/**
 * Rating service
 */

import { createRating, getRatingByOrderAndProduct, getRatingsByProduct, getRatingsByOrder } from '../models/ratingModel.js';
import { ConflictError } from '../../shared/utils/errors.js';
import { executeTransaction } from '../../shared/utils/database.js';

/**
 * Create rating (one per completed order per product)
 * @param {Object} ratingData - Rating data
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Created rating
 */
export async function submitRating(ratingData, db) {
  // Check if rating already exists for this order and product
  const existing = await getRatingByOrderAndProduct(db, ratingData.orderId, ratingData.productId);
  
  if (existing) {
    throw new ConflictError('Rating already exists for this order and product');
  }
  
  // Create rating in transaction
  return await executeTransaction(db, async (txDb) => {
    return await createRating(txDb, ratingData);
  });
}

/**
 * Get ratings for a product
 * @param {string} productId - Product ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Ratings and pagination
 */
export async function getProductRatings(productId, page, limit, db) {
  return await getRatingsByProduct(db, productId, page, limit);
}

/**
 * Get rating by order and product
 * @param {string} orderId - Order ID
 * @param {string} productId - Product ID
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object|null>} Rating or null
 */
export async function getRating(orderId, productId, db) {
  return await getRatingByOrderAndProduct(db, orderId, productId);
}

/**
 * Get all ratings for an order
 * @param {string} orderId - Order ID
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object[]>} Array of ratings
 */
export async function getOrderRatings(orderId, db) {
  return await getRatingsByOrder(db, orderId);
}

