import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders } from '../shared/utils/tracing.js';
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
    // Extract trace context from incoming request (for inter-worker calls)
    // This ensures the entire transaction shows as one trace in Honeycomb
    const { withTraceContext } = await import('../shared/utils/otel.js');
    const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
    
    // Execute the handler within the extracted trace context if it's an inter-worker request
    if (isWorkerRequest) {
      return await withTraceContext(request.headers, async () => {
        // Initialize request tracing with CF Ray ID (within the trace context)
        initRequestTrace(request, 'payment-worker');
        
        // Log structured JSON with trace IDs and CF Ray ID
        const { getTraceContext, getCfRayId } = await import('../shared/utils/otel.js');
        const traceContext = getTraceContext();
        const cfRayId = getCfRayId(request);
        console.log(JSON.stringify({
          message: `[payment-worker] ${request.method} ${new URL(request.url).pathname}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          method: request.method,
          path: new URL(request.url).pathname,
          service: 'payment-worker',
          isWorkerRequest: true,
        }));
        
        try {
          const response = await router.handle(request, env, ctx).catch((error) => {
            return errorHandler(error, request);
          });
          const corsResponse = addCorsHeaders(response || new Response('Not Found', { status: 404 }), request);
          return addTraceHeaders(corsResponse, request);
        } catch (error) {
          const errorResponse = errorHandler(error, request);
          const corsResponse = addCorsHeaders(errorResponse, request);
          return addTraceHeaders(corsResponse, request);
        }
      });
    }
    
    // For non-inter-worker requests, proceed normally
    // Initialize request tracing with CF Ray ID
    initRequestTrace(request, 'payment-worker');
    
    // Log structured JSON with trace IDs and CF Ray ID
    const { getTraceContext, getCfRayId } = await import('../shared/utils/otel.js');
    const traceContext = getTraceContext();
    const cfRayId = getCfRayId(request);
    console.log(JSON.stringify({
      message: `[payment-worker] ${request.method} ${new URL(request.url).pathname}`,
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      cfRayId: cfRayId,
      method: request.method,
      path: new URL(request.url).pathname,
      service: 'payment-worker',
      isWorkerRequest: isWorkerRequest,
    }));
    
    try {
      const response = await router.handle(request, env, ctx).catch((error) => {
        return errorHandler(error, request);
      });
      const corsResponse = addCorsHeaders(response || new Response('Not Found', { status: 404 }), request);
      return addTraceHeaders(corsResponse, request);
    } catch (error) {
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
      'x-honeycomb-dataset': env.HONEYCOMB_DATASET || 'payment-worker',
    },
  },
  service: {
    name: 'payment-worker',
    version: env.SERVICE_VERSION || '1.0.0',
  },
  fetchInstrumentation: {
    enabled: true,
    propagateTraceContext: true,
  },
});

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);

