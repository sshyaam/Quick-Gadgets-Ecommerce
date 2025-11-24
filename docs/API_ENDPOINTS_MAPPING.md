# API Endpoints Mapping: Frontend vs Backend

## Overview

This document maps all API endpoints called from the frontend and their corresponding backend handlers.

---

## 🔐 Auth Worker

### Frontend Calls (`frontend/src/lib/api.js` - `authApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `signup()` | `/signup` | POST | `authworker/controllers/authController.js` → `signup()` |
| `login()` | `/login` | POST | `authworker/controllers/authController.js` → `login()` |
| `logout()` | `/logout` | POST | `authworker/controllers/authController.js` → `logout()` |
| `refresh()` | `/refresh` | POST | `authworker/controllers/authController.js` → `refreshToken()` |
| `getProfile()` | `/profile` | GET | `authworker/controllers/profileController.js` → `getProfile()` |
| `updateProfile()` | `/profile` | PUT | `authworker/controllers/profileController.js` → `updateProfile()` |
| `addSavedAddress()` | `/profile/addresses` | POST | `authworker/controllers/profileController.js` → `addSavedAddress()` |
| `updateSavedAddress()` | `/profile/addresses/:addressId` | PUT | `authworker/controllers/profileController.js` → `updateSavedAddress()` |
| `deleteSavedAddress()` | `/profile/addresses/:addressId` | DELETE | `authworker/controllers/profileController.js` → `deleteSavedAddress()` |

### Backend-Only Endpoints (Inter-Worker)

| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/session/:sessionId` | GET | `authController.getSession()` | Get session by ID (for other workers) |
| `/user/:userId` | GET | `profileController.getUserById()` | Get user by ID (for other workers) |
| `/users/batch` | GET | `profileController.getUsersBatch()` | Get multiple users (for other workers) |

---

## 📦 Catalog Worker

### Frontend Calls (`frontend/src/lib/api.js` - `catalogApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `getProducts()` | `/products?page=&limit=&category=&search=` | GET | `catalogworker/controllers/catalogController.js` → `getProducts()` |
| `getProduct()` | `/product/:productId` | GET | `catalogworker/controllers/catalogController.js` → `getProduct()` |

### Admin Frontend Calls (`frontend/src/lib/api.js` - `adminApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `getAllProducts()` | `/admin/products?page=&limit=&category=` | GET | `catalogworker/controllers/adminController.js` → `getAllProducts()` |
| `createProduct()` | `/admin/products` | POST | `catalogworker/controllers/adminController.js` → `createProduct()` |
| `updateProduct()` | `/admin/products/:productId` | PUT | `catalogworker/controllers/adminController.js` → `updateProduct()` |
| `deleteProduct()` | `/admin/products/:productId` | DELETE | `catalogworker/controllers/adminController.js` → `deleteProduct()` |
| `restoreProduct()` | `/admin/products/:productId/restore` | POST | `catalogworker/controllers/adminController.js` → `restoreProduct()` |
| `uploadImage()` | `/admin/images/upload` | POST | `catalogworker/controllers/imageController.js` → `uploadImage()` |
| `deleteImage()` | `/admin/images/*` | DELETE | `catalogworker/controllers/imageController.js` → `deleteImage()` |

### Public Endpoints

| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/images/*` | GET | `imageController.serveImage()` | Serve product images |

---

## 🛒 Cart Worker

### Frontend Calls (`frontend/src/lib/api.js` - `cartApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `getCart()` | `/cart` | GET | `cartworker/controllers/cartController.js` → `getCart()` |
| `addItem()` | `/cart/item` | POST | `cartworker/controllers/cartController.js` → `addItem()` |
| `updateItem()` | `/cart/item/:itemId` | PUT | `cartworker/controllers/cartController.js` → `updateItem()` |
| `removeItem()` | `/cart/item/:itemId` | DELETE | `cartworker/controllers/cartController.js` → `removeItem()` |
| `clearCart()` | `/cart` | DELETE | `cartworker/controllers/cartController.js` → `clearCart()` |
| `validateCart()` | `/cart/validate` | POST | `cartworker/controllers/cartController.js` → `validateCart()` |

### Backend-Only Endpoints (Inter-Worker)

| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/cart/validate` | POST | `cartController.validateCart()` | Validate cart prices/stock (called by orders worker) |
| `/cart/:cartId` | DELETE | `cartController.clearCartByCartId()` | Clear cart by ID (called by orders worker) |

---

## 📋 Orders Worker

### Frontend Calls (`frontend/src/lib/api.js` - `ordersApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `getOrders()` | `/orders?status=&dateFrom=&dateTo=&page=&limit=` | GET | `ordersworker/controllers/ordersController.js` → `getOrders()` |
| `getOrder()` | `/order/:orderId` | GET | `ordersworker/controllers/ordersController.js` → `getOrder()` |
| `createOrder()` | `/order` | POST | `ordersworker/controllers/ordersController.js` → `createOrder()` |
| `createCODOrder()` | `/order/cod` | POST | `ordersworker/controllers/ordersController.js` → `createCODOrder()` |
| `capturePayment()` | `/orders/capture` | POST | `ordersworker/controllers/ordersController.js` → `capturePayment()` |
| `cancelOrder()` | `/order/:orderId/cancel` | POST | `ordersworker/controllers/ordersController.js` → `cancelOrder()` |
| `rateProduct()` | `/order/:orderId/rate` | POST | `ordersworker/controllers/ordersController.js` → `rateProduct()` |

---

## 💳 Payment Worker

### Frontend Calls

**Note**: The frontend does NOT directly call payment worker endpoints. All PayPal operations go through the Orders Worker.

### Backend-Only Endpoints (Inter-Worker)

| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/paypal/create` | POST | `paymentworker/controllers/paymentController.js` → `createPayPalOrder()` | Create PayPal order (called by orders worker) |
| `/paypal/capture` | POST | `paymentworker/controllers/paymentController.js` → `capturePayPalOrder()` | Capture PayPal payment (called by orders worker) |
| `/paypal/store` | POST | `paymentworker/controllers/paymentController.js` → `storePayment()` | Store payment record (called by orders worker) |

---

## ⭐ Rating Worker

### Frontend Calls (`frontend/src/lib/api.js` - `ratingApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `getRatings()` | `/ratings/:productId` | GET | `ratingworker/controllers/ratingController.js` → `getRatings()` |
| `getOrderRatings()` | `/order/:orderId/ratings` | GET | `ratingworker/controllers/ratingController.js` → `getOrderRatings()` |
| `submitRating()` | `/order/:orderId/rate` | POST | `ratingworker/controllers/ratingController.js` → `submitRating()` |

---

## 📦 Fulfillment Worker

### Frontend Calls (`frontend/src/lib/api.js` - `fulfillmentApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `getShippingOptions()` | `/shipping/:productId?category=&pincode=&city=&state=` | GET | `fulfillmentworker/controllers/fulfillmentController.js` → `getShippingOptions()` |
| `calculateShipping()` | `/shipping/calculate` | POST | `fulfillmentworker/controllers/fulfillmentController.js` → `calculateShipping()` |
| `calculateBatchShipping()` | `/shipping/calculate-batch` | POST | `fulfillmentworker/controllers/fulfillmentController.js` → `calculateBatchShipping()` |

### Admin Frontend Calls (`frontend/src/lib/api.js` - `adminApi`)

| Frontend Method | Endpoint | Method | Backend Handler |
|----------------|----------|--------|----------------|
| `getAllStocks()` | `/admin/stocks?page=&limit=` | GET | `fulfillmentworker/controllers/adminController.js` → `getAllStocks()` |
| `updateStock()` | `/admin/stock/:productId` | PUT | `fulfillmentworker/controllers/adminController.js` → `updateStock()` |
| `getAllWarehouses()` | `/admin/warehouses` | GET | `fulfillmentworker/controllers/adminController.js` → `getAllWarehouses()` |
| `getAllShippingRules()` | `/admin/shipping-rules?warehouseId=&category=` | GET | `fulfillmentworker/controllers/adminController.js` → `getAllShippingRules()` |

### Backend-Only Endpoints (Inter-Worker)

| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/stock/:productId` | GET | `fulfillmentController.getStock()` | Get stock for product |
| `/stocks` | GET | `fulfillmentController.getStocks()` | Get stock for multiple products |
| `/stock/:productId/reduce` | POST | `fulfillmentController.reduceStock()` | Reduce stock (called by orders worker) |
| `/stock/:productId/reserve` | POST | `fulfillmentController.reserveStock()` | Reserve stock (called by orders worker) |
| `/stock/:productId/release` | POST | `fulfillmentController.releaseStock()` | Release reserved stock (called by orders worker) |

---

## 🔄 PayPal Flow: Frontend vs Backend

### What Frontend Calls

**Frontend does NOT directly call PayPal API or Payment Worker!**

The frontend only calls:
1. **Orders Worker** → `POST /order` (creates order + PayPal order)
2. **Orders Worker** → `POST /orders/capture` (captures payment)

### Complete PayPal Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1. POST /order
                              │    { address, itemShippingModes }
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ORDERS WORKER (Backend)                            │
│  - Creates order in database                                    │
│  - Calls Payment Worker to create PayPal order                 │
│  - Returns: { orderId, paypalOrderId, approvalUrl }            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 2. POST /paypal/create
                              │    (Service Binding)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PAYMENT WORKER (Backend)                           │
│  - Gets OAuth token from PayPal                                 │
│  - Creates PayPal order via PayPal API                          │
│  - Returns: { id, status, links: [{rel: "approve", href: ...}] }│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 3. POST /v2/checkout/orders
                              │    (PayPal API)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PAYPAL API                                   │
│  Returns: { id, status: "CREATED", links: [...] }             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 4. User redirected to PayPal
                              │    (Browser redirect)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                           │
│  - Opens PayPal approval URL in new window                      │
│  - User approves payment on PayPal                              │
│  - PayPal redirects to /paypal-return?token=...                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 5. POST /orders/capture
                              │    { orderId, paypalOrderId }
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ORDERS WORKER (Backend)                            │
│  - Calls Payment Worker to capture payment                      │
│  - Reduces stock                                                │
│  - Clears cart                                                  │
│  - Updates order status                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 6. POST /paypal/capture
                              │    (Service Binding)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PAYMENT WORKER (Backend)                           │
│  - Gets OAuth token from PayPal                                 │
│  - Captures payment via PayPal API                              │
│  - Returns: { status: "COMPLETED", ... }                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 7. POST /v2/checkout/orders/{id}/capture
                              │    (PayPal API)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PAYPAL API                                   │
│  Returns: { status: "COMPLETED", payment: {...} }               │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed PayPal Endpoint Calls

#### Step 1: Create Order (Frontend → Orders Worker)

**Frontend Call:**
```javascript
// frontend/src/routes/checkout/+page.svelte
const order = await ordersApi.createOrder({
  address: orderAddress,
  itemShippingModes: itemShippingModes
});
```

**Backend Handler:**
- `ordersworker/controllers/ordersController.js` → `createOrder()`
- Calls `ordersworker/services/orderSagaService.js` → `createOrderSaga()`
- Which calls `payment_worker.fetch('/paypal/create')` (Service Binding)

#### Step 2: Create PayPal Order (Orders Worker → Payment Worker)

**Backend Call:**
```javascript
// ordersworker/services/orderSagaService.js (line 397)
const paymentRequest = new Request('https://workers.dev/paypal/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': env.INTER_WORKER_API_KEY,
    'X-Worker-Request': 'true',
  },
  body: JSON.stringify({
    amount: paymentAmount,
    currency: 'INR',
    description: `Order for ${cart.items.length} items`,
    returnUrl: returnUrl,
    cancelUrl: cancelUrl,
  }),
});
const paymentResponse = await env.payment_worker.fetch(paymentRequest);
```

**Backend Handler:**
- `paymentworker/controllers/paymentController.js` → `createPayPalOrder()`
- Calls `paymentworker/services/paymentService.js` → `createPayPalOrder()`
- Which calls PayPal API: `POST /v1/oauth2/token` (get access token)
- Then calls PayPal API: `POST /v2/checkout/orders` (create order)

#### Step 3: User Approves on PayPal

**No API call** - Browser redirect to PayPal, user approves, PayPal redirects back

#### Step 4: Capture Payment (Frontend → Orders Worker)

**Frontend Call:**
```javascript
// frontend/src/routes/paypal-return/+page.svelte
const result = await ordersApi.capturePayment(orderId, paypalOrderId);
```

**Backend Handler:**
- `ordersworker/controllers/ordersController.js` → `capturePayment()`
- Calls `ordersworker/services/orderSagaService.js` → `capturePaymentSaga()`
- Which calls `payment_worker.fetch('/paypal/capture')` (Service Binding)

#### Step 5: Capture PayPal Payment (Orders Worker → Payment Worker)

**Backend Call:**
```javascript
// ordersworker/services/orderSagaService.js (line ~850)
const captureRequest = new Request('https://workers.dev/paypal/capture', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': env.INTER_WORKER_API_KEY,
    'X-Worker-Request': 'true',
  },
  body: JSON.stringify({
    orderId: paypalOrderId,
    internalOrderId: orderId,
  }),
});
const captureResponse = await env.payment_worker.fetch(captureRequest);
```

**Backend Handler:**
- `paymentworker/controllers/paymentController.js` → `capturePayPalOrder()`
- Calls `paymentworker/services/paymentService.js` → `capturePayPalOrder()`
- Which calls PayPal API: `POST /v1/oauth2/token` (get access token)
- Then calls PayPal API: `GET /v2/checkout/orders/{id}` (check order status)
- Then calls PayPal API: `POST /v2/checkout/orders/{id}/capture` (capture payment)

---

## Summary

### Frontend → Backend Direct Calls

- ✅ Auth Worker: Direct calls for auth, profile, addresses
- ✅ Catalog Worker: Direct calls for products, admin operations
- ✅ Cart Worker: Direct calls for cart operations
- ✅ Orders Worker: Direct calls for orders, order creation, payment capture
- ✅ Rating Worker: Direct calls for ratings
- ✅ Fulfillment Worker: Direct calls for shipping calculations, admin stock management

### Backend → Backend (Inter-Worker) Calls

- Orders Worker → Payment Worker: `/paypal/create`, `/paypal/capture`, `/paypal/store`
- Orders Worker → Cart Worker: `/cart/validate`, `/cart/:cartId` (DELETE)
- Orders Worker → Fulfillment Worker: `/stock/:productId/reduce`, `/stock/:productId/reserve`, `/stock/:productId/release`
- Orders Worker → Auth Worker: `/user/:userId`, `/users/batch`
- Catalog Worker → Pricing Worker: `/products` (batch price fetch)
- Catalog Worker → Fulfillment Worker: `/stocks` (batch stock fetch)

### PayPal-Specific

**Frontend NEVER calls:**
- ❌ Payment Worker directly
- ❌ PayPal API directly

**Frontend ONLY calls:**
- ✅ Orders Worker → `POST /order` (creates order + PayPal order)
- ✅ Orders Worker → `POST /orders/capture` (captures payment)

**Backend handles:**
- ✅ All PayPal API communication (OAuth, create order, capture)
- ✅ All payment worker calls (via service bindings)
- ✅ Payment record storage

---

## Key Takeaway

**The frontend is completely isolated from PayPal API and Payment Worker.** All PayPal operations are abstracted through the Orders Worker, which acts as the orchestrator for the entire payment flow.

