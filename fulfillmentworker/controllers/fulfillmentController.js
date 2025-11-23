/**
 * Fulfillment controller
 */

import * as fulfillmentService from '../services/fulfillmentService.js';
import { validateApiKey } from '../../shared/utils/interWorker.js';
import { AuthenticationError, ValidationError, ConflictError } from '../../shared/utils/errors.js';
import { updateStockSchema, reduceStockSchema, reserveStockSchema, releaseStockSchema, calculateShippingSchema, calculateBatchShippingSchema } from '../validation/fulfillmentValidation.js';
import { sendLog } from '../../shared/utils/logger.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    // Check database
    await env.fulfillment_db.prepare('SELECT 1').first();
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'fulfillment-worker',
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
        service: 'fulfillment-worker',
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
 * Validate worker request (for inter-worker calls)
 * Returns a response if invalid, or nothing to continue
 */
export async function validateWorkerRequest(request, env) {
  if (!validateApiKey(request, env.INTER_WORKER_API_KEY)) {
    // Throw error - itty-router error handler will catch it
    throw new AuthenticationError('Invalid API key for inter-worker request');
  }
  // Don't return anything - continue to next handler
}

/**
 * Get stock for a product
 */
export async function getStock(request, env) {
  const { productId } = request.params;
  
  const stock = await fulfillmentService.getProductStock(
    productId, 
    env.fulfillment_db,
    env.reserved_stock_do // Pass DO binding
  );
  
  return new Response(
    JSON.stringify(stock),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get stocks for multiple products
 */
export async function getStocks(request, env) {
  const url = new URL(request.url);
  const productIds = url.searchParams.get('productIds');
  
  if (!productIds) {
    throw new ValidationError('productIds query parameter is required');
  }
  
  const ids = productIds.split(',').filter(id => id.trim());
  if (ids.length === 0) {
    throw new ValidationError('At least one productId is required');
  }
  
  const stocks = await fulfillmentService.getProductStocks(
    ids, 
    env.fulfillment_db,
    env.reserved_stock_do // Pass DO binding
  );
  
  return new Response(
    JSON.stringify(stocks),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Update stock for a product
 */
export async function updateStock(request, env) {
  const { productId } = request.params;
  const body = await request.json();
  
  // Validate
  const { error, value } = updateStockSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  const stock = await fulfillmentService.updateProductStock(
    productId,
    value.quantity,
    env.fulfillment_db,
    env.SHIPPING_CACHE, // Pass KV cache for invalidation
    env.reserved_stock_do // Pass DO binding
  );
  
  return new Response(
    JSON.stringify(stock),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Reduce stock (for order fulfillment)
 */
export async function reduceStock(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  const { productId } = request.params;
  const body = await request.json();
  
  // Validate
  const { error, value } = reduceStockSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  try {
    // Log stock reduction start
    await sendLog(logWorkerBindingOrUrl, 'event', 'Stock reduction started', {
      productId,
      quantity: value.quantity,
      worker: 'fulfillment-worker',
    }, apiKey, ctx);
    
    // Get orderId from request body if available
    const orderId = value.orderId || null;
    
    await fulfillmentService.reduceProductStock(
      productId,
      value.quantity,
      env.fulfillment_db,
      env.SHIPPING_CACHE, // Pass KV cache for invalidation
      env.reserved_stock_do, // Pass DO binding
      orderId // Pass orderId if available
    );
    
    // Log successful stock reduction
    await sendLog(logWorkerBindingOrUrl, 'event', 'Stock reduced successfully', {
      productId,
      quantity: value.quantity,
      worker: 'fulfillment-worker',
    }, apiKey, ctx);
    
    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // Log full error details
    console.error(`[fulfillment-controller] Error reducing stock for ${productId}:`, {
      message: error.message,
      name: error.name,
      stack: error.stack,
      isConflictError: error instanceof ConflictError,
    });
    
    // Log stock reduction failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'Stock reduction failed', {
      productId,
      quantity: value.quantity,
      error: error.message,
      worker: 'fulfillment-worker',
    }, apiKey, ctx);
    
    // If it's already a ConflictError, re-throw as-is
    if (error instanceof ConflictError) {
      throw error;
    }
    
    // Convert to ConflictError to preserve error message
    throw new ConflictError(error.message || `Failed to reduce stock: ${String(error)}`);
  }
}

/**
 * Get shipping options for a product (warehouse-based, requires address)
 */
export async function getShippingOptions(request, env) {
  const { productId } = request.params;
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  
  if (!category) {
    throw new ValidationError('category query parameter is required');
  }
  
  // Get address from query params or request body
  let userAddress = null;
  const pincode = url.searchParams.get('pincode');
  const city = url.searchParams.get('city') || '';
  const state = url.searchParams.get('state') || '';
  
  if (pincode) {
    // Pincode is required, city and state are optional
    userAddress = { pincode, city, state };
  } else {
    // Try to get from request body if POST
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.address && body.address.pincode) {
        userAddress = {
          pincode: body.address.pincode,
          city: body.address.city || '',
          state: body.address.state || ''
        };
      }
    }
  }
  
  if (!userAddress || !userAddress.pincode) {
    throw new ValidationError('Pincode is required for shipping options');
  }
  
  const options = await fulfillmentService.getShippingOptions(
    productId,
    category,
    env.fulfillment_db,
    userAddress,
    1, // requiredQuantity
    env.SHIPPING_CACHE // KV cache binding
  );
  
  return new Response(
    JSON.stringify(options),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Calculate shipping cost
 */
export async function calculateShipping(request, env) {
  const body = await request.json();
  
  // Validate
  const { error, value } = calculateShippingSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  const result = await fulfillmentService.calculateShipping(
    value,
    env.fulfillment_db
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
 * Calculate shipping for multiple products in batch
 * Accepts array of products and returns shipping options for all (both standard and express)
 */
export async function calculateBatchShipping(request, env) {
  const body = await request.json();
  
  // Validate
  const { error, value } = calculateBatchShippingSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  const result = await fulfillmentService.calculateBatchShipping(
    value,
    env.fulfillment_db,
    env.SHIPPING_CACHE // Pass KV cache binding
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
 * Reserve stock (for orders)
 */
export async function reserveStock(request, env) {
  const { productId } = request.params;
  const body = await request.json();
  
  // Validate using reserveStockSchema
  const { error, value } = reserveStockSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  await fulfillmentService.reserveProductStock(
    productId,
    value.quantity,
    env.fulfillment_db,
    env.SHIPPING_CACHE, // Pass KV cache for invalidation
    env.reserved_stock_do, // Pass DO binding
    value.orderId, // Pass orderId for TTL tracking
    value.ttlMinutes // Pass TTL (defaults to 15 if not provided)
  );
  
  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get reserved stock status for a product (inter-worker)
 */
export async function getReservedStockStatus(request, env) {
  const { productId } = request.params;
  
  if (!env.reserved_stock_do) {
    throw new Error('ReservedStockDO binding not available');
  }
  
  const { getReservedStockStatus } = await import('../utils/reservedStockDO.js');
  const status = await getReservedStockStatus(env.reserved_stock_do, productId);
  
  return new Response(
    JSON.stringify(status),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get all reservations for a product (including expired, for debugging)
 */
export async function getAllReservations(request, env) {
  const { productId } = request.params;
  
  if (!env.reserved_stock_do) {
    throw new Error('ReservedStockDO binding not available');
  }
  
  const { getAllReservations } = await import('../utils/reservedStockDO.js');
  const data = await getAllReservations(env.reserved_stock_do, productId);
  
  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Clean up expired reservations for a product
 */
export async function cleanupReservations(request, env) {
  const { productId } = request.params;
  
  if (!env.reserved_stock_do) {
    throw new Error('ReservedStockDO binding not available');
  }
  
  const { cleanupExpiredReservations } = await import('../utils/reservedStockDO.js');
  const result = await cleanupExpiredReservations(env.reserved_stock_do, productId);
  
  return new Response(
    JSON.stringify(result),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Release reserved stock
 */
export async function releaseStock(request, env) {
  const { productId } = request.params;
  
  // Parse body - handle empty body gracefully
  let body = {};
  try {
    // Check if request has a body by checking content-length
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 0) {
      body = await request.json();
    }
  } catch (error) {
    // If body is invalid JSON, throw a clear error
    if (error instanceof SyntaxError) {
      throw new ValidationError('Request body must be valid JSON with either orderId or quantity');
    }
    throw error;
  }
  
  // Validate using releaseStockSchema
  const { error, value } = releaseStockSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message || 'Either orderId or quantity must be provided', error.details);
  }
  
  console.log(`[fulfillment-controller] Releasing stock for product ${productId}, orderId: ${value.orderId}, quantity: ${value.quantity}`);
  
  // Pass orderId if provided, otherwise pass null and use quantity
  const orderId = value.orderId || null;
  const quantity = orderId ? null : (value.quantity || null);
  
  await fulfillmentService.releaseProductStock(
    productId,
    orderId,
    env.fulfillment_db,
    env.SHIPPING_CACHE, // Pass KV cache for invalidation
    env.reserved_stock_do, // Pass DO binding
    quantity
  );
  
  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

