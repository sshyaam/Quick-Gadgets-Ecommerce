#!/usr/bin/env node

/**
 * Health check for a worker
 * Returns exit code 0 if healthy, 1 if unhealthy
 */

// Use native fetch (available in Node 18+)
// For older Node versions, you may need to install undici

const WORKER_NAME = process.argv[2];
const ENVIRONMENT = process.argv[3] || 'production'; // 'preview' or 'production'
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Worker URL mapping (adjust based on your Cloudflare setup)
const WORKER_URLS = {
  authworker: {
    production: process.env.AUTH_WORKER_URL || 'https://auth-worker.shyaamdps.workers.dev',
    preview: process.env.AUTH_WORKER_PREVIEW_URL || 'https://auth-worker-preview.shyaamdps.workers.dev'
  },
  cartworker: {
    production: process.env.CART_WORKER_URL || 'https://cart-worker.shyaamdps.workers.dev',
    preview: process.env.CART_WORKER_PREVIEW_URL || 'https://cart-worker-preview.shyaamdps.workers.dev'
  },
  catalogworker: {
    production: process.env.CATALOG_WORKER_URL || 'https://catalog-worker.shyaamdps.workers.dev',
    preview: process.env.CATALOG_WORKER_PREVIEW_URL || 'https://catalog-worker-preview.shyaamdps.workers.dev'
  },
  fulfillmentworker: {
    production: process.env.FULFILLMENT_WORKER_URL || 'https://fulfillment-worker.shyaamdps.workers.dev',
    preview: process.env.FULFILLMENT_WORKER_PREVIEW_URL || 'https://fulfillment-worker-preview.shyaamdps.workers.dev'
  },
  healthcheckworker: {
    production: process.env.HEALTHCHECK_WORKER_URL || 'https://healthcheck-worker.shyaamdps.workers.dev',
    preview: process.env.HEALTHCHECK_WORKER_PREVIEW_URL || 'https://healthcheck-worker-preview.shyaamdps.workers.dev'
  },
  logworker: {
    production: process.env.LOG_WORKER_URL || 'https://log-worker.shyaamdps.workers.dev',
    preview: process.env.LOG_WORKER_PREVIEW_URL || 'https://log-worker-preview.shyaamdps.workers.dev'
  },
  ordersworker: {
    production: process.env.ORDERS_WORKER_URL || 'https://orders-worker.shyaamdps.workers.dev',
    preview: process.env.ORDERS_WORKER_PREVIEW_URL || 'https://orders-worker-preview.shyaamdps.workers.dev'
  },
  paymentworker: {
    production: process.env.PAYMENT_WORKER_URL || 'https://payment-worker.shyaamdps.workers.dev',
    preview: process.env.PAYMENT_WORKER_PREVIEW_URL || 'https://payment-worker-preview.shyaamdps.workers.dev'
  },
  pricingworker: {
    production: process.env.PRICING_WORKER_URL || 'https://pricing-worker.shyaamdps.workers.dev',
    preview: process.env.PRICING_WORKER_PREVIEW_URL || 'https://pricing-worker-preview.shyaamdps.workers.dev'
  },
  ratingworker: {
    production: process.env.RATING_WORKER_URL || 'https://rating-worker.shyaamdps.workers.dev',
    preview: process.env.RATING_WORKER_PREVIEW_URL || 'https://rating-worker-preview.shyaamdps.workers.dev'
  },
  realtimeworker: {
    production: process.env.REALTIME_WORKER_URL || 'https://realtime-worker.shyaamdps.workers.dev',
    preview: process.env.REALTIME_WORKER_PREVIEW_URL || 'https://realtime-worker-preview.shyaamdps.workers.dev'
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkHealth(url, retries = MAX_RETRIES) {
  // Use native fetch (Node 18+) or import undici if needed
  let fetchFn = globalThis.fetch;
  if (!fetchFn) {
    try {
      const { fetch: undiciFetch } = await import('undici');
      fetchFn = undiciFetch;
    } catch (e) {
      throw new Error('fetch is not available. Node 18+ required or install undici.');
    }
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔍 Health check attempt ${i + 1}/${retries} for ${url}...`);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetchFn(`${url}/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'CI/CD-Health-Check'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        console.log(`✅ Health check passed for ${url}`);
        return true;
      } else {
        console.warn(`⚠️  Health check returned status ${response.status} for ${url}`);
        if (i < retries - 1) {
          await sleep(RETRY_DELAY);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Health check failed for ${url}:`, error.message);
      if (i < retries - 1) {
        await sleep(RETRY_DELAY);
      }
    }
  }
  
  return false;
}

async function main() {
  const workerName = WORKER_NAME;
  const environment = ENVIRONMENT;
  
  if (!workerName) {
    console.error('❌ Worker name is required');
    console.error('Usage: node scripts/health-check.js <worker-name> [preview|production]');
    process.exit(1);
  }
  
  const workerConfig = WORKER_URLS[workerName];
  if (!workerConfig) {
    console.error(`❌ Unknown worker: ${workerName}`);
    process.exit(1);
  }
  
  // Check for environment variable first, then use default
  const envVar = environment === 'preview' 
    ? `${workerName.toUpperCase()}_WORKER_PREVIEW_URL`
    : `${workerName.toUpperCase()}_WORKER_URL`;
  
  let url = process.env[envVar] || process.env.WORKER_PREVIEW_URL || process.env.WORKER_URL;
  
  if (!url) {
    url = workerConfig[environment];
  }
  
  if (!url) {
    console.error(`❌ No URL configured for ${workerName} in ${environment}`);
    console.error(`   Set ${envVar} environment variable or configure in script`);
    process.exit(1);
  }
  
  const isHealthy = await checkHealth(url);
  
  if (isHealthy) {
    console.log(`✅ ${workerName} is healthy in ${environment}`);
    process.exit(0);
  } else {
    console.error(`❌ ${workerName} health check failed in ${environment}`);
    process.exit(1);
  }
}

main();

