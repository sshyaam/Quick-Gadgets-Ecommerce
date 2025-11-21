import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';
import { validateApiKey } from '../shared/utils/interWorker.js';
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

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await router.handle(request, env, ctx).catch((error) => {
        return errorHandler(error, request);
      });
      return addCorsHeaders(response || new Response('Not Found', { status: 404 }), request);
    } catch (error) {
      const errorResponse = errorHandler(error, request);
      return addCorsHeaders(errorResponse, request);
    }
  },
};

// Durable Object class
export { OrderStatusDurableObject };

