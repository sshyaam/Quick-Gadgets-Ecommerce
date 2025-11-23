/**
 * Helper utilities for interacting with ReservedStockDO
 * Provides a clean interface for reserve/release operations
 */

/**
 * Get the Durable Object stub for a product
 * @param {DurableObjectNamespace} doBinding - The DO binding from env
 * @param {string} productId - Product ID
 * @returns {DurableObjectStub} DO stub
 */
function getReservedStockDO(doBinding, productId) {
  if (!doBinding) {
    throw new Error('ReservedStockDO binding not available');
  }
  
  // Create DO ID from productId (one DO per product)
  const id = doBinding.idFromName(productId);
  return doBinding.get(id);
}

/**
 * Reserve stock using DO (atomic operation with TTL)
 * @param {DurableObjectNamespace} doBinding - The DO binding from env
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reserve
 * @param {string} orderId - Order ID (required for TTL tracking)
 * @param {number} ttlMinutes - Time to live in minutes (default: 15)
 * @returns {Promise<{success: boolean, reserved: number, totalReserved: number, expiresAt: string}>}
 */
export async function reserveStockDO(doBinding, productId, quantity, orderId, ttlMinutes = 15) {
  const stub = getReservedStockDO(doBinding, productId);
  
  const response = await stub.fetch('https://workers.dev/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity, orderId, ttlMinutes }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to reserve stock: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Release reserved stock using DO (atomic operation)
 * @param {DurableObjectNamespace} doBinding - The DO binding from env
 * @param {string} productId - Product ID
 * @param {string} orderId - Order ID (preferred) or quantity (backward compatibility)
 * @param {number} quantity - Quantity to release (only if orderId not provided)
 * @returns {Promise<{success: boolean, released: number, totalReserved: number}>}
 */
export async function releaseStockDO(doBinding, productId, orderId = null, quantity = null) {
  const stub = getReservedStockDO(doBinding, productId);
  
  const body = orderId ? { orderId } : { quantity };
  
  const response = await stub.fetch('https://workers.dev/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to release stock: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Reduce reserved stock using DO (used when order is fulfilled)
 * @param {DurableObjectNamespace} doBinding - The DO binding from env
 * @param {string} productId - Product ID
 * @param {string} orderId - Order ID (preferred) or quantity (backward compatibility)
 * @param {number} quantity - Quantity to reduce (only if orderId not provided)
 * @returns {Promise<{success: boolean, reduced: number, totalReserved: number}>}
 */
export async function reduceReservedStockDO(doBinding, productId, orderId = null, quantity = null) {
  const stub = getReservedStockDO(doBinding, productId);
  
  const body = orderId ? { orderId } : { quantity };
  
  const response = await stub.fetch('https://workers.dev/reduce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to reduce reserved stock: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Get current reserved stock from DO
 * @param {DurableObjectNamespace} doBinding - The DO binding from env
 * @param {string} productId - Product ID
 * @returns {Promise<{reserved: number, updatedAt: string}>}
 */
export async function getReservedStockStatus(doBinding, productId) {
  const stub = getReservedStockDO(doBinding, productId);
  
  const response = await stub.fetch('https://workers.dev/status', {
    method: 'GET',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to get reserved stock: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Get all reservations from DO (including expired, for debugging)
 * @param {DurableObjectNamespace} doBinding - The DO binding from env
 * @param {string} productId - Product ID
 * @returns {Promise<{reservations: Array, totalReserved: number, expiredCount: number}>}
 */
export async function getAllReservations(doBinding, productId) {
  const stub = getReservedStockDO(doBinding, productId);
  
  const response = await stub.fetch('https://workers.dev/all', {
    method: 'GET',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to get all reservations: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Clean up expired reservations manually
 * @param {DurableObjectNamespace} doBinding - The DO binding from env
 * @param {string} productId - Product ID
 * @returns {Promise<{cleaned: number, totalReserved: number}>}
 */
export async function cleanupExpiredReservations(doBinding, productId) {
  const stub = getReservedStockDO(doBinding, productId);
  
  const response = await stub.fetch('https://workers.dev/cleanup', {
    method: 'POST',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to cleanup reservations: ${response.status}`);
  }
  
  return await response.json();
}

