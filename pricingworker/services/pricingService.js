/**
 * Pricing service
 */

import { getPrice, getPrices, setPrice, updatePrice } from '../models/priceModel.js';
import { NotFoundError, ConflictError } from '../../shared/utils/errors.js';

/**
 * Get price for a product
 * @param {string} productId - Product ID
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Price data
 */
export async function getProductPrice(productId, db) {
  const price = await getPrice(db, productId);
  if (!price) {
    throw new NotFoundError('Price');
  }
  return price;
}

/**
 * Get prices for multiple products
 * @param {string[]} productIds - Array of product IDs
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Map of productId to price
 */
export async function getProductPrices(productIds, db) {
  const prices = await getPrices(db, productIds);
  
  // Convert to map for easy lookup
  const priceMap = {};
  prices.forEach(price => {
    priceMap[price.product_id] = {
      price: price.price,
      currency: price.currency,
      updatedAt: price.updated_at,
    };
  });
  
  return priceMap;
}

/**
 * Set or update price for a product
 * @param {string} productId - Product ID
 * @param {number} price - Price value
 * @param {string} currency - Currency code
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Price data
 */
export async function setProductPrice(productId, price, currency, db) {
  // Check if price exists
  const existing = await getPrice(db, productId);
  
  if (existing) {
    // Update existing price
    const updated = await updatePrice(db, productId, price);
    if (!updated) {
      throw new Error('Failed to update price');
    }
    return {
      productId,
      price,
      currency: existing.currency,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Create new price
    return await setPrice(db, productId, price, currency);
  }
}

/**
 * Update price for a product
 * @param {string} productId - Product ID
 * @param {number} price - New price value
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Updated price data
 */
export async function updateProductPrice(productId, price, db) {
  const existing = await getPrice(db, productId);
  if (!existing) {
    throw new NotFoundError('Price');
  }
  
  const updated = await updatePrice(db, productId, price);
  if (!updated) {
    throw new Error('Failed to update price');
  }
  
  return {
    productId,
    price,
    currency: existing.currency,
    updatedAt: new Date().toISOString(),
  };
}

