# Cart Clearing, Pagination, and Express Shipping Logic

## 1. Cart Clearing After Checkout

### How Cart is Cleared

The cart is **NOT soft deleted** - it's **cleared** by setting the items array to empty and total price to zero. The cart record itself remains in the database.

**Location:** `cartworker/models/cartModel.js` (lines 120-131)

```javascript
export async function clearCart(db, cartId) {
  const result = await db
    .prepare(
      `UPDATE carts 
       SET items = ?, total_price = 0, updated_at = ? 
       WHERE cart_id = ? AND deleted_at IS NULL`
    )
    .bind(JSON.stringify([]), new Date().toISOString(), cartId)
    .run();
  
  return result.success && result.meta.changes > 0;
}
```

### When Cart is Cleared

The cart is cleared **after successful payment capture** in the order saga.

**Location:** `ordersworker/services/orderSagaService.js` (lines 664-699)

```javascript
// Step 4: Clear cart (get cartId from order or user)
const userId = order.userId || order.user_id;
if (userId && env.cart_worker && accessToken) {
  try {
    // Get user's cart
    const cartRequest = new Request('https://workers.dev/cart', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.INTER_WORKER_API_KEY,
        'X-Worker-Request': 'true',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    const cartResponse = await env.cart_worker.fetch(cartRequest);
    if (cartResponse.ok) {
      const cart = await cartResponse.json();
      if (cart && cart.cartId) {
        const clearCartRequest = new Request('https://workers.dev/cart/' + cart.cartId, {
          method: 'DELETE',
          headers: {
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
        });
        
        const clearCartResponse = await env.cart_worker.fetch(clearCartRequest);
        if (clearCartResponse.ok) {
          sagaState.cartCleared = true;
          console.log('[payment-saga] Cart cleared successfully');
        }
      }
    }
  } catch (error) {
    console.warn('[payment-saga] Failed to clear cart (non-critical):', error);
  }
}
```

**Key Points:**
- Cart is cleared **after payment is captured** (not after order creation)
- The cart record is **NOT deleted** - only the items are cleared
- The `deleted_at` field is **NOT set** - cart remains active
- This is a **hard clear** (items set to empty array), not a soft delete
- If cart clearing fails, it's logged as a warning but doesn't fail the payment saga

---

## 2. Pagination Implementation

### How Pagination Works

Pagination uses **SQL `LIMIT` and `OFFSET`** - it does **NOT** fetch all records and split them in memory. This is efficient and database-optimized.

### Products Pagination

**Location:** `catalogworker/models/productModel.js` (lines 33-73)

```javascript
export async function getProducts(db, page = 1, limit = 20, category = null) {
  const offset = (page - 1) * limit;  // Calculate offset
  
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
  
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;  // SQL LIMIT/OFFSET
  params.push(limit, offset);
  
  // Execute both queries in parallel
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
```

### Orders Pagination

**Location:** `ordersworker/models/orderModel.js` (lines 94-175)

```javascript
export async function getOrdersByUserId(db, userId, page = 1, limit = 10, status = null, dateFrom = null, dateTo = null) {
  const offset = (page - 1) * limit;  // Calculate offset
  
  // Build WHERE clause with filters
  let whereClause = 'WHERE user_id = ?';
  const bindParams = [userId];
  
  if (status) {
    whereClause += ' AND status = ?';
    bindParams.push(status);
  }
  
  if (dateFrom) {
    whereClause += ' AND DATE(created_at) >= ?';
    bindParams.push(dateFrom);
  }
  
  if (dateTo) {
    whereClause += ' AND DATE(created_at) <= ?';
    bindParams.push(dateTo);
  }
  
  // Build query with LIMIT and OFFSET
  const query = `SELECT order_id, user_id, user_data, address_data, product_data, shipping_data, total_amount, status, created_at, updated_at
       FROM orders 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`;  // SQL LIMIT/OFFSET
  
  bindParams.push(limit, offset);
  
  const ordersResult = await db
    .prepare(query)
    .bind(...bindParams)
    .all();
  
  // Get total count with same filters
  const countQuery = `SELECT COUNT(*) as total
       FROM orders 
       ${whereClause}`;
  
  const countBindParams = bindParams.slice(0, -2); // Remove limit and offset
  
  const countResult = await db
    .prepare(countQuery)
    .bind(...countBindParams)
    .first();
  
  const total = countResult.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  return {
    orders: ordersResult.results || [],
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
```

**Key Points:**
- ✅ Uses **SQL `LIMIT` and `OFFSET`** - efficient database-level pagination
- ✅ Does **NOT** fetch all records and split in memory
- ✅ Executes **two queries in parallel**: one for data, one for total count
- ✅ Supports **filters** (category, status, date range) while maintaining pagination
- ✅ Default limits: Products = 20 per page, Orders = 10 per page

---

## 3. Express Shipping Availability Logic

### Two-Level Check for Express Shipping

Express shipping availability is determined by **TWO checks** that both must pass:

1. **Pincode Coverage Check** - Does the warehouse support express for this pincode?
2. **Shipping Rules Check** - Are express rules enabled in the shipping rules?

**Location:** `fulfillmentworker/models/shippingModel.js` (lines 351-595)

### Step-by-Step Logic

#### Step 1: Find Warehouse with Stock
```javascript
// Find closest warehouse with stock available
let warehouse = await getNearestWarehouseWithStock(
  db,
  address.pincode,
  address.state || '',
  address.city || '',
  productId,
  requiredQuantity
);
```

#### Step 2: Get Pincode Coverage
```javascript
// Get pincode coverage for this warehouse
const coverageResult = await db
  .prepare(
    `SELECT standard_available, express_available
     FROM pincode_coverage
     WHERE warehouse_id = ? AND pincode = ?`
  )
  .bind(warehouse.warehouse_id, address.pincode)
  .first();

// Check pincode coverage availability
const expressAvailable = coverageResult
  ? (coverageResult.express_available === 1 || 
     coverageResult.express_available === true || 
     coverageResult.express_available === '1' || 
     coverageResult.express_available === 'true')
  : true; // Default to available if no coverage record exists
```

#### Step 3: Get Shipping Rules
```javascript
// Get shipping rules for the selected warehouse and category
let rules = await getShippingRulesByWarehouseAndCategory(db, warehouse.warehouse_id, category);

// Fallback to category rules if no warehouse-specific rules
if (!rules) {
  rules = await getShippingRulesByCategory(db, category);
}

// Parse rules
const rulesData = typeof rules.rules === 'string' 
  ? JSON.parse(rules.rules) 
  : rules.rules;

const expressRules = rulesData.express || {};
```

#### Step 4: Final Availability Check (BOTH must be true)
```javascript
// Final availability check: must be available in both coverage AND rules
const finalExpressAvailable = expressAvailable && 
  (expressRules.available === undefined || 
   expressRules.available === true || 
   expressRules.available === 1);
```

### Summary of Express Availability Logic

Express shipping is available **ONLY IF**:

1. ✅ **Pincode Coverage Check:**
   - `pincode_coverage.express_available` = `1`, `true`, `'1'`, or `'true'`
   - OR no coverage record exists (defaults to `true`)

2. ✅ **Shipping Rules Check:**
   - `shipping_rules.rules.express.available` = `undefined`, `true`, or `1`
   - If `available` is `false` or `0`, express is **NOT available**

**Both conditions must be true** for express shipping to be available.

### Code Reference

**File:** `fulfillmentworker/models/shippingModel.js`
- Lines 427-444: Pincode coverage check
- Lines 418-424: Shipping rules lookup
- Lines 564-569: Final availability check

**Key Points:**
- Express availability requires **BOTH** pincode coverage AND shipping rules to allow it
- If either check fails, express is unavailable
- Default behavior: If no coverage record exists, it defaults to `true` (available)
- If shipping rules don't specify `available`, it defaults to `true` (available)

