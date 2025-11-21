import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders } from '../shared/utils/tracing.js';
import * as ordersController from './controllers/ordersController.js';
import * as authController from './controllers/authController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Protected routes (require authentication)
router.get('/orders', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await ordersController.getOrders(request, env);
});

router.get('/order/:orderId', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await ordersController.getOrder(request, env);
});

router.post('/order', async (request, env, ctx) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await ordersController.createOrder(request, env, ctx);
});

router.post('/orders/capture', async (request, env, ctx) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await ordersController.capturePayment(request, env, ctx);
});

router.post('/order/:orderId/rate', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  return await ordersController.rateProduct(request, env);
});

// Health check
router.get('/health', ordersController.healthCheck);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'orders-worker', 
  status: 'running',
  endpoints: ['/orders', '/order/:orderId', '/health']
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
        initRequestTrace(request, 'orders-worker');
        
        // Log structured JSON with trace IDs and CF Ray ID
        const traceContext = getTraceContext();
        const cfRayId = getCfRayId(request);
        console.log(JSON.stringify({
          message: `[orders-worker] ${request.method} ${url.pathname}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          method: request.method,
          path: url.pathname,
          service: 'orders-worker',
          isWorkerRequest: true,
        }));
        
        try {
          let response = await router.handle(request, env, ctx);
          
          // If router returns null/undefined, create error response
          if (!response) {
            console.error('[orders-worker] Router returned null/undefined');
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
          
          // Add trace headers for client correlation
          response = addTraceHeaders(response, request);
          
          // Log structured JSON response
          console.log(JSON.stringify({
            message: `[orders-worker] Returning response with status: ${response.status}`,
            traceId: traceContext.traceId,
            spanId: traceContext.spanId,
            cfRayId: cfRayId,
            status: response.status,
            service: 'orders-worker',
          }));
          
          return response;
        } catch (error) {
          console.error(JSON.stringify({
            message: '[orders-worker] Fetch handler error',
            error: error.message,
            stack: error.stack,
            traceId: getTraceContext().traceId,
            spanId: getTraceContext().spanId,
            cfRayId: getCfRayId(request),
            service: 'orders-worker',
          }));
          const errorResponse = errorHandler(error, request);
          const corsResponse = addCorsHeaders(errorResponse, request);
          return addTraceHeaders(corsResponse, request);
        }
      });
    }
    
    // For non-inter-worker requests, proceed normally
    // Initialize request tracing with CF Ray ID
    initRequestTrace(request, 'orders-worker');
    
    // Log structured JSON with trace IDs and CF Ray ID
    const traceContext = getTraceContext();
    const cfRayId = getCfRayId(request);
    console.log(JSON.stringify({
      message: `[orders-worker] ${request.method} ${url.pathname}`,
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      cfRayId: cfRayId,
      method: request.method,
      path: url.pathname,
      service: 'orders-worker',
    }));
    
    try {
      let response = await router.handle(request, env, ctx);
      
      // If router returns null/undefined, create error response
      if (!response) {
        console.error('[orders-worker] Router returned null/undefined');
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
      
      // Add trace headers for client correlation
      response = addTraceHeaders(response, request);
      
      // Log structured JSON response
      console.log(JSON.stringify({
        message: `[orders-worker] Returning response with status: ${response.status}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        status: response.status,
        service: 'orders-worker',
      }));
      
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: '[orders-worker] Fetch handler error',
        error: error.message,
        stack: error.stack,
        traceId: getTraceContext().traceId,
        spanId: getTraceContext().spanId,
        cfRayId: getCfRayId(request),
        service: 'orders-worker',
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
      'x-honeycomb-dataset': env.HONEYCOMB_DATASET || 'orders-worker',
    },
  },
  service: {
    name: 'orders-worker',
    version: env.SERVICE_VERSION || '1.0.0',
  },
  fetchInstrumentation: {
    enabled: true,
    propagateTraceContext: true,
  },
});

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);

