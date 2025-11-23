import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders, createOtelConfig } from '../shared/utils/tracing.js';
import * as paymentController from './controllers/paymentController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Public routes
router.post('/paypal/create', (request, env, ctx) => paymentController.createPayPalOrder(request, env, ctx));
router.post('/paypal/capture', (request, env, ctx) => paymentController.capturePayPalOrder(request, env, ctx));
router.post('/paypal/store', (request, env, ctx) => paymentController.storePayment(request, env, ctx));

// Health check
router.get('/health', paymentController.healthCheck);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'payment-worker', 
  status: 'running',
  endpoints: ['/paypal/create', '/paypal/capture', '/health']
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
      initRequestTrace(request, 'payment-worker');
      
      // Log structured JSON with trace IDs and CF Ray ID
      const traceContext = getTraceContext();
      const cfRayId = getCfRayId(request);
      const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
      
      console.log(JSON.stringify({
        message: `[payment-worker] ${request.method} ${url.pathname}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        method: request.method,
        path: url.pathname,
        service: 'payment-worker',
        isWorkerRequest: isWorkerRequest,
      }));
      
      try {
        let response = await router.handle(request, env, ctx).catch((error) => {
          return errorHandler(error, request);
        });
        
        // If router returns null/undefined, create error response
        if (!response) {
          console.error('[payment-worker] Router returned null/undefined');
          response = new Response(
            JSON.stringify({
              error: {
                code: 'NOT_FOUND',
                message: 'Route not found',
              },
            }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
        
        const corsResponse = addCorsHeaders(response, request);
        return addTraceHeaders(corsResponse, request);
      } catch (error) {
        console.error(JSON.stringify({
          message: '[payment-worker] Fetch handler error',
          error: error.message,
          stack: error.stack,
          traceId: getTraceContext().traceId,
          spanId: getTraceContext().spanId,
          cfRayId: getCfRayId(request),
          service: 'payment-worker',
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

