import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import * as cartController from './controllers/cartController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Protected routes (require authentication)
router.get('/cart', async (request, env) => {
  const authResult = await cartController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await cartController.getCart(request, env);
});

router.post('/cart/item', async (request, env, ctx) => {
  const authResult = await cartController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await cartController.addItem(request, env, ctx);
});

router.put('/cart/item/:itemId', async (request, env, ctx) => {
  const authResult = await cartController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await cartController.updateItem(request, env, ctx);
});

router.delete('/cart/item/:itemId', async (request, env, ctx) => {
  const authResult = await cartController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await cartController.removeItem(request, env, ctx);
});

router.delete('/cart', async (request, env, ctx) => {
  const authResult = await cartController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await cartController.clearCart(request, env, ctx);
});

// Inter-worker routes (private)
router.post('/cart/validate', cartController.validateWorkerRequest, cartController.validateCart);
router.delete('/cart/:cartId', cartController.validateWorkerRequest, cartController.clearCartByCartId);

// Health check
router.get('/health', cartController.healthCheck);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'cart-worker', 
  status: 'running',
  endpoints: ['/cart', '/cart/item', '/health']
}), { 
  status: 200, 
  headers: { 'Content-Type': 'application/json' } 
}));

// 404 handler
router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`[cart-worker] ${request.method} ${url.pathname}`);
    
    try {
      let response = await router.handle(request, env, ctx);
      
      // If router returns null/undefined, create error response
      if (!response) {
        console.error('[cart-worker] Router returned null/undefined');
        response = new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error',
            },
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      
      // Add CORS headers to all responses
      response = addCorsHeaders(response, request);
      
      console.log(`[cart-worker] Returning response with status: ${response.status}`);
      return response;
    } catch (error) {
      console.error('[cart-worker] Fetch handler error:', error.message, error.stack);
      const errorResponse = errorHandler(error, request);
      return addCorsHeaders(errorResponse, request);
    }
  },
};

