/**
 * Rating model for rating worker
 */

/**
 * Create rating
 * @param {D1Database} db - Database instance
 * @param {Object} ratingData - Rating data
 * @returns {Promise<Object>} Created rating
 */
export async function createRating(db, ratingData) {
  const ratingId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  try {
    const result = await db
      .prepare(
        `INSERT INTO ratings (rating_id, order_id, product_id, user_id, rating, title, comment, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ratingId,
        ratingData.orderId,
        ratingData.productId,
        ratingData.userId,
        ratingData.rating,
        ratingData.title || null,
        ratingData.comment || null,
        now,
        now
      )
      .run();
    
    if (!result.success) {
      console.error('[ratingModel] Failed to create rating:', result.error);
      throw new Error(`Failed to create rating: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('[ratingModel] Error creating rating:', error.message, error.stack);
    // Check if it's a column error (title column might not exist)
    if (error.message && error.message.includes('no such column: title')) {
      throw new Error('Database schema error: title column does not exist. Please run the migration: ALTER TABLE ratings ADD COLUMN title TEXT;');
    }
    throw error;
  }
  
  return {
    ratingId,
    orderId: ratingData.orderId,
    productId: ratingData.productId,
    userId: ratingData.userId,
    rating: ratingData.rating,
    title: ratingData.title || null,
    comment: ratingData.comment || null,
    createdAt: now,
  };
}

/**
 * Get rating by order and product
 * @param {D1Database} db - Database instance
 * @param {string} orderId - Order ID
 * @param {string} productId - Product ID
 * @returns {Promise<Object|null>} Rating or null
 */
export async function getRatingByOrderAndProduct(db, orderId, productId) {
  const result = await db
    .prepare(
      `SELECT rating_id, order_id, product_id, user_id, rating, title, comment, created_at, updated_at
       FROM ratings 
       WHERE order_id = ? AND product_id = ?`
    )
    .bind(orderId, productId)
    .first();
  
  return result || null;
}

/**
 * Get all ratings for an order
 * @param {D1Database} db - Database instance
 * @param {string} orderId - Order ID
 * @returns {Promise<Object[]>} Array of ratings
 */
export async function getRatingsByOrder(db, orderId) {
  const result = await db
    .prepare(
      `SELECT rating_id, order_id, product_id, user_id, rating, title, comment, created_at, updated_at
       FROM ratings 
       WHERE order_id = ?
       ORDER BY created_at DESC`
    )
    .bind(orderId)
    .all();
  
  return result.results || [];
}

/**
 * Get ratings for a product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} Ratings and pagination
 */
export async function getRatingsByProduct(db, productId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  const ratingsResult = await db
    .prepare(
      `SELECT rating_id, order_id, product_id, user_id, rating, title, comment, created_at, updated_at
       FROM ratings 
       WHERE product_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(productId, limit, offset)
    .all();
  
  const countResult = await db
    .prepare(
      `SELECT COUNT(*) as total, AVG(rating) as average
       FROM ratings 
       WHERE product_id = ?`
    )
    .bind(productId)
    .first();
  
  const total = countResult.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  return {
    ratings: ratingsResult.results || [],
    average: countResult.average || 0,
    total,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

