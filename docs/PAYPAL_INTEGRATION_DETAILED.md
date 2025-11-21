# PayPal Integration - Complete Technical Explanation

## Overview

This document explains how PayPal is integrated into the e-commerce platform, covering the complete flow from order creation to payment completion.

---

## Table of Contents

1. [Integration Architecture](#integration-architecture)
2. [The Three-Step Flow](#the-three-step-flow)
3. [Step 1: Authorization (Create PayPal Order)](#step-1-authorization-create-paypal-order)
4. [Step 2: Capture Payment](#step-2-capture-payment)
5. [Step 3: Store Payment Data](#step-3-store-payment-data)
6. [PayPal Token Management](#paypal-token-management)
7. [Data Flow: Amount and Currency](#data-flow-amount-and-currency)
8. [Response Flow: PayPal to Website](#response-flow-paypal-to-website)
9. [Complete Flow Diagram](#complete-flow-diagram)

---

## Integration Architecture

### Components Involved

1. **Frontend** (Svelte) - User interface
2. **Orders Worker** - Orchestrates the payment flow
3. **Payment Worker** - Handles PayPal API calls
4. **PayPal API** - External payment service

### Communication Flow

```
Frontend → Orders Worker → Payment Worker → PayPal API
                ↓                ↓
            Database         Database
```

---

## The Three-Step Flow

The PayPal integration follows a **three-step process**:

1. **Authorization** (Create PayPal Order)
2. **Capture** (Charge the Payment)
3. **Store** (Save Payment Records)

Each step serves a specific purpose and happens at different stages of the payment flow.

---

## Step 1: Authorization (Create PayPal Order)

### What Happens

This step **creates a PayPal order** and gets user approval. The money is **authorized but NOT charged yet**.

### When It Happens

- User clicks "Place Order" on checkout page
- Before redirecting to PayPal

### Detailed Flow

#### 1.1 Frontend Initiates Order Creation

**Location**: `frontend/src/routes/checkout/+page.svelte`

```javascript
// User clicks "Place Order"
const order = await ordersApi.createOrder(orderData);
// orderData contains: address, itemShippingModes
```

#### 1.2 Orders Worker Calculates Total

**Location**: `ordersworker/services/orderSagaService.js` (line 240-273)

```javascript
// Calculate total amount including:
// - Cart items subtotal
// - Shipping costs (from Fulfillment Worker)
// - Any taxes

const paymentAmount = cart.subtotal + shippingCost;
// Example: 5000 INR
```

#### 1.3 Orders Worker Calls Payment Worker

**Location**: `ordersworker/services/orderSagaService.js` (line 259-275)

```javascript
const paymentRequest = new Request('https://workers.dev/paypal/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': env.INTER_WORKER_API_KEY,
    'X-Worker-Request': 'true',
  },
  body: JSON.stringify({
    amount: paymentAmount,        // 5000 (number)
    currency: 'INR',              // Indian Rupees
    description: `Order for ${cart.items.length} items`,
    orderId: sagaState.orderId,   // Internal order ID
    returnUrl: returnUrl,         // Where PayPal redirects after approval
    cancelUrl: cancelUrl,         // Where PayPal redirects if cancelled
  }),
});

const paymentResponse = await env.payment_worker.fetch(paymentRequest);
```

**Key Data Passed**:
- `amount`: Total order amount (number)
- `currency`: 'INR' (converted to USD for PayPal Sandbox)
- `orderId`: Internal order ID (for linking)
- `returnUrl`: Frontend URL for PayPal redirect
- `cancelUrl`: Frontend URL if user cancels

#### 1.4 Payment Worker Gets PayPal Access Token

**Location**: `paymentworker/services/paymentService.js` (line 43-70)

```javascript
// Step 1: Get OAuth access token from PayPal
const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
  },
  body: 'grant_type=client_credentials',
});

const tokenData = await tokenResponse.json();
const accessToken = tokenData.access_token; // This is the PayPal token!
```

**Who Provides the Token?**
- **PayPal API** provides the access token
- Your backend requests it using `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
- Token is valid for a limited time (usually 1 hour)
- Token is used for all subsequent PayPal API calls

#### 1.5 Payment Worker Converts Currency (if needed)

**Location**: `paymentworker/services/paymentService.js` (line 34-41)

```javascript
// PayPal Sandbox doesn't support INR, so convert to USD
if (isSandbox && currency === 'INR') {
  const inrToUsdRate = 83; // From environment variable
  amount = amount / inrToUsdRate;  // 5000 INR → 60.24 USD
  currency = 'USD';
}
```

#### 1.6 Payment Worker Creates PayPal Order

**Location**: `paymentworker/services/paymentService.js` (line 81-154)

```javascript
const orderPayload = {
  intent: 'CAPTURE',  // We want to capture later
  purchase_units: [{
    amount: {
      currency_code: 'USD',  // Converted from INR
      value: '60.24',        // String with 2 decimals
    },
    description: 'Order payment',
  }],
  application_context: {
    return_url: 'https://week2ecom-frontend.pages.dev/paypal-return',
    cancel_url: 'https://week2ecom-frontend.pages.dev/checkout',
    brand_name: 'E-Commerce Store',
    landing_page: 'BILLING',
    user_action: 'PAY_NOW',
  },
};

// Create order with PayPal
const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,  // Use the token from step 1.4
  },
  body: JSON.stringify(orderPayload),
});

const orderResult = await orderResponse.json();
// Returns: { id: 'PAYPAL_ORDER_ID', status: 'CREATED', links: [...] }
```

**PayPal Response**:
```json
{
  "id": "5O190127TN364715T",
  "status": "CREATED",
  "links": [
    {
      "href": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
      "rel": "approve",
      "method": "GET"
    }
  ]
}
```

#### 1.7 Payment Worker Stores Initial Payment Record

**Location**: `paymentworker/controllers/paymentController.js` (line 102-111)

```javascript
// Store payment record in database
if (value.orderId) {
  await paymentService.storePayment(
    value.orderId,        // Internal order ID
    paypalOrder.id,       // PayPal order ID
    paypalOrder,         // Full PayPal response
    env.payment_db,
    env.ENCRYPTION_KEY
  );
}
```

**What Gets Stored**:
- Internal order ID → PayPal order ID mapping
- Payment status: `pending`
- Encrypted PayPal order ID (for security)

#### 1.8 Response Sent Back to Frontend

**Location**: `paymentworker/controllers/paymentController.js` (line 122-132)

```javascript
return new Response(
  JSON.stringify({
    orderId: paypalOrder.id,        // PayPal order ID
    status: paypalOrder.status,     // 'CREATED'
    links: paypalOrder.links,       // Contains approval URL
  }),
  { status: 200 }
);
```

**Frontend Receives**:
```json
{
  "orderId": "5O190127TN364715T",
  "status": "CREATED",
  "links": [
    {
      "href": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
      "rel": "approve"
    }
  ]
}
```

#### 1.9 Frontend Redirects User to PayPal

**Location**: `frontend/src/routes/checkout/+page.svelte`

```javascript
// Extract approval URL from response
const approvalUrl = order.approvalUrl || order.links.find(l => l.rel === 'approve').href;

// Store order IDs in localStorage (for later use)
localStorage.setItem('pendingOrderId', order.orderId);
localStorage.setItem('pendingPaypalOrderId', order.paypalOrderId);

// Redirect user to PayPal
window.location.href = approvalUrl;
```

### Summary of Step 1

✅ **What Happened**:
- PayPal order created
- Payment record stored in database (status: `pending`)
- User redirected to PayPal for approval

❌ **What Did NOT Happen**:
- Money NOT charged yet
- Stock NOT reduced
- Cart NOT cleared

---

## Step 2: Capture Payment

### What Happens

This step **actually charges the customer** and transfers money to your account.

### When It Happens

- After user approves payment on PayPal
- When PayPal redirects user back to your website

### Detailed Flow

#### 2.1 PayPal Redirects User Back

After user approves payment on PayPal, PayPal redirects to:

```
https://week2ecom-frontend.pages.dev/paypal-return?token=5O190127TN364715T&PayerID=ABC123
```

**URL Parameters**:
- `token`: PayPal order ID (same as the one created in Step 1)
- `PayerID`: PayPal user ID (optional, not used in this implementation)

#### 2.2 Frontend Extracts Token from URL

**Location**: `frontend/src/routes/paypal-return/+page.svelte` (line 11-20)

```javascript
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');  // '5O190127TN364715T'
const payerId = urlParams.get('PayerID');

// Get stored order IDs
const storedOrderId = localStorage.getItem('pendingOrderId');
const storedPaypalOrderId = localStorage.getItem('pendingPaypalOrderId');
```

#### 2.3 Frontend Calls Orders Worker to Capture

**Location**: `frontend/src/routes/paypal-return/+page.svelte` (line 37)

```javascript
const result = await ordersApi.capturePayment(storedOrderId, storedPaypalOrderId);
```

**API Call**:
```javascript
// frontend/src/lib/api.js
async capturePayment(orderId, paypalOrderId) {
  return apiRequest(`${WORKER_URLS.orders}/orders/capture`, {
    method: 'POST',
    body: JSON.stringify({ orderId, paypalOrderId })
  });
}
```

#### 2.4 Orders Worker Orchestrates Capture Saga

**Location**: `ordersworker/services/orderSagaService.js` (line 481-553)

```javascript
// Step 1: Capture PayPal payment
const captureRequest = new Request('https://workers.dev/paypal/capture', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': env.INTER_WORKER_API_KEY,
    'X-Worker-Request': 'true',
  },
  body: JSON.stringify({
    orderId: paypalOrderId,      // PayPal order ID from URL
    internalOrderId: orderId,    // Internal order ID
  }),
});

const captureResponse = await env.payment_worker.fetch(captureRequest);
```

#### 2.5 Payment Worker Gets New Access Token

**Location**: `paymentworker/services/paymentService.js` (line 172-211)

```javascript
// Get fresh access token (tokens expire)
const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
  },
  body: 'grant_type=client_credentials',
});

const accessToken = tokenData.access_token;
```

**Why New Token?**
- Tokens expire (usually after 1 hour)
- Always get a fresh token for each API call to ensure it's valid

#### 2.6 Payment Worker Checks Order Status

**Location**: `paymentworker/services/paymentService.js` (line 214-244)

```javascript
// Verify order is in APPROVED state before capturing
const orderCheckResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

const orderData = await orderCheckResponse.json();

if (orderData.status !== 'APPROVED' && orderData.status !== 'CREATED') {
  throw new Error(`Order must be APPROVED before capture. Current: ${orderData.status}`);
}
```

#### 2.7 Payment Worker Captures Payment

**Location**: `paymentworker/services/paymentService.js` (line 246-297)

```javascript
// Actually capture the payment
const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  },
});

const captureResult = await captureResponse.json();
```

**PayPal Response**:
```json
{
  "id": "5O190127TN364715T",
  "status": "COMPLETED",
  "purchase_units": [{
    "payments": {
      "captures": [{
        "id": "CAPTURE_ID_123",
        "status": "COMPLETED",
        "amount": {
          "currency_code": "USD",
          "value": "60.24"
        }
      }]
    }
  }]
}
```

**What Happens at PayPal**:
- Money is **transferred** from customer's PayPal account to your account
- Order status changes from `APPROVED` → `COMPLETED`
- Payment is **finalized** (cannot be undone without refund)

#### 2.8 Payment Worker Updates Payment Record

**Location**: `paymentworker/controllers/paymentController.js` (line 220-232)

```javascript
// Update payment record with capture details
if (value.internalOrderId) {
  const payment = await getPaymentByOrderId(env.payment_db, value.internalOrderId);
  if (payment) {
    await paymentService.updatePaymentStatus(
      payment.payment_id,
      'completed',           // Update status
      captureResult,         // Store full capture response
      env.payment_db
    );
  }
}
```

#### 2.9 Orders Worker Completes Order Saga

**Location**: `ordersworker/services/orderSagaService.js` (line 564-733)

After payment is captured, the Orders Worker:

1. **Reduces Stock** (via Fulfillment Worker)
2. **Clears Cart** (via Cart Worker)
3. **Updates Order Status** to `completed`
4. **Sends Notifications** (optional)

```javascript
// Step 2: Reduce stock for each item
for (const item of orderItems) {
  await env.fulfillment_worker.fetch(/* reduce stock */);
}

// Step 3: Clear cart
await env.cart_worker.fetch(/* clear cart */);

// Step 4: Update order status
await updateOrderStatus(env.orders_db, orderId, 'completed');
```

#### 2.10 Response Sent Back to Frontend

**Location**: `ordersworker/services/orderSagaService.js` (line 729-733)

```javascript
return {
  success: true,
  orderId: orderId,
  payment: captureData,
};
```

**Frontend Receives**:
```json
{
  "success": true,
  "orderId": "internal-order-123",
  "payment": {
    "status": "COMPLETED",
    "payment": { /* capture details */ }
  }
}
```

#### 2.11 Frontend Redirects to Orders Page

**Location**: `frontend/src/routes/paypal-return/+page.svelte` (line 39-47)

```javascript
if (result && result.success) {
  // Clear stored data
  localStorage.removeItem('pendingOrderId');
  localStorage.removeItem('pendingPaypalOrderId');
  
  // Redirect to orders page
  goto('/orders');
}
```

### Summary of Step 2

✅ **What Happened**:
- Payment **captured** (money transferred)
- Payment record **updated** in database (status: `completed`)
- Stock **reduced**
- Cart **cleared**
- Order status **updated** to `completed`

❌ **What Did NOT Happen**:
- Nothing - payment is complete!

---

## Step 3: Store Payment Data

### What Happens

This step **saves payment information** to the database for records and audit trail.

### When It Happens

**Actually happens in TWO places**:

1. **After Step 1** (Authorization) - Store initial payment record
2. **After Step 2** (Capture) - Update payment record with capture details

### Detailed Flow

#### 3.1 Store After Authorization (Step 1)

**Location**: `paymentworker/controllers/paymentController.js` (line 102-111)

```javascript
// After creating PayPal order
await paymentService.storePayment(
  value.orderId,        // Internal order ID: 'order-123'
  paypalOrder.id,      // PayPal order ID: '5O190127TN364715T'
  paypalOrder,         // Full PayPal response
  env.payment_db,
  env.ENCRYPTION_KEY
);
```

**What Gets Stored**:
```sql
INSERT INTO payments (
  order_id,              -- 'order-123'
  payment_id,            -- Encrypted PayPal order ID
  status,                -- 'pending'
  payment_data,          -- Full PayPal order JSON
  created_at
) VALUES (...);
```

#### 3.2 Update After Capture (Step 2)

**Location**: `paymentworker/controllers/paymentController.js` (line 220-232)

```javascript
// After capturing payment
await paymentService.updatePaymentStatus(
  payment.payment_id,
  'completed',           // Update status
  captureResult,         // Store capture response
  env.payment_db
);
```

**What Gets Updated**:
```sql
UPDATE payments
SET 
  status = 'completed',
  payment_data = '{ ... captureResult ... }',
  updated_at = NOW()
WHERE payment_id = ?;
```

### Why Store Payment Data?

1. **Audit Trail**: Track all payments for accounting
2. **Refunds**: Need PayPal order ID to process refunds
3. **Disputes**: Evidence for payment disputes
4. **Reporting**: Generate payment reports
5. **Linking**: Connect internal orders to PayPal transactions

### Summary of Step 3

✅ **What Happened**:
- Payment record **created** after authorization
- Payment record **updated** after capture
- All payment data **stored** in database (encrypted)

---

## PayPal Token Management

### Who Provides the Token?

**PayPal API** provides the access token. Your backend requests it.

### How Token is Obtained

**Location**: `paymentworker/services/paymentService.js` (line 43-70)

```javascript
// Request token using Client Credentials (OAuth 2.0)
const tokenResponse = await fetch('https://api.sandbox.paypal.com/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
  },
  body: 'grant_type=client_credentials',
});

const tokenData = await tokenResponse.json();
// {
//   "access_token": "A21AA...",
//   "token_type": "Bearer",
//   "expires_in": 32400
// }
```

### Token Details

- **Type**: OAuth 2.0 Bearer Token
- **Expiration**: Usually 1 hour (32400 seconds)
- **Scope**: Full access to PayPal API (for your account)
- **Storage**: Not stored - requested fresh for each operation

### When Token is Used

1. **Creating PayPal Order** (Step 1)
2. **Checking Order Status** (Step 2)
3. **Capturing Payment** (Step 2)

**Each operation gets a fresh token** to ensure it's valid.

### Security

- **Client ID & Secret**: Stored as environment variables (secrets)
- **Token**: Never exposed to frontend
- **HTTPS Only**: All API calls use HTTPS
- **Token in Headers**: `Authorization: Bearer {token}`

---

## Data Flow: Amount and Currency

### How Amount is Calculated

#### Step 1: Frontend → Orders Worker

**Location**: `frontend/src/routes/checkout/+page.svelte`

```javascript
// User clicks "Place Order"
const order = await ordersApi.createOrder({
  address: orderAddress,
  itemShippingModes: itemShippingModes
});
// Amount is NOT sent - calculated on backend
```

#### Step 2: Orders Worker Calculates Total

**Location**: `ordersworker/services/orderSagaService.js`

```javascript
// Get cart from Cart Worker
const cart = await getCartFromCartWorker();

// Calculate shipping from Fulfillment Worker
const shipping = await calculateShippingFromFulfillmentWorker();

// Calculate total
const paymentAmount = cart.subtotal + shipping.totalCost;
// Example: 5000 INR
```

#### Step 3: Orders Worker → Payment Worker

**Location**: `ordersworker/services/orderSagaService.js` (line 266-272)

```javascript
body: JSON.stringify({
  amount: paymentAmount,    // 5000 (number)
  currency: 'INR',          // 'INR' (string)
  description: '...',
  orderId: '...',
  returnUrl: '...',
  cancelUrl: '...',
}),
```

#### Step 4: Payment Worker Converts Currency

**Location**: `paymentworker/services/paymentService.js` (line 34-41)

```javascript
let currency = orderData.currency || 'USD';  // 'INR'
let amount = orderData.amount;                // 5000

// Convert INR to USD for PayPal Sandbox
if (isSandbox && currency === 'INR') {
  const inrToUsdRate = 83;  // From env.INR_TO_USD_RATE
  amount = amount / inrToUsdRate;  // 5000 / 83 = 60.24
  currency = 'USD';
}
```

#### Step 5: Payment Worker → PayPal API

**Location**: `paymentworker/services/paymentService.js` (line 81-97)

```javascript
const orderPayload = {
  intent: 'CAPTURE',
  purchase_units: [{
    amount: {
      currency_code: 'USD',     // Converted from INR
      value: '60.24',           // String with 2 decimals
    },
    description: 'Order payment',
  }],
  // ...
};
```

### Data Format Requirements

1. **Amount**: 
   - Sent as **number** from Orders Worker
   - Converted to **string with 2 decimals** for PayPal
   - Example: `5000` → `"60.24"`

2. **Currency**:
   - Sent as **string** ('INR' or 'USD')
   - PayPal Sandbox only supports: USD, EUR, GBP, CAD, AUD, JPY
   - INR is converted to USD automatically

### Currency Conversion

**Why Convert?**
- PayPal Sandbox doesn't support INR
- Production PayPal supports INR, but conversion still happens in sandbox

**Conversion Rate**:
- Stored in environment variable: `INR_TO_USD_RATE`
- Default: `83` (1 USD = 83 INR)
- Can be updated via environment variables

---

## Response Flow: PayPal to Website

### How PayPal Sends Response

PayPal doesn't send HTTP responses directly to your backend. Instead, it **redirects the user's browser** back to your website.

### Flow Diagram

```
User on PayPal → Approves Payment
        ↓
PayPal Redirects Browser
        ↓
https://week2ecom-frontend.pages.dev/paypal-return?token=5O190127TN364715T&PayerID=ABC123
        ↓
Frontend Page Loads
        ↓
Frontend Extracts Token from URL
        ↓
Frontend Calls Backend API
        ↓
Backend Calls PayPal API to Capture
        ↓
PayPal API Returns JSON Response
        ↓
Backend Processes Response
        ↓
Backend Returns to Frontend
        ↓
Frontend Displays Result
```

### Detailed Response Flow

#### 1. PayPal Redirects User

After user approves payment, PayPal redirects the browser to:

```
https://week2ecom-frontend.pages.dev/paypal-return?token=5O190127TN364715T&PayerID=ABC123
```

**URL Parameters**:
- `token`: PayPal order ID (the one created in Step 1)
- `PayerID`: PayPal user ID (optional)

**Important**: This is a **browser redirect**, not an API call. PayPal doesn't call your backend directly.

#### 2. Frontend Extracts Token

**Location**: `frontend/src/routes/paypal-return/+page.svelte` (line 11-20)

```javascript
// Browser loads the page
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');  // '5O190127TN364715T'
```

#### 3. Frontend Calls Backend

**Location**: `frontend/src/routes/paypal-return/+page.svelte` (line 37)

```javascript
// Frontend makes API call to backend
const result = await ordersApi.capturePayment(orderId, paypalOrderId);
```

#### 4. Backend Calls PayPal API

**Location**: `paymentworker/services/paymentService.js` (line 246-297)

```javascript
// Backend calls PayPal API to capture payment
const captureResponse = await fetch(
  'https://api.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/capture',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  }
);

const captureResult = await captureResponse.json();
```

#### 5. PayPal API Returns JSON

**PayPal Response** (HTTP 200):
```json
{
  "id": "5O190127TN364715T",
  "status": "COMPLETED",
  "purchase_units": [{
    "payments": {
      "captures": [{
        "id": "CAPTURE_ID_123",
        "status": "COMPLETED",
        "amount": {
          "currency_code": "USD",
          "value": "60.24"
        },
        "create_time": "2024-01-15T10:30:00Z"
      }]
    }
  }]
}
```

#### 6. Backend Processes Response

**Location**: `paymentworker/controllers/paymentController.js` (line 234-243)

```javascript
// Backend returns response to frontend
return new Response(
  JSON.stringify({
    status: captureResult.status,  // 'COMPLETED'
    payment: captureResult.purchase_units[0]?.payments?.captures[0],
  }),
  { status: 200 }
);
```

#### 7. Frontend Receives Response

**Location**: `frontend/src/routes/paypal-return/+page.svelte` (line 39-47)

```javascript
if (result && result.success) {
  // Display success message
  message = 'Payment successful!';
  
  // Redirect to orders page
  goto('/orders');
}
```

### Key Points

1. **No Direct PayPal → Backend Call**: PayPal redirects the browser, not your backend
2. **Token in URL**: PayPal order ID is passed via URL query parameter
3. **Frontend Initiates Capture**: Frontend must call backend to capture payment
4. **Backend Calls PayPal**: Backend makes the actual API call to PayPal
5. **JSON Response**: PayPal returns JSON via HTTP response (not redirect)

### Error Handling

If PayPal capture fails, PayPal returns an error response:

```json
{
  "name": "UNPROCESSABLE_ENTITY",
  "details": [{
    "field": "/purchase_units/0/payments/captures/0",
    "issue": "ORDER_ALREADY_CAPTURED"
  }]
}
```

Backend catches this and returns error to frontend:

```javascript
// paymentworker/services/paymentService.js (line 267-292)
if (!captureResponse.ok) {
  const errorData = await captureResponse.json();
  throw new Error(`Failed to capture: ${errorData.details[0].issue}`);
}
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 1: AUTHORIZATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User clicks "Place Order"                                   │
│     ↓                                                           │
│  2. Frontend → Orders Worker: POST /orders/order                │
│     Body: { address, itemShippingModes }                        │
│     ↓                                                           │
│  3. Orders Worker calculates total:                             │
│     - Gets cart from Cart Worker                                │
│     - Calculates shipping from Fulfillment Worker               │
│     - Total = cart.subtotal + shipping                          │
│     ↓                                                           │
│  4. Orders Worker → Payment Worker: POST /paypal/create          │
│     Body: { amount: 5000, currency: 'INR', ... }                 │
│     ↓                                                           │
│  5. Payment Worker gets PayPal access token:                    │
│     POST https://api.sandbox.paypal.com/v1/oauth2/token         │
│     Headers: Basic Auth (Client ID + Secret)                    │
│     Response: { access_token: "A21AA...", expires_in: 32400 }   │
│     ↓                                                           │
│  6. Payment Worker converts INR → USD:                          │
│     5000 INR / 83 = 60.24 USD                                   │
│     ↓                                                           │
│  7. Payment Worker creates PayPal order:                        │
│     POST https://api.sandbox.paypal.com/v2/checkout/orders      │
│     Headers: Authorization: Bearer {access_token}                 │
│     Body: { intent: 'CAPTURE', purchase_units: [{ amount: ... }] } │
│     Response: { id: "5O190127TN364715T", status: "CREATED", links: [...] } │
│     ↓                                                           │
│  8. Payment Worker stores payment record:                       │
│     INSERT INTO payments (order_id, payment_id, status: 'pending') │
│     ↓                                                           │
│  9. Payment Worker → Orders Worker:                             │
│     Response: { orderId: "5O190127TN364715T", links: [...] }   │
│     ↓                                                           │
│  10. Orders Worker → Frontend:                                  │
│      Response: { orderId: "...", approvalUrl: "https://..." }  │
│      ↓                                                          │
│  11. Frontend redirects user to PayPal:                         │
│      window.location.href = approvalUrl                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    USER ON PAYPAL                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User approves payment on PayPal website                        │
│  PayPal status: APPROVED (money reserved, not charged)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 2: CAPTURE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PayPal redirects browser to:                                │
│     https://week2ecom-frontend.pages.dev/paypal-return?token=5O190127TN364715T │
│     ↓                                                           │
│  2. Frontend extracts token from URL:                           │
│     const token = urlParams.get('token')                        │
│     ↓                                                           │
│  3. Frontend → Orders Worker: POST /orders/orders/capture       │
│     Body: { orderId: "internal-123", paypalOrderId: "5O190127TN364715T" } │
│     ↓                                                           │
│  4. Orders Worker → Payment Worker: POST /paypal/capture         │
│     Body: { orderId: "5O190127TN364715T", internalOrderId: "..." } │
│     ↓                                                           │
│  5. Payment Worker gets fresh access token:                     │
│     POST https://api.sandbox.paypal.com/v1/oauth2/token         │
│     Response: { access_token: "NEW_TOKEN..." }                  │
│     ↓                                                           │
│  6. Payment Worker checks order status:                         │
│     GET https://api.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T │
│     Response: { status: "APPROVED" }                            │
│     ↓                                                           │
│  7. Payment Worker captures payment:                            │
│     POST https://api.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/capture │
│     Headers: Authorization: Bearer {access_token}               │
│     Response: { status: "COMPLETED", purchase_units: [...] }    │
│     ↓                                                           │
│  8. Payment Worker updates payment record:                     │
│     UPDATE payments SET status = 'completed', payment_data = {...} │
│     ↓                                                           │
│  9. Orders Worker completes order saga:                       │
│     - Reduces stock (Fulfillment Worker)                        │
│     - Clears cart (Cart Worker)                                 │
│     - Updates order status to 'completed'                       │
│     ↓                                                           │
│  10. Orders Worker → Frontend:                                  │
│      Response: { success: true, orderId: "...", payment: {...} } │
│      ↓                                                          │
│  11. Frontend redirects to /orders page                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 3: STORE (Already Done)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Payment record already stored in Step 1                        │
│  Payment record updated in Step 2                              │
│                                                                 │
│  Database contains:                                             │
│  - order_id → paypal_order_id mapping                          │
│  - payment status: 'completed'                                  │
│  - full payment data (encrypted)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary

### The Three Steps

1. **Authorization (Create Order)**:
   - Creates PayPal order
   - Gets user approval
   - Money authorized but NOT charged
   - Payment record stored (status: `pending`)

2. **Capture**:
   - Actually charges the customer
   - Money transferred to your account
   - Payment record updated (status: `completed`)
   - Order completed (stock reduced, cart cleared)

3. **Store**:
   - Payment data saved to database
   - Happens in both Step 1 and Step 2
   - Used for audit trail and refunds

### Key Answers

**Who provides the PayPal token?**
- PayPal API provides the access token
- Your backend requests it using Client ID and Secret
- Token is requested fresh for each operation

**How does response come from PayPal?**
- PayPal redirects user's browser (not direct API call)
- Token passed via URL query parameter
- Frontend extracts token and calls backend
- Backend calls PayPal API to get full response

**How is amount and currency passed?**
- Amount calculated on backend (cart + shipping)
- Sent as number from Orders Worker to Payment Worker
- Currency converted (INR → USD for Sandbox)
- Sent to PayPal as string with 2 decimals

---

## Additional Resources

- [PayPal API Documentation](https://developer.paypal.com/docs/api/orders/v2/)
- [PayPal Sandbox Testing](https://developer.paypal.com/docs/api-basics/sandbox/)
- [OAuth 2.0 Client Credentials](https://developer.paypal.com/docs/api/get-an-access-token-curl/)

