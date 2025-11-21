import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import * as ratingController from './controllers/ratingController.js';
import * as authController from './controllers/authController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Inter-worker routes (private)
router.post('/rating', ratingController.validateWorkerRequest, ratingController.createRating);
router.get('/ratings/:productId', ratingController.getRatings);
router.get('/rating/:orderId/:productId', ratingController.getRating);

// User-facing routes (authenticated)
router.post('/order/:orderId/rate', async (request, env, ctx) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await ratingController.createUserRating(request, env, ctx);
});

router.get('/order/:orderId/ratings', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await ratingController.getOrderRatingsUser(request, env);
});

// Health check
router.get('/health', ratingController.healthCheck);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'rating-worker', 
  status: 'running',
  endpoints: ['/ratings/:productId', '/rating/:orderId/:productId', '/health']
}), { 
  status: 200, 
  headers: { 'Content-Type': 'application/json' } 
}));

// 404 handler
router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`[rating-worker] ${request.method} ${url.pathname}`);
    
    try {
      let response = await router.handle(request, env, ctx).catch((error) => {
        return errorHandler(error, request);
      });
      
      // If router returns null/undefined, create error response
      if (!response) {
        console.error('[rating-worker] Router returned null/undefined');
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
      
      console.log(`[rating-worker] Returning response with status: ${response.status}`);
      return response;
    } catch (error) {
      console.error('[rating-worker] Fetch handler error:', error.message, error.stack);
      const errorResponse = errorHandler(error, request);
      return addCorsHeaders(errorResponse, request);
    }
  },
};

