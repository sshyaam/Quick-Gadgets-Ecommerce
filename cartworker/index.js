import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders, createOtelConfig } from '../shared/utils/tracing.js';
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

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Extract trace context from incoming request (for distributed tracing)
    // This ensures traces from other workers or external clients are properly linked
    const { withTraceContext, getTraceContext, getCfRayId } = await import('../shared/utils/otel.js');
    
    // Always try to extract and use trace context from incoming request
    // If no trace context exists, OpenTelemetry will create a new trace
    return await withTraceContext(request.headers, async () => {
      // Initialize request tracing with CF Ray ID (within the trace context)
      initRequestTrace(request, 'cart-worker');
      
      // Log structured JSON with trace IDs and CF Ray ID
      const traceContext = getTraceContext();
      const cfRayId = getCfRayId(request);
      const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
      
      console.log(JSON.stringify({
        message: `[cart-worker] ${request.method} ${url.pathname}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        method: request.method,
        path: url.pathname,
        service: 'cart-worker',
        isWorkerRequest: isWorkerRequest,
      }));
      
      try {
        let response = await router.handle(request, env, ctx);
        
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
        
        response = addCorsHeaders(response, request);
        response = addTraceHeaders(response, request);
        
        console.log(JSON.stringify({
          message: `[cart-worker] Returning response with status: ${response.status}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          status: response.status,
          service: 'cart-worker',
        }));
        
        return response;
      } catch (error) {
        console.error(JSON.stringify({
          message: '[cart-worker] Fetch handler error',
          error: error.message,
          stack: error.stack,
          traceId: getTraceContext().traceId,
          spanId: getTraceContext().spanId,
          cfRayId: getCfRayId(request),
          service: 'cart-worker',
        }));
        const errorResponse = errorHandler(error, request);
        const corsResponse = addCorsHeaders(errorResponse, request);
        return addTraceHeaders(corsResponse, request);
      }
    });
  },
};

// OpenTelemetry configuration for Honeycomb
// Using unified dataset for distributed tracing across all workers
const otelConfig = (env) => createOtelConfig(env, 'ecommerce-platform');

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);

