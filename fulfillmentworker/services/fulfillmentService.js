/**
 * Fulfillment service
 */

import { 
  getStock, 
  getStocks, 
  setStock, 
  updateStock, 
  reduceStock,
  reserveStock,
  releaseReservedStock,
  getAvailableStock 
} from '../models/inventoryModel.js';
import { 
  getShippingOptionsForProduct, 
  calculateShippingCost 
} from '../models/shippingModel.js';
import { NotFoundError, ConflictError } from '../../shared/utils/errors.js';
import { executeTransaction } from '../../shared/utils/database.js';

/**
 * Get stock for a product
 * @param {string} productId - Product ID
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Stock data
 */
export async function getProductStock(productId, db) {
  const stock = await getStock(db, productId);
  if (!stock) {
    return {
      productId,
      quantity: 0,
      available: 0,
      reservedQuantity: 0,
    };
  }
  
  // Calculate available stock (ensure it's never negative)
  const available = Math.max(0, stock.quantity - stock.reserved_quantity);
  
  // Log if there's a data inconsistency (reserved > total)
  if (stock.reserved_quantity > stock.quantity) {
    console.warn(`[fulfillment-service] Data inconsistency for product ${stock.product_id}: reserved_quantity (${stock.reserved_quantity}) > quantity (${stock.quantity})`);
  }
  
  return {
    productId: stock.product_id,
    quantity: stock.quantity,
    available: available,
    reservedQuantity: stock.reserved_quantity,
    updatedAt: stock.updated_at,
  };
}

/**
 * Get stocks for multiple products
 * @param {string[]} productIds - Array of product IDs
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Map of productId to stock
 */
export async function getProductStocks(productIds, db) {
  const stocks = await getStocks(db, productIds);
  
  const stockMap = {};
  stocks.forEach(stock => {
    stockMap[stock.product_id] = {
      quantity: stock.quantity,
      available: stock.quantity - stock.reserved_quantity,
      reservedQuantity: stock.reserved_quantity,
      updatedAt: stock.updated_at,
    };
  });
  
  // Fill in missing products with 0 stock
  productIds.forEach(productId => {
    if (!stockMap[productId]) {
      stockMap[productId] = {
        quantity: 0,
        available: 0,
        reservedQuantity: 0,
      };
    }
  });
  
  return stockMap;
}

/**
 * Update stock for a product
 * @param {string} productId - Product ID
 * @param {number} quantity - New stock quantity
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Updated stock data
 */
export async function updateProductStock(productId, quantity, db, cache = null) {
  if (quantity < 0) {
    throw new Error('Stock quantity cannot be negative');
  }
  
  const existing = await getStock(db, productId);
  if (!existing) {
    // Create new stock entry
    const result = await setStock(db, productId, quantity);
    // Invalidate shipping cache - stock added to warehouse affects shipping options
    if (cache) {
      await invalidateShippingCache(cache, productId);
    }
    return result;
  }
  
  const updated = await updateStock(db, productId, quantity);
  if (!updated) {
    throw new Error('Failed to update stock');
  }
  
  // Invalidate shipping cache - stock change affects shipping availability
  if (cache) {
    await invalidateShippingCache(cache, productId);
  }
  
  return {
    productId,
    quantity,
    available: quantity - existing.reserved_quantity,
    reservedQuantity: existing.reserved_quantity,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reduce stock (for order fulfillment)
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reduce
 * @param {D1Database} db - Database instance
 * @returns {Promise<boolean>} True if reduced successfully
 */
export async function reduceProductStock(productId, quantity, db, cache = null) {
  // Get current stock info
  const stock = await getStock(db, productId);
  if (!stock) {
    throw new ConflictError(`Product ${productId} not found in inventory`);
  }
  
  const available = stock.quantity - stock.reserved_quantity;
  
  console.log(`[fulfillment-service] Reducing stock for ${productId}:`, {
    totalQuantity: stock.quantity,
    reservedQuantity: stock.reserved_quantity,
    available,
    requested: quantity,
  });
  
  if (available < quantity) {
    throw new ConflictError(`Insufficient stock. Available: ${available}, Requested: ${quantity}, Total: ${stock.quantity}, Reserved: ${stock.reserved_quantity}`);
  }
  
  try {
    const reduced = await reduceStock(db, productId, quantity);
    if (!reduced) {
      // Check stock again to provide better error message
      const currentStock = await getStock(db, productId);
      const currentAvailable = currentStock ? currentStock.quantity - currentStock.reserved_quantity : 0;
      throw new ConflictError(`Failed to reduce stock. Current available: ${currentAvailable}, Requested: ${quantity}. Stock may have been reduced by another order.`);
    }
    
    // Invalidate shipping cache - stock reduction affects shipping availability
    if (cache) {
      await invalidateShippingCache(cache, productId);
    }
  } catch (error) {
    // Convert regular errors to ConflictError to preserve error messages
    if (error instanceof ConflictError) {
      throw error; // Already a ConflictError, re-throw as-is
    }
    
    // Convert any error related to stock reduction to ConflictError
    const errorMessage = error.message || String(error);
    if (errorMessage.includes('Insufficient') || 
        errorMessage.includes('Failed to reduce') || 
        errorMessage.includes('not found in inventory') ||
        error.name === 'ConflictError') {
      console.error(`[fulfillment-service] Converting error to ConflictError:`, errorMessage);
      throw new ConflictError(errorMessage);
    }
    
    // Log unexpected errors
    console.error(`[fulfillment-service] Unexpected error reducing stock:`, error);
    throw new ConflictError(`Failed to reduce stock: ${errorMessage}`);
  }
  
  console.log(`[fulfillment-service] Stock reduced successfully for ${productId}`);
  return true;
}

/**
 * Reserve stock (for cart)
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reserve
 * @param {D1Database} db - Database instance
 * @returns {Promise<boolean>} True if reserved successfully
 */
export async function reserveProductStock(productId, quantity, db, cache = null) {
  const available = await getAvailableStock(db, productId);
  
  if (available < quantity) {
    throw new ConflictError(`Insufficient stock. Available: ${available}, Requested: ${quantity}`);
  }
  
  const reserved = await reserveStock(db, productId, quantity);
  if (!reserved) {
    throw new ConflictError('Failed to reserve stock. Insufficient quantity available.');
  }
  
  // Invalidate shipping cache - reserved stock affects available stock for shipping
  if (cache) {
    await invalidateShippingCache(cache, productId);
  }
  
  return true;
}

/**
 * Release reserved stock
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to release
 * @param {D1Database} db - Database instance
 * @returns {Promise<boolean>} True if released successfully
 */
export async function releaseProductStock(productId, quantity, db, cache = null) {
  const released = await releaseReservedStock(db, productId, quantity);
  
  // Invalidate shipping cache - releasing reserved stock affects available stock for shipping
  if (cache) {
    await invalidateShippingCache(cache, productId);
  }
  
  return released;
}

/**
 * Get shipping options for a product (warehouse-based, India-specific)
 * @param {string} productId - Product ID
 * @param {string} category - Product category
 * @param {D1Database} db - Database instance
 * @param {Object} userAddress - User address with pincode, city, state
 * @returns {Promise<Object>} Shipping options with warehouse info
 */
/**
 * Generate cache key for shipping options
 * Format: shipping:{productId}:{pincode}
 * Note: City and state are included in pincode coverage, so pincode alone is sufficient
 * @param {string} productId - Product ID
 * @param {Object} userAddress - Address with pincode
 * @returns {string|null} Cache key or null if no pincode
 */
function getShippingCacheKey(productId, userAddress) {
  if (!userAddress || !userAddress.pincode) return null;
  
  // Simple cache key: shipping:{productId}:{pincode}
  // Pincode alone is sufficient as it determines warehouse and zone
  return `shipping:${productId}:${userAddress.pincode}`;
}

/**
 * Get shipping options from cache
 * @param {KVNamespace} cache - KV cache binding
 * @param {string} cacheKey - Cache key
 * @returns {Promise<Object|null>} Cached data or null
 */
async function getShippingFromCache(cache, cacheKey) {
  if (!cache || !cacheKey) return null;
  
  try {
    const cached = await cache.get(cacheKey, { type: 'json' });
    if (cached) {
      console.log(`[Shipping Cache] Cache hit for key: ${cacheKey}`);
      return cached;
    }
  } catch (error) {
    console.error(`[Shipping Cache] Error reading cache for ${cacheKey}:`, error.message);
  }
  
  return null;
}

/**
 * Store shipping options in cache
 * @param {KVNamespace} cache - KV cache binding
 * @param {string} cacheKey - Cache key
 * @param {Object} data - Data to cache
 * @param {number} ttl - Time to live in seconds (default: 120 = 2 minutes)
 */
async function setShippingCache(cache, cacheKey, data, ttl = 120) {
  if (!cache || !cacheKey) return;
  
  try {
    await cache.put(cacheKey, JSON.stringify(data), { expirationTtl: ttl });
    console.log(`[Shipping Cache] Cached data for key: ${cacheKey} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error(`[Shipping Cache] Error storing cache for ${cacheKey}:`, error.message);
    // Cache write error - non-fatal, continue
  }
}

/**
 * Invalidate all shipping cache entries for a product
 * This is called when stock changes (added, updated, reduced, reserved, released)
 * because shipping options depend on warehouse stock availability
 * @param {KVNamespace} cache - KV cache binding
 * @param {string} productId - Product ID
 */
export async function invalidateShippingCache(cache, productId) {
  if (!cache || !productId) return;
  
  try {
    // List all keys with prefix shipping:{productId}:
    const prefix = `shipping:${productId}:`;
    const keys = await cache.list({ prefix });
    
    if (keys.keys && keys.keys.length > 0) {
      // Delete all matching keys
      const deletePromises = keys.keys.map(key => cache.delete(key.name));
      await Promise.all(deletePromises);
      console.log(`[Shipping Cache] Invalidated ${keys.keys.length} cache entries for product ${productId}`);
    } else {
      console.log(`[Shipping Cache] No cache entries found to invalidate for product ${productId}`);
    }
  } catch (error) {
    console.error(`[Shipping Cache] Error invalidating cache for product ${productId}:`, error.message);
    // Cache invalidation error - non-fatal, continue
  }
}

export async function getShippingOptions(productId, category, db, userAddress = null, requiredQuantity = 1, cache = null) {
  // Generate cache key based on productId and pincode
  const cacheKey = getShippingCacheKey(productId, userAddress);
  
  // Try to get from cache first (2 minute TTL)
  if (cacheKey) {
    const cached = await getShippingFromCache(cache, cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  // Cache miss - calculate shipping options
  const { getShippingOptionsForProduct } = await import('../models/shippingModel.js');
  const options = await getShippingOptionsForProduct(db, productId, category, userAddress, requiredQuantity);
  
  // Cache the result (2 minute TTL - short TTL as requested)
  if (cacheKey) {
    await setShippingCache(cache, cacheKey, options, 120); // 2 minutes
  }
  
  return options;
}

/**
 * Calculate shipping cost
 * @param {Object} params - Calculation parameters
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Shipping cost and estimated delivery
 */
export async function calculateShipping(params, db) {
  return await calculateShippingCost(db, params);
}

/**
 * Calculate shipping for multiple products in batch
 * @param {Object} params - Batch calculation parameters
 * @param {Array} params.items - Array of {productId, category, quantity}
 * @param {Object} params.address - Shipping address
 * @param {D1Database} db - Database instance
 * @param {KVNamespace} cache - KV cache binding (optional)
 * @returns {Promise<Object>} Shipping options for all products (both standard and express)
 */
export async function calculateBatchShipping(params, db, cache = null) {
  const { items, address } = params;
  
  const results = {};
  
  // Calculate shipping for each product (both standard and express)
  const calculationPromises = items.map(async (item) => {
    // Generate cache key for this product
    const cacheKey = getShippingCacheKey(item.productId, address);
    
    // Try to get from cache first
    let cachedOptions = null;
    if (cacheKey) {
      cachedOptions = await getShippingFromCache(cache, cacheKey);
    }
    
    let productResults;
    
    if (cachedOptions) {
      // Cache hit - use cached data
      console.log(`[Batch Shipping] Cache hit for product ${item.productId}`);
      
      // Cached data has format: { standard: {...}, express: {...}, ... }
      // We need to extract just standard and express for batch response
      productResults = {
        standard: cachedOptions.standard || { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false },
        express: cachedOptions.express || { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false }
      };
    } else {
      // Cache miss - calculate shipping options
      // OPTIMIZATION: Use getShippingOptionsForProduct which returns both standard and express in one call
      // This is more efficient and ensures cache format matches single product endpoint
      console.log(`[Batch Shipping] Cache miss for product ${item.productId}, calculating...`);
      
      const { getShippingOptionsForProduct } = await import('../models/shippingModel.js');
      
      try {
        // Get full shipping options (includes both standard and express)
        const fullOptions = await getShippingOptionsForProduct(
          db,
          item.productId,
          item.category,
          address,
          item.quantity || 1
        );
        
        // Cache the full options (2 minute TTL - short TTL as requested)
        if (cacheKey) {
          await setShippingCache(cache, cacheKey, fullOptions, 120); // 2 minutes
        }
        
        // Extract standard and express for batch response
        productResults = {
          standard: fullOptions.standard || { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false },
          express: fullOptions.express || { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false }
        };
      } catch (error) {
        console.error(`[fulfillmentService] Error calculating shipping for ${item.productId}:`, error.message);
        // Return default unavailable state on error
        productResults = {
          standard: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false },
          express: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false }
        };
      }
    }
    
    return { productId: item.productId, options: productResults };
  });
  
  const allResults = await Promise.all(calculationPromises);
  
  // Build result object keyed by productId
  allResults.forEach(({ productId, options }) => {
    results[productId] = options;
  });
  
  return results;
}

