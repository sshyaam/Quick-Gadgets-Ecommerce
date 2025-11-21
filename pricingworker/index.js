import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import { AuthenticationError } from '../shared/utils/errors.js';
import * as pricingController from './controllers/pricingController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Simple middleware function - returns error response if invalid
function requireApiKey(request, env) {
  const apiKey = request.headers.get('X-API-Key');
  const workerRequest = request.headers.get('X-Worker-Request');
  
  if (!apiKey || !workerRequest || apiKey !== env.INTER_WORKER_API_KEY || workerRequest !== 'true') {
    return new Response(
      JSON.stringify({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid API key for inter-worker request',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  return null; // Continue
}

// Inter-worker routes (private)
router.get('/product/:productId', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await pricingController.getPrice(request, env);
});

router.get('/products', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await pricingController.getPrices(request, env);
});

router.put('/product/:productId', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await pricingController.updatePrice(request, env);
});

router.post('/product/:productId', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await pricingController.setPrice(request, env);
});

// Simple test endpoint (no auth required)
router.get('/test', () => {
  console.log('[pricing-worker] /test endpoint called');
  return new Response('hi', { 
    status: 200, 
    headers: { 'Content-Type': 'text/plain' } 
  });
});

// Health check (public)
router.get('/health', pricingController.healthCheck);

// Root route (public)
router.get('/', () => new Response(JSON.stringify({ 
  service: 'pricing-worker', 
  status: 'running',
  endpoints: ['/health', '/test']
}), { 
  status: 200, 
  headers: { 'Content-Type': 'application/json' } 
}));

// 404 handler - must be last
router.all('*', (request) => {
  console.log(`[pricing-worker] 404 - No route matched for ${request.method} ${new URL(request.url).pathname}`);
  return new Response('Not Found', { status: 404 });
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`[pricing-worker] ${request.method} ${url.pathname}${url.search}`);
    console.log(`[pricing-worker] Headers:`, {
      'x-api-key': request.headers.get('X-API-Key') ? 'present' : 'missing',
      'x-worker-request': request.headers.get('X-Worker-Request'),
    });
    
    try {
      const response = await router.handle(request, env, ctx);
      if (!response) {
        console.error('[pricing-worker] Router returned null/undefined');
        return new Response('Internal Server Error', { status: 500 });
      }
      return addCorsHeaders(response, request);
    } catch (error) {
      console.error('[pricing-worker] Error:', error.message, error.stack);
      const errorResponse = errorHandler(error, request);
      return addCorsHeaders(errorResponse, request);
    }
  },
};
