/**
 * Cart controller
 */

import * as cartService from '../services/cartService.js';
import { validateApiKey, getWorkerBinding } from '../../shared/utils/interWorker.js';
import { AuthenticationError, ValidationError } from '../../shared/utils/errors.js';
import { addItemSchema, updateItemSchema } from '../validation/cartValidation.js';
import { sendLog } from '../../shared/utils/logger.js';
import jwt from 'jsonwebtoken';

/**
 * Authentication middleware
 */
export async function authenticate(request, env) {
  try {
    // Get access token from cookie or Authorization header (fallback)
    const cookies = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';
    
    console.log('[cart-worker] Authenticate - Cookies:', cookies ? 'present' : 'missing');
    console.log('[cart-worker] Authorization header:', authHeader ? 'present' : 'missing');
    
    // Parse cookies more robustly - handle URL encoding and whitespace
    let accessToken = null;
    
    // Try Authorization header first (localStorage fallback)
    if (authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7).trim();
      console.log('[cart-worker] Using token from Authorization header');
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
          console.log('[cart-worker] Using token from Cookie header');
          break;
        }
      }
    }

    if (!accessToken) {
      console.log('[cart-worker] No access token found in cookies');
      console.log('[cart-worker] Cookie header:', cookies.substring(0, 100));
      return new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Access token required. Please log in.',
          },
        }),
        {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
          },
        }
      );
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(accessToken, env.ENCRYPTION_KEY);
    } catch (error) {
      console.log('[cart-worker] Token verification failed:', error.message);
      return new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid or expired access token. Please log in again.',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify session with auth worker using Service Binding
    try {
      const sessionResponse = await getWorkerBinding(
        env.auth_worker,
        `/session/${decoded.sessionId}`,
        {},
        env.INTER_WORKER_API_KEY
      );

      if (!sessionResponse.ok) {
        console.log('[cart-worker] Session verification failed');
        return new Response(
          JSON.stringify({
            error: {
              code: 'AUTHENTICATION_ERROR',
              message: 'Session not found or expired. Please log in again.',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (error) {
      console.error('[cart-worker] Session verification error:', error.message);
      return new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Failed to verify session. Please log in again.',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Attach to request for use in handlers
    request.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
    };
    
    console.log('[cart-worker] Authentication successful for user:', decoded.userId);
    // Return null to continue to next handler
    return null;
  } catch (error) {
    console.error('[cart-worker] Authentication error:', error.message);
    return new Response(
      JSON.stringify({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: error.message || 'Authentication failed',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    // Check database
    await env.cart_db.prepare('SELECT 1').first();
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'cart-worker',
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
        service: 'cart-worker',
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
 */
export function validateWorkerRequest(request, env) {
  if (!validateApiKey(request, env.INTER_WORKER_API_KEY)) {
    throw new AuthenticationError('Invalid API key for inter-worker request');
  }
}

/**
 * Get cart
 */
export async function getCart(request, env) {
  const cart = await cartService.getOrCreateCart(
    request.user.userId,
    env.cart_db
  );
  
  return new Response(
    JSON.stringify(cart),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Add item to cart
 */
export async function addItem(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    const body = await request.json();
    
    // Validate
    const { error, value } = addItemSchema.validate(body);
    if (error) {
      throw new ValidationError(error.details[0].message, error.details);
    }
    
    // Log item addition start
    await sendLog(logWorkerBindingOrUrl, 'debug', 'Adding item to cart', {
      userId: request.user.userId,
      productId: value.productId,
      quantity: value.quantity,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    const cart = await cartService.addItemToCart(
      request.user.userId,
      value,
      env.cart_db,
      env.catalog_worker, // Service binding for product details
      env.pricing_worker, // Service binding
      env.fulfillment_worker, // Service binding
      env.INTER_WORKER_API_KEY
    );
    
    // Log successful item addition
    await sendLog(logWorkerBindingOrUrl, 'event', 'Item added to cart', {
      userId: request.user.userId,
      productId: value.productId,
      quantity: value.quantity,
      cartId: cart.cartId,
      totalItems: cart.items?.length || 0,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    return new Response(
      JSON.stringify(cart),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[cart-controller] Error adding item to cart:', error.message, error.stack);
    // Log item addition failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'Failed to add item to cart', {
      userId: request.user.userId,
      productId: body.productId || null,
      quantity: body.quantity || null,
      error: error.message,
      worker: 'cart-worker',
    }, apiKey, ctx);
    // Re-throw to let error handler deal with it
    throw error;
  }
}

/**
 * Update item quantity
 */
export async function updateItem(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    const { itemId } = request.params;
    const body = await request.json();
    
    console.log(`[cart-controller] Updating item ${itemId} with body:`, JSON.stringify(body));
    
    // Validate
    const { error, value } = updateItemSchema.validate(body);
    if (error) {
      throw new ValidationError(error.details[0].message, error.details);
    }
    
    // Log item update start
    await sendLog(logWorkerBindingOrUrl, 'debug', 'Updating cart item quantity', {
      userId: request.user.userId,
      itemId,
      newQuantity: value.quantity,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    const cart = await cartService.updateItemQuantity(
      request.user.userId,
      itemId,
      value.quantity,
      env.cart_db,
      env.fulfillment_worker, // Service binding
      env.INTER_WORKER_API_KEY
    );
    
    // Log successful item update
    await sendLog(logWorkerBindingOrUrl, 'event', 'Cart item quantity updated', {
      userId: request.user.userId,
      itemId,
      newQuantity: value.quantity,
      cartId: cart.cartId,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    return new Response(
      JSON.stringify(cart),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[cart-controller] Error updating item:', error.message, error.stack);
    // Log item update failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'Failed to update cart item', {
      userId: request.user.userId,
      itemId: request.params.itemId,
      error: error.message,
      worker: 'cart-worker',
    }, apiKey, ctx);
    throw error;
  }
}

/**
 * Remove item from cart
 */
export async function removeItem(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    const { itemId } = request.params;
    
    console.log(`[cart-controller] Removing item ${itemId}`);
    
    // Log item removal start
    await sendLog(logWorkerBindingOrUrl, 'debug', 'Removing item from cart', {
      userId: request.user.userId,
      itemId,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    const cart = await cartService.removeItemFromCart(
      request.user.userId,
      itemId,
      env.cart_db,
      env.fulfillment_worker, // Service binding
      env.INTER_WORKER_API_KEY
    );
    
    // Log successful item removal
    await sendLog(logWorkerBindingOrUrl, 'event', 'Item removed from cart', {
      userId: request.user.userId,
      itemId,
      cartId: cart.cartId,
      remainingItems: cart.items?.length || 0,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    return new Response(
      JSON.stringify(cart),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[cart-controller] Error removing item:', error.message, error.stack);
    // Log item removal failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'Failed to remove item from cart', {
      userId: request.user.userId,
      itemId: request.params.itemId,
      error: error.message,
      worker: 'cart-worker',
    }, apiKey, ctx);
    throw error;
  }
}

/**
 * Clear cart
 */
export async function clearCart(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    console.log(`[cart-controller] Clearing cart for user ${request.user.userId}`);
    
    // Log cart clear start
    await sendLog(logWorkerBindingOrUrl, 'debug', 'Clearing cart', {
      userId: request.user.userId,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    await cartService.clearUserCart(
      request.user.userId,
      env.cart_db,
      env.fulfillment_worker, // Service binding
      env.INTER_WORKER_API_KEY
    );
    
    // Log successful cart clear
    await sendLog(logWorkerBindingOrUrl, 'event', 'Cart cleared', {
      userId: request.user.userId,
      worker: 'cart-worker',
    }, apiKey, ctx);
    
    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[cart-controller] Error clearing cart:', error.message, error.stack);
    throw error;
  }
}

/**
 * Clear cart by cart ID (inter-worker)
 */
export async function clearCartByCartId(request, env) {
  const { cartId } = request.params;
  
  await cartService.clearCartById(cartId, env.cart_db);
  
  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Validate cart (inter-worker)
 */
export async function validateCart(request, env) {
  const body = await request.json();
  
  if (!body.cart) {
    throw new ValidationError('Cart data is required');
  }
  
  const validation = await cartService.validateCart(
    body.cartId || body.cart?.cartId,
    env.cart_db,
    env.pricing_worker, // Service binding
    env.fulfillment_worker, // Service binding
    env.INTER_WORKER_API_KEY
  );
  
  return new Response(
    JSON.stringify(validation),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

