/**
 * Payment model for payment worker
 * Stores payment data with encrypted payment IDs
 */

/**
 * Create payment record
 * @param {D1Database} db - Database instance
 * @param {string} orderId - Order ID
 * @param {string} encryptedPaymentId - Encrypted PayPal payment ID
 * @param {Object} paymentData - Payment data (as blob)
 * @returns {Promise<Object>} Created payment record
 */
export async function createPayment(db, orderId, encryptedPaymentId, paymentData) {
  const paymentId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const result = await db
    .prepare(
      `INSERT INTO payments (payment_id, order_id, encrypted_payment_id, payment_data, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(paymentId, orderId, encryptedPaymentId, JSON.stringify(paymentData), now, now)
    .run();
  
  if (!result.success) {
    throw new Error('Failed to create payment record');
  }
  
  return {
    paymentId,
    orderId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get payment by payment ID
 * @param {D1Database} db - Database instance
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object|null>} Payment data or null
 */
export async function getPaymentById(db, paymentId) {
  const result = await db
    .prepare(
      `SELECT payment_id, order_id, encrypted_payment_id, payment_data, status, created_at, updated_at
       FROM payments 
       WHERE payment_id = ? AND deleted_at IS NULL`
    )
    .bind(paymentId)
    .first();
  
  return result || null;
}

/**
 * Get payment by order ID
 * @param {D1Database} db - Database instance
 * @param {string} orderId - Order ID
 * @returns {Promise<Object|null>} Payment data or null
 */
export async function getPaymentByOrderId(db, orderId) {
  const result = await db
    .prepare(
      `SELECT payment_id, order_id, encrypted_payment_id, payment_data, status, created_at, updated_at
       FROM payments 
       WHERE order_id = ? AND deleted_at IS NULL`
    )
    .bind(orderId)
    .first();
  
  return result || null;
}

/**
 * Update payment status
 * @param {D1Database} db - Database instance
 * @param {string} paymentId - Payment ID
 * @param {string} status - New status
 * @param {Object} paymentData - Updated payment data
 * @returns {Promise<boolean>} True if updated
 */
export async function updatePayment(db, paymentId, status, paymentData = null) {
  let query = `UPDATE payments 
               SET status = ?, updated_at = ?`;
  const params = [status, new Date().toISOString()];
  
  if (paymentData) {
    query += `, payment_data = ?`;
    params.push(JSON.stringify(paymentData));
  }
  
  query += ` WHERE payment_id = ? AND deleted_at IS NULL`;
  params.push(paymentId);
  
  const result = await db.prepare(query).bind(...params).run();
  
  return result.success && result.meta.changes > 0;
}

