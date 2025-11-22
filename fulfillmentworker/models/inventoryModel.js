/**
 * Inventory model for fulfillment worker
 */

/**
 * Get stock for a product (aggregated across all warehouses)
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @returns {Promise<Object|null>} Stock data or null
 */
export async function getStock(db, productId) {
  // Aggregate stock across all warehouses
  const result = await db
    .prepare(
      `SELECT 
        product_id,
        SUM(quantity) as quantity,
        SUM(reserved_quantity) as reserved_quantity,
        MAX(updated_at) as updated_at
       FROM inventory 
       WHERE product_id = ? AND deleted_at IS NULL
       GROUP BY product_id`
    )
    .bind(productId)
    .first();
  
  return result || null;
}

/**
 * Get stocks for multiple products (aggregated across all warehouses)
 * @param {D1Database} db - Database instance
 * @param {string[]} productIds - Array of product IDs
 * @returns {Promise<Object[]>} Array of stock data
 */
export async function getStocks(db, productIds) {
  if (!productIds || productIds.length === 0) {
    return [];
  }

  const placeholders = productIds.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT 
        product_id,
        SUM(quantity) as quantity,
        SUM(reserved_quantity) as reserved_quantity,
        MAX(updated_at) as updated_at
       FROM inventory 
       WHERE product_id IN (${placeholders}) AND deleted_at IS NULL
       GROUP BY product_id`
    )
    .bind(...productIds)
    .all();
  
  return result.results || [];
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
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reduce
 * @param {string} warehouseId - Optional: specific warehouse ID to reduce from
 * @returns {Promise<boolean>} True if reduced successfully
 */
export async function reduceStock(db, productId, quantity, warehouseId = null) {
  // First, check total available stock across all warehouses
  const totalStock = await getStock(db, productId);
  
  if (!totalStock) {
    const error = new Error(`Product ${productId} not found in inventory`);
    error.name = 'NotFoundError';
    throw error;
  }
  
  // Fix data inconsistencies: if reserved_quantity > quantity in any warehouse, cap it
  const allInventory = await db
    .prepare(
      `SELECT inventory_id, warehouse_id, quantity, reserved_quantity
       FROM inventory 
       WHERE product_id = ? AND deleted_at IS NULL`
    )
    .bind(productId)
    .all();
  
  for (const inv of allInventory.results || []) {
    if (inv.reserved_quantity > inv.quantity) {
      console.warn(`[inventory-model] Data inconsistency detected for ${productId} in warehouse ${inv.warehouse_id}: reserved_quantity (${inv.reserved_quantity}) > quantity (${inv.quantity}). Fixing...`);
      await db
        .prepare(
          `UPDATE inventory 
           SET reserved_quantity = ?,
               updated_at = ? 
           WHERE inventory_id = ? AND deleted_at IS NULL`
        )
        .bind(inv.quantity, new Date().toISOString(), inv.inventory_id)
        .run();
    }
  }
  
  // Re-fetch total stock after fixing inconsistencies
  const fixedTotalStock = await getStock(db, productId);
  if (!fixedTotalStock) {
    const error = new Error(`Product ${productId} not found in inventory`);
    error.name = 'NotFoundError';
    throw error;
  }
  const totalAvailable = (fixedTotalStock.quantity || fixedTotalStock.qty || 0) - (fixedTotalStock.reserved_quantity || 0);
  
  if (totalAvailable < quantity) {
    const totalQty = fixedTotalStock.quantity || fixedTotalStock.qty || 0;
    const reservedQty = fixedTotalStock.reserved_quantity || 0;
    const error = new Error(`Insufficient available stock. Available: ${totalAvailable}, Requested: ${quantity}, Total: ${totalQty}, Reserved: ${reservedQty}`);
    error.name = 'ConflictError';
    throw error;
  }
  
  // If specific warehouse requested, try that first
  if (warehouseId) {
    const warehouseStock = await getStockFromWarehouse(db, productId, warehouseId);
    if (warehouseStock) {
      const warehouseAvailable = warehouseStock.quantity - warehouseStock.reserved_quantity;
      if (warehouseAvailable >= quantity) {
        // Reduce from this specific warehouse
        const newQuantity = Math.max(0, warehouseStock.quantity - quantity);
        const newReservedQuantity = Math.max(0, warehouseStock.reserved_quantity - quantity);
        const finalReservedQuantity = Math.min(newReservedQuantity, newQuantity);
        
        // Update with atomic check: ensure we have enough available stock
        const result = await db
          .prepare(
            `UPDATE inventory 
             SET quantity = ?,
                 reserved_quantity = ?,
                 updated_at = ? 
             WHERE inventory_id = ? 
               AND deleted_at IS NULL 
               AND (quantity - reserved_quantity) >= ?`
          )
          .bind(newQuantity, finalReservedQuantity, new Date().toISOString(), warehouseStock.inventory_id, quantity)
          .run();
        
        if (result.success && result.meta.changes > 0) {
          console.log(`[inventory-model] Reduced ${quantity} stock from warehouse ${warehouseId} for product ${productId}`);
          return true;
        }
      }
    }
  }
  
  // Find warehouses with available stock, ordered by available quantity (descending)
  const warehousesWithStock = await db
    .prepare(
      `SELECT inventory_id, warehouse_id, quantity, reserved_quantity,
              (quantity - reserved_quantity) as available
       FROM inventory 
       WHERE product_id = ? 
         AND deleted_at IS NULL 
         AND (quantity - reserved_quantity) > 0
       ORDER BY available DESC`
    )
    .bind(productId)
    .all();
  
  if (!warehousesWithStock.results || warehousesWithStock.results.length === 0) {
    const error = new Error(`No warehouses with available stock for product ${productId}`);
    error.name = 'ConflictError';
    throw error;
  }
  
  // Reduce stock from warehouses, starting with the one with most available stock
  let remainingToReduce = quantity;
  const updatedWarehouses = [];
  
  for (const warehouse of warehousesWithStock.results) {
    if (remainingToReduce <= 0) break;
    
    const available = warehouse.quantity - warehouse.reserved_quantity;
    const toReduceFromThis = Math.min(remainingToReduce, available);
    
    const newQuantity = Math.max(0, warehouse.quantity - toReduceFromThis);
    const newReservedQuantity = Math.max(0, warehouse.reserved_quantity - toReduceFromThis);
    const finalReservedQuantity = Math.min(newReservedQuantity, newQuantity);
    
    // Update with atomic check: ensure we have enough available stock
    const result = await db
      .prepare(
        `UPDATE inventory 
         SET quantity = ?,
             reserved_quantity = ?,
             updated_at = ? 
         WHERE inventory_id = ? 
           AND deleted_at IS NULL 
           AND (quantity - reserved_quantity) >= ?`
      )
      .bind(newQuantity, finalReservedQuantity, new Date().toISOString(), warehouse.inventory_id, toReduceFromThis)
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
  
  console.log(`[inventory-model] Successfully reduced ${quantity} stock for product ${productId} from ${updatedWarehouses.length} warehouse(s): ${updatedWarehouses.join(', ')}`);
  return true;
}

/**
 * Reserve stock (for cart) - reserves from specific warehouse(s) with stock
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reserve
 * @returns {Promise<boolean>} True if reserved successfully
 */
export async function reserveStock(db, productId, quantity) {
  // Find warehouses with available stock, ordered by available quantity (descending)
  const warehousesWithStock = await db
    .prepare(
      `SELECT inventory_id, warehouse_id, quantity, reserved_quantity,
              (quantity - reserved_quantity) as available
       FROM inventory 
       WHERE product_id = ? 
         AND deleted_at IS NULL 
         AND (quantity - reserved_quantity) > 0
       ORDER BY available DESC`
    )
    .bind(productId)
    .all();
  
  if (!warehousesWithStock.results || warehousesWithStock.results.length === 0) {
    return false;
  }
  
  // Reserve stock from warehouses, starting with the one with most available stock
  let remainingToReserve = quantity;
  
  for (const warehouse of warehousesWithStock.results) {
    if (remainingToReserve <= 0) break;
    
    const available = warehouse.quantity - warehouse.reserved_quantity;
    const toReserveFromThis = Math.min(remainingToReserve, available);
    
    const result = await db
      .prepare(
        `UPDATE inventory 
         SET reserved_quantity = reserved_quantity + ?,
             updated_at = ? 
         WHERE inventory_id = ? 
           AND deleted_at IS NULL 
           AND (quantity - reserved_quantity) >= ?`
      )
      .bind(toReserveFromThis, new Date().toISOString(), warehouse.inventory_id, toReserveFromThis)
      .run();
    
    if (result.success && result.meta.changes > 0) {
      remainingToReserve -= toReserveFromThis;
    }
  }
  
  return remainingToReserve === 0;
}

/**
 * Release reserved stock - releases from specific warehouse(s) with reserved stock
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to release
 * @returns {Promise<boolean>} True if released successfully
 */
export async function releaseReservedStock(db, productId, quantity) {
  // Find warehouses with reserved stock, ordered by reserved quantity (descending)
  const warehousesWithReserved = await db
    .prepare(
      `SELECT inventory_id, warehouse_id, quantity, reserved_quantity
       FROM inventory 
       WHERE product_id = ? 
         AND deleted_at IS NULL 
         AND reserved_quantity > 0
       ORDER BY reserved_quantity DESC`
    )
    .bind(productId)
    .all();
  
  if (!warehousesWithReserved.results || warehousesWithReserved.results.length === 0) {
    return false;
  }
  
  // Release stock from warehouses, starting with the one with most reserved stock
  let remainingToRelease = quantity;
  
  for (const warehouse of warehousesWithReserved.results) {
    if (remainingToRelease <= 0) break;
    
    const toReleaseFromThis = Math.min(remainingToRelease, warehouse.reserved_quantity);
    const newReservedQuantity = Math.max(0, warehouse.reserved_quantity - toReleaseFromThis);
    
    const result = await db
      .prepare(
        `UPDATE inventory 
         SET reserved_quantity = ?,
             updated_at = ? 
         WHERE inventory_id = ? 
           AND deleted_at IS NULL`
      )
      .bind(newReservedQuantity, new Date().toISOString(), warehouse.inventory_id)
      .run();
    
    if (result.success && result.meta.changes > 0) {
      remainingToRelease -= toReleaseFromThis;
    }
  }
  
  return remainingToRelease === 0;
}

/**
 * Get available stock (quantity - reserved_quantity)
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @returns {Promise<number>} Available stock quantity
 */
export async function getAvailableStock(db, productId) {
  const stock = await getStock(db, productId);
  if (!stock) {
    return 0;
  }
  return Math.max(0, stock.quantity - stock.reserved_quantity);
}

