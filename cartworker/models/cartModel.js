/**
 * Cart model for cart worker
 * Stores cart items with locked price and stock
 */

/**
 * Get cart by user ID
 * @param {D1Database} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Cart data or null
 */
export async function getCartByUserId(db, userId) {
  const result = await db
    .prepare(
      `SELECT cart_id, user_id, items, total_price, created_at, updated_at
       FROM carts 
       WHERE user_id = ? AND deleted_at IS NULL`
    )
    .bind(userId)
    .first();
  
  return result || null;
}

/**
 * Get cart by cart ID
 * @param {D1Database} db - Database instance
 * @param {string} cartId - Cart ID
 * @returns {Promise<Object|null>} Cart data or null
 */
export async function getCartById(db, cartId) {
  const result = await db
    .prepare(
      `SELECT cart_id, user_id, items, total_price, created_at, updated_at
       FROM carts 
       WHERE cart_id = ? AND deleted_at IS NULL`
    )
    .bind(cartId)
    .first();
  
  return result || null;
}

/**
 * Create cart
 * @param {D1Database} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Created cart
 */
export async function createCart(db, userId) {
  const cartId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const result = await db
    .prepare(
      `INSERT INTO carts (cart_id, user_id, items, total_price, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .bind(cartId, userId, JSON.stringify([]), now, now)
    .run();
  
  if (!result.success) {
    throw new Error('Failed to create cart');
  }
  
  return {
    cartId,
    userId,
    items: [],
    totalPrice: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update cart
 * @param {D1Database} db - Database instance
 * @param {string} cartId - Cart ID
 * @param {Array} items - Cart items
 * @param {number} totalPrice - Total price
 * @returns {Promise<boolean>} True if updated
 */
export async function updateCart(db, cartId, items, totalPrice) {
  try {
    const itemsJson = JSON.stringify(items);
    const updatedAt = new Date().toISOString();
    
    console.log(`[cart-model] Updating cart ${cartId} with ${items.length} items, totalPrice: ${totalPrice}`);
    
    const result = await db
      .prepare(
        `UPDATE carts 
         SET items = ?, total_price = ?, updated_at = ? 
         WHERE cart_id = ? AND deleted_at IS NULL`
      )
      .bind(itemsJson, totalPrice, updatedAt, cartId)
      .run();
    
    console.log(`[cart-model] Update result - success: ${result.success}, changes: ${result.meta?.changes || 0}`);
    
    if (!result.success) {
      console.error(`[cart-model] Update failed - result:`, result);
      return false;
    }
    
    return result.meta.changes > 0;
  } catch (error) {
    console.error(`[cart-model] Error updating cart:`, error.message, error.stack);
    throw error;
  }
}

/**
 * Clear cart
 * @param {D1Database} db - Database instance
 * @param {string} cartId - Cart ID
 * @returns {Promise<boolean>} True if cleared
 */
export async function clearCart(db, cartId) {
  const result = await db
    .prepare(
      `UPDATE carts 
       SET items = ?, total_price = 0, updated_at = ? 
       WHERE cart_id = ? AND deleted_at IS NULL`
    )
    .bind(JSON.stringify([]), new Date().toISOString(), cartId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

/**
 * Soft delete cart
 * @param {D1Database} db - Database instance
 * @param {string} cartId - Cart ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function softDeleteCart(db, cartId) {
  const result = await db
    .prepare(
      `UPDATE carts 
       SET deleted_at = ? 
       WHERE cart_id = ? AND deleted_at IS NULL`
    )
    .bind(new Date().toISOString(), cartId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

