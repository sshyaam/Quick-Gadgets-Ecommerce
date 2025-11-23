/**
 * Orders controller
 */

import * as orderService from '../services/orderService.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { createOrderSchema } from '../validation/orderValidation.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    // Check database
    await env.orders_db.prepare('SELECT 1').first();
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'orders-worker',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        service: 'orders-worker',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Get orders for user
 */
export async function getOrders(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);
  
  // Get filter parameters
  const status = url.searchParams.get('status') || null;
  const dateFrom = url.searchParams.get('dateFrom') || null;
  const dateTo = url.searchParams.get('dateTo') || null;
  
  console.log('[orders-controller] Filter parameters:', { status, dateFrom, dateTo, userId: request.user.userId });
  
  // Get orders with filters
  const orders = await orderService.getOrdersByUserId(
    request.user.userId,
    page,
    limit,
    env.orders_db,
    status,
    dateFrom,
    dateTo
  );
  
  console.log('[orders-controller] Found orders:', orders.orders.length, 'with filters:', { status, dateFrom, dateTo });
  
    // Format billing address for display
    const formatBillingAddress = (billingAddr) => {
      if (!billingAddr) {
        return 'Not Available';
      }
      
      const parts = [];
      if (billingAddr.name) parts.push(billingAddr.name);
      if (billingAddr.line1) parts.push(billingAddr.line1);
      if (billingAddr.line2) parts.push(billingAddr.line2);
      if (billingAddr.city) parts.push(billingAddr.city);
      if (billingAddr.state) parts.push(billingAddr.state);
      if (billingAddr.postalCode) parts.push(billingAddr.postalCode);
      if (billingAddr.countryCode) parts.push(billingAddr.countryCode);
      
      return parts.length > 0 ? parts.join(', ') : 'Not Available';
    };
    
    // Transform orders to match frontend expectations
    const transformedOrders = orders.orders.map(order => ({
      orderId: order.orderId,
      status: order.status,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      // Map productData.items to items
      items: order.productData?.items || [],
      // Map shippingData to shippingInfo
      shippingInfo: order.shippingData ? {
        mode: order.shippingData.mode || 'standard',
        cost: order.shippingData.cost || 0,
        estimatedDelivery: order.shippingData.estimatedDelivery || 5,
      } : null,
      // Payment method
      paymentMethod: order.addressData?.paymentMethod || 'paypal', // Default to paypal for backward compatibility
      // Billing address from PayPal
      billingAddress: formatBillingAddress(order.addressData?.billingAddress),
      billingAddressData: order.addressData?.billingAddress || null,
      // Keep other fields for compatibility
      addressData: order.addressData,
      userData: order.userData,
      productData: order.productData,
      shippingData: order.shippingData,
    }));
  
  // Group by delivery date
  const groupedOrders = orderService.groupOrdersByDeliveryDate(transformedOrders);
  
  return new Response(
    JSON.stringify({
      orders: groupedOrders,
      pagination: orders.pagination,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get single order
 */
export async function getOrder(request, env) {
  const { orderId } = request.params;
  
  const order = await orderService.getOrderById(orderId, env.orders_db);
  
  if (!order || order.userId !== request.user.userId) {
    return new Response(
      JSON.stringify({ error: 'Order not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Format billing address for display
  const formatBillingAddress = (billingAddr) => {
    if (!billingAddr) {
      return 'Not Available';
    }
    
    const parts = [];
    if (billingAddr.name) parts.push(billingAddr.name);
    if (billingAddr.line1) parts.push(billingAddr.line1);
    if (billingAddr.line2) parts.push(billingAddr.line2);
    if (billingAddr.city) parts.push(billingAddr.city);
    if (billingAddr.state) parts.push(billingAddr.state);
    if (billingAddr.postalCode) parts.push(billingAddr.postalCode);
    if (billingAddr.countryCode) parts.push(billingAddr.countryCode);
    
    return parts.length > 0 ? parts.join(', ') : 'Not Available';
  };
  
  // Transform order to match frontend expectations
  const transformedOrder = {
    orderId: order.orderId,
    status: order.status,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    // Map productData.items to items
    items: order.productData?.items || [],
    // Map shippingData to shippingInfo
    shippingInfo: order.shippingData ? {
      mode: order.shippingData.mode || 'standard',
      cost: order.shippingData.cost || 0,
      estimatedDelivery: order.shippingData.estimatedDelivery || 5,
    } : null,
    // Payment method
    paymentMethod: order.addressData?.paymentMethod || 'paypal', // Default to paypal for backward compatibility
    // Billing address from PayPal
    billingAddress: formatBillingAddress(order.addressData?.billingAddress),
    billingAddressData: order.addressData?.billingAddress || null,
    // Keep other fields for compatibility
    addressData: order.addressData,
    userData: order.userData,
    productData: order.productData,
    shippingData: order.shippingData,
  };
  
  return new Response(
    JSON.stringify(transformedOrder),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Capture payment (called after PayPal approval)
 */
/**
 * Create COD (Cash on Delivery) order
 */
export async function createCODOrder(request, env, ctx = null) {
  const body = await request.json();
  
  const { error, value } = createOrderSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message || 'Invalid order data', error.details);
  }
  
  // Manual validation for itemShippingModes values
  if (value.itemShippingModes && typeof value.itemShippingModes === 'object') {
    for (const [productId, shippingMode] of Object.entries(value.itemShippingModes)) {
      if (shippingMode !== 'standard' && shippingMode !== 'express') {
        throw new ValidationError(`Invalid shipping mode '${shippingMode}' for product ${productId}. Must be 'standard' or 'express'.`);
      }
    }
  }
  
  // Get access token from cookie or Authorization header for cart worker
  const cookies = request.headers.get('Cookie') || '';
  const authHeader = request.headers.get('Authorization') || '';
  
  let accessToken = null;
  
  // Try Authorization header first (localStorage fallback)
  if (authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7).trim();
  } else {
    // Try cookies
    const cookieParts = cookies.split(';');
    for (const part of cookieParts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('accessToken=')) {
        accessToken = trimmed.substring('accessToken='.length).trim();
        // Decode if URL encoded
        try {
          accessToken = decodeURIComponent(accessToken);
        } catch (e) {
          // If decoding fails, use as-is
        }
        break;
      }
    }
  }
  
  // If still no token, log error (shouldn't happen if authenticate middleware worked)
  if (!accessToken) {
    console.error('[orders-controller] No access token found for cart worker call');
    throw new Error('Access token required for cart operations');
  }
  
  const { createCODOrderSaga } = await import('../services/orderSagaService.js');
  const result = await createCODOrderSaga(
    request.user.userId,
    {
      ...value,
      accessToken,
      userData: request.user,
    },
    env,
    ctx,
    request
  );
  
  return new Response(
    JSON.stringify(result),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Cancel order and release reserved stock
 */
export async function cancelOrder(request, env, ctx = null) {
  const { orderId } = request.params;
  
  if (!orderId) {
    throw new ValidationError('orderId is required');
  }
  
  const { cancelOrderSaga } = await import('../services/orderSagaService.js');
  const result = await cancelOrderSaga(orderId, env, ctx);
  
  return new Response(
    JSON.stringify(result),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function capturePayment(request, env, ctx = null) {
  const body = await request.json();
  const { orderId, paypalOrderId } = body;
  
  if (!orderId || !paypalOrderId) {
    throw new ValidationError('orderId and paypalOrderId are required');
  }
  
  // Get access token for cart clearing
  const cookies = request.headers.get('Cookie') || '';
  const authHeader = request.headers.get('Authorization') || '';
  let accessToken = null;
  
  if (authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7).trim();
  } else {
    const cookieParts = cookies.split(';');
    for (const part of cookieParts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('accessToken=')) {
        accessToken = trimmed.substring('accessToken='.length).trim();
        try {
          accessToken = decodeURIComponent(accessToken);
        } catch (e) {
          // If decoding fails, use as-is
        }
        break;
      }
    }
  }
  
  // Capture payment and complete order
  const result = await orderService.capturePayment(
    orderId,
    paypalOrderId,
    env,
    accessToken,
    ctx // Pass execution context for ctx.waitUntil
  );
  
  return new Response(
    JSON.stringify(result),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create order
 */
export async function createOrder(request, env, ctx = null) {
  const body = await request.json();
  
  // Validate
  const { error, value } = createOrderSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  // Manual validation for itemShippingModes values
  if (value.itemShippingModes && typeof value.itemShippingModes === 'object') {
    for (const [productId, shippingMode] of Object.entries(value.itemShippingModes)) {
      if (shippingMode !== 'standard' && shippingMode !== 'express') {
        throw new ValidationError(`Invalid shipping mode '${shippingMode}' for product ${productId}. Must be 'standard' or 'express'.`);
      }
    }
  }
  
  // Get access token from cookie or Authorization header for cart worker
  const cookies = request.headers.get('Cookie') || '';
  const authHeader = request.headers.get('Authorization') || '';
  
  let accessToken = null;
  
  // Try Authorization header first (localStorage fallback)
  if (authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7).trim();
  } else {
    // Try cookies
    const cookieParts = cookies.split(';');
    for (const part of cookieParts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('accessToken=')) {
        accessToken = trimmed.substring('accessToken='.length).trim();
        // Decode if URL encoded
        try {
          accessToken = decodeURIComponent(accessToken);
        } catch (e) {
          // If decoding fails, use as-is
        }
        break;
      }
    }
  }
  
  // Extract frontend origin from request headers for PayPal return URLs
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  let frontendOrigin = 'https://week2ecom-frontend.pages.dev'; // Default fallback
  
  if (origin) {
    try {
      const url = new URL(origin);
      frontendOrigin = `${url.protocol}//${url.host}`;
    } catch (e) {
      // If parsing fails, use default
      console.warn('[orders-controller] Failed to parse origin:', origin);
    }
  }

  // If still no token, log error (shouldn't happen if authenticate middleware worked)
  if (!accessToken) {
    console.error('[orders-controller] No access token found for cart worker call');
    console.error('[orders-controller] Cookies:', cookies ? 'present' : 'missing');
    console.error('[orders-controller] Authorization header:', authHeader ? 'present' : 'missing');
    throw new Error('Access token required for cart operations');
  }
  
  console.log('[orders-controller] Using access token for cart worker (length:', accessToken.length, ')');
  
  // Create order using Saga pattern (pass frontend origin for PayPal return URLs)
  const result = await orderService.createOrder(
    request.user.userId,
    {
      ...value,
      accessToken,
      userData: request.user,
    },
    env,
    frontendOrigin,
    ctx, // Pass execution context for ctx.waitUntil
    request // Pass request for CF Ray ID and trace context
  );
  
  return new Response(
    JSON.stringify(result),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Rate product (only for completed orders)
 */
export async function rateProduct(request, env) {
  const { orderId } = request.params;
  const body = await request.json();
  
  // Validate
  if (!body.productId || !body.rating || body.rating < 1 || body.rating > 5) {
    throw new ValidationError('productId and rating (1-5) are required');
  }
  
  // Get order
  const order = await orderService.getOrderById(orderId, env.orders_db);
  
  if (!order || order.userId !== request.user.userId) {
    return new Response(
      JSON.stringify({ error: 'Order not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  if (order.status !== 'completed') {
    throw new ValidationError('Can only rate products from completed orders');
  }
  
  // Submit rating to rating worker
  const rating = await orderService.submitRating(
    orderId,
    body.productId,
    body.rating,
    body.comment,
    env.RATING_WORKER_URL,
    env.INTER_WORKER_API_KEY
  );
  
  return new Response(
    JSON.stringify(rating),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

