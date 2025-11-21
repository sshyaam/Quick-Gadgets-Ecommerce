/**
 * Product model for catalog worker
 * Stores product data in JSONB format (excluding price and stock)
 */

/**
 * Get product by ID
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @returns {Promise<Object|null>} Product data or null
 */
export async function getProductById(db, productId) {
  const result = await db
    .prepare(
      `SELECT product_id, data, created_at, updated_at
       FROM products 
       WHERE product_id = ? AND deleted_at IS NULL`
    )
    .bind(productId)
    .first();
  
  return result || null;
}

/**
 * Get products with pagination
 * @param {D1Database} db - Database instance
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @param {string} category - Optional category filter
 * @returns {Promise<Object>} Products and pagination info
 */
export async function getProducts(db, page = 1, limit = 20, category = null) {
  const offset = (page - 1) * limit;
  
  let query = `SELECT product_id, data, created_at, updated_at
               FROM products 
               WHERE deleted_at IS NULL`;
  let countQuery = `SELECT COUNT(*) as total
                    FROM products 
                    WHERE deleted_at IS NULL`;
  
  const params = [];
  
  if (category) {
    query += ` AND json_extract(data, '$.category') = ?`;
    countQuery += ` AND json_extract(data, '$.category') = ?`;
    params.push(category);
  }
  
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const [productsResult, countResult] = await Promise.all([
    db.prepare(query).bind(...params).all(),
    db.prepare(countQuery).bind(...(category ? [category] : [])).first(),
  ]);
  
  const total = countResult.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  return {
    products: productsResult.results || [],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Search products by name or description
 * @param {D1Database} db - Database instance
 * @param {string} searchTerm - Search term
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @param {string|null} category - Optional category filter
 * @returns {Promise<Object>} Products and pagination info
 */
export async function searchProducts(db, searchTerm, page = 1, limit = 20, category = null) {
  const offset = (page - 1) * limit;
  
  // Search in name and description fields using json_extract
  let query = `SELECT product_id, data, created_at, updated_at
               FROM products 
               WHERE deleted_at IS NULL
                 AND (
                   json_extract(data, '$.name') LIKE ? 
                   OR json_extract(data, '$.description') LIKE ?
                 )`;
  
  let countQuery = `SELECT COUNT(*) as total
                    FROM products 
                    WHERE deleted_at IS NULL
                      AND (
                        json_extract(data, '$.name') LIKE ? 
                        OR json_extract(data, '$.description') LIKE ?
                      )`;
  
  const params = [];
  const searchPattern = `%${searchTerm}%`;
  params.push(searchPattern, searchPattern);
  
  // Add category filter if provided
  if (category) {
    query += ` AND json_extract(data, '$.category') = ?`;
    countQuery += ` AND json_extract(data, '$.category') = ?`;
    params.push(category);
  }
  
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const productsResult = await db
    .prepare(query)
    .bind(...params)
    .all();
  
  // Get total count (without LIMIT/OFFSET)
  const countParams = [searchPattern, searchPattern];
  if (category) {
    countParams.push(category);
  }
  
  const countResult = await db
    .prepare(countQuery)
    .bind(...countParams)
    .first();
  
  const total = countResult.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  return {
    products: productsResult.results || [],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Create product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {Object} productData - Product data (JSONB)
 * @returns {Promise<Object>} Created product
 */
export async function createProduct(db, productId, productData) {
  const now = new Date().toISOString();
  
  const result = await db
    .prepare(
      `INSERT INTO products (product_id, data, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(productId, JSON.stringify(productData), now, now)
    .run();
  
  if (!result.success) {
    throw new Error('Failed to create product');
  }
  
  return {
    productId,
    data: productData,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {Object} productData - Updated product data (JSONB)
 * @returns {Promise<boolean>} True if updated
 */
export async function updateProduct(db, productId, productData) {
  const result = await db
    .prepare(
      `UPDATE products 
       SET data = ?, updated_at = ? 
       WHERE product_id = ? AND deleted_at IS NULL`
    )
    .bind(JSON.stringify(productData), new Date().toISOString(), productId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

/**
 * Soft delete product
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function softDeleteProduct(db, productId) {
  const result = await db
    .prepare(
      `UPDATE products 
       SET deleted_at = ? 
       WHERE product_id = ? AND deleted_at IS NULL`
    )
    .bind(new Date().toISOString(), productId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

