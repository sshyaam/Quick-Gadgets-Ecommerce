/**
 * Warehouse model for fulfillment worker
 */

/**
 * Get warehouse by ID
 */
export async function getWarehouseById(db, warehouseId) {
  const result = await db
    .prepare(
      `SELECT warehouse_id, name, pincode, city, state, address, is_active, created_at, updated_at
       FROM warehouses 
       WHERE warehouse_id = ? AND is_active = 1`
    )
    .bind(warehouseId)
    .first();
  
  return result || null;
}

/**
 * Get warehouses serving a pincode
 */
export async function getWarehousesByPincode(db, pincode) {
  const result = await db
    .prepare(
      `SELECT DISTINCT w.warehouse_id, w.name, w.pincode, w.city, w.state, w.address,
              pc.standard_available, pc.express_available
       FROM warehouses w
       INNER JOIN pincode_coverage pc ON w.warehouse_id = pc.warehouse_id
       WHERE pc.pincode = ? AND w.is_active = 1`
    )
    .bind(pincode)
    .all();
  
  return result.results || [];
}

/**
 * Calculate zone based on pincode distance
 * Zone 1: Same postal region (first 3 digits match) - 0-50km
 * Zone 2: Same state, different region - 50-500km
 * Zone 3: Different state - 500km+
 * @param {string} warehousePincode - Warehouse pincode
 * @param {string} customerPincode - Customer pincode
 * @returns {number} Zone number (1, 2, or 3)
 */
export function calculateZone(warehousePincode, customerPincode) {
  if (!warehousePincode || !customerPincode) return 3; // Default to farthest zone
  
  const warehouseRegion = warehousePincode.substring(0, 3);
  const customerRegion = customerPincode.substring(0, 3);
  
  if (warehouseRegion === customerRegion) {
    return 1; // Same postal region
  }
  
  const warehouseState = warehousePincode.substring(0, 1);
  const customerState = customerPincode.substring(0, 1);
  
  if (warehouseState === customerState) {
    return 2; // Same state, different region
  }
  
  return 3; // Different state
}

/**
 * Get nearest warehouse to a pincode with stock availability check
 * Checks total available stock across all warehouses (supports multi-warehouse fulfillment)
 * @param {D1Database} db - Database instance
 * @param {string} pincode - Customer pincode
 * @param {string} state - Customer state
 * @param {string} city - Customer city
 * @param {string} productId - Product ID to check stock
 * @param {number} requiredQuantity - Required quantity (default 1)
 * @returns {Promise<Object|null>} Warehouse with stock info or null
 */
export async function getNearestWarehouseWithStock(db, pincode, state, city, productId, requiredQuantity = 1) {
  // First, check if total available stock across ALL warehouses is sufficient
  // This allows multi-warehouse fulfillment (e.g., 10 from warehouse B + 5 from warehouse C)
  const { getStock } = await import('./inventoryModel.js');
  const totalStock = await getStock(db, productId);
  
  if (!totalStock) {
    return null; // Product not in inventory
  }
  
  const totalAvailable = (totalStock.quantity || 0) - (totalStock.reserved_quantity || 0);
  
  // If total available stock is insufficient, return null
  if (totalAvailable < requiredQuantity) {
    return null;
  }
  
  // Total stock is sufficient - now find the nearest warehouse for zone/shipping calculation
  // Priority: Closer warehouses with sufficient stock > Closer warehouses with any stock
  // We don't require this warehouse to have all the stock, since fulfillment can split across warehouses
  
  // First try exact pincode match - find nearest warehouse that serves this pincode
  let warehouses = await getWarehousesByPincode(db, pincode);
  
  if (warehouses.length > 0) {
    // Two-pass approach: First find warehouses with sufficient stock, then fallback to any stock
    const warehousesWithSufficientStock = [];
    const warehousesWithAnyStock = [];
    
    for (const warehouse of warehouses) {
      const stock = await getStockFromWarehouse(db, productId, warehouse.warehouse_id);
      if (stock) {
        const available = stock.quantity - stock.reserved_quantity;
        if (available > 0) {
          const warehouseData = {
            ...warehouse,
            availableStock: available,
            zone: calculateZone(warehouse.pincode, pincode)
          };
          
          if (available >= requiredQuantity) {
            warehousesWithSufficientStock.push(warehouseData);
          } else {
            warehousesWithAnyStock.push(warehouseData);
          }
        }
      }
    }
    
    // Priority 1: If we found warehouses with sufficient stock, pick the closest one
    if (warehousesWithSufficientStock.length > 0) {
      // Sort by zone (1 < 2 < 3), then by available stock (descending)
      warehousesWithSufficientStock.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone - b.zone;
        return b.availableStock - a.availableStock;
      });
      return warehousesWithSufficientStock[0];
    }
    
    // Priority 2: Fallback to warehouses with any stock, still sorted by zone first
    if (warehousesWithAnyStock.length > 0) {
      warehousesWithAnyStock.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone - b.zone;
        return b.availableStock - a.availableStock;
      });
      return warehousesWithAnyStock[0];
    }
  }
  
  // If no exact pincode match with stock, find warehouses in same state with stock
  const stateWarehouses = await db
    .prepare(
      `SELECT w.warehouse_id, w.name, w.pincode, w.city, w.state, w.address
       FROM warehouses w
       WHERE w.state = ? AND w.is_active = 1
       ORDER BY w.pincode`
    )
    .bind(state)
    .all();
  
  if (stateWarehouses.results && stateWarehouses.results.length > 0) {
    // Two-pass approach: First find warehouses with sufficient stock, then fallback to any stock
    const warehousesWithSufficientStock = [];
    const warehousesWithAnyStock = [];
    
    for (const warehouse of stateWarehouses.results) {
      const stock = await getStockFromWarehouse(db, productId, warehouse.warehouse_id);
      if (stock) {
        const available = stock.quantity - stock.reserved_quantity;
        if (available > 0) {
          const warehouseData = {
            ...warehouse,
            availableStock: available,
            zone: calculateZone(warehouse.pincode, pincode)
          };
          
          if (available >= requiredQuantity) {
            warehousesWithSufficientStock.push(warehouseData);
          } else {
            warehousesWithAnyStock.push(warehouseData);
          }
        }
      }
    }
    
    // Priority 1: If we found warehouses with sufficient stock, pick the closest one
    if (warehousesWithSufficientStock.length > 0) {
      // Sort by zone (1 < 2 < 3), then by available stock (descending)
      warehousesWithSufficientStock.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone - b.zone;
        return b.availableStock - a.availableStock;
      });
      return warehousesWithSufficientStock[0];
    }
    
    // Priority 2: Fallback to warehouses with any stock, still sorted by zone first
    if (warehousesWithAnyStock.length > 0) {
      warehousesWithAnyStock.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone - b.zone;
        return b.availableStock - a.availableStock;
      });
      return warehousesWithAnyStock[0];
    }
  }
  
  // Fallback: find any warehouse with stock
  const allWarehouses = await db
    .prepare(
      `SELECT w.warehouse_id, w.name, w.pincode, w.city, w.state, w.address
       FROM warehouses w
       WHERE w.is_active = 1
       ORDER BY w.state = ? DESC, w.pincode`
    )
    .bind(state)
    .all();
  
  if (allWarehouses.results && allWarehouses.results.length > 0) {
    // Two-pass approach: First find warehouses with sufficient stock, then fallback to any stock
    const warehousesWithSufficientStock = [];
    const warehousesWithAnyStock = [];
    
    for (const warehouse of allWarehouses.results) {
      const stock = await getStockFromWarehouse(db, productId, warehouse.warehouse_id);
      if (stock) {
        const available = stock.quantity - stock.reserved_quantity;
        if (available > 0) {
          const warehouseData = {
            ...warehouse,
            availableStock: available,
            zone: calculateZone(warehouse.pincode, pincode)
          };
          
          if (available >= requiredQuantity) {
            warehousesWithSufficientStock.push(warehouseData);
          } else {
            warehousesWithAnyStock.push(warehouseData);
          }
        }
      }
    }
    
    // Priority 1: If we found warehouses with sufficient stock, pick the closest one
    if (warehousesWithSufficientStock.length > 0) {
      // Sort by zone (1 < 2 < 3), then by same state preference, then by available stock (descending)
      warehousesWithSufficientStock.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone - b.zone;
        // If same zone, prefer same state
        if (a.state === state && b.state !== state) return -1;
        if (b.state === state && a.state !== state) return 1;
        return b.availableStock - a.availableStock;
      });
      return warehousesWithSufficientStock[0];
    }
    
    // Priority 2: Fallback to warehouses with any stock, still sorted by zone first
    if (warehousesWithAnyStock.length > 0) {
      warehousesWithAnyStock.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone - b.zone;
        // If same zone, prefer same state
        if (a.state === state && b.state !== state) return -1;
        if (b.state === state && a.state !== state) return 1;
        return b.availableStock - a.availableStock;
      });
      return warehousesWithAnyStock[0];
    }
  }
  
  // Should not reach here if total stock check passed, but return null as fallback
  return null;
}

/**
 * Get nearest warehouse to a pincode (by state/city matching)
 * @deprecated Use getNearestWarehouseWithStock for stock-aware selection
 */
export async function getNearestWarehouse(db, pincode, state, city) {
  // First try exact pincode match
  let warehouses = await getWarehousesByPincode(db, pincode);
  
  if (warehouses.length > 0) {
    return warehouses[0]; // Return first matching warehouse
  }
  
  // Fallback: find warehouse in same state
  const result = await db
    .prepare(
      `SELECT warehouse_id, name, pincode, city, state, address
       FROM warehouses 
       WHERE state = ? AND is_active = 1
       LIMIT 1`
    )
    .bind(state)
    .first();
  
  return result || null;
}

/**
 * Get inventory for a product across all warehouses
 */
export async function getProductInventoryAcrossWarehouses(db, productId) {
  const result = await db
    .prepare(
      `SELECT i.inventory_id, i.product_id, i.warehouse_id, i.quantity, i.reserved_quantity,
              w.name as warehouse_name, w.city, w.state, w.pincode as warehouse_pincode
       FROM inventory i
       INNER JOIN warehouses w ON i.warehouse_id = w.warehouse_id
       WHERE i.product_id = ? AND i.deleted_at IS NULL AND w.is_active = 1`
    )
    .all();
  
  return result.results || [];
}

/**
 * Get total available stock for a product (across all warehouses)
 */
export async function getTotalAvailableStock(db, productId) {
  const inventories = await getProductInventoryAcrossWarehouses(db, productId);
  
  return inventories.reduce((total, inv) => {
    return total + Math.max(0, inv.quantity - inv.reserved_quantity);
  }, 0);
}

/**
 * Get stock for a product from a specific warehouse
 * @deprecated Import from inventoryModel.js instead
 */
export async function getStockFromWarehouse(db, productId, warehouseId) {
  // Import from inventoryModel to avoid duplication
  const { getStockFromWarehouse: getStock } = await import('./inventoryModel.js');
  return getStock(db, productId, warehouseId);
}

