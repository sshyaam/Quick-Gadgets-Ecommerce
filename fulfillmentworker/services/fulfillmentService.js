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
export async function updateProductStock(productId, quantity, db) {
  if (quantity < 0) {
    throw new Error('Stock quantity cannot be negative');
  }
  
  const existing = await getStock(db, productId);
  if (!existing) {
    // Create new stock entry
    return await setStock(db, productId, quantity);
  }
  
  const updated = await updateStock(db, productId, quantity);
  if (!updated) {
    throw new Error('Failed to update stock');
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
export async function reduceProductStock(productId, quantity, db) {
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
export async function reserveProductStock(productId, quantity, db) {
  const available = await getAvailableStock(db, productId);
  
  if (available < quantity) {
    throw new ConflictError(`Insufficient stock. Available: ${available}, Requested: ${quantity}`);
  }
  
  const reserved = await reserveStock(db, productId, quantity);
  if (!reserved) {
    throw new ConflictError('Failed to reserve stock. Insufficient quantity available.');
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
export async function releaseProductStock(productId, quantity, db) {
  return await releaseReservedStock(db, productId, quantity);
}

/**
 * Get shipping options for a product (warehouse-based, India-specific)
 * @param {string} productId - Product ID
 * @param {string} category - Product category
 * @param {D1Database} db - Database instance
 * @param {Object} userAddress - User address with pincode, city, state
 * @returns {Promise<Object>} Shipping options with warehouse info
 */
export async function getShippingOptions(productId, category, db, userAddress = null, requiredQuantity = 1, cache = null) {
  // Generate cache key
  const cacheKey = userAddress && userAddress.pincode 
    ? `shipping:${productId}:${category}:${userAddress.pincode}:${requiredQuantity}`
    : null;
  
  // Try to get from cache (5 minute TTL)
  if (cache && cacheKey) {
    try {
      const cached = await cache.get(cacheKey, { type: 'json' });
      if (cached) {
        return cached;
      }
    } catch (error) {
      // Cache miss or error - continue to DB query
    }
  }
  
  const { getShippingOptionsForProduct } = await import('../models/shippingModel.js');
  const options = await getShippingOptionsForProduct(db, productId, category, userAddress, requiredQuantity);
  
  // Cache the result (5 minute TTL)
  if (cache && cacheKey) {
    try {
      await cache.put(cacheKey, JSON.stringify(options), { expirationTtl: 300 }); // 5 minutes
    } catch (error) {
      // Cache write error - non-fatal, continue
    }
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
 * @returns {Promise<Object>} Shipping options for all products (both standard and express)
 */
export async function calculateBatchShipping(params, db) {
  const { items, address } = params;
  
  const results = {};
  
  // Calculate shipping for each product (both standard and express)
  const calculationPromises = items.map(async (item) => {
    const productResults = {
      standard: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false },
      express: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false }
    };
    
    // Calculate both standard and express shipping
    for (const mode of ['standard', 'express']) {
      try {
        const result = await calculateShippingCost(db, {
          category: item.category,
          shippingMode: mode,
          quantity: item.quantity,
          address: address,
          productId: item.productId
        });
        
        productResults[mode] = {
          cost: Math.round(result.cost * 100) / 100,
          estimatedDays: result.estimatedDays || null,
          estimatedDaysRange: result.estimatedDaysRange || null,
          available: result.cost > 0
        };
      } catch (error) {
        console.error(`[fulfillmentService] Error calculating ${mode} shipping for ${item.productId}:`, error.message);
        // Keep default unavailable state
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

