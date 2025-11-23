import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { instrumentHandler, initRequestTrace, addTraceHeaders, createOtelConfig } from '../shared/utils/tracing.js';
import * as catalogController from './controllers/catalogController.js';
import * as imageController from './controllers/imageController.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Public routes (anonymous users can view)
router.get('/products', catalogController.getProducts);
router.get('/product/:productId', catalogController.getProduct);

// Image serving route (public)
router.get('/images/*', imageController.serveImage);

// Admin routes (protected)
import { authenticateAdmin } from '../shared/utils/adminAuth.js';
import * as adminController from './controllers/adminController.js';

router.get('/admin/products', async (request, env) => {
  try {
    const authResult = await authenticateAdmin(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }
    request.user = authResult.user;
    request.userId = authResult.userId;
    return await adminController.getAllProducts(request, env);
  } catch (error) {
    console.error('[catalog-worker] Admin route error:', error.message, error.stack);
    // Error handler will catch this
    throw error;
  }
});

router.post('/admin/products', async (request, env, ctx) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.createProduct(request, env, ctx);
});

router.put('/admin/products/:productId', async (request, env, ctx) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.updateProduct(request, env, ctx);
});

router.delete('/admin/products/:productId', async (request, env, ctx) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.deleteProduct(request, env, ctx);
});

router.post('/admin/products/:productId/restore', async (request, env) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await adminController.restoreProduct(request, env);
});

// Image upload route (admin only)
router.post('/admin/images/upload', async (request, env) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await imageController.uploadImage(request, env);
});

// Image delete route (admin only)
router.delete('/admin/images/*', async (request, env) => {
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  request.user = authResult.user;
  request.userId = authResult.userId;
  return await imageController.deleteImage(request, env);
});

// Test endpoint to call other workers using Service Bindings
router.get('/test-call', async (request, env) => {
  console.log('[catalog-worker] /test-call endpoint called');
  
  const results = {
    pricing: null,
    fulfillment: null,
  };
  
  try {
    // Test calling pricing worker using Service Binding
    console.log('[catalog-worker] Testing pricing worker via service binding...');
    try {
      const pricingRequest = new Request('https://workers.dev/test', {
        method: 'GET',
      });
      const pricingResponse = await env.pricing_worker.fetch(pricingRequest);
      const pricingText = await pricingResponse.text();
      results.pricing = {
        status: pricingResponse.status,
        body: pricingText,
        method: 'service-binding',
      };
      console.log(`[catalog-worker] Pricing worker response: ${pricingResponse.status} - ${pricingText}`);
    } catch (e) {
      results.pricing = {
        error: e.message,
        stack: e.stack,
        method: 'service-binding',
      };
      console.error('[catalog-worker] Pricing worker call failed:', e);
    }
    
    // Test calling fulfillment worker using Service Binding
    console.log('[catalog-worker] Testing fulfillment worker via service binding...');
    try {
      const fulfillmentRequest = new Request('https://workers.dev/test', {
        method: 'GET',
      });
      const fulfillmentResponse = await env.fulfillment_worker.fetch(fulfillmentRequest);
      const fulfillmentText = await fulfillmentResponse.text();
      results.fulfillment = {
        status: fulfillmentResponse.status,
        body: fulfillmentText,
        method: 'service-binding',
      };
      console.log(`[catalog-worker] Fulfillment worker response: ${fulfillmentResponse.status} - ${fulfillmentText}`);
    } catch (e) {
      results.fulfillment = {
        error: e.message,
        stack: e.stack,
        method: 'service-binding',
      };
      console.error('[catalog-worker] Fulfillment worker call failed:', e);
    }
    
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[catalog-worker] Test call error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
      results,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Health check
router.get('/health', catalogController.healthCheck);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'catalog-worker', 
  status: 'running',
  endpoints: ['/products', '/product/:productId', '/health', '/test-call']
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
      initRequestTrace(request, 'catalog-worker');
      
      // Log structured JSON with trace IDs and CF Ray ID
      const traceContext = getTraceContext();
      const cfRayId = getCfRayId(request);
      const isWorkerRequest = request.headers.get('X-Worker-Request') === 'true';
      
      console.log(JSON.stringify({
        message: `[catalog-worker] ${request.method} ${url.pathname}`,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        cfRayId: cfRayId,
        method: request.method,
        path: url.pathname,
        service: 'catalog-worker',
        isWorkerRequest: isWorkerRequest,
      }));
      
      try {
        let response = await router.handle(request, env, ctx);
        
        // If router returns null/undefined, create error response
        if (!response) {
          console.error('[catalog-worker] Router returned null/undefined');
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
          message: `[catalog-worker] Returning response with status: ${response.status}`,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          cfRayId: cfRayId,
          status: response.status,
          service: 'catalog-worker',
        }));
        
        return response;
      } catch (error) {
        console.error(JSON.stringify({
          message: '[catalog-worker] Fetch handler error',
          error: error.message,
          stack: error.stack,
          traceId: getTraceContext().traceId,
          spanId: getTraceContext().spanId,
          cfRayId: getCfRayId(request),
          service: 'catalog-worker',
        }));
        const errorResponse = errorHandler(error, request);
        const corsResponse = addCorsHeaders(errorResponse, request);
        return addTraceHeaders(corsResponse, request);
      }
    });
  },
};

// OpenTelemetry configuration for Honeycomb
// OpenTelemetry configuration for Honeycomb
// Using unified dataset for distributed tracing across all workers
const otelConfig = (env) => createOtelConfig(env, 'ecommerce-platform');

// Export instrumented handler
export default instrumentHandler(handler, otelConfig);

