import { Router } from 'itty-router';
import { errorHandler } from '../shared/utils/errors.js';
import { addCorsHeaders, handleOptions } from '../shared/utils/cors.js';

const router = Router();

// Handle OPTIONS preflight
router.options('*', handleOptions);

// Root route
router.get('/', () => new Response(JSON.stringify({ 
  service: 'health-check-worker', 
  status: 'running',
  endpoints: ['/health']
}), { 
  status: 200, 
  headers: { 'Content-Type': 'application/json' } 
}));

// Health check route
router.get('/health', async (request, env) => {
  // Helper function to safely get binding without throwing error 1042
  const safeGetBinding = (bindingName) => {
    try {
      return env[bindingName];
    } catch (error) {
      const errorStr = String(error || '');
      if (errorStr.includes('1042')) {
        return null; // Binding doesn't exist
      }
      throw error; // Re-throw if it's a different error
    }
  };
  
  const checks = {
    timestamp: new Date().toISOString(),
    services: {},
    overall: 'healthy',
  };
  
  // Check all workers using service bindings (prevents error 1042)
  const workerChecks = [
    { name: 'auth', binding: 'auth_worker', url: env.AUTH_WORKER_URL },
    { name: 'catalog', binding: 'catalog_worker', url: env.CATALOG_WORKER_URL },
    { name: 'pricing', binding: 'pricing_worker', url: env.PRICING_WORKER_URL },
    { name: 'fulfillment', binding: 'fulfillment_worker', url: env.FULFILLMENT_WORKER_URL },
    { name: 'cart', binding: 'cart_worker', url: env.CART_WORKER_URL },
    { name: 'payment', binding: 'payment_worker', url: env.PAYMENT_WORKER_URL },
    { name: 'orders', binding: 'orders_worker', url: env.ORDERS_WORKER_URL },
    { name: 'rating', binding: 'rating_worker', url: env.RATING_WORKER_URL },
    { name: 'log', binding: 'log_worker', url: env.LOG_WORKER_URL },
    { name: 'realtime', binding: 'realtime_worker', url: env.REALTIME_WORKER_URL },
  ];
  
  // Check workers using service bindings (preferred) or HTTP fallback
  for (const { name, binding, url } of workerChecks) {
    try {
      // Try to use service binding first (prevents error 1042)
      const workerBinding = safeGetBinding(binding);
      
      if (workerBinding && typeof workerBinding.fetch === 'function') {
        // Use service binding
        console.log(`[health-check] Checking ${name} using service binding`);
        
        const healthUrl = 'https://workers.dev/health'; // Path is what matters for service bindings
        const request = new Request(healthUrl, {
          method: 'GET',
        });
        
        try {
          const response = await Promise.race([
            workerBinding.fetch(request),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout after 5 seconds')), 5000)
            )
          ]);
          
          console.log(`[health-check] ${name} response (via binding): ${response.status} ${response.statusText}`);
          
          if (response.ok) {
            try {
              const data = await response.json();
              checks.services[name] = {
                status: data.status || 'healthy',
                timestamp: data.timestamp,
                method: 'service_binding',
              };
            } catch (parseError) {
              // If response is not JSON, check status
              checks.services[name] = {
                status: response.status === 200 ? 'healthy' : 'unhealthy',
                error: 'Invalid JSON response',
                method: 'service_binding',
              };
              if (response.status !== 200) {
                checks.overall = 'unhealthy';
              }
            }
          } else {
            const errorText = await response.text().catch(() => `HTTP ${response.status}`);
            checks.services[name] = {
              status: 'unhealthy',
              error: errorText,
              method: 'service_binding',
            };
            checks.overall = 'unhealthy';
          }
        } catch (bindingError) {
          console.error(`[health-check] Error checking ${name} via binding:`, bindingError.message);
          checks.services[name] = {
            status: 'unhealthy',
            error: bindingError.message || 'Service binding check failed',
            method: 'service_binding',
          };
          checks.overall = 'unhealthy';
        }
      } else if (url) {
        // Fallback to HTTP fetch if service binding not available
        console.log(`[health-check] Service binding not available for ${name}, using HTTP fallback`);
        const healthUrl = `${url}/health`;
        console.log(`[health-check] Checking ${name} at ${healthUrl}`);
        
        try {
          const response = await Promise.race([
            fetch(healthUrl, {
              method: 'GET',
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout after 5 seconds')), 5000)
            )
          ]);
          
          console.log(`[health-check] ${name} response (via HTTP): ${response.status} ${response.statusText}`);
          
          if (response.ok) {
            try {
              const data = await response.json();
              checks.services[name] = {
                status: data.status || 'healthy',
                timestamp: data.timestamp,
                method: 'http_fallback',
              };
            } catch (parseError) {
              // If response is not JSON, check status
              checks.services[name] = {
                status: response.status === 200 ? 'healthy' : 'unhealthy',
                error: 'Invalid JSON response',
                method: 'http_fallback',
              };
              if (response.status !== 200) {
                checks.overall = 'unhealthy';
              }
            }
          } else {
            const errorText = await response.text().catch(() => `HTTP ${response.status}`);
            checks.services[name] = {
              status: 'unhealthy',
              error: errorText,
              method: 'http_fallback',
            };
            checks.overall = 'unhealthy';
          }
        } catch (httpError) {
          console.error(`[health-check] Error checking ${name} via HTTP:`, httpError.message);
          checks.services[name] = {
            status: 'unhealthy',
            error: httpError.message || 'HTTP check failed',
            method: 'http_fallback',
          };
          checks.overall = 'unhealthy';
        }
      } else {
        // No binding and no URL configured
        checks.services[name] = {
          status: 'unhealthy',
          error: 'Worker binding and URL not configured',
        };
        checks.overall = 'unhealthy';
      }
    } catch (error) {
      console.error(`[health-check] Error checking ${name}:`, error.message);
      checks.services[name] = {
        status: 'unhealthy',
        error: error.message || 'Unknown error',
      };
      checks.overall = 'unhealthy';
    }
  }
  
  // Check D1 databases - safely access bindings to avoid error 1042
  const dbChecks = [
    { name: 'auth', binding: 'auth_db' },
    { name: 'catalog', binding: 'catalog_db' },
    { name: 'pricing', binding: 'pricing_db' },
    { name: 'fulfillment', binding: 'fulfillment_db' },
    { name: 'cart', binding: 'cart_db' },
    { name: 'payment', binding: 'payment_db' },
    { name: 'orders', binding: 'orders_db' },
    { name: 'rating', binding: 'rating_db' },
  ];
  
  for (const { name, binding } of dbChecks) {
    try {
      // Safely try to access the binding using helper
      const db = safeGetBinding(binding);
      if (!db) {
        checks.services[`${name}_db`] = {
          status: 'unhealthy',
          error: 'Database binding not configured (error 1042)',
          warning: true,
        };
        continue;
      }
      
      // Try to query the database
      try {
        await db.prepare('SELECT 1').first();
        checks.services[`${name}_db`] = { status: 'healthy' };
      } catch (dbError) {
        const dbErrorStr = String(dbError || '');
        const dbErrorCode = dbError?.code || '';
        
        // Error 1042 is a binding error
        if (dbErrorCode === '1042' || dbErrorStr.includes('1042')) {
          checks.services[`${name}_db`] = {
            status: 'unhealthy',
            error: 'Database binding not available (error 1042)',
            warning: true,
          };
        } else {
          checks.services[`${name}_db`] = {
            status: 'unhealthy',
            error: dbError?.message || 'Database query failed',
          };
          checks.overall = 'unhealthy';
        }
      }
    } catch (error) {
      const errorStr = String(error || '');
      if (errorStr.includes('1042')) {
        checks.services[`${name}_db`] = {
          status: 'unhealthy',
          error: 'Database binding not available (error 1042)',
          warning: true,
        };
      } else {
        checks.services[`${name}_db`] = {
          status: 'unhealthy',
          error: error?.message || 'Unknown error',
        };
        checks.overall = 'unhealthy';
      }
    }
  }
  
  // Check KV namespaces - safely access bindings to avoid error 1042
  const kvChecks = [
    { name: 'product_cache', binding: 'product_cache' },
    { name: 'log_state', binding: 'log_state' },
  ];
  
  for (const { name, binding } of kvChecks) {
    try {
      // Safely try to access the binding using helper
      const kv = safeGetBinding(binding);
      if (!kv) {
        checks.services[`${name}_kv`] = {
          status: 'unhealthy',
          error: 'KV binding not configured (error 1042)',
          warning: true,
        };
        continue;
      }
      
      // Try to access KV
      try {
        await kv.get('health-check');
        checks.services[`${name}_kv`] = { status: 'healthy' };
      } catch (kvError) {
        const kvErrorStr = String(kvError || '');
        const kvErrorCode = kvError?.code || '';
        
        // Error 1042 is a binding error
        if (kvErrorCode === '1042' || kvErrorStr.includes('1042')) {
          checks.services[`${name}_kv`] = {
            status: 'unhealthy',
            error: 'KV binding not available (error 1042)',
            warning: true,
          };
        } else {
          checks.services[`${name}_kv`] = {
            status: 'unhealthy',
            error: kvError?.message || 'KV access failed',
          };
          checks.overall = 'unhealthy';
        }
      }
    } catch (error) {
      const errorStr = String(error || '');
      if (errorStr.includes('1042')) {
        checks.services[`${name}_kv`] = {
          status: 'unhealthy',
          error: 'KV binding not available (error 1042)',
          warning: true,
        };
      } else {
        checks.services[`${name}_kv`] = {
          status: 'unhealthy',
          error: error?.message || 'Unknown error',
        };
        checks.overall = 'unhealthy';
      }
    }
  }
  
  // Check R2 buckets - safely access bindings to avoid error 1042
  const r2Checks = [
    { name: 'log_bucket', binding: 'log_bucket' },
  ];
  
  for (const { name, binding } of r2Checks) {
    try {
      // Safely try to access the binding using helper
      const bucket = safeGetBinding(binding);
      if (!bucket) {
        checks.services[`${name}_r2`] = {
          status: 'unhealthy',
          error: 'R2 binding not configured (error 1042)',
          warning: true,
        };
        continue;
      }
      
      // Try to access R2
      try {
        await bucket.head('health-check');
        checks.services[`${name}_r2`] = { status: 'healthy' };
      } catch (r2Error) {
        const r2ErrorStr = String(r2Error || '');
        const r2ErrorCode = r2Error?.code || '';
        
        // Error 1042 is a binding error
        if (r2ErrorCode === '1042' || r2ErrorStr.includes('1042')) {
          checks.services[`${name}_r2`] = {
            status: 'unhealthy',
            error: 'R2 binding not available (error 1042)',
            warning: true,
          };
        } else {
          // R2 head might fail if object doesn't exist, which is OK
          checks.services[`${name}_r2`] = { status: 'healthy' };
        }
      }
    } catch (error) {
      const errorStr = String(error || '');
      if (errorStr.includes('1042')) {
        checks.services[`${name}_r2`] = {
          status: 'unhealthy',
          error: 'R2 binding not available (error 1042)',
          warning: true,
        };
      } else {
        // R2 head might fail if object doesn't exist, which is OK
        checks.services[`${name}_r2`] = { status: 'healthy' };
      }
    }
  }
  
  return new Response(
    JSON.stringify(checks, null, 2),
    {
      status: checks.overall === 'healthy' ? 200 : 503,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});

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

