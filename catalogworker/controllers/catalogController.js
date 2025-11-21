/**
 * Catalog controller
 */

import * as catalogService from '../services/catalogService.js';
import { ValidationError } from '../../shared/utils/errors.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    // Check database
    await env.catalog_db.prepare('SELECT 1').first();
    
    // Check KV
    await env.product_cache.get('health-check');
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'catalog-worker',
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
        service: 'catalog-worker',
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
 * Get products with pagination
 */
export async function getProducts(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const category = url.searchParams.get('category') || null;
  const search = url.searchParams.get('search') || null;
  
  if (page < 1) {
    throw new ValidationError('Page must be greater than 0');
  }
  
  if (limit < 1 || limit > 100) {
    throw new ValidationError('Limit must be between 1 and 100');
  }
  
  const result = await catalogService.getProductsWithDetails(
    page,
    limit,
    category,
    search,
    env.catalog_db,
    env.pricing_worker, // Service binding instead of URL
    env.fulfillment_worker, // Service binding instead of URL
    env.INTER_WORKER_API_KEY
  );
  
  return new Response(
    JSON.stringify(result),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get single product
 */
export async function getProduct(request, env) {
  const { productId } = request.params;
  
  const product = await catalogService.getProductWithDetails(
    productId,
    env.catalog_db,
    env.product_cache,
    env.pricing_worker, // Service binding instead of URL
    env.fulfillment_worker, // Service binding instead of URL
    env.INTER_WORKER_API_KEY
  );
  
  return new Response(
    JSON.stringify(product),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

