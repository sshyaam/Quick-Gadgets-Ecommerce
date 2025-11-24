/**
 * Admin controller for catalog worker
 * Handles admin-only CRUD operations on products
 */

import { authenticateAdmin } from '../../shared/utils/adminAuth.js';
import * as productModel from '../models/productModel.js';
import * as catalogService from '../services/catalogService.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { sendLog } from '../../shared/utils/logger.js';
import { randomUUID } from 'crypto';
import { getWorkerBinding } from '../../shared/utils/interWorker.js';

/**
 * Get all products (admin view - includes deleted)
 */
export async function getAllProducts(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const category = url.searchParams.get('category') || null;
  
  // Get all products including deleted (admin view)
  const offset = (page - 1) * limit;
  
  let query = `SELECT product_id, data, created_at, updated_at, deleted_at
               FROM products`;
  let countQuery = `SELECT COUNT(*) as total FROM products`;
  
  if (category) {
    query += ` WHERE json_extract(data, '$.category') = ?`;
    countQuery += ` WHERE json_extract(data, '$.category') = ?`;
  }
  
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  
  const queryParams = category ? [category, limit, offset] : [limit, offset];
  const countParams = category ? [category] : [];
  
  const [productsResult, countResult] = await Promise.all([
    env.catalog_db.prepare(query).bind(...queryParams).all(),
    env.catalog_db.prepare(countQuery).bind(...countParams).first(),
  ]);
  
  const total = countResult.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  // Parse product data first
  const parsedProducts = (productsResult.results || []).map(product => {
    try {
      const productData = typeof product.data === 'string' ? JSON.parse(product.data) : product.data;
      return {
        productId: product.product_id,
        productData,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        deletedAt: product.deleted_at,
      };
    } catch (error) {
      console.error('[adminController] Error parsing product data:', error, product);
      return {
        productId: product.product_id,
        productData: {
          name: 'Invalid Product Data',
          description: 'Unable to parse product data',
        },
        stock: 0,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        deletedAt: product.deleted_at,
      };
    }
  });
  
  // Batch fetch stock and prices for all products at once
  let stockMap = {};
  let priceMap = {};
  if (parsedProducts.length > 0) {
    const productIds = parsedProducts.map(p => p.productId);
    const productIdsString = productIds.join(',');
    const apiKey = env.INTER_WORKER_API_KEY;
    
    console.log(`[adminController] Fetching data for ${productIds.length} products`);
    console.log(`[adminController] Service bindings available:`, {
      pricing_worker: !!env.pricing_worker,
      fulfillment_worker: !!env.fulfillment_worker
    });
    
    // Fetch stock
    try {
      if (env.fulfillment_worker) {
        // Use service binding
        const stockResponse = await env.fulfillment_worker.fetch(
          `https://workers.dev/stocks?productIds=${productIdsString}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'X-Worker-Request': 'true',
            },
          }
        );
        
        if (stockResponse.ok) {
          stockMap = await stockResponse.json();
        } else {
          const errorText = await stockResponse.text().catch(() => 'Unknown error');
          console.warn('[adminController] Batch stock fetch failed:', stockResponse.status, errorText);
        }
      } else {
        // Fallback to HTTP
        const fulfillmentUrl = env.FULFILLMENT_WORKER_URL || 'https://fulfillment-worker.shyaamdps.workers.dev';
        const stockResponse = await fetch(
          `${fulfillmentUrl}/stocks?productIds=${productIdsString}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'X-Worker-Request': 'true',
            },
          }
        );
        
        if (stockResponse.ok) {
          stockMap = await stockResponse.json();
        } else {
          const errorText = await stockResponse.text().catch(() => 'Unknown error');
          console.warn('[adminController] Batch stock fetch failed:', stockResponse.status, errorText);
        }
      }
    } catch (stockError) {
      console.error('[adminController] Error batch fetching stock:', stockError.message, stockError.stack);
      // Continue without stock data
    }
    
    // Fetch prices using service binding (same pattern as catalogService)
    try {
      if (env.pricing_worker) {
        // Use service binding directly (same as catalogService.getPricesFromWorker)
        const priceResponse = await getWorkerBinding(
          env.pricing_worker,
          '/products',
          { productIds: productIdsString },
          apiKey
        );
        
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          priceMap = priceData || {};
          console.log(`[adminController] Fetched prices for ${Object.keys(priceMap).length} products using service binding`);
          if (Object.keys(priceMap).length > 0) {
            const sampleKeys = Object.keys(priceMap).slice(0, 3);
            console.log(`[adminController] Price map sample:`, sampleKeys.map(key => ({ 
              productId: key, 
              priceData: priceMap[key],
              priceValue: priceMap[key]?.price 
            })));
          } else {
            console.warn(`[adminController] Price map is empty! Product IDs requested: ${productIdsString.substring(0, 100)}`);
          }
        } else {
          const errorText = await priceResponse.text().catch(() => 'Unknown error');
          console.error('[adminController] Batch price fetch failed via service binding:', priceResponse.status, errorText);
        }
      } else {
        console.warn('[adminController] pricing_worker service binding not available, using HTTP fallback');
        // Fallback to HTTP only if service binding is not available
        const pricingUrl = env.PRICING_WORKER_URL || 'https://pricing-worker.shyaamdps.workers.dev';
        const priceResponse = await fetch(
          `${pricingUrl}/products?productIds=${productIdsString}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'X-Worker-Request': 'true',
            },
          }
        );
        
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          priceMap = priceData || {};
          console.log(`[adminController] Fetched prices for ${Object.keys(priceMap).length} products (HTTP fallback)`);
        } else {
          const errorText = await priceResponse.text().catch(() => 'Unknown error');
          console.error('[adminController] Batch price fetch failed (HTTP fallback):', priceResponse.status, errorText);
        }
      }
    } catch (priceError) {
      console.error('[adminController] Error batch fetching prices:', priceError.message, priceError.stack);
      // Continue without price data
    }
  }
  
  // Combine product data with stock and price
  const products = parsedProducts.map(({ productId, productData, createdAt, updatedAt, deletedAt }) => {
    const stockInfo = stockMap[productId] || null;
    const priceInfo = priceMap[productId] || null;
    let stock = 0;
    let price = null;
    
    if (stockInfo) {
      // stockInfo is an object with { quantity, available, reservedQuantity, updatedAt }
      stock = stockInfo.available !== undefined ? stockInfo.available : (stockInfo.quantity - (stockInfo.reservedQuantity || 0) || 0);
    }
    
    if (priceInfo && priceInfo !== null) {
      // priceInfo is an object with { price, currency, updatedAt }
      if (typeof priceInfo.price === 'number') {
        price = priceInfo.price; // Use the price even if it's 0 (though unlikely)
      } else if (typeof priceInfo === 'object' && 'price' in priceInfo) {
        // Try to parse if it's a string
        const parsedPrice = parseFloat(priceInfo.price);
        price = !isNaN(parsedPrice) ? parsedPrice : null;
      }
    }
    
    // Extract ratings and reviews from productData (they should be in the JSONB data)
    // Handle both number and string types, and ensure we get the actual value
    // Note: These might be 0 if not set, which is valid
    let rating = 0;
    if (productData.rating !== null && productData.rating !== undefined && productData.rating !== '') {
      const parsedRating = typeof productData.rating === 'number' ? productData.rating : parseFloat(productData.rating);
      rating = !isNaN(parsedRating) ? parsedRating : 0;
    }
    
    let reviews = 0;
    if (productData.reviews !== null && productData.reviews !== undefined && productData.reviews !== '') {
      const parsedReviews = typeof productData.reviews === 'number' ? productData.reviews : parseInt(productData.reviews);
      reviews = !isNaN(parsedReviews) ? parsedReviews : 0;
    }
    
    // Debug log for first product
    const firstProductIndex = parsedProducts.findIndex(p => p.productId === productId);
    if (firstProductIndex === 0) {
      console.log(`[adminController] Sample product data for ${productId}:`, {
        productDataKeys: Object.keys(productData),
        rating: productData.rating,
        reviews: productData.reviews,
        priceInfo,
        priceMapKeys: Object.keys(priceMap).slice(0, 5),
        lookingForProductId: productId,
        stockInfo,
        finalRating: rating,
        finalReviews: reviews,
        finalPrice: price
      });
    }
    
    // Build the product object, ensuring price, rating, and reviews are properly set
    // IMPORTANT: Remove price from productData before spreading to avoid conflicts
    const { price: _priceFromData, stock: _stockFromData, ...productDataClean } = productData;
    
    const product = {
      productId,
      ...productDataClean,
      // Explicitly set these fields - price from pricing worker, rating/reviews from productData
      price: price !== null && price !== undefined ? price : null, // ONLY use price from pricing worker, never from productData
      rating: rating, // Ensure rating is a number (can be 0)
      reviews: reviews, // Ensure reviews is a number (can be 0)
      stock: stock || 0, // Override stock from productData with actual stock from fulfillment
      stockDetails: stockInfo || null,
      createdAt,
      updatedAt,
      deletedAt,
    };
    
    return product;
  });
  
  return new Response(
    JSON.stringify({
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create product (admin only)
 */
export async function createProduct(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const body = await request.json();
  
  // Validate required fields
  if (!body.name || !body.description || !body.category) {
    throw new ValidationError('Name, description, and category are required');
  }
  
  // Validate discount percentage (0-90%)
  const discountPercentage = body.discountPercentage || 0;
  if (discountPercentage < 0 || discountPercentage > 90) {
    throw new ValidationError('Discount percentage must be between 0% and 90%');
  }
  
  // Generate product ID
  const productId = randomUUID();
  
  // Log product creation start
  await sendLog(logWorkerBindingOrUrl, 'event', 'Product creation started (admin)', {
    adminUserId: request.userId || null,
    productName: body.name,
    category: body.category,
    worker: 'catalog-worker',
  }, apiKey, ctx);
  
  // Build product data
  const productData = {
    name: body.name,
    description: body.description,
    category: body.category,
    brand: body.brand || null,
    sku: body.sku || null,
    thumbnail: body.thumbnail || null,
    images: Array.isArray(body.images) ? body.images : (body.images ? [body.images] : []),
    productImage: body.images && body.images.length > 0 ? body.images[0] : (body.thumbnail || null),
    rating: body.rating || 0,
    reviews: body.reviews || 0,
    discountPercentage: discountPercentage,
    tags: Array.isArray(body.tags) ? body.tags : [],
    stock: body.stock || 0,
    availabilityStatus: (body.stock || 0) > 0 ? 'in stock' : 'out of stock',
    minimumOrderQuantity: body.minimumOrderQuantity || 1,
    ...body.customFields, // Include any custom fields
  };
  
  // Create product
  const product = await productModel.createProduct(
    env.catalog_db,
    productId,
    productData
  );
  
  // Invalidate cache for this product (in case it exists)
  if (env.product_cache) {
    try {
      await catalogService.invalidateProductCache(productId, env.product_cache, request);
    } catch (cacheError) {
      console.warn('[adminController] Failed to invalidate cache:', cacheError);
      // Don't fail the request if cache invalidation fails
    }
  }
  
  // Log successful product creation
  await sendLog(logWorkerBindingOrUrl, 'event', 'Product created successfully (admin)', {
    adminUserId: request.userId || null,
    productId,
    productName: body.name,
    category: body.category,
    worker: 'catalog-worker',
  }, apiKey, ctx);
  
  // Also create price and stock if provided
  // Note: These are handled via service bindings to other workers
  // The frontend can call these separately after product creation if needed
  
  return new Response(
    JSON.stringify({
      productId: product.productId,
      ...productData,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      // Return price and stock from body so frontend knows what to set
      price: body.price,
      stock: body.stock,
    }),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Update product (admin only)
 */
export async function updateProduct(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const { productId } = request.params;
  const body = await request.json();
  
  // Validate discount percentage if provided (0-90%)
  if (body.discountPercentage !== undefined) {
    const discountPercentage = body.discountPercentage || 0;
    if (discountPercentage < 0 || discountPercentage > 90) {
      throw new ValidationError('Discount percentage must be between 0% and 90%');
    }
  }
  
  // Log product update start
  await sendLog(logWorkerBindingOrUrl, 'event', 'Product update started (admin)', {
    adminUserId: request.userId || null,
    productId,
    worker: 'catalog-worker',
  }, apiKey, ctx);
  
  // Get existing product
  const existingProduct = await productModel.getProductById(env.catalog_db, productId);
  if (!existingProduct) {
    throw new Error('Product not found');
  }
  
  // Parse existing data
  const existingData = JSON.parse(existingProduct.data);
  
  // Handle images separately - empty array means delete all images
  let imagesToSet;
  if (body.images !== undefined) {
    if (Array.isArray(body.images)) {
      imagesToSet = body.images; // Can be empty array
    } else if (body.images) {
      imagesToSet = [body.images]; // Single image as string
    } else {
      imagesToSet = []; // null/undefined/false means empty
    }
  } else {
    imagesToSet = existingData.images; // Keep existing if not specified
  }
  
  // Merge updates
  const updatedData = {
    ...existingData,
    ...body,
    // Override with processed images
    images: imagesToSet,
    productImage: imagesToSet && imagesToSet.length > 0 ? imagesToSet[0] : null,
    thumbnail: imagesToSet && imagesToSet.length > 0 ? imagesToSet[0] : null,
    // Update availability based on stock if stock is being updated
    availabilityStatus: body.stock !== undefined ? ((body.stock > 0) ? 'in stock' : 'out of stock') : existingData.availabilityStatus,
  };
  
  // Update product
  const success = await productModel.updateProduct(
    env.catalog_db,
    productId,
    updatedData
  );
  
  if (!success) {
    throw new Error('Failed to update product');
  }
  
  // Invalidate cache for this product
  if (env.product_cache) {
    try {
      await catalogService.invalidateProductCache(productId, env.product_cache, request);
    } catch (cacheError) {
      console.warn('[adminController] Failed to invalidate cache:', cacheError);
      // Don't fail the request if cache invalidation fails
    }
  }
  
  // Log successful product update
  await sendLog(logWorkerBindingOrUrl, 'event', 'Product updated successfully (admin)', {
    adminUserId: request.userId || null,
    productId,
    updatedFields: Object.keys(body),
    worker: 'catalog-worker',
  }, apiKey, ctx);
  
  return new Response(
    JSON.stringify({
      productId,
      ...updatedData,
      updatedAt: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Delete product (admin only - soft delete)
 */
export async function deleteProduct(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const { productId } = request.params;
  
  // Log product deletion start
  await sendLog(logWorkerBindingOrUrl, 'event', 'Product deletion started (admin)', {
    adminUserId: request.userId || null,
    productId,
    worker: 'catalog-worker',
  }, apiKey, ctx);
  
  // Soft delete product
  const success = await productModel.softDeleteProduct(env.catalog_db, productId);
  
  if (!success) {
    throw new Error('Product not found');
  }
  
  // Log successful product deletion
  await sendLog(logWorkerBindingOrUrl, 'event', 'Product deleted successfully (admin)', {
    adminUserId: request.userId || null,
    productId,
    worker: 'catalog-worker',
  }, apiKey, ctx);
  
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Product deleted successfully',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Restore product (admin only - undo soft delete)
 */
export async function restoreProduct(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const { productId } = request.params;
  
  // Restore product (remove deleted_at)
  const result = await env.catalog_db
    .prepare(
      `UPDATE products 
       SET deleted_at = NULL, updated_at = ? 
       WHERE product_id = ?`
    )
    .bind(new Date().toISOString(), productId)
    .run();
  
  if (!result.success || result.meta.changes === 0) {
    throw new Error('Product not found');
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Product restored successfully',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

