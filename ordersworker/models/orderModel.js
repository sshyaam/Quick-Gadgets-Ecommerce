/**
 * Order model for orders worker
 * Stores order data with user, address, and product data in JSONB format
 */

/**
 * Create order
 * @param {D1Database} db - Database instance
 * @param {Object} orderData - Order data
 * @returns {Promise<Object>} Created order
 */
export async function createOrder(db, orderData) {
  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const result = await db
    .prepare(
      `INSERT INTO orders (order_id, user_id, user_data, address_data, product_data, shipping_data, total_amount, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)`
    )
    .bind(
      orderId,
      orderData.userId,
      JSON.stringify(orderData.userData),
      JSON.stringify(orderData.addressData),
      JSON.stringify(orderData.productData),
      JSON.stringify(orderData.shippingData || {}),
      orderData.totalAmount,
      now,
      now
    )
    .run();
  
  if (!result.success) {
    throw new Error('Failed to create order');
  }
  
  return {
    orderId,
    userId: orderData.userId,
    status: 'processing',
    totalAmount: orderData.totalAmount,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get order by ID
 * @param {D1Database} db - Database instance
 * @param {string} orderId - Order ID
 * @returns {Promise<Object|null>} Order data or null
 */
export async function getOrderById(db, orderId) {
  const result = await db
    .prepare(
      `SELECT order_id, user_id, user_data, address_data, product_data, shipping_data, total_amount, status, created_at, updated_at
       FROM orders 
       WHERE order_id = ?`
    )
    .bind(orderId)
    .first();
  
  if (!result) {
    return null;
  }
  
  // Parse JSONB fields
  return {
    orderId: result.order_id,
    userId: result.user_id,
    userData: typeof result.user_data === 'string' ? JSON.parse(result.user_data) : result.user_data,
    addressData: typeof result.address_data === 'string' ? JSON.parse(result.address_data) : result.address_data,
    productData: typeof result.product_data === 'string' ? JSON.parse(result.product_data) : result.product_data,
    shippingData: typeof result.shipping_data === 'string' ? JSON.parse(result.shipping_data) : result.shipping_data,
    totalAmount: result.total_amount,
    status: result.status,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

/**
 * Get orders by user ID with optional filters
 * @param {D1Database} db - Database instance
 * @param {string} userId - User ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @param {string} status - Optional status filter (completed, processing, cancelled, pending, failed)
 * @param {string} dateFrom - Optional date filter (YYYY-MM-DD) - filter orders created on or after this date
 * @param {string} dateTo - Optional date filter (YYYY-MM-DD) - filter orders created on or before this date
 * @returns {Promise<Object>} Orders and pagination info
 */
export async function getOrdersByUserId(db, userId, page = 1, limit = 10, status = null, dateFrom = null, dateTo = null) {
  const offset = (page - 1) * limit;
  
  // Build WHERE clause with filters
  let whereClause = 'WHERE user_id = ?';
  const bindParams = [userId];
  
  if (status) {
    whereClause += ' AND status = ?';
    bindParams.push(status);
  }
  
  if (dateFrom) {
    whereClause += ' AND DATE(created_at) >= ?';
    bindParams.push(dateFrom);
  }
  
  if (dateTo) {
    whereClause += ' AND DATE(created_at) <= ?';
    bindParams.push(dateTo);
  }
  
  // Build query with filters
  const query = `SELECT order_id, user_id, user_data, address_data, product_data, shipping_data, total_amount, status, created_at, updated_at
       FROM orders 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`;
  
  console.log('[order-model] Query:', query);
  console.log('[order-model] Bind params:', bindParams);
  
  bindParams.push(limit, offset);
  
  const ordersResult = await db
    .prepare(query)
    .bind(...bindParams)
    .all();
  
  console.log('[order-model] Query result count:', ordersResult.results?.length || 0);
  
  // Build count query with same filters
  const countQuery = `SELECT COUNT(*) as total
       FROM orders 
       ${whereClause}`;
  
  const countBindParams = bindParams.slice(0, -2); // Remove limit and offset
  
  const countResult = await db
    .prepare(countQuery)
    .bind(...countBindParams)
    .first();
  
  const total = countResult.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  // Parse JSONB fields
  const orders = (ordersResult.results || []).map(order => ({
    orderId: order.order_id,
    userId: order.user_id,
    userData: typeof order.user_data === 'string' ? JSON.parse(order.user_data) : order.user_data,
    addressData: typeof order.address_data === 'string' ? JSON.parse(order.address_data) : order.address_data,
    productData: typeof order.product_data === 'string' ? JSON.parse(order.product_data) : order.product_data,
    shippingData: typeof order.shipping_data === 'string' ? JSON.parse(order.shipping_data) : order.shipping_data,
    totalAmount: order.total_amount,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  }));
  
  return {
    orders,
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

/**
 * Update order status
 * @param {D1Database} db - Database instance
 * @param {string} orderId - Order ID
 * @param {string} status - New status
 * @returns {Promise<boolean>} True if updated
 */
export async function updateOrderStatus(db, orderId, status) {
  const result = await db
    .prepare(
      `UPDATE orders 
       SET status = ?, updated_at = ? 
       WHERE order_id = ?`
    )
    .bind(status, new Date().toISOString(), orderId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

