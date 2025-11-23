import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import { AuthenticationError } from '../shared/utils/errors.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders, createOtelConfig } from '../shared/utils/tracing.js';
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
      initRequestTrace(request, 'pricing-worker');
      
      // Log structured JSON with trace IDs and CF Ray ID
      const traceContext = getTraceContext();
      const cfRayId = getCfRayId(request);
      const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
      
      console.log(JSON.stringify({
        message: `[pricing-worker] ${request.method} ${url.pathname}${url.search}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        method: request.method,
        path: url.pathname,
        service: 'pricing-worker',
        isWorkerRequest: isWorkerRequest,
      }));
      
      try {
        let response = await router.handle(request, env, ctx);
        
        // If router returns null/undefined, create error response
        if (!response) {
          console.error('[pricing-worker] Router returned null/undefined');
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
        
        // Add CORS headers
        response = addCorsHeaders(response, request);
        
        // Add trace headers for client correlation
        response = addTraceHeaders(response, request);
        
        // Log structured JSON response
        console.log(JSON.stringify({
          message: `[pricing-worker] Returning response with status: ${response.status}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          status: response.status,
          service: 'pricing-worker',
        }));
        
        return response;
      } catch (error) {
        console.error(JSON.stringify({
          message: '[pricing-worker] Fetch handler error',
          error: error.message,
          stack: error.stack,
          traceId: getTraceContext().traceId,
          spanId: getTraceContext().spanId,
          cfRayId: getCfRayId(request),
          service: 'pricing-worker',
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
