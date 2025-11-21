# Payment Flow Explanation

## Overview
The payment system uses PayPal Sandbox integration with a Saga pattern for distributed transaction management. The flow involves multiple workers coordinating to create orders, process payments, and manage inventory.

---

## 1. Which Worker Calls the Payment Worker?

**Answer: The Orders Worker calls the Payment Worker**

### Flow:
1. **Frontend** → Calls `POST /orders/order` (Orders Worker)
2. **Orders Worker** → Calls Payment Worker via service binding to create PayPal order
3. **Orders Worker** → Calls Payment Worker via service binding to capture payment

### Code Location:
- **Order Creation**: `ordersworker/services/orderSagaService.js` → `createOrderSaga()` (line 243-384)
- **Payment Capture**: `ordersworker/services/orderSagaService.js` → `capturePaymentSaga()` (line 493-515)

```javascript
// In orderSagaService.js (line 259-275)
const paymentRequest = new Request('https://workers.dev/paypal/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': env.INTER_WORKER_API_KEY,
    'X-Worker-Request': 'true'
  },
  body: JSON.stringify({
    amount: paymentAmount,
    currency: 'INR',
    description: `Order ${sagaState.orderId}`,
    orderId: sagaState.orderId,
    returnUrl: returnUrl,  // Dynamic based on frontend origin
    cancelUrl: cancelUrl,  // Dynamic based on frontend origin
  }),
});

const paymentResponse = await env.payment_worker.fetch(paymentRequest);
```

---

## 2. How Does Payment Capture Work?

### Who Calls Payment Capture?

**Two possible callers:**

1. **Frontend** (Primary): After user approves payment on PayPal, PayPal redirects to `/paypal-return` page
   - Frontend page (`frontend/src/routes/paypal-return/+page.svelte`) extracts `token` from URL
   - Frontend calls `POST /orders/orders/capture` (Orders Worker)
   - Orders Worker then calls Payment Worker to capture

2. **Orders Worker** (Internal): The Orders Worker orchestrates the capture via Saga pattern

### Capture Flow:

```
Frontend (/paypal-return)
  ↓
POST /orders/orders/capture (Orders Worker)
  ↓
capturePaymentSaga() (Orders Worker)
  ↓
POST /paypal/capture (Payment Worker) ← Service Binding
  ↓
capturePayPalOrder() (Payment Service)
  ↓
PayPal API: POST /v2/checkout/orders/{id}/capture
```

### Code Flow:

**Step 1: Frontend calls Orders Worker**
```javascript
// frontend/src/routes/paypal-return/+page.svelte (line 37)
const result = await ordersApi.capturePayment(orderId, paypalOrderId);

// frontend/src/lib/api.js (line 415-423)
async capturePayment(orderId, paypalOrderId) {
  return apiRequest(`${WORKER_URLS.orders}/orders/capture`, {
    method: 'POST',
    body: JSON.stringify({ orderId, paypalOrderId })
  });
}
```

**Step 2: Orders Worker receives request**
```javascript
// ordersworker/controllers/ordersController.js (line 158-205)
export async function capturePayment(request, env, ctx = null) {
  const { orderId, paypalOrderId } = await request.json();
  
  // Extract access token for cart clearing
  const accessToken = /* from cookies or Authorization header */;
  
  // Call saga service
  const result = await orderService.capturePayment(
    orderId,
    paypalOrderId,
    env,
    accessToken,
    ctx
  );
  
  return new Response(JSON.stringify(result), { status: 200 });
}
```

**Step 3: Saga orchestrates capture**
```javascript
// ordersworker/services/orderSagaService.js (line 506-536)
const captureRequest = new Request('https://workers.dev/paypal/capture', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': env.INTER_WORKER_API_KEY,
  },
  body: JSON.stringify({
    orderId: paypalOrderId,        // PayPal order ID
    internalOrderId: orderId,      // Internal order ID
  }),
});

const captureResponse = await env.payment_worker.fetch(captureRequest);
const captureData = await captureResponse.json();
```

**Step 4: Payment Worker captures from PayPal**
```javascript
// paymentworker/services/paymentService.js (line 165-298)
export async function capturePayPalOrder(orderId, paypalClientId, paypalClientSecret, isSandbox = true) {
  // 1. Get PayPal access token
  const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, { ... });
  const accessToken = tokenData.access_token;
  
  // 2. Check order status (must be APPROVED)
  const orderCheckResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  // 3. Capture the payment
  const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  return captureData; // Contains payment details
}
```

### How is Response Returned?

**Response Chain:**
1. **Payment Worker** → Returns `{ status: 'COMPLETED', payment: {...} }` to Orders Worker
2. **Orders Worker** → Returns `{ success: true, orderId, payment }` to Frontend
3. **Frontend** → Displays success message and redirects to `/orders`

```javascript
// paymentworker/controllers/paymentController.js (line 234-243)
return new Response(
  JSON.stringify({
    status: captureResult.status,  // 'COMPLETED'
    payment: captureResult.purchase_units[0]?.payments?.captures[0],
  }),
  { status: 200, headers: { 'Content-Type': 'application/json' } }
);

// ordersworker/services/orderSagaService.js (line 729-733)
return {
  success: true,
  orderId: orderId,
  payment: captureData,
};
```

### What Happens if Capture Fails?

**Saga Compensation Pattern** - If any step fails, previous steps are compensated (rolled back):

```javascript
// ordersworker/services/orderSagaService.js (line 735-763)
catch (error) {
  // 1. Log failure
  await sendLog(..., 'Payment capture failed', { error: error.message });
  
  // 2. Compensate in reverse order:
  //    - Restore stock (if reduced)
  //    - Restore cart (if cleared) - Note: Cart restoration is limited
  //    - Payment already captured - Manual refund may be required
  
  for (let i = compensationSteps.length - 1; i >= 0; i--) {
    await compensationSteps[i].compensate();
  }
  
  // 3. Update order status to 'failed'
  await updateOrderStatus(env.orders_db, orderId, 'failed');
  
  // 4. Throw error (returns to frontend)
  throw error;
}
```

**Compensation Steps:**
1. **Stock Restoration**: If stock was reduced, it's restored via fulfillment worker
2. **Cart Restoration**: Limited - cart cannot be easily restored (logged as warning)
3. **Payment Refund**: Payment is already captured - requires manual refund via PayPal dashboard

**Error Response:**
- Frontend receives error response
- Order status set to `'failed'` in database
- User sees error message and is redirected to orders page

---

## 3. Return URL and Cancel URL - Local Development

### How It Works with Local Frontend

**The system dynamically detects the frontend origin from the request headers!**

### Code Flow:

**Step 1: Frontend makes request**
```javascript
// Frontend running on http://localhost:5173
fetch('https://orders-worker.you.workers.dev/order', {
  headers: {
    'Origin': 'http://localhost:5173',  // Browser automatically adds this
    // OR
    'Referer': 'http://localhost:5173/checkout'  // Fallback
  }
});
```

**Step 2: Orders Worker extracts origin**
```javascript
// ordersworker/controllers/ordersController.js (line 255-267)
const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
let frontendOrigin = 'https://week2ecom-frontend.pages.dev'; // Default fallback

if (origin) {
  try {
    const url = new URL(origin);
    frontendOrigin = `${url.protocol}//${url.host}`;  // http://localhost:5173
  } catch (e) {
    // Use default if parsing fails
  }
}
```

**Step 3: Dynamic URLs passed to PayPal**
```javascript
// ordersworker/services/orderSagaService.js (line 250-257)
const baseUrl = frontendOrigin || 'https://week2ecom-frontend.pages.dev';
const returnUrl = `${baseUrl}/paypal-return`;   // http://localhost:5173/paypal-return
const cancelUrl = `${baseUrl}/checkout`;         // http://localhost:5173/checkout

console.log('[order-saga] Using frontend origin:', baseUrl);
console.log('[order-saga] PayPal return URL:', returnUrl);
console.log('[order-saga] PayPal cancel URL:', cancelUrl);
```

**Step 4: PayPal redirects back to local frontend**
- After payment approval: PayPal redirects to `http://localhost:5173/paypal-return?token=...`
- After cancellation: PayPal redirects to `http://localhost:5173/checkout`

### Important Notes:

1. **Browser adds Origin header automatically** - No frontend code changes needed
2. **Fallback to production URL** - If origin cannot be detected, uses `https://week2ecom-frontend.pages.dev`
3. **PayPal Sandbox allows localhost** - PayPal Sandbox accepts `http://localhost` URLs for testing
4. **Production uses production URL** - When deployed, frontend origin will be the production domain

---

## 4. Complete Payment Flow with Edge Cases

### Happy Path Flow:

```
1. User clicks "Place Order" on frontend
   ↓
2. Frontend → POST /orders/order
   - Headers: Origin: http://localhost:5173
   - Body: { cart, address, itemShippingModes, ... }
   ↓
3. Orders Worker → createOrderSaga()
   ├─ Step 1: Get cart from Cart Worker
   ├─ Step 2: Calculate shipping from Fulfillment Worker
   ├─ Step 3: Create PayPal order via Payment Worker
   │   └─ PayPal returns: { id, status: 'CREATED', links: [{ rel: 'approve', href: '...' }] }
   └─ Step 4: Create order record (status: 'pending')
   ↓
4. Frontend receives: { orderId, paypalOrderId, approvalUrl }
   ↓
5. Frontend redirects user to PayPal approval URL
   ↓
6. User approves payment on PayPal
   ↓
7. PayPal redirects to: http://localhost:5173/paypal-return?token=PAYPAL_ORDER_ID
   ↓
8. Frontend /paypal-return page:
   - Extracts token from URL
   - Gets orderId from localStorage
   - Calls POST /orders/orders/capture
   ↓
9. Orders Worker → capturePaymentSaga()
   ├─ Step 1: Capture payment via Payment Worker
   │   └─ Payment Worker calls PayPal API
   │   └─ PayPal returns: { status: 'COMPLETED', ... }
   ├─ Step 2: Reduce stock via Fulfillment Worker (for each item)
   ├─ Step 3: Clear cart via Cart Worker
   ├─ Step 4: Update order status to 'completed'
   └─ Step 5: Notify Realtime Worker (optional)
   ↓
10. Frontend receives: { success: true, orderId, payment }
   ↓
11. Frontend redirects to /orders page
```

### Edge Cases and Error Handling:

#### Edge Case 1: PayPal Order Creation Fails

**Scenario**: Payment Worker cannot create PayPal order (invalid credentials, network error, etc.)

**Flow**:
```
createOrderSaga() → Step 3 fails
  ↓
Compensation:
  - Order record not created yet (no compensation needed)
  - Cart not modified (no compensation needed)
  - Shipping not calculated (no compensation needed)
  ↓
Error returned to frontend
Order status: Not created
```

**Code**:
```javascript
// orderSagaService.js (line 422-452)
catch (error) {
  // Compensate in reverse order
  for (let i = compensationSteps.length - 1; i >= 0; i--) {
    await compensationSteps[i].compensate();
  }
  
  // Update order status if created
  if (sagaState.orderCreated) {
    await updateOrderStatus(env.orders_db, sagaState.orderId, 'failed');
  }
  
  throw error; // Returns to frontend
}
```

#### Edge Case 2: User Cancels on PayPal

**Scenario**: User clicks "Cancel" on PayPal checkout page

**Flow**:
```
User cancels on PayPal
  ↓
PayPal redirects to: http://localhost:5173/checkout?token=...
  ↓
Frontend /checkout page handles cancellation
  ↓
Order remains in 'pending' status
  ↓
User can retry payment later
```

**Note**: Order is not deleted - it remains in `pending` status. User can retry payment.

#### Edge Case 3: Payment Capture Fails

**Scenario**: PayPal capture fails (order already captured, invalid order ID, etc.)

**Flow**:
```
capturePaymentSaga() → Step 1 fails
  ↓
Compensation:
  - No stock reduced yet (no compensation)
  - No cart cleared yet (no compensation)
  ↓
Order status set to 'failed'
Error returned to frontend
```

**Code**:
```javascript
// orderSagaService.js (line 517-527)
if (!captureResponse.ok) {
  const errorText = /* extract error */;
  throw new ConflictError(`Payment capture failed: ${errorText}`);
}
```

#### Edge Case 4: Stock Reduction Fails After Payment Capture

**Scenario**: Payment captured successfully, but stock reduction fails (insufficient stock, network error)

**Flow**:
```
capturePaymentSaga():
  ✅ Step 1: Payment captured
  ❌ Step 2: Stock reduction fails
  ↓
Compensation:
  - Stock: Not reduced (no compensation needed)
  - Payment: Already captured - CANNOT be automatically refunded
    → Requires manual refund via PayPal dashboard
  ↓
Order status set to 'failed'
Error logged for manual intervention
```

**Code**:
```javascript
// orderSagaService.js (line 540-546)
compensationSteps.push({
  name: 'capturePayment',
  compensate: async () => {
    // Payment is already captured, can't easily reverse
    console.warn('[payment-saga] Payment was captured but order failed. Manual refund may be required.');
  },
});

// orderSagaService.js (line 612-646)
compensationSteps.push({
  name: 'reduceStock',
  compensate: async () => {
    // Restore stock (if it was reduced)
    for (const stock of sagaState.stockReduced) {
      await env.fulfillment_worker.fetch(/* restore stock */);
    }
  },
});
```

**Critical Issue**: If payment is captured but stock reduction fails, the payment cannot be automatically refunded. This requires:
1. Manual refund via PayPal dashboard
2. Or implement a refund API endpoint
3. Or retry stock reduction later

#### Edge Case 5: Cart Clearing Fails After Payment Capture

**Scenario**: Payment captured, stock reduced, but cart clearing fails

**Flow**:
```
capturePaymentSaga():
  ✅ Step 1: Payment captured
  ✅ Step 2: Stock reduced
  ❌ Step 3: Cart clearing fails
  ↓
Compensation:
  - Cart: Cannot be easily restored (logged as warning)
  - Stock: Already reduced (not restored - order is completing)
  - Payment: Already captured (not refunded)
  ↓
Order status: Still set to 'completed' (cart clearing is non-critical)
```

**Code**:
```javascript
// orderSagaService.js (line 648-686)
try {
  // Clear cart
  const clearCartResponse = await env.cart_worker.fetch(clearCartRequest);
  if (clearCartResponse.ok) {
    sagaState.cartCleared = true;
  }
} catch (error) {
  console.warn('[payment-saga] Failed to clear cart (non-critical):', error);
  // Don't fail the entire saga if cart clearing fails
}

// orderSagaService.js (line 688-694)
compensationSteps.push({
  name: 'clearCart',
  compensate: async () => {
    // Cart is already cleared, can't easily restore
    console.warn('[payment-saga] Cart was cleared but order failed. Cart cannot be restored.');
  },
});
```

**Note**: Cart clearing failure is **non-critical** - order still completes successfully.

#### Edge Case 6: Network Timeout During Capture

**Scenario**: Network timeout while calling Payment Worker or PayPal API

**Flow**:
```
capturePaymentSaga() → Network timeout
  ↓
Error thrown
  ↓
Compensation executed
  ↓
Order status: 'failed'
  ↓
Frontend receives timeout error
  ↓
User can retry capture (if payment wasn't actually captured)
```

**Handling**: 
- Frontend should show retry option
- Backend should check if payment was already captured before retrying
- Consider idempotency keys for capture operations

#### Edge Case 7: Duplicate Capture Attempt

**Scenario**: User refreshes `/paypal-return` page, causing duplicate capture calls

**Current Behavior**:
- PayPal will reject duplicate captures (order already captured)
- Error returned to frontend
- Order status may already be 'completed' from first attempt

**Recommended Fix**:
- Check order status before attempting capture
- Return success if order is already completed
- Implement idempotency check

#### Edge Case 8: Frontend Origin Not Detected

**Scenario**: Request doesn't include `Origin` or `Referer` header

**Flow**:
```
Orders Worker receives request without Origin header
  ↓
frontendOrigin = 'https://week2ecom-frontend.pages.dev' (default)
  ↓
PayPal return URL: https://week2ecom-frontend.pages.dev/paypal-return
  ↓
User redirected to production URL (even if running locally)
```

**Solution**: 
- Ensure frontend sends requests with proper CORS headers
- Browser automatically adds `Origin` header for cross-origin requests
- For same-origin requests, `Referer` header is used as fallback

---

## 5. Key Design Decisions

### Why Saga Pattern?

1. **Distributed Transactions**: Multiple workers involved (Cart, Fulfillment, Payment, Orders)
2. **Compensation on Failure**: If any step fails, previous steps can be rolled back
3. **Eventual Consistency**: System can recover from partial failures

### Why Two-Phase Flow (Create → Capture)?

1. **User Approval Required**: PayPal requires user to approve payment
2. **Stock Not Reserved**: Stock is only reduced after payment is captured (prevents overselling)
3. **Cart Not Cleared**: Cart is only cleared after successful payment (user can retry)

### Why Dynamic Return URLs?

1. **Local Development**: Developers can test with `localhost`
2. **Multiple Environments**: Staging, production can use different URLs
3. **No Configuration Needed**: Automatically detects from request headers

---

## 6. Database State Transitions

### Order Status Flow:

```
pending → completed (on successful capture)
pending → failed (on capture failure)
pending → failed (on order creation failure)
```

### Payment Record:

- Created when PayPal order is created
- Updated with capture details when payment is captured
- Status: `pending` → `completed` or `failed`

---

## 7. Security Considerations

1. **Service Bindings**: Inter-worker communication uses service bindings (not public HTTP)
2. **API Keys**: `INTER_WORKER_API_KEY` required for inter-worker calls
3. **Token Validation**: Access tokens validated for cart operations
4. **Encryption**: Payment data encrypted in database
5. **CORS**: Frontend origin validated for return URLs

---

## 8. Monitoring and Logging

- All steps logged via Log Worker
- OpenTelemetry tracing for distributed tracing
- Error logs include order ID, PayPal order ID, and error details
- Compensation steps logged for audit trail

---

## Summary

1. **Orders Worker** orchestrates the entire payment flow
2. **Payment Worker** is called via service bindings for PayPal operations
3. **Frontend** triggers capture after PayPal redirect
4. **Return URLs** are dynamically generated from request `Origin` header
5. **Saga Pattern** ensures compensation on failures
6. **Edge Cases** handled with compensation, but payment refunds require manual intervention

