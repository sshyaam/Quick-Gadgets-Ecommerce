import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders, createOtelConfig } from '../shared/utils/tracing.js';
import { OrderStatusDurableObject } from './durableObjects/OrderStatusDurableObject.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Inter-worker routes (private)
router.post('/order/:orderId/status', async (request, env) => {
  if (!validateApiKey(request, env.INTER_WORKER_API_KEY)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { orderId } = request.params;
  const body = await request.json();
  
  // Get Durable Object ID
  const id = env.order_status_do.idFromName(orderId);
  const stub = env.order_status_do.get(id);
  
  // Update status
  await stub.fetch(new Request(`http://do/update`, {
    method: 'POST',
    body: JSON.stringify(body),
  }));
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// Health check
router.get('/health', async () => {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      service: 'realtime-worker',
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'realtime-worker', 
  status: 'running',
  endpoints: ['/health']
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
      initRequestTrace(request, 'realtime-worker');
      
      // Log structured JSON with trace IDs and CF Ray ID
      const traceContext = getTraceContext();
      const cfRayId = getCfRayId(request);
      const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
      
      console.log(JSON.stringify({
        message: `[realtime-worker] ${request.method} ${url.pathname}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        method: request.method,
        path: url.pathname,
        service: 'realtime-worker',
        isWorkerRequest: isWorkerRequest,
      }));
      
      try {
        let response = await router.handle(request, env, ctx).catch((error) => {
          return errorHandler(error, request);
        });
        
        // If router returns null/undefined, create error response
        if (!response) {
          console.error('[realtime-worker] Router returned null/undefined');
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
        
        // Add CORS headers
        response = addCorsHeaders(response, request);
        
        // Add trace headers for client correlation
        response = addTraceHeaders(response, request);
        
        // Log structured JSON response
        console.log(JSON.stringify({
          message: `[realtime-worker] Returning response with status: ${response.status}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          status: response.status,
          service: 'realtime-worker',
        }));
        
        return response;
      } catch (error) {
        console.error(JSON.stringify({
          message: '[realtime-worker] Fetch handler error',
          error: error.message,
          stack: error.stack,
          traceId: getTraceContext().traceId,
          spanId: getTraceContext().spanId,
          cfRayId: getCfRayId(request),
          service: 'realtime-worker',
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
const otelConfig = (env) => createOtelConfig(env, 'realtime-worker');

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);

// Durable Object class
export { OrderStatusDurableObject };

