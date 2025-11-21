import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import { AuthenticationError } from '../shared/utils/errors.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders } from '../shared/utils/tracing.js';
import * as fulfillmentController from './controllers/fulfillmentController.js';

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
router.get('/stock/:productId', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await fulfillmentController.getStock(request, env);
});

router.get('/stocks', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await fulfillmentController.getStocks(request, env);
});

router.put('/stock/:productId', async (request, env, ctx) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await fulfillmentController.updateStock(request, env, ctx);
});

// Admin routes for stock management
import { authenticateAdmin } from '../shared/utils/adminAuth.js';
import * as adminController from './controllers/adminController.js';

router.get('/admin/stocks', async (request, env) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.getAllStocks(request, env);
});

router.put('/admin/stock/:productId', async (request, env) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.updateStock(request, env);
});

router.get('/admin/warehouses', async (request, env) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.getAllWarehouses(request, env);
});

router.get('/admin/shipping-rules', async (request, env) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.getAllShippingRules(request, env);
});

router.post('/stock/:productId/reduce', async (request, env, ctx) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await fulfillmentController.reduceStock(request, env, ctx);
});

router.post('/stock/:productId/reserve', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await fulfillmentController.reserveStock(request, env);
});

router.post('/stock/:productId/release', async (request, env) => {
  const authError = requireApiKey(request, env);
  if (authError) return authError;
  return await fulfillmentController.releaseStock(request, env);
});

// Public shipping endpoints (called from frontend)
router.get('/shipping/:productId', async (request, env) => {
  return await fulfillmentController.getShippingOptions(request, env);
});

router.post('/shipping/calculate', async (request, env) => {
  return await fulfillmentController.calculateShipping(request, env);
});

router.post('/shipping/calculate-batch', async (request, env) => {
  return await fulfillmentController.calculateBatchShipping(request, env);
});

// Simple test endpoint (no auth required)
router.get('/test', () => {
  // Test endpoint
  return new Response('hi', { 
    status: 200, 
    headers: { 'Content-Type': 'text/plain' } 
  });
});

// Health check (public)
router.get('/health', fulfillmentController.healthCheck);

// Root route (public)
router.get('/', () => new Response(JSON.stringify({ 
  service: 'fulfillment-worker', 
  status: 'running',
  endpoints: ['/health', '/test']
}), { 
  status: 200, 
  headers: { 'Content-Type': 'application/json' } 
}));

// 404 handler
router.all('*', () => new Response('Not Found', { status: 404 }));

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Extract trace context from incoming request (for inter-worker calls)
    const { withTraceContext, getTraceContext, getCfRayId } = await import('../shared/utils/otel.js');
    const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
    
    // Execute the handler within the extracted trace context if it's an inter-worker request
    if (isWorkerRequest) {
      return await withTraceContext(request.headers, async () => {
        // Initialize request tracing with CF Ray ID (within the trace context)
        initRequestTrace(request, 'fulfillment-worker');
        
        // Log structured JSON with trace IDs and CF Ray ID
        const traceContext = getTraceContext();
        const cfRayId = getCfRayId(request);
        console.log(JSON.stringify({
          message: `[fulfillment-worker] ${request.method} ${url.pathname}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          method: request.method,
          path: url.pathname,
          service: 'fulfillment-worker',
          isWorkerRequest: true,
        }));
        
        try {
          let response = await router.handle(request, env, ctx);
          
          // If router returns null/undefined, create error response
          if (!response) {
            console.error('[fulfillment-worker] Router returned null/undefined');
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
            message: `[fulfillment-worker] Returning response with status: ${response.status}`,
            traceId: traceContext.traceId,
            spanId: traceContext.spanId,
            cfRayId: cfRayId,
            status: response.status,
            service: 'fulfillment-worker',
          }));
          
          return response;
        } catch (error) {
          console.error(JSON.stringify({
            message: '[fulfillment-worker] Fetch handler error',
            error: error.message,
            stack: error.stack,
            traceId: getTraceContext().traceId,
            spanId: getTraceContext().spanId,
            cfRayId: getCfRayId(request),
            service: 'fulfillment-worker',
          }));
          const errorResponse = errorHandler(error, request);
          const corsResponse = addCorsHeaders(errorResponse, request);
          return addTraceHeaders(corsResponse, request);
        }
      });
    }
    
    // For non-inter-worker requests, proceed normally
    // Initialize request tracing with CF Ray ID
    initRequestTrace(request, 'fulfillment-worker');
    
    // Log structured JSON with trace IDs and CF Ray ID
    const traceContext = getTraceContext();
    const cfRayId = getCfRayId(request);
    console.log(JSON.stringify({
      message: `[fulfillment-worker] ${request.method} ${url.pathname}`,
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      cfRayId: cfRayId,
      method: request.method,
      path: url.pathname,
      service: 'fulfillment-worker',
    }));
    
    try {
      let response = await router.handle(request, env, ctx);
      
      // If router returns null/undefined, create error response
      if (!response) {
        console.error('[fulfillment-worker] Router returned null/undefined');
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
        message: `[fulfillment-worker] Returning response with status: ${response.status}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        status: response.status,
        service: 'fulfillment-worker',
      }));
      
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: '[fulfillment-worker] Fetch handler error',
        error: error.message,
        stack: error.stack,
        traceId: getTraceContext().traceId,
        spanId: getTraceContext().spanId,
        cfRayId: getCfRayId(request),
        service: 'fulfillment-worker',
      }));
      const errorResponse = errorHandler(error, request);
      const corsResponse = addCorsHeaders(errorResponse, request);
      return addTraceHeaders(corsResponse, request);
    }
  },
};

// OpenTelemetry configuration for Honeycomb
const otelConfig = (env) => ({
  exporter: {
    url: env.HONEYCOMB_ENDPOINT || 'https://api.honeycomb.io/v1/traces',
    headers: {
      'x-honeycomb-team': env.HONEYCOMB_API_KEY || '',
      'x-honeycomb-dataset': env.HONEYCOMB_DATASET || 'fulfillment-worker',
    },
  },
  service: {
    name: 'fulfillment-worker',
    version: env.SERVICE_VERSION || '1.0.0',
  },
  fetchInstrumentation: {
    enabled: true,
    propagateTraceContext: true,
  },
});

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);
