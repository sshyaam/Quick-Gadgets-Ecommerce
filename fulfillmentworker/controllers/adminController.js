/**
 * Admin controller for fulfillment worker
 * Handles admin-only stock management operations
 */

import { authenticateAdmin } from '../../shared/utils/adminAuth.js';
import * as inventoryModel from '../models/inventoryModel.js';
import { ValidationError } from '../../shared/utils/errors.js';

/**
 * Update stock for a product (admin only)
 */
export async function updateStock(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const { productId } = request.params;
  const body = await request.json();
  
  if (body.quantity === undefined) {
    throw new ValidationError('Quantity is required');
  }
  
  if (typeof body.quantity !== 'number' || body.quantity < 0) {
    throw new ValidationError('Quantity must be a non-negative number');
  }
  
  const warehouseId = body.warehouseId || 'WH-MUM-001';
  
  // Get current stock
  const stock = await inventoryModel.getStock(env.fulfillment_db, productId, warehouseId);
  
  if (!stock || stock.length === 0) {
    // Create new inventory entry if it doesn't exist
    const inventoryId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await env.fulfillment_db
      .prepare(
        `INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(inventoryId, productId, warehouseId, body.quantity, 0, now, now)
      .run();
  } else {
    // Update existing stock
    const inventoryId = stock[0].inventory_id;
    await env.fulfillment_db
      .prepare(
        `UPDATE inventory 
         SET quantity = ?, updated_at = ? 
         WHERE inventory_id = ?`
      )
      .bind(body.quantity, new Date().toISOString(), inventoryId)
      .run();
  }
  
  // Get updated stock
  const updatedStock = await inventoryModel.getStock(env.fulfillment_db, productId, warehouseId);
  
  return new Response(
    JSON.stringify({
      productId,
      warehouseId,
      quantity: body.quantity,
      available: updatedStock[0]?.quantity - updatedStock[0]?.reserved_quantity || 0,
      reserved: updatedStock[0]?.reserved_quantity || 0,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get stock for all products (admin view)
 */
export async function getAllStocks(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = (page - 1) * limit;
  
  // Get all inventory entries
  const inventoryResult = await env.fulfillment_db
    .prepare(
      `SELECT inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at
       FROM inventory
       WHERE deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all();
  
  const countResult = await env.fulfillment_db
    .prepare(`SELECT COUNT(*) as total FROM inventory WHERE deleted_at IS NULL`)
    .first();
  
  const total = countResult.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  const stocks = (inventoryResult.results || []).map(item => ({
    inventoryId: item.inventory_id,
    productId: item.product_id,
    warehouseId: item.warehouse_id,
    quantity: item.quantity,
    reservedQuantity: item.reserved_quantity,
    available: item.quantity - item.reserved_quantity,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
  
  return new Response(
    JSON.stringify({
      stocks,
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
 * Get all warehouses (admin view)
 */
export async function getAllWarehouses(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const result = await env.fulfillment_db
    .prepare(
      `SELECT warehouse_id, name, pincode, city, state, address, is_active, created_at, updated_at
       FROM warehouses
       ORDER BY created_at DESC`
    )
    .all();
  
  const warehouses = (result.results || []).map(warehouse => ({
    warehouseId: warehouse.warehouse_id,
    name: warehouse.name,
    pincode: warehouse.pincode,
    city: warehouse.city,
    state: warehouse.state,
    address: warehouse.address,
    isActive: warehouse.is_active === 1,
    createdAt: warehouse.created_at,
    updatedAt: warehouse.updated_at,
  }));
  
  return new Response(
    JSON.stringify({ warehouses }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get all shipping rules (admin view)
 */
export async function getAllShippingRules(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get('warehouseId') || null;
  const category = url.searchParams.get('category') || null;
  
  let query = `SELECT rule_id, warehouse_id, category, rules, created_at, updated_at
               FROM shipping_rules`;
  const params = [];
  
  if (warehouseId) {
    query += ` WHERE warehouse_id = ?`;
    params.push(warehouseId);
  }
  
  if (category) {
    query += params.length > 0 ? ` AND category = ?` : ` WHERE category = ?`;
    params.push(category);
  }
  
  query += ` ORDER BY warehouse_id, category, created_at DESC`;
  
  const result = await env.fulfillment_db
    .prepare(query)
    .bind(...params)
    .all();
  
  const rules = (result.results || []).map(rule => {
    try {
      const rulesData = typeof rule.rules === 'string' ? JSON.parse(rule.rules) : rule.rules;
      return {
        ruleId: rule.rule_id,
        warehouseId: rule.warehouse_id,
        category: rule.category,
        rules: rulesData,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      };
    } catch (error) {
      console.error('[adminController] Error parsing shipping rule:', error, rule);
      return {
        ruleId: rule.rule_id,
        warehouseId: rule.warehouse_id,
        category: rule.category,
        rules: { standard: {}, express: {} },
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      };
    }
  });
  
  return new Response(
    JSON.stringify({ rules }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

