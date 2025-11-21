# PayPal Capture vs Store - Simple Explanation

## What is PayPal Capture?

**PayPal Capture** is the process of actually **collecting the money** from the customer's PayPal account after they've approved the payment.

### The Two-Step Process:

Think of it like a restaurant:
1. **Create Order** = Customer says "I'll pay" (approval)
2. **Capture Payment** = Restaurant actually charges the card (money transfer)

---

## Why Two Steps? (Create → Capture)

### Step 1: Create PayPal Order (Authorization)
```
User clicks "Pay with PayPal"
  ↓
PayPal shows payment page
  ↓
User approves payment
  ↓
PayPal says: "OK, customer approved $100"
  ↓
Status: APPROVED (but money NOT charged yet)
```

**What happens:**
- PayPal **reserves** the money (authorization)
- Money is **held** but not transferred
- Order status: `CREATED` or `APPROVED`

### Step 2: Capture Payment (Actual Charge)
```
User redirected back to your site
  ↓
Your backend calls PayPal: "Capture this order"
  ↓
PayPal transfers money to your account
  ↓
Status: COMPLETED (money actually charged)
```

**What happens:**
- PayPal **transfers** the money to your account
- Payment is **finalized**
- Order status: `COMPLETED`

---

## Why Use Capture Instead of Immediate Payment?

### 1. **User Approval Required**
- User must approve on PayPal's website
- You can't charge them until they come back to your site
- Capture happens **after** user returns from PayPal

### 2. **Stock Management**
- Don't reduce stock until payment is confirmed
- If user cancels, no stock is lost
- Prevents overselling

### 3. **Order Validation**
- Verify order details before charging
- Check if items are still available
- Validate shipping address

### 4. **Fraud Prevention**
- Time gap between approval and capture allows fraud detection
- Can cancel before capturing if suspicious

### 5. **User Experience**
- User can cancel before capture
- Better for abandoned carts
- More control over the transaction

---

## Difference: Capture vs Store

### **Capture** = PayPal Operation (Money Transfer)

**What it does:**
- Calls PayPal API to actually charge the customer
- Transfers money from customer to your account
- Changes PayPal order status from `APPROVED` → `COMPLETED`

**When it happens:**
- After user approves payment on PayPal
- When user returns to your site (`/paypal-return` page)

**Code:**
```javascript
// paymentworker/services/paymentService.js
export async function capturePayPalOrder(orderId, ...) {
  // Calls PayPal API
  const response = await fetch(
    `https://api.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`,
    { method: 'POST' }
  );
  // Returns: { status: 'COMPLETED', payment: {...} }
}
```

**Result:**
- Money is transferred
- PayPal order is finalized
- Cannot be undone (requires refund)

---

### **Store** = Database Operation (Record Keeping)

**What it does:**
- Saves payment information to your database
- Links your internal order ID with PayPal order ID
- Stores payment details for records/audit

**When it happens:**
- After creating PayPal order (before capture)
- After capturing payment (to update status)

**Code:**
```javascript
// paymentworker/services/paymentService.js
export async function storePayment(orderId, paypalOrderId, paymentData, db, encryptionKey) {
  // Encrypts PayPal order ID
  const encryptedPaymentId = encrypt(paypalOrderId, encryptionKey);
  
  // Saves to database
  return await createPayment(db, orderId, encryptedPaymentId, paymentData);
}
```

**Result:**
- Payment record in your database
- Can query payment history
- Links orders to PayPal transactions

---

## Visual Flow

```
┌─────────────────────────────────────────────────────────┐
│                    CREATE ORDER                          │
├─────────────────────────────────────────────────────────┤
│ 1. User clicks "Place Order"                             │
│ 2. Backend creates PayPal order                          │
│ 3. PayPal returns: { id: "PAYPAL-123", status: "CREATED" } │
│ 4. ✅ STORE: Save to database (orderId → paypalOrderId) │
│ 5. User redirected to PayPal                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  USER APPROVES                          │
├─────────────────────────────────────────────────────────┤
│ User approves payment on PayPal                          │
│ PayPal status: APPROVED (money reserved, not charged)   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    CAPTURE PAYMENT                       │
├─────────────────────────────────────────────────────────┤
│ 1. User redirected back to /paypal-return               │
│ 2. Backend calls PayPal: "Capture this order"            │
│ 3. ✅ CAPTURE: PayPal transfers money                   │
│ 4. PayPal returns: { status: "COMPLETED", ... }         │
│ 5. ✅ STORE: Update database with capture details       │
│ 6. Reduce stock, clear cart, complete order            │
└─────────────────────────────────────────────────────────┘
```

---

## Key Differences Summary

| Aspect | **Capture** | **Store** |
|--------|------------|-----------|
| **What** | PayPal API call | Database operation |
| **Purpose** | Transfer money | Save records |
| **When** | After user approval | After create & after capture |
| **Result** | Money in your account | Record in database |
| **Reversible** | No (requires refund) | Yes (can update/delete) |
| **External** | Calls PayPal API | Internal database |
| **Critical** | Yes (must succeed) | Yes (for records) |

---

## Real-World Analogy

**Capture** = Swiping a credit card at a store
- The actual transaction
- Money moves from customer to merchant
- Happens once, final

**Store** = Keeping a receipt
- Recording the transaction
- For your records
- Can be updated/corrected later

---

## In Your Code

### Creating Order (Store happens here):
```javascript
// ordersworker/services/orderSagaService.js (line 94-111)
const paypalOrder = await paymentService.createPayPalOrder(...);

// Store payment record
if (value.orderId) {
  await paymentService.storePayment(
    value.orderId,        // Your internal order ID
    paypalOrder.id,      // PayPal order ID
    paypalOrder,         // Full PayPal response
    env.payment_db,
    env.ENCRYPTION_KEY
  );
}
```

### Capturing Payment (Capture + Store update):
```javascript
// ordersworker/services/orderSagaService.js (line 515)
const captureResponse = await env.payment_worker.fetch(captureRequest);
const captureData = await captureResponse.json();
// ✅ CAPTURE: Money is now transferred

// paymentworker/controllers/paymentController.js (line 220-232)
// Update stored payment record with capture details
if (value.internalOrderId) {
  await paymentService.updatePaymentStatus(
    payment.payment_id,
    'completed',           // Update status
    captureResult,         // Store capture details
    env.payment_db
  );
}
// ✅ STORE: Database record updated
```

---

## Why Both Are Needed

1. **Capture** = Business transaction (money transfer)
   - Without it: No money received
   - Critical for revenue

2. **Store** = Record keeping (audit trail)
   - Without it: No payment history
   - Critical for accounting, refunds, disputes

**Both must succeed for a complete payment flow!**

