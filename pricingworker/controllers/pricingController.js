/**
 * Pricing controller
 */

import * as pricingService from '../services/pricingService.js';
import { validateApiKey } from '../../shared/utils/interWorker.js';
import { AuthenticationError, ValidationError } from '../../shared/utils/errors.js';
import { setPriceSchema, updatePriceSchema } from '../validation/pricingValidation.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    // Check database
    await env.pricing_db.prepare('SELECT 1').first();
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'pricing-worker',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        service: 'pricing-worker',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Validate worker request (for inter-worker calls)
 * Returns a response if invalid, or nothing to continue
 */
export async function validateWorkerRequest(request, env) {
  const apiKey = request.headers.get('X-API-Key');
  const workerRequest = request.headers.get('X-Worker-Request');
  const expectedKey = env.INTER_WORKER_API_KEY;
  
  console.log(`[validateWorkerRequest] API Key received: ${apiKey ? 'present' : 'missing'}`);
  console.log(`[validateWorkerRequest] Worker-Request header: ${workerRequest}`);
  console.log(`[validateWorkerRequest] Expected key: ${expectedKey ? 'present' : 'missing'}`);
  console.log(`[validateWorkerRequest] Match: ${apiKey === expectedKey && workerRequest === 'true'}`);
  
  if (!validateApiKey(request, env.INTER_WORKER_API_KEY)) {
    // Throw error - itty-router error handler will catch it
    throw new AuthenticationError('Invalid API key for inter-worker request');
  }
  // Don't return anything - continue to next handler
}

/**
 * Get price for a product
 */
export async function getPrice(request, env) {
  const { productId } = request.params;
  
  const price = await pricingService.getProductPrice(productId, env.pricing_db);
  
  return new Response(
    JSON.stringify(price),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get prices for multiple products
 */
export async function getPrices(request, env) {
  console.log(`[getPrices] Route handler called`);
  const url = new URL(request.url);
  const productIds = url.searchParams.get('productIds');
  
  console.log(`[getPrices] productIds param: ${productIds}`);
  
  if (!productIds) {
    throw new ValidationError('productIds query parameter is required');
  }
  
  const ids = productIds.split(',').filter(id => id.trim());
  if (ids.length === 0) {
    throw new ValidationError('At least one productId is required');
  }
  
  console.log(`[getPrices] Fetching prices for ${ids.length} products`);
  const prices = await pricingService.getProductPrices(ids, env.pricing_db);
  console.log(`[getPrices] Found prices for ${Object.keys(prices).length} products`);
  
  return new Response(
    JSON.stringify(prices),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Set price for a product
 */
export async function setPrice(request, env) {
  const { productId } = request.params;
  const body = await request.json();
  
  // Validate
  const { error, value } = setPriceSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  const price = await pricingService.setProductPrice(
    productId,
    value.price,
    value.currency || 'USD',
    env.pricing_db
  );
  
  return new Response(
    JSON.stringify(price),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Update price for a product
 */
export async function updatePrice(request, env) {
  const { productId } = request.params;
  const body = await request.json();
  
  // Validate
  const { error, value } = updatePriceSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  const price = await pricingService.updateProductPrice(
    productId,
    value.price,
    env.pricing_db
  );
  
  return new Response(
    JSON.stringify(price),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

