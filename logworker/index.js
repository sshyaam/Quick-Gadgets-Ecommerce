import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`[log-worker] ${request.method} ${url.pathname}`);
    
    try {
      let response = await router.handle(request, env, ctx).catch((error) => {
        console.error('[log-worker] Router error:', error.message, error.stack);
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
      
      console.log(`[log-worker] Returning response with status: ${response.status}`);
      return addCorsHeaders(response, request);
    } catch (error) {
      console.error('[log-worker] Fetch handler error:', error.message, error.stack);
      const errorResponse = errorHandler(error, request);
      return addCorsHeaders(errorResponse, request);
    }
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
      
      // Push logs from KV to R2 and clear KV
      const result = await logService.pushLogsToR2(logBucket, logState);
      
      console.log('[log-worker] Scheduled push completed:', result);
    } catch (error) {
      console.error('[log-worker] Error in scheduled event:', error.message, error.stack);
      // Don't throw - we don't want to retry immediately
    }
  },
};

