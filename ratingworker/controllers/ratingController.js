/**
 * Rating controller
 */

import * as ratingService from '../services/ratingService.js';
import { validateApiKey } from '../../shared/utils/interWorker.js';
import { AuthenticationError, ValidationError } from '../../shared/utils/errors.js';
import { createRatingSchema } from '../validation/ratingValidation.js';
import { sendLog } from '../../shared/utils/logger.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    await env.rating_db.prepare('SELECT 1').first();
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'rating-worker',
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        service: 'rating-worker',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Validate worker request
 */
export function validateWorkerRequest(request, env) {
  if (!validateApiKey(request, env.INTER_WORKER_API_KEY)) {
    throw new AuthenticationError('Invalid API key for inter-worker request');
  }
}

/**
 * Create rating
 */
export async function createRating(request, env) {
  const body = await request.json();
  
  const { error, value } = createRatingSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  const rating = await ratingService.submitRating(value, env.rating_db);
  
  return new Response(
    JSON.stringify(rating),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Get ratings for a product
 */
export async function getRatings(request, env) {
  const { productId } = request.params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  
  const result = await ratingService.getProductRatings(productId, page, limit, env.rating_db);
  
  // Fetch user names for ratings (batch call)
  if (result.ratings && result.ratings.length > 0) {
    const userIds = [...new Set(result.ratings.map(r => r.user_id))];
    const userMap = {};
    
    // Fetch user names from auth worker in a single batch call
    try {
      let usersResponse;
      if (env.auth_worker) {
        // Use service binding
        const batchRequest = new Request(`https://workers.dev/users/batch?userIds=${userIds.join(',')}`, {
          method: 'GET',
          headers: {
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
        });
        usersResponse = await env.auth_worker.fetch(batchRequest);
      } else {
        // Fallback to HTTP
        const authUrl = env.AUTH_WORKER_URL || 'https://auth-worker.shyaamdps.workers.dev';
        usersResponse = await fetch(`${authUrl}/users/batch?userIds=${userIds.join(',')}`, {
          method: 'GET',
          headers: {
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
        });
      }
      
      if (usersResponse.ok) {
        const batchResult = await usersResponse.json();
        const users = batchResult.users || {};
        
        // Build user map from batch response (include name and profileImage)
        Object.keys(users).forEach(userId => {
          userMap[userId] = {
            name: users[userId].name || 'Anonymous',
            profileImage: users[userId].profileImage || null,
          };
        });
      }
    } catch (error) {
      console.error('[ratingController] Error fetching user names in batch:', error.message);
    }
    
    // Add user names and profile images to ratings
    result.ratings = result.ratings.map(rating => ({
      ...rating,
      userName: userMap[rating.user_id]?.name || 'Anonymous',
      userProfileImage: userMap[rating.user_id]?.profileImage || null,
    }));
  }
  
  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Get rating by order and product
 */
export async function getRating(request, env) {
  const { orderId, productId } = request.params;
  
  const rating = await ratingService.getRating(orderId, productId, env.rating_db);
  
  if (!rating) {
    return new Response(
      JSON.stringify({ error: 'Rating not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify(rating),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Get all ratings for an order (inter-worker)
 */
export async function getOrderRatings(request, env) {
  const { orderId } = request.params;
  
  const ratings = await ratingService.getOrderRatings(orderId, env.rating_db);
  
  // Convert to map keyed by productId for easy lookup
  const ratingsMap = {};
  if (Array.isArray(ratings)) {
    ratings.forEach(rating => {
      ratingsMap[rating.product_id] = {
        ratingId: rating.rating_id,
        orderId: rating.order_id,
        productId: rating.product_id,
        userId: rating.user_id,
        rating: rating.rating,
        title: rating.title || null,
        comment: rating.comment || null,
        createdAt: rating.created_at,
        updatedAt: rating.updated_at,
      };
    });
  }
  
  // Fetch user names for ratings (batch call)
  if (ratings && ratings.length > 0) {
    const userIds = [...new Set(ratings.map(r => r.user_id))];
    const userMap = {};
    
    // Fetch user names from auth worker in a single batch call
    try {
      let usersResponse;
      if (env.auth_worker) {
        // Use service binding
        const batchRequest = new Request(`https://workers.dev/users/batch?userIds=${userIds.join(',')}`, {
          method: 'GET',
          headers: {
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
        });
        usersResponse = await env.auth_worker.fetch(batchRequest);
      } else {
        // Fallback to HTTP
        const authUrl = env.AUTH_WORKER_URL || 'https://auth-worker.shyaamdps.workers.dev';
        usersResponse = await fetch(`${authUrl}/users/batch?userIds=${userIds.join(',')}`, {
          method: 'GET',
          headers: {
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
        });
      }
      
      if (usersResponse.ok) {
        const batchResult = await usersResponse.json();
        const users = batchResult.users || {};
        
        // Build user map from batch response
        Object.keys(users).forEach(userId => {
          userMap[userId] = users[userId].name || 'Anonymous';
        });
      }
    } catch (error) {
      console.error('[ratingController] Error fetching user names in batch for order ratings:', error.message);
    }
    
    // Add user names to ratings map
    Object.keys(ratingsMap).forEach(productId => {
      ratingsMap[productId].userName = userMap[ratingsMap[productId].userId] || 'Anonymous';
    });
  }
  
  return new Response(
    JSON.stringify({ ratings: ratingsMap }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Create rating (user-facing endpoint)
 * Validates that order is completed and belongs to user
 */
export async function createUserRating(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  // Declare variables outside try block so they're accessible in catch
  let body = null;
  let value = null;
  
  try {
    console.log('[ratingController] createUserRating called');
    const { orderId } = request.params;
    console.log('[ratingController] orderId:', orderId);
    console.log('[ratingController] request.user:', request.user);
    
    body = await request.json();
    console.log('[ratingController] request body:', body);
    
    const userId = request.user?.userId;
    
    if (!userId) {
      console.error('[ratingController] User ID not found in request');
      throw new ValidationError('User ID not found in request');
    }
    
    console.log('[ratingController] userId:', userId);
    
    // Validate request body
    const { error, value: validatedValue } = createRatingSchema.validate({
      ...body,
      orderId,
      userId,
    });
    
    if (error) {
      console.error('[ratingController] Validation error:', error.details);
      throw new ValidationError(error.details[0].message, error.details);
    }
    
    value = validatedValue;
    console.log('[ratingController] Validated data:', value);
  
    // Verify order exists, belongs to user, and is completed
    let orderResponse;
    try {
      if (env.orders_worker) {
        console.log('[ratingController] Using service binding for orders worker');
        // Use service binding
        const orderRequest = new Request(`https://workers.dev/order/${orderId}`, {
          method: 'GET',
          headers: {
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
            'Authorization': request.headers.get('Authorization') || '',
            'Cookie': request.headers.get('Cookie') || '',
          },
        });
        orderResponse = await env.orders_worker.fetch(orderRequest);
      } else {
        console.log('[ratingController] Using HTTP fallback for orders worker');
        // Fallback to HTTP
        const ordersUrl = env.ORDERS_WORKER_URL || 'https://orders-worker.shyaamdps.workers.dev';
        orderResponse = await fetch(`${ordersUrl}/order/${orderId}`, {
          method: 'GET',
          headers: {
            'Authorization': request.headers.get('Authorization') || '',
            'Cookie': request.headers.get('Cookie') || '',
          },
        });
      }
      
      console.log('[ratingController] Order response status:', orderResponse.status);
      
      if (!orderResponse.ok) {
        const errorText = await orderResponse.text().catch(() => 'Unknown error');
        console.error('[ratingController] Order response error:', orderResponse.status, errorText);
        if (orderResponse.status === 404) {
          throw new ValidationError('Order not found');
        }
        throw new ValidationError(`Failed to verify order: ${orderResponse.status} ${errorText}`);
      }
      
      const order = await orderResponse.json();
      console.log('[ratingController] Order retrieved:', order.orderId, order.status);
      
      // Verify order belongs to user
      if (order.userId !== userId && order.userData?.userId !== userId) {
        console.error('[ratingController] Order does not belong to user. Order userId:', order.userId, 'Request userId:', userId);
        throw new ValidationError('Order does not belong to user');
      }
      
      // Verify order is completed
      if (order.status !== 'completed') {
        console.error('[ratingController] Order is not completed. Status:', order.status);
        throw new ValidationError('Can only rate products from completed orders');
      }
      
      // Verify product is in the order
      const orderItems = order.items || order.productData?.items || [];
      console.log('[ratingController] Order items:', orderItems.map(i => i.productId));
      const productInOrder = orderItems.some(item => item.productId === value.productId);
      if (!productInOrder) {
        console.error('[ratingController] Product not found in order. ProductId:', value.productId);
        throw new ValidationError('Product not found in this order');
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      console.error('[ratingController] Error verifying order:', error.message, error.stack);
      throw new ValidationError('Failed to verify order: ' + error.message);
    }
  
    // Submit rating
    console.log('[ratingController] Submitting rating to service...');
    
    // Log rating submission start
    await sendLog(logWorkerBindingOrUrl, 'event', 'Rating submission started', {
      userId,
      orderId,
      productId: value.productId,
      rating: value.rating,
      worker: 'rating-worker',
    }, apiKey, ctx);
    
    const rating = await ratingService.submitRating(value, env.rating_db);
    console.log('[ratingController] Rating created successfully:', rating.ratingId);
    
    // Log successful rating submission
    await sendLog(logWorkerBindingOrUrl, 'event', 'Rating submitted successfully', {
      userId,
      orderId,
      productId: value.productId,
      ratingId: rating.ratingId,
      rating: value.rating,
      hasTitle: !!value.title,
      hasComment: !!value.comment,
      worker: 'rating-worker',
    }, apiKey, ctx);
    
    return new Response(
      JSON.stringify(rating),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[ratingController] Error in createUserRating:', error);
    console.error('[ratingController] Error message:', error.message);
    console.error('[ratingController] Error stack:', error.stack);
    console.error('[ratingController] Error name:', error.name);
    console.error('[ratingController] Error constructor:', error.constructor.name);
    
    // Log rating submission failure
    // value and body are in outer scope, so they should be available
    await sendLog(logWorkerBindingOrUrl, 'error', 'Rating submission failed', {
      userId: request.user?.userId || null,
      orderId: request.params.orderId || null,
      productId: (value?.productId || body?.productId) || null,
      error: error.message,
      worker: 'rating-worker',
    }, apiKey, ctx);
    
    // Re-throw to let error handler process it
    throw error;
  }
}

/**
 * Get all ratings for an order (user-facing endpoint)
 */
export async function getOrderRatingsUser(request, env) {
  try {
    const { orderId } = request.params;
    const userId = request.user?.userId;
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID not found in request' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  
  // Verify order exists and belongs to user
  try {
    let orderResponse;
    if (env.orders_worker) {
      // Use service binding
      const orderRequest = new Request(`https://workers.dev/order/${orderId}`, {
        method: 'GET',
        headers: {
          'X-API-Key': env.INTER_WORKER_API_KEY,
          'X-Worker-Request': 'true',
          'Authorization': request.headers.get('Authorization') || '',
          'Cookie': request.headers.get('Cookie') || '',
        },
      });
      orderResponse = await env.orders_worker.fetch(orderRequest);
    } else {
      // Fallback to HTTP
      const ordersUrl = env.ORDERS_WORKER_URL || 'https://orders-worker.shyaamdps.workers.dev';
      orderResponse = await fetch(`${ordersUrl}/order/${orderId}`, {
        method: 'GET',
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
          'Cookie': request.headers.get('Cookie') || '',
        },
      });
    }
    
    if (!orderResponse.ok) {
      if (orderResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: 'Order not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Failed to verify order');
    }
    
    const order = await orderResponse.json();
    
    // Verify order belongs to user
    if (order.userId !== userId && order.userData?.userId !== userId) {
      return new Response(
        JSON.stringify({ error: 'Order does not belong to user' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[ratingController] Error verifying order:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to verify order' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
    // Get ratings for the order
    const ratings = await ratingService.getOrderRatings(orderId, env.rating_db);
    
    // Convert to map keyed by productId for easy lookup
    const ratingsMap = {};
    if (Array.isArray(ratings)) {
      ratings.forEach(rating => {
        ratingsMap[rating.product_id] = {
          ratingId: rating.rating_id,
          orderId: rating.order_id,
          productId: rating.product_id,
          userId: rating.user_id,
          rating: rating.rating,
          title: rating.title || null,
          comment: rating.comment || null,
          createdAt: rating.created_at,
          updatedAt: rating.updated_at,
        };
      });
    }
    
    // Fetch user names for ratings (batch call)
    if (ratings && ratings.length > 0) {
      const userIds = [...new Set(ratings.map(r => r.user_id))];
      const userMap = {};
      
      // Fetch user names from auth worker in a single batch call
      try {
        let usersResponse;
        if (env.auth_worker) {
          // Use service binding
          const batchRequest = new Request(`https://workers.dev/users/batch?userIds=${userIds.join(',')}`, {
            method: 'GET',
            headers: {
              'X-API-Key': env.INTER_WORKER_API_KEY,
              'X-Worker-Request': 'true',
            },
          });
          usersResponse = await env.auth_worker.fetch(batchRequest);
        } else {
          // Fallback to HTTP
          const authUrl = env.AUTH_WORKER_URL || 'https://auth-worker.shyaamdps.workers.dev';
          usersResponse = await fetch(`${authUrl}/users/batch?userIds=${userIds.join(',')}`, {
            method: 'GET',
            headers: {
              'X-API-Key': env.INTER_WORKER_API_KEY,
              'X-Worker-Request': 'true',
            },
          });
        }
        
        if (usersResponse.ok) {
          const batchResult = await usersResponse.json();
          const users = batchResult.users || {};
          
          // Build user map from batch response (include name and profileImage)
          Object.keys(users).forEach(userId => {
            userMap[userId] = {
              name: users[userId].name || 'Anonymous',
              profileImage: users[userId].profileImage || null,
            };
          });
        }
      } catch (error) {
        console.error('[ratingController] Error fetching user names in batch for order ratings:', error.message);
      }
      
      // Add user names and profile images to ratings map
      Object.keys(ratingsMap).forEach(productId => {
        const userInfo = userMap[ratingsMap[productId].userId];
        ratingsMap[productId].userName = userInfo?.name || 'Anonymous';
        ratingsMap[productId].userProfileImage = userInfo?.profileImage || null;
      });
    }
    
    return new Response(
      JSON.stringify({ ratings: ratingsMap }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[ratingController] Error in getOrderRatingsUser:', error.message, error.stack);
    // Re-throw to let error handler process it
    throw error;
  }
}

