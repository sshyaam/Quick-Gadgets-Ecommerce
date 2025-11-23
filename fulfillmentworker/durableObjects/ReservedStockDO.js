/**
 * Durable Object for managing reserved stock atomically
 * One instance per productId to ensure strong consistency
 * 
 * This solves race conditions by serializing all reserve/release operations
 * per product through a single DO instance.
 * 
 * Supports TTL-based reservations to handle abandoned orders.
 * Each reservation is tracked with orderId and expiration time.
 */

export class ReservedStockDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Reserved stock is stored in DO storage for persistence
    // Key: `reserved:${productId}`, Value: { reservations: [{orderId, quantity, expiresAt}], updatedAt: string }
    
    // Schedule periodic cleanup using alarm (if supported) or on every fetch
    // Note: Cloudflare DO alarms require paid plan, so we use fetch-based cleanup
  }

  /**
   * Clean up expired reservations
   * @returns {Promise<number>} Total active reserved quantity after cleanup
   */
  async cleanupExpiredReservations() {
    const productId = this.getProductId();
    const storageKey = `reserved:${productId}`;
    const current = await this.state.storage.get(storageKey);
    
    if (!current || !current.reservations || current.reservations.length === 0) {
      return 0;
    }
    
    const now = Date.now();
    const activeReservations = current.reservations.filter(res => {
      const expiresAt = new Date(res.expiresAt).getTime();
      return expiresAt > now;
    });
    
    const totalReserved = activeReservations.reduce((sum, res) => sum + res.quantity, 0);
    
    // Update storage with cleaned reservations
    await this.state.storage.put(storageKey, {
      reservations: activeReservations,
      updatedAt: new Date().toISOString(),
    });
    
    const expiredCount = current.reservations.length - activeReservations.length;
    if (expiredCount > 0) {
      console.log(`[ReservedStockDO] Cleaned up ${expiredCount} expired reservation(s) for product ${productId}. Active reserved: ${totalReserved}`);
    }
    
    return totalReserved;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Always cleanup expired reservations before any operation (except cleanup itself)
      // This ensures expired reservations are removed proactively
      if (method !== 'POST' || url.pathname !== '/cleanup') {
        try {
          await this.cleanupExpiredReservations();
        } catch (cleanupError) {
          // Log but don't fail - cleanup errors shouldn't block operations
          console.warn('[ReservedStockDO] Cleanup warning:', cleanupError.message);
        }
      }

      if (method === 'POST' && url.pathname === '/reserve') {
        return await this.handleReserve(request);
      } else if (method === 'POST' && url.pathname === '/release') {
        return await this.handleRelease(request);
      } else if (method === 'GET' && url.pathname === '/status') {
        return await this.handleGetStatus();
      } else if (method === 'POST' && url.pathname === '/reduce') {
        return await this.handleReduce(request);
      } else if (method === 'POST' && url.pathname === '/cleanup') {
        return await this.handleCleanup();
      } else if (method === 'GET' && url.pathname === '/all') {
        return await this.handleGetAll();
      } else {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (error) {
      console.error('[ReservedStockDO] Error:', error);
      return new Response(
        JSON.stringify({ 
          error: error.message || 'Internal server error',
          success: false 
        }),
        {
          status: error.status || 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  /**
   * Reserve stock atomically with TTL
   * POST /reserve
   * Body: { quantity: number, orderId: string, ttlMinutes?: number }
   * Returns: { success: boolean, reserved: number, totalReserved: number, expiresAt: string }
   */
  async handleReserve(request) {
    const body = await request.json();
    const { quantity, orderId, ttlMinutes = 15 } = body;

    if (!quantity || typeof quantity !== 'number' || quantity <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid quantity. Must be a positive number.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!orderId || typeof orderId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'orderId is required and must be a string.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Cleanup already happened in fetch(), get current reservations
    const productId = this.getProductId();
    const storageKey = `reserved:${productId}`;
    const current = await this.state.storage.get(storageKey);
    
    const reservations = current?.reservations || [];
    const currentReserved = reservations.reduce((sum, res) => {
      const expiresAt = new Date(res.expiresAt).getTime();
      return expiresAt > Date.now() ? sum + res.quantity : sum;
    }, 0);
    
    // Check if this orderId already has a reservation (update it)
    const existingIndex = reservations.findIndex(r => r.orderId === orderId);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    
    if (existingIndex >= 0) {
      // Update existing reservation
      reservations[existingIndex] = {
        orderId,
        quantity,
        expiresAt,
      };
    } else {
      // Add new reservation
      reservations.push({
        orderId,
        quantity,
        expiresAt,
      });
    }
    
    const totalReserved = reservations.reduce((sum, res) => sum + res.quantity, 0);

    // Store updated reservations atomically
    await this.state.storage.put(storageKey, {
      reservations,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[ReservedStockDO] Reserved ${quantity} for product ${productId}, order ${orderId}. Total reserved: ${totalReserved}, expires at ${expiresAt}`);

    return new Response(
      JSON.stringify({
        success: true,
        reserved: quantity,
        totalReserved,
        previousReserved: currentReserved,
        expiresAt,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Release reserved stock atomically (by orderId)
   * POST /release
   * Body: { orderId: string } or { quantity: number } (backward compatibility)
   * Returns: { success: boolean, released: number, totalReserved: number }
   */
  async handleRelease(request) {
    const body = await request.json();
    const { orderId, quantity } = body;

    console.log(`[ReservedStockDO] Release request received: orderId=${orderId}, quantity=${quantity}`);

    // Cleanup already happened in fetch()

    // Get current reservations
    const productId = this.getProductId();
    const storageKey = `reserved:${productId}`;
    const current = await this.state.storage.get(storageKey);
    
    const reservations = current?.reservations || [];
    
    console.log(`[ReservedStockDO] Current reservations for product ${productId}:`, JSON.stringify(reservations.map(r => ({ orderId: r.orderId, quantity: r.quantity }))));
    
    let released = 0;
    let remainingReservations = reservations;
    
    if (orderId) {
      // Release by orderId (preferred method)
      // Normalize orderId to string for comparison
      const normalizedOrderId = String(orderId).trim();
      const orderIndex = reservations.findIndex(r => String(r.orderId).trim() === normalizedOrderId);
      console.log(`[ReservedStockDO] Looking for orderId "${normalizedOrderId}" (type: ${typeof normalizedOrderId}), found at index: ${orderIndex}`);
      if (orderIndex >= 0) {
        released = reservations[orderIndex].quantity;
        remainingReservations = reservations.filter((_, index) => index !== orderIndex);
        console.log(`[ReservedStockDO] Releasing reservation for order ${normalizedOrderId}: ${released} units`);
      } else {
        const availableOrderIds = reservations.map(r => `"${r.orderId}" (type: ${typeof r.orderId})`).join(', ');
        console.warn(`[ReservedStockDO] No reservation found for order "${normalizedOrderId}" for product ${productId}. Available orderIds: [${availableOrderIds}]`);
        // Return success even if not found (idempotent)
        const totalReserved = reservations.reduce((sum, res) => sum + res.quantity, 0);
        return new Response(
          JSON.stringify({
            success: true,
            released: 0,
            totalReserved,
            previousReserved: totalReserved,
            message: `No reservation found for orderId "${normalizedOrderId}"`,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } else if (quantity) {
      // Backward compatibility: release by quantity (FIFO - oldest first)
      if (typeof quantity !== 'number' || quantity <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid quantity. Must be a positive number.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      let remainingToRelease = quantity;
      remainingReservations = [];
      
      for (const res of reservations) {
        if (remainingToRelease <= 0) {
          remainingReservations.push(res);
          continue;
        }
        
        if (res.quantity <= remainingToRelease) {
          released += res.quantity;
          remainingToRelease -= res.quantity;
        } else {
          // Partial release
          released += remainingToRelease;
          remainingReservations.push({
            ...res,
            quantity: res.quantity - remainingToRelease,
          });
          remainingToRelease = 0;
        }
      }
      
      if (remainingToRelease > 0) {
        const totalReserved = reservations.reduce((sum, res) => sum + res.quantity, 0);
        console.warn(`[ReservedStockDO] Attempted to release ${quantity} but only ${totalReserved} is reserved for product ${productId}`);
        return new Response(
          JSON.stringify({ 
            error: `Cannot release ${quantity}. Only ${totalReserved} is reserved.`,
            success: false 
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Either orderId or quantity must be provided.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const totalReserved = remainingReservations.reduce((sum, res) => sum + res.quantity, 0);

    // Store updated reservations atomically
    await this.state.storage.put(storageKey, {
      reservations: remainingReservations,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[ReservedStockDO] Released ${released} for product ${productId}. Total reserved: ${totalReserved}`);

    return new Response(
      JSON.stringify({
        success: true,
        released,
        totalReserved,
        previousReserved: reservations.reduce((sum, res) => sum + res.quantity, 0),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Reduce reserved stock (used when order is fulfilled - reduces both reserved and actual)
   * POST /reduce
   * Body: { orderId: string } or { quantity: number } (backward compatibility)
   * Returns: { success: boolean, reduced: number, totalReserved: number }
   */
  async handleReduce(request) {
    const body = await request.json();
    const { orderId, quantity } = body;

    // Cleanup already happened in fetch()

    // Get current reservations
    const productId = this.getProductId();
    const storageKey = `reserved:${productId}`;
    const current = await this.state.storage.get(storageKey);
    
    const reservations = current?.reservations || [];
    
    let reduced = 0;
    let remainingReservations = reservations;
    
    if (orderId) {
      // Reduce by orderId (preferred method)
      const orderIndex = reservations.findIndex(r => r.orderId === orderId);
      if (orderIndex >= 0) {
        reduced = reservations[orderIndex].quantity;
        remainingReservations = reservations.filter((_, index) => index !== orderIndex);
        console.log(`[ReservedStockDO] Reducing reservation for order ${orderId}: ${reduced} units`);
      } else {
        console.warn(`[ReservedStockDO] No reservation found for order ${orderId} for product ${productId}`);
        // Return success even if not found (idempotent)
        const totalReserved = reservations.reduce((sum, res) => sum + res.quantity, 0);
        return new Response(
          JSON.stringify({
            success: true,
            reduced: 0,
            totalReserved,
            previousReserved: totalReserved,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } else if (quantity) {
      // Backward compatibility: reduce by quantity (FIFO - oldest first)
      if (typeof quantity !== 'number' || quantity <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid quantity. Must be a positive number.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      let remainingToReduce = quantity;
      remainingReservations = [];
      
      for (const res of reservations) {
        if (remainingToReduce <= 0) {
          remainingReservations.push(res);
          continue;
        }
        
        if (res.quantity <= remainingToReduce) {
          reduced += res.quantity;
          remainingToReduce -= res.quantity;
        } else {
          // Partial reduce
          reduced += remainingToReduce;
          remainingReservations.push({
            ...res,
            quantity: res.quantity - remainingToReduce,
          });
          remainingToReduce = 0;
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Either orderId or quantity must be provided.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const totalReserved = remainingReservations.reduce((sum, res) => sum + res.quantity, 0);

    // Store updated reservations atomically
    await this.state.storage.put(storageKey, {
      reservations: remainingReservations,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[ReservedStockDO] Reduced ${reduced} reserved stock for product ${productId}. Total reserved: ${totalReserved}`);

    return new Response(
      JSON.stringify({
        success: true,
        reduced,
        totalReserved,
        previousReserved: reservations.reduce((sum, res) => sum + res.quantity, 0),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Get current reserved stock status (after cleaning expired)
   * GET /status
   * Returns: { reserved: number, updatedAt: string, reservations: Array }
   */
  async handleGetStatus() {
    // Cleanup already happened in fetch(), just get current state
    const productId = this.getProductId();
    const storageKey = `reserved:${productId}`;
    const current = await this.state.storage.get(storageKey);
    
    const reservations = current?.reservations || [];
    const totalReserved = reservations.reduce((sum, res) => {
      const expiresAt = new Date(res.expiresAt).getTime();
      return expiresAt > Date.now() ? sum + res.quantity : sum;
    }, 0);
    const updatedAt = current?.updatedAt || null;

    return new Response(
      JSON.stringify({
        reserved: totalReserved,
        updatedAt,
        reservations: reservations.map(r => ({
          orderId: r.orderId,
          quantity: r.quantity,
          expiresAt: r.expiresAt,
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Clean up expired reservations (manual trigger)
   * POST /cleanup
   * Returns: { cleaned: number, totalReserved: number }
   */
  async handleCleanup() {
    const productId = this.getProductId();
    const storageKey = `reserved:${productId}`;
    const current = await this.state.storage.get(storageKey);
    
    if (!current || !current.reservations || current.reservations.length === 0) {
      return new Response(
        JSON.stringify({
          cleaned: 0,
          totalReserved: 0,
          message: 'No reservations to clean',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const beforeCount = current.reservations.length;
    const beforeReserved = current.reservations.reduce((sum, res) => sum + res.quantity, 0);
    
    const totalReserved = await this.cleanupExpiredReservations();
    
    const afterCount = (await this.state.storage.get(storageKey))?.reservations?.length || 0;
    const cleaned = beforeCount - afterCount;
    
    return new Response(
      JSON.stringify({
        cleaned,
        totalReserved,
        beforeReserved,
        afterReserved: totalReserved,
        message: `Cleaned up ${cleaned} expired reservation(s)`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Get all reservations (including expired, for debugging)
   * GET /all
   * Returns: { reservations: Array, totalReserved: number, expiredCount: number }
   */
  async handleGetAll() {
    // Cleanup already happened in fetch(), but we want to show expired too for debugging
    const productId = this.getProductId();
    const storageKey = `reserved:${productId}`;
    const current = await this.state.storage.get(storageKey);
    
    const reservations = current?.reservations || [];
    const now = Date.now();
    
    const activeReservations = reservations.filter(res => {
      const expiresAt = new Date(res.expiresAt).getTime();
      return expiresAt > now;
    });
    
    const expiredReservations = reservations.filter(res => {
      const expiresAt = new Date(res.expiresAt).getTime();
      return expiresAt <= now;
    });
    
    const totalReserved = activeReservations.reduce((sum, res) => sum + res.quantity, 0);
    const expiredReserved = expiredReservations.reduce((sum, res) => sum + res.quantity, 0);
    
    return new Response(
      JSON.stringify({
        productId,
        totalReserved,
        expiredReserved,
        activeCount: activeReservations.length,
        expiredCount: expiredReservations.length,
        reservations: reservations.map(r => ({
          orderId: r.orderId,
          quantity: r.quantity,
          expiresAt: r.expiresAt,
          isExpired: new Date(r.expiresAt).getTime() <= now,
          expiresIn: Math.max(0, Math.floor((new Date(r.expiresAt).getTime() - now) / 1000 / 60)), // minutes
        })),
        updatedAt: current?.updatedAt || null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Extract productId from the DO ID
   * The DO ID is created using idFromName(productId)
   */
  getProductId() {
    // The DO ID is created with idFromName(productId)
    // We can get the name from the ID
    const id = this.state.id;
    // If created with idFromName, use .name, otherwise toString()
    return id.name || id.toString();
  }
}

