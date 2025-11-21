/**
 * Price model for pricing worker
 */

/**
 * Get price for a product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @returns {Promise<Object|null>} Price data or null
 */
export async function getPrice(db, productId) {
  const result = await db
    .prepare(
      `SELECT product_id, price, currency, updated_at, created_at
       FROM prices 
       WHERE product_id = ?`
    )
    .bind(productId)
    .first();
  
  return result || null;
}

/**
 * Get prices for multiple products
 * @param {D1Database} db - Database instance
 * @param {string[]} productIds - Array of product IDs
 * @returns {Promise<Object[]>} Array of price data
 */
export async function getPrices(db, productIds) {
  if (!productIds || productIds.length === 0) {
    return [];
  }

  const placeholders = productIds.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT product_id, price, currency, updated_at, created_at
       FROM prices 
       WHERE product_id IN (${placeholders})`
    )
    .bind(...productIds)
    .all();
  
  return result.results || [];
}

/**
 * Set price for a product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} price - Price value
 * @param {string} currency - Currency code (default: INR)
 * @returns {Promise<Object>} Created price data
 */
export async function setPrice(db, productId, price, currency = 'INR') {
  const now = new Date().toISOString();
  
  const result = await db
    .prepare(
      `INSERT INTO prices (product_id, price, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(productId, price, currency, now, now)
    .run();
  
  if (!result.success) {
    throw new Error('Failed to set price');
  }
  
  return {
    productId,
    price,
    currency,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update price for a product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {number} price - New price value
 * @returns {Promise<boolean>} True if updated
 */
export async function updatePrice(db, productId, price) {
  const result = await db
    .prepare(
      `UPDATE prices 
       SET price = ?, updated_at = ? 
       WHERE product_id = ?`
    )
    .bind(price, new Date().toISOString(), productId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

