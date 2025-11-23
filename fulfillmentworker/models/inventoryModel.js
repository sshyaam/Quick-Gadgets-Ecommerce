/**
 * Inventory model for fulfillment worker
 * Uses Durable Objects for reserved stock to prevent race conditions
 * D1 stores actual inventory quantities, DO stores reserved quantities
 */

import { randomUUID } from 'crypto';
import { 
  reserveStockDO, 
  releaseStockDO, 
  reduceReservedStockDO, 
  getReservedStockStatus 
} from '../utils/reservedStockDO.js';

/**
 * Get stock for a product (aggregated across all warehouses)
 * Reserved quantity comes from DO, actual quantity from D1
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {DurableObjectNamespace} reservedStockDO - DO binding for reserved stock (optional)
 * @returns {Promise<Object|null>} Stock data or null
 */
export async function getStock(db, productId, reservedStockDO = null) {
  // Aggregate actual stock across all warehouses from D1
  const result = await db
    .prepare(
      `SELECT 
        product_id,
        SUM(quantity) as quantity,
        MAX(updated_at) as updated_at
       FROM inventory 
       WHERE product_id = ? AND deleted_at IS NULL
       GROUP BY product_id`
    )
    .bind(productId)
    .first();
  
  if (!result) {
    return null;
  }
  
  // Get reserved quantity from DO (if available)
  // This will automatically trigger cleanup of expired reservations
  let reservedQuantity = 0;
  if (reservedStockDO) {
    try {
      // Getting status triggers cleanup automatically (via DO fetch handler)
      const reservedStatus = await getReservedStockStatus(reservedStockDO, productId);
      reservedQuantity = reservedStatus.reserved || 0;
    } catch (error) {
      console.warn(`[inventory-model] Failed to get reserved stock from DO for ${productId}:`, error.message);
      // Fallback: if DO is not available, reserved_quantity is 0
      reservedQuantity = 0;
    }
  }
  
  return {
    product_id: result.product_id,
    quantity: result.quantity,
    reserved_quantity: reservedQuantity,
    updated_at: result.updated_at,
  };
}

/**
 * Get stocks for multiple products (aggregated across all warehouses)
 * Reserved quantities come from DO, actual quantities from D1
 * @param {D1Database} db - Database instance
 * @param {string[]} productIds - Array of product IDs
 * @param {DurableObjectNamespace} reservedStockDO - DO binding for reserved stock (optional)
 * @returns {Promise<Object[]>} Array of stock data
 */
export async function getStocks(db, productIds, reservedStockDO = null) {
  if (!productIds || productIds.length === 0) {
    return [];
  }

  const placeholders = productIds.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT 
        product_id,
        SUM(quantity) as quantity,
        MAX(updated_at) as updated_at
       FROM inventory 
       WHERE product_id IN (${placeholders}) AND deleted_at IS NULL
       GROUP BY product_id`
    )
    .bind(...productIds)
    .all();
  
  const stocks = result.results || [];
  
  // Get reserved quantities from DO for all products
  if (reservedStockDO) {
    const reservedPromises = stocks.map(async (stock) => {
      try {
        const reservedStatus = await getReservedStockStatus(reservedStockDO, stock.product_id);
        stock.reserved_quantity = reservedStatus.reserved || 0;
      } catch (error) {
        console.warn(`[inventory-model] Failed to get reserved stock from DO for ${stock.product_id}:`, error.message);
        stock.reserved_quantity = 0;
      }
      return stock;
    });
    
    await Promise.all(reservedPromises);
  } else {
    // If DO not available, set reserved_quantity to 0
    stocks.forEach(stock => {
      stock.reserved_quantity = 0;
    });
  }
  
  return stocks;
}

/**
 * Set stock for a product in a warehouse
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} quantity - Stock quantity
 * @param {string} warehouseId - Warehouse ID (optional, defaults to first active warehouse)
 * @returns {Promise<Object>} Created stock data
 */
export async function setStock(db, productId, quantity, warehouseId = null) {
  const now = new Date().toISOString();
  
  // If no warehouse specified, get first active warehouse
  let finalWarehouseId = warehouseId;
  if (!finalWarehouseId) {
    const warehouse = await db
      .prepare('SELECT warehouse_id FROM warehouses WHERE is_active = 1 LIMIT 1')
      .first();
    if (!warehouse) {
      throw new Error('No active warehouse found');
    }
    finalWarehouseId = warehouse.warehouse_id;
  }
  
  const inventoryId = crypto.randomUUID();
  
  const result = await db
    .prepare(
      `INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(inventoryId, productId, finalWarehouseId, quantity, now, now)
    .run();
  
  if (!result.success) {
    throw new Error('Failed to set stock');
  }
  
  return {
    inventoryId,
    productId,
    warehouseId: finalWarehouseId,
    quantity,
    reservedQuantity: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update stock for a product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} quantity - New stock quantity
 * @returns {Promise<boolean>} True if updated
 */
export async function updateStock(db, productId, quantity) {
  const result = await db
    .prepare(
      `UPDATE inventory 
       SET quantity = ?, updated_at = ? 
       WHERE product_id = ? AND deleted_at IS NULL`
    )
    .bind(quantity, new Date().toISOString(), productId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

/**
 * Get stock from a specific warehouse
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {string} warehouseId - Warehouse ID
 * @returns {Promise<Object|null>} Stock data or null
 */
export async function getStockFromWarehouse(db, productId, warehouseId) {
  const result = await db
    .prepare(
      `SELECT inventory_id, product_id, warehouse_id, quantity, reserved_quantity, updated_at
       FROM inventory 
       WHERE product_id = ? AND warehouse_id = ? AND deleted_at IS NULL`
    )
    .bind(productId, warehouseId)
    .first();
  
  return result || null;
}

/**
 * Reduce stock (for order fulfillment) - reduces from specific warehouse(s) with stock
 * Also reduces reserved stock from DO when reducing actual stock
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reduce
 * @param {string} warehouseId - Optional: specific warehouse ID to reduce from
 * @param {DurableObjectNamespace} reservedStockDO - DO binding for reserved stock (optional)
 * @returns {Promise<boolean>} True if reduced successfully
 */
export async function reduceStock(db, productId, quantity, warehouseId = null, reservedStockDO = null, orderId = null) {
  // First, check total available stock across all warehouses
  // Get reserved from DO if available
  const totalStock = await getStock(db, productId, reservedStockDO);
  
  if (!totalStock) {
    const error = new Error(`Product ${productId} not found in inventory`);
    error.name = 'NotFoundError';
    throw error;
  }
  
  const totalAvailable = (totalStock.quantity || 0) - (totalStock.reserved_quantity || 0);
  
  if (totalAvailable < quantity) {
    const totalQty = totalStock.quantity || 0;
    const reservedQty = totalStock.reserved_quantity || 0;
    const error = new Error(`Insufficient available stock. Available: ${totalAvailable}, Requested: ${quantity}, Total: ${totalQty}, Reserved: ${reservedQty}`);
    error.name = 'ConflictError';
    throw error;
  }
  
  // If specific warehouse requested, try that first
  if (warehouseId) {
    const warehouseStock = await getStockFromWarehouse(db, productId, warehouseId);
    if (warehouseStock) {
      // Calculate available: warehouse quantity - (product-level reserved from DO)
      const warehouseAvailable = warehouseStock.quantity - (totalStock.reserved_quantity || 0);
      if (warehouseAvailable >= quantity) {
        // Reduce from this specific warehouse (only update quantity, not reserved_quantity in D1)
        const newQuantity = Math.max(0, warehouseStock.quantity - quantity);
        
        // Update with atomic check
        const result = await db
          .prepare(
            `UPDATE inventory 
             SET quantity = ?,
                 updated_at = ? 
             WHERE inventory_id = ? 
               AND deleted_at IS NULL 
               AND quantity >= ?`
          )
          .bind(newQuantity, new Date().toISOString(), warehouseStock.inventory_id, quantity)
          .run();
        
        if (result.success && result.meta.changes > 0) {
          // Also reduce reserved stock from DO
          if (reservedStockDO) {
            try {
              await reduceReservedStockDO(reservedStockDO, productId, quantity);
            } catch (error) {
              console.warn(`[inventory-model] Failed to reduce reserved stock from DO: ${error.message}`);
              // Continue - the actual stock was reduced, reserved stock reduction is best-effort
            }
          }
          console.log(`[inventory-model] Reduced ${quantity} stock from warehouse ${warehouseId} for product ${productId}`);
          return true;
        }
      }
    }
  }
  
  // Find warehouses with stock, ordered by quantity (descending)
  // Note: We use quantity only since reserved is tracked per-product in DO
  const warehousesWithStock = await db
    .prepare(
      `SELECT inventory_id, warehouse_id, quantity
       FROM inventory 
       WHERE product_id = ? 
         AND deleted_at IS NULL 
         AND quantity > 0
       ORDER BY quantity DESC`
    )
    .bind(productId)
    .all();
  
  if (!warehousesWithStock.results || warehousesWithStock.results.length === 0) {
    const error = new Error(`No warehouses with stock for product ${productId}`);
    error.name = 'ConflictError';
    throw error;
  }
  
  // Reduce stock from warehouses, starting with the one with most stock
  // We've already verified total available stock above
  let remainingToReduce = quantity;
  const updatedWarehouses = [];
  
  for (const warehouse of warehousesWithStock.results) {
    if (remainingToReduce <= 0) break;
    
    // Calculate available for this warehouse considering product-level reserved stock
    const warehouseAvailable = Math.max(0, warehouse.quantity - (totalStock.reserved_quantity || 0));
    const toReduceFromThis = Math.min(remainingToReduce, warehouseAvailable);
    
    if (toReduceFromThis <= 0) continue;
    
    const newQuantity = Math.max(0, warehouse.quantity - toReduceFromThis);
    
    // Update with atomic check
    const result = await db
      .prepare(
        `UPDATE inventory 
         SET quantity = ?,
             updated_at = ? 
         WHERE inventory_id = ? 
           AND deleted_at IS NULL 
           AND quantity >= ?`
      )
      .bind(newQuantity, new Date().toISOString(), warehouse.inventory_id, toReduceFromThis)
      .run();
    
    if (result.success && result.meta.changes > 0) {
      remainingToReduce -= toReduceFromThis;
      updatedWarehouses.push(warehouse.warehouse_id);
      console.log(`[inventory-model] Reduced ${toReduceFromThis} stock from warehouse ${warehouse.warehouse_id} for product ${productId}`);
    }
  }
  
  if (remainingToReduce > 0) {
    const error = new Error(`Failed to reduce all stock. Reduced ${quantity - remainingToReduce} of ${quantity} requested. Stock may have been reduced by another order.`);
    error.name = 'ConflictError';
    throw error;
  }
  
  // Also reduce reserved stock from DO (after successfully reducing actual stock)
  // If orderId is provided, use it; otherwise use quantity (backward compatibility)
  if (reservedStockDO) {
    try {
      await reduceReservedStockDO(reservedStockDO, productId, orderId, quantity);
      console.log(`[inventory-model] Reduced reserved stock from DO for product ${productId}, orderId: ${orderId || 'quantity: ' + quantity}`);
    } catch (error) {
      console.warn(`[inventory-model] Failed to reduce reserved stock from DO: ${error.message}`);
      // Continue - the actual stock was reduced, reserved stock reduction is best-effort
    }
  }
  
  console.log(`[inventory-model] Successfully reduced ${quantity} stock for product ${productId} from ${updatedWarehouses.length} warehouse(s): ${updatedWarehouses.join(', ')}`);
  return true;
}

/**
 * Reserve stock (for orders) - uses DO for atomic reservation with TTL
 * Checks D1 for available stock, then reserves in DO atomically
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reserve
 * @param {DurableObjectNamespace} reservedStockDO - DO binding for reserved stock
 * @param {string} orderId - Order ID (required for TTL tracking)
 * @param {number} ttlMinutes - Time to live in minutes (default: 15)
 * @returns {Promise<boolean>} True if reserved successfully
 */
export async function reserveStock(db, productId, quantity, reservedStockDO, orderId = null, ttlMinutes = 15) {
  if (!reservedStockDO) {
    throw new Error('ReservedStockDO binding is required for stock reservation');
  }
  
  if (!orderId) {
    throw new Error('orderId is required for stock reservation');
  }
  
  // First, check total available stock from D1
  const totalStock = await getStock(db, productId, reservedStockDO);
  
  if (!totalStock) {
    return false;
  }
  
  const available = totalStock.quantity - totalStock.reserved_quantity;
  
  if (available < quantity) {
    console.log(`[inventory-model] Insufficient stock to reserve. Available: ${available}, Requested: ${quantity}`);
    return false;
  }
  
  // Reserve in DO atomically (this prevents race conditions)
  try {
    const result = await reserveStockDO(reservedStockDO, productId, quantity, orderId, ttlMinutes);
    if (result.success) {
      console.log(`[inventory-model] Reserved ${quantity} stock for product ${productId}, order ${orderId} via DO. Total reserved: ${result.totalReserved}, expires at ${result.expiresAt}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[inventory-model] Failed to reserve stock via DO for ${productId}:`, error);
    return false;
  }
}

/**
 * Release reserved stock - uses DO for atomic release
 * @param {D1Database} db - Database instance (not used, kept for API compatibility)
 * @param {string} productId - Product ID
 * @param {string} orderId - Order ID (preferred) or quantity (backward compatibility)
 * @param {DurableObjectNamespace} reservedStockDO - DO binding for reserved stock
 * @param {number} quantity - Quantity to release (only if orderId not provided)
 * @returns {Promise<boolean>} True if released successfully
 */
export async function releaseReservedStock(db, productId, orderId, reservedStockDO, quantity = null) {
  if (!reservedStockDO) {
    throw new Error('ReservedStockDO binding is required for stock release');
  }
  
  // Release from DO atomically
  try {
    const result = await releaseStockDO(reservedStockDO, productId, orderId, quantity);
    if (result.success) {
      console.log(`[inventory-model] Released reserved stock for product ${productId}, order ${orderId || 'quantity: ' + quantity} via DO. Total reserved: ${result.totalReserved}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[inventory-model] Failed to release stock via DO for ${productId}:`, error);
    // If error is about insufficient reserved stock, return false
    if (error.message && error.message.includes('Cannot release')) {
      return false;
    }
    throw error;
  }
}

/**
 * Get available stock (quantity - reserved_quantity)
 * Reserved quantity comes from DO, actual quantity from D1
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {DurableObjectNamespace} reservedStockDO - DO binding for reserved stock (optional)
 * @returns {Promise<number>} Available stock quantity
 */
export async function getAvailableStock(db, productId, reservedStockDO = null) {
  const stock = await getStock(db, productId, reservedStockDO);
  if (!stock) {
    return 0;
  }
  return Math.max(0, stock.quantity - stock.reserved_quantity);
}

