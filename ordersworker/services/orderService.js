/**
 * Order service
 */

import { getOrderById as getOrderByIdModel, getOrdersByUserId as getOrdersByUserIdModel, updateOrderStatus } from '../models/orderModel.js';
import { createOrderSaga, capturePaymentSaga } from './orderSagaService.js';
import { callWorker } from '../../shared/utils/interWorker.js';
import { NotFoundError } from '../../shared/utils/errors.js';

/**
 * Get order by ID
 * @param {string} orderId - Order ID
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object>} Order data
 */
export async function getOrderById(orderId, db) {
  const order = await getOrderByIdModel(db, orderId);
  if (!order) {
    throw new NotFoundError('Order');
  }
  return order;
}

/**
 * Get orders by user ID with optional filters
 * @param {string} userId - User ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @param {D1Database} db - Database instance
 * @param {string} status - Optional status filter
 * @param {string} dateFrom - Optional date filter (YYYY-MM-DD)
 * @param {string} dateTo - Optional date filter (YYYY-MM-DD)
 * @returns {Promise<Object>} Orders and pagination
 */
export async function getOrdersByUserId(userId, page, limit, db, status = null, dateFrom = null, dateTo = null) {
  return await getOrdersByUserIdModel(db, userId, page, limit, status, dateFrom, dateTo);
}

/**
 * Create order using Saga pattern
 * @param {string} userId - User ID
 * @param {Object} orderData - Order data
 * @param {Object} env - Environment variables
 * @param {string} frontendOrigin - Frontend origin URL for PayPal return URLs
 * @returns {Promise<Object>} Created order with PayPal approval URL
 */
export async function createOrder(userId, orderData, env, frontendOrigin = null, ctx = null) {
  return await createOrderSaga(userId, orderData, env, frontendOrigin, ctx);
}

/**
 * Capture payment and complete order (called after PayPal approval)
 * @param {string} orderId - Order ID
 * @param {string} paypalOrderId - PayPal order ID
 * @param {Object} env - Environment variables
 * @param {string} accessToken - User access token (for cart clearing)
 * @param {ExecutionContext} ctx - Cloudflare execution context (optional, for ctx.waitUntil)
 * @returns {Promise<Object>} Completed order
 */
export async function capturePayment(orderId, paypalOrderId, env, accessToken = null, ctx = null) {
  return await capturePaymentSaga(orderId, paypalOrderId, env, accessToken, ctx);
}

/**
 * Group orders by delivery date
 * Items with different delivery dates within the same order are grouped separately
 * @param {Array} orders - Orders array
 * @returns {Object} Grouped orders (object with date keys, not array)
 */
export function groupOrdersByDeliveryDate(orders) {
  const grouped = {};
  
  orders.forEach(order => {
    const items = order.items || order.productData?.items || [];
    
    // Group items by their individual delivery dates
    const itemsByDeliveryDate = {};
    
    items.forEach(item => {
      // Get delivery date from item.shipping.deliveryDate if available (new format)
      // Otherwise calculate from item.shipping.estimatedDays or fallback to order-level
      let deliveryDate;
      let dateKey;
      
      if (item.shipping?.deliveryDate) {
        // New format: delivery date is stored per item
        dateKey = item.shipping.deliveryDate;
      } else if (item.shipping?.estimatedDays) {
        // Calculate from estimated days
        const createdAt = new Date(order.createdAt);
        deliveryDate = new Date(createdAt);
        deliveryDate.setDate(deliveryDate.getDate() + item.shipping.estimatedDays);
        dateKey = deliveryDate.toISOString().split('T')[0];
      } else {
        // Fallback to order-level delivery date
        const estimatedDelivery = order.shippingData?.estimatedDelivery || 5;
        deliveryDate = new Date(order.createdAt);
        deliveryDate.setDate(deliveryDate.getDate() + estimatedDelivery);
        dateKey = deliveryDate.toISOString().split('T')[0];
      }
      
      if (!itemsByDeliveryDate[dateKey]) {
        itemsByDeliveryDate[dateKey] = [];
      }
      itemsByDeliveryDate[dateKey].push(item);
    });
    
    // Create order copies for each delivery date group
    Object.keys(itemsByDeliveryDate).forEach(dateKey => {
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      
      // Create a copy of the order with only items for this delivery date
      const orderCopy = {
        ...order,
        items: itemsByDeliveryDate[dateKey],
        deliveryDate: dateKey, // Add deliveryDate field for frontend compatibility
        // Update shippingInfo to reflect this group's delivery date
        shippingInfo: {
          ...order.shippingInfo,
          estimatedDelivery: itemsByDeliveryDate[dateKey][0]?.shipping?.estimatedDays || 
                            order.shippingInfo?.estimatedDelivery || 5,
        },
      };
      
      grouped[dateKey].push(orderCopy);
    });
  });
  
  // Return object (not array) for frontend compatibility
  return grouped;
}

/**
 * Submit rating for a product
 * @param {string} orderId - Order ID
 * @param {string} productId - Product ID
 * @param {number} rating - Rating (1-5)
 * @param {string} comment - Optional comment
 * @param {string} ratingWorkerUrl - Rating worker URL
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} Rating data
 */
export async function submitRating(orderId, productId, rating, comment, ratingWorkerUrl, apiKey) {
  const response = await callWorker(
    `${ratingWorkerUrl}/rating`,
    {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        productId,
        rating,
        comment,
      }),
    },
    apiKey
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to submit rating');
  }
  
  return await response.json();
}

