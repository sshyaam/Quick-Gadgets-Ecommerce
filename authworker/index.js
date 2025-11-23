import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders, createOtelConfig } from '../shared/utils/tracing.js';
import * as authController from './controllers/authController.js';
import * as profileController from './controllers/profileController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Public routes
router.post('/signup', (request, env, ctx) => authController.signup(request, env, ctx));
router.post('/login', (request, env, ctx) => authController.login(request, env, ctx));
router.post('/refresh', (request, env, ctx) => authController.refreshToken(request, env, ctx));
router.post('/logout', (request, env, ctx) => authController.logout(request, env, ctx));
router.post('/set-password', authController.setPassword); // Special endpoint for users without passwords

// Protected routes (require authentication)
router.get('/profile', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await profileController.getProfile(request, env);
});

router.put('/profile', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await profileController.updateProfile(request, env);
});

router.put('/profile/password', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await profileController.updatePassword(request, env);
});

// Address management routes
router.post('/profile/addresses', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await profileController.addSavedAddress(request, env);
});

router.put('/profile/addresses/:addressId', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await profileController.updateSavedAddress(request, env);
});

router.delete('/profile/addresses/:addressId', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // Return error response if authentication failed
  }
  return await profileController.deleteSavedAddress(request, env);
});

// Inter-worker routes (private)
router.get('/session/:sessionId', authController.validateWorkerRequest, authController.getSession);
router.get('/user/:userId', authController.validateWorkerRequest, profileController.getUserById);
router.get('/users/batch', authController.validateWorkerRequest, profileController.getUsersBatch);

// Health check
router.get('/health', authController.healthCheck);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'auth-worker', 
  status: 'running',
  endpoints: ['/signup', '/login', '/refresh', '/logout', '/profile', '/health']
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
      initRequestTrace(request, 'ecommerce-platform');
      
      // Log structured JSON with trace IDs and CF Ray ID
      const traceContext = getTraceContext();
      const cfRayId = getCfRayId(request);
      const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
      
      console.log(JSON.stringify({
        message: `[auth-worker] ${request.method} ${url.pathname}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        method: request.method,
        path: url.pathname,
        service: 'auth-worker',
        isWorkerRequest: isWorkerRequest,
      }));
      
      try {
        let response = await router.handle(request, env, ctx);
        
        // If router returns null/undefined, create error response
        if (!response) {
          console.error('[auth-worker] Router returned null/undefined');
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
          message: `[auth-worker] Returning response with status: ${response.status}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          status: response.status,
          service: 'auth-worker',
        }));
        
        return response;
      } catch (error) {
        console.error(JSON.stringify({
          message: '[auth-worker] Fetch handler error',
          error: error.message,
          stack: error.stack,
          traceId: getTraceContext().traceId,
          spanId: getTraceContext().spanId,
          cfRayId: getCfRayId(request),
          service: 'auth-worker',
        }));
        const errorResponse = errorHandler(error, request);
        const finalResponse = addCorsHeaders(errorResponse, request);
        return addTraceHeaders(finalResponse, request);
      }
    });
  },
};

// OpenTelemetry configuration for Honeycomb
// Using unified dataset for distributed tracing across all workers
const otelConfig = (env) => createOtelConfig(env, 'ecommerce-platform');

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);

