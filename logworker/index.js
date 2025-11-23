import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders, createOtelConfig } from '../shared/utils/tracing.js';
import * as logController from './controllers/logController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Inter-worker routes (private)
router.post('/log', logController.validateWorkerRequest, logController.receiveLog);

// Flush logs endpoint (for manual flushing or periodic flushing)
router.post('/flush', logController.validateWorkerRequest, logController.flushLogs);

// Health check
router.get('/health', logController.healthCheck);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'log-worker', 
  status: 'running',
  endpoints: ['/health', '/log (POST)', '/flush (POST)']
}), { 
  status: 200, 
  headers: { 'Content-Type': 'application/json' } 
}));

// Debug endpoint to check KV logs (for testing)
// Note: This is unauthenticated for easier debugging - secure it in production
router.get('/debug/kv-logs', logController.debugKvLogs);

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
      initRequestTrace(request, 'log-worker');
      
      // Log structured JSON with trace IDs and CF Ray ID
      const traceContext = getTraceContext();
      const cfRayId = getCfRayId(request);
      const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
      
      console.log(JSON.stringify({
        message: `[log-worker] ${request.method} ${url.pathname}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        method: request.method,
        path: url.pathname,
        service: 'log-worker',
        isWorkerRequest: isWorkerRequest,
      }));
      
      try {
        let response = await router.handle(request, env, ctx).catch((error) => {
          console.error(JSON.stringify({
            message: '[log-worker] Router error',
            error: error.message,
            stack: error.stack,
            traceId: getTraceContext().traceId,
            spanId: getTraceContext().spanId,
            cfRayId: getCfRayId(request),
            service: 'log-worker',
          }));
          return errorHandler(error, request);
        });
        
        // If router returns null/undefined, create error response
        if (!response) {
          console.error('[log-worker] Router returned null/undefined');
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
          message: `[log-worker] Returning response with status: ${response.status}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          status: response.status,
          service: 'log-worker',
        }));
        
        return response;
      } catch (error) {
        console.error(JSON.stringify({
          message: '[log-worker] Fetch handler error',
          error: error.message,
          stack: error.stack,
          traceId: getTraceContext().traceId,
          spanId: getTraceContext().spanId,
          cfRayId: getCfRayId(request),
          service: 'log-worker',
        }));
        const errorResponse = errorHandler(error, request);
        const corsResponse = addCorsHeaders(errorResponse, request);
        return addTraceHeaders(corsResponse, request);
      }
    });
  },
  
  /**
   * Scheduled event handler (cron trigger)
   * Runs daily to push logs from KV to R2
   */
  async scheduled(event, env, ctx) {
    console.log('[log-worker] Scheduled event triggered:', event.cron);
    
    try {
      const logBucket = env.log_bucket;
      const logState = env.log_state;
      
      if (!logBucket || !logState) {
        console.error('[log-worker] R2 bucket or KV namespace not configured');
        return;
      }
      
      // Import logService dynamically
      const logService = await import('./services/logService.js');
      
      // Push logs from KV to R2 and clear KV
      const result = await logService.pushLogsToR2(logBucket, logState);
      
      console.log('[log-worker] Scheduled push completed:', result);
    } catch (error) {
      console.error('[log-worker] Error in scheduled event:', error.message, error.stack);
      // Don't throw - we don't want to retry immediately
    }
  },
};

// OpenTelemetry configuration for Honeycomb
// Using unified dataset for distributed tracing across all workers
const otelConfig = (env) => createOtelConfig(env, 'ecommerce-platform');

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);

