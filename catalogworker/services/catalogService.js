/**
 * Catalog service
 * Handles product display, caching, and calls to fulfillment worker
 * Uses Service Bindings for inter-worker communication
 */

import { getProductById, getProducts, searchProducts } from '../models/productModel.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { getWorkerBinding } from '../../shared/utils/interWorker.js';
import { traceKvOperation } from '../../shared/utils/otel.js';

/**
 * Get product with price and stock from fulfillment worker
 */
export async function getProductWithDetails(
  productId,
  db,
  kv,
  pricingWorkerBinding,
  fulfillmentWorkerBinding,
  apiKey,
  request = null
) {
  // Check KV cache first
  const cacheKey = `product:${productId}`;
  const cached = await traceKvOperation(
    'kv.get',
    async () => await kv.get(cacheKey, { type: 'json' }),
    { key: cacheKey, namespace: 'product_cache' },
    request
  );
  
  if (cached) {
    // Still fetch price and stock (not cached) - always fetch fresh stock
    const [price, stock] = await Promise.all([
      getPriceFromWorker(productId, pricingWorkerBinding, apiKey),
      getStockFromWorker(productId, fulfillmentWorkerBinding, apiKey),
    ]);
    
    // Remove stock and price from cached data if they exist (safety measure)
    const { stock: _cachedStock, price: _cachedPrice, ...cachedWithoutStock } = cached;
    
    return {
      ...cachedWithoutStock,
      price: price?.price || null,
      stock: stock?.available || 0, // Always use fresh stock, never cached
    };
  }
  
  // Get product from database
  const product = await getProductById(db, productId);
  if (!product) {
    throw new NotFoundError('Product');
  }
  
  // Parse product data
  const productData = typeof product.data === 'string' 
    ? JSON.parse(product.data) 
    : product.data;
  
  // Remove stock and price from productData if they exist (safety measure)
  // Stock and price should never be stored in the product data JSONB field
  const { price: _priceFromData, stock: _stockFromData, ...productDataClean } = productData;
  
  // Get price and stock from workers (always fetch fresh, never from cache or product data)
  const [price, stock] = await Promise.all([
    getPriceFromWorker(productId, pricingWorkerBinding, apiKey),
    getStockFromWorker(productId, fulfillmentWorkerBinding, apiKey),
  ]);
  
  // Prepare product response (explicitly set price/stock from workers, not from productData)
  const productResponse = {
    productId: product.product_id,
    ...productDataClean, // Use cleaned productData (without stock/price)
    price: price?.price || null, // Always from worker
    stock: stock?.available || 0, // Always from worker, never cached
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
  
  // Cache product data (without price/stock) in KV
  // Explicitly exclude price and stock to ensure they're never cached
  const cacheData = {
    productId: product.product_id,
    ...productDataClean, // Already cleaned of stock/price
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
  
  // Double-check: Ensure stock and price are never in cache data
  delete cacheData.stock;
  delete cacheData.price;
  
  await traceKvOperation(
    'kv.put',
    async () => await kv.put(cacheKey, JSON.stringify(cacheData), {
      expirationTtl: 3600, // 1 hour cache
    }),
    { key: cacheKey, namespace: 'product_cache', expirationTtl: 3600 },
    request
  );
  
  return productResponse;
}

/**
 * Extract minimal fields needed for catalog listing
 * Only includes: name, description, category, discountPercentage, and first image
 */
function extractCatalogFields(productData) {
  // Extract first image from various possible locations
  let firstImage = null;
  
  // Check for images array first
  if (productData.images && Array.isArray(productData.images) && productData.images.length > 0) {
    firstImage = productData.images[0];
  } else {
    // Check for single image fields
    firstImage = productData.image || productData.imageUrl || productData.image_url || 
                 productData.productImage || productData.thumbnail || productData.thumbnailUrl || null;
  }
  
  // Return only the minimal fields needed for catalog display
  return {
    name: productData.name || null,
    description: productData.description || null,
    category: productData.category || null,
    discountPercentage: productData.discountPercentage || 0,
    // Include first image - use images array if we found one, otherwise use single image field
    ...(firstImage ? { images: [firstImage] } : {}),
  };
}

/**
 * Get products with pagination
 * Returns only minimal fields for catalog listing: name, description, category, discountPercentage, first image, price, stock
 */
export async function getProductsWithDetails(
  page,
  limit,
  category,
  search,
  db,
  pricingWorkerBinding,
  fulfillmentWorkerBinding,
  apiKey
) {
  // Get products from database
  // If both search and category are provided, search with category filter in SQL
  let result;
  if (search) {
    // Pass category to searchProducts so it can filter in SQL (not after pagination)
    result = await searchProducts(db, search, page, limit, category);
  } else {
    result = await getProducts(db, page, limit, category);
  }
  
  if (result.products.length === 0) {
    return {
      products: [],
      pagination: result.pagination,
    };
  }
  
  // Get product IDs
  const productIds = result.products.map(p => p.product_id);
  
  // Fetch prices and stocks in parallel using Service Bindings
  const [prices, stocks] = await Promise.all([
    getPricesFromWorker(productIds, pricingWorkerBinding, apiKey),
    getStocksFromWorker(productIds, fulfillmentWorkerBinding, apiKey),
  ]);
  
  // Combine product data with price and stock
  // Only include minimal fields needed for catalog listing
  const products = result.products.map(product => {
    const productData = typeof product.data === 'string' 
      ? JSON.parse(product.data) 
      : product.data;
    
    const priceData = prices[product.product_id];
    const stockData = stocks[product.product_id];
    
    // Extract only minimal catalog fields
    const catalogFields = extractCatalogFields(productData);
    
    // Return minimal product data for catalog listing
    return {
      productId: product.product_id,
      ...catalogFields, // Only name, description, category, discountPercentage, first image
      price: priceData?.price || null, // Always from pricing worker
      stock: stockData?.available || 0, // Always from fulfillment worker, never cached
    };
  });
  
  return {
    products,
    pagination: result.pagination,
  };
}

/**
 * Get price from pricing worker using Service Binding
 */
async function getPriceFromWorker(productId, pricingWorkerBinding, apiKey) {
  try {
    const response = await getWorkerBinding(
      pricingWorkerBinding,
      `/product/${productId}`,
      {},
      apiKey
    );
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to get price for ${productId}: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error getting price for ${productId}:`, error.message);
    return null;
  }
}

/**
 * Get stock from fulfillment worker using Service Binding
 */
async function getStockFromWorker(productId, fulfillmentWorkerBinding, apiKey) {
  try {
    const response = await getWorkerBinding(
      fulfillmentWorkerBinding,
      `/stock/${productId}`,
      {},
      apiKey
    );
    
    if (response.status === 404) {
      return { available: 0 };
    }
    
    if (!response.ok) {
      console.error(`Failed to get stock for ${productId}: ${response.status}`);
      return { available: 0 };
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error getting stock for ${productId}:`, error.message);
    return { available: 0 };
  }
}

/**
 * Get prices for multiple products using Service Binding
 */
async function getPricesFromWorker(productIds, pricingWorkerBinding, apiKey) {
  if (productIds.length === 0) {
    return {};
  }
  
  try {
    const response = await getWorkerBinding(
      pricingWorkerBinding,
      '/products',
      { productIds: productIds.join(',') },
      apiKey
    );
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to get prices: ${response.status} - ${errorText.substring(0, 200)}`);
      return {};
    }
    
    const data = await response.json();
    return data || {};
  } catch (error) {
    console.error('Error getting prices:', error.message);
    return {};
  }
}

/**
 * Get stocks for multiple products using Service Binding
 */
async function getStocksFromWorker(productIds, fulfillmentWorkerBinding, apiKey) {
  if (productIds.length === 0) {
    return {};
  }
  
  try {
    const response = await getWorkerBinding(
      fulfillmentWorkerBinding,
      '/stocks',
      { productIds: productIds.join(',') },
      apiKey
    );
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to get stocks: ${response.status} - ${errorText.substring(0, 200)}`);
      return {};
    }
    
    const data = await response.json();
    return data || {};
  } catch (error) {
    console.error('Error getting stocks:', error.message);
    return {};
  }
}

/**
 * Invalidate product cache
 */
export async function invalidateProductCache(productId, kv, request = null) {
  const cacheKey = `product:${productId}`;
  await traceKvOperation(
    'kv.delete',
    async () => await kv.delete(cacheKey),
    { key: cacheKey, namespace: 'product_cache' },
    request
  );
}
