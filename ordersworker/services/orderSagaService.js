/**
 * Order Saga Service
 * Implements Saga pattern for distributed transaction management
 * Coordinates multiple workers: cart, fulfillment, payment, rating
 */

import { callWorker, callWorkerBinding } from '../../shared/utils/interWorker.js';
import { executeTransaction } from '../../shared/utils/database.js';
import { createOrder, updateOrderStatus } from '../models/orderModel.js';
import { ConflictError } from '../../shared/utils/errors.js';
import { sendLog } from '../../shared/utils/logger.js';
import { 
  traceExternalCall, 
  getTracer, 
  getCfRayId, 
  addSpanAttributes,
  addSpanLog,
  injectTraceContext 
} from '../../shared/utils/otel.js';

/**
 * Saga step result
 */
class SagaStepResult {
  constructor(success, data = null, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
  }
}

/**
 * Create order using Saga pattern (returns PayPal approval URL)
 * Steps:
 * 1. Validate cart and get cart data
 * 2. Calculate shipping
 * 3. Create payment order (PayPal)
 * 4. Create order record (status: pending)
 * 
 * Returns: { orderId, paypalOrderId, approvalUrl }
 * 
 * Stock is NOT reduced here - only after payment capture
 * Cart is NOT cleared here - only after payment capture
 */
export async function createOrderSaga(
  userId,
  orderData,
  env,
  frontendOrigin = null,
  ctx = null,
  request = null // Add request parameter for CF Ray ID
) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  const tracer = getTracer('orders-worker');
  const cfRayId = request ? getCfRayId(request) : null;
  
  // Create main span for order creation saga
  const sagaSpan = tracer.startSpan('order.create_saga');
  if (cfRayId) {
    sagaSpan.setAttribute('cf.ray_id', cfRayId);
  }
  sagaSpan.setAttribute('user.id', userId);
  sagaSpan.setAttribute('cart.item_count', orderData?.cart?.items?.length || 0);
  addSpanLog(sagaSpan, 'Order creation saga started', { userId, cartItemCount: orderData?.cart?.items?.length || 0 }, request);
  
  const sagaState = {
    orderId: null,
    cartId: null,
    paypalOrderId: null,
    paymentId: null,
    stockReserved: [], // Track reserved stock for compensation
    stockReduced: [],
    cartCleared: false,
    orderCreated: false,
    paymentCreated: false,
  };
  
  const compensationSteps = [];
  
  try {
    // Log order creation start
    await sendLog(logWorkerBindingOrUrl, 'event', 'Order creation started', {
      userId,
      cartItemCount: orderData?.cart?.items?.length || 0,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    console.log('[order-saga] Starting order creation for user:', userId);
    
    // Step 1: Get and validate cart using service binding
    if (!env.cart_worker) {
      throw new Error('Cart worker service binding not available');
    }
    
    // Use service binding to call cart worker with authentication
    if (!orderData.accessToken) {
      console.error('[order-saga] No access token provided for cart worker call');
      throw new ConflictError('Access token required for cart operations');
    }
    
    // Get cart with tracing
    const cartResponse = await traceExternalCall(
      'cart.get_cart',
      async () => {
        console.log('[order-saga] Calling cart worker with token (length:', orderData.accessToken.length, ')');
        const cartRequest = new Request('https://workers.dev/cart', {
          method: 'GET',
          headers: {
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
            'Authorization': `Bearer ${orderData.accessToken}`,
            'Cookie': `accessToken=${orderData.accessToken}`,
          },
        });
        
        // Inject trace context
        injectTraceContext(cartRequest.headers);
        
        const response = await env.cart_worker.fetch(cartRequest);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[order-saga] Failed to get cart:', response.status, errorText);
          throw new ConflictError('Failed to get cart');
        }
        
        return response;
      },
      {
        url: 'https://workers.dev/cart',
        method: 'GET',
        system: 'cart-worker',
        operation: 'get_cart',
      },
      request
    );
    
    const cart = await cartResponse.json();
    sagaState.cartId = cart.cartId;
    
    if (!cart.items || cart.items.length === 0) {
      throw new ConflictError('Cart is empty');
    }
    
    // Validate cart (check price/stock changes) with tracing
    const validation = await traceExternalCall(
      'cart.validate_cart',
      async () => {
        const validateRequest = new Request('https://workers.dev/cart/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
            'Authorization': `Bearer ${orderData.accessToken}`,
          },
          body: JSON.stringify({ cart }),
        });
        
        // Inject trace context
        injectTraceContext(validateRequest.headers);
        
        const validateResponse = await env.cart_worker.fetch(validateRequest);
        
        if (!validateResponse.ok) {
          let errorText;
          try {
            const errorData = await validateResponse.json();
            errorText = errorData.error?.message || errorData.message || JSON.stringify(errorData);
          } catch (e) {
            errorText = await validateResponse.text();
          }
          console.error('[order-saga] Cart validation request failed:', validateResponse.status, errorText);
          throw new ConflictError(`Cart validation request failed: ${errorText}`);
        }
        
        return validateResponse;
      },
      {
        url: 'https://workers.dev/cart/validate',
        method: 'POST',
        system: 'cart-worker',
        operation: 'validate_cart',
      },
      request
    );
    
    const validationData = await validation.json();
    console.log('[order-saga] Cart validation result:', validationData);
    
    if (!validationData.valid) {
      const errorMessages = validationData.errors && validationData.errors.length > 0
        ? validationData.errors.map(e => e.message || e).join(', ')
        : (validationData.message || 'Unknown validation error');
      console.error('[order-saga] Cart validation failed:', errorMessages);
      throw new ConflictError(`Cart validation failed: ${errorMessages}`);
    }
    
    addSpanLog(sagaSpan, 'Cart validated successfully', { cartId: cart.cartId, itemCount: cart.items.length }, request);
    
    compensationSteps.push({
      name: 'validateCart',
      compensate: async () => {
        // No compensation needed for validation
      },
    });
    
    // Step 2: Calculate shipping using service binding
    if (!env.fulfillment_worker) {
      throw new Error('Fulfillment worker service binding not available');
    }
    if (!env.catalog_worker) {
      throw new Error('Catalog worker service binding not available');
    }
    
    // First, fetch product details to get categories with tracing
    const productDetailsPromises = cart.items.map(async (item) => {
      return await traceExternalCall(
        `catalog.get_product.${item.productId}`,
        async () => {
          const productRequest = new Request(`https://workers.dev/product/${item.productId}`, {
            method: 'GET',
            headers: {
              'X-API-Key': env.INTER_WORKER_API_KEY,
              'X-Worker-Request': 'true',
            },
          });
          
          // Inject trace context
          injectTraceContext(productRequest.headers);
          
          const productResponse = await env.catalog_worker.fetch(productRequest);
          if (productResponse.ok) {
            const product = await productResponse.json();
            return { ...item, category: product.category || 'accessories' };
          }
          // Fallback category if product fetch fails
          return { ...item, category: 'accessories' };
        },
        {
          url: `https://workers.dev/product/${item.productId}`,
          method: 'GET',
          system: 'catalog-worker',
          operation: 'get_product',
          productId: item.productId,
        },
        request
      );
    });
    
    const itemsWithCategories = await Promise.all(productDetailsPromises);
    
    // Now calculate shipping for each item using per-item shipping modes with tracing
    const shippingPromises = itemsWithCategories.map(item => {
      // Use per-item shipping mode if available, otherwise fall back to global shippingMode or 'standard'
      const itemShippingMode = orderData.itemShippingModes?.[item.productId] || 
                               orderData.shippingMode || 
                               'standard';
      
      return traceExternalCall(
        `fulfillment.calculate_shipping.${item.productId}`,
        async () => {
          const shippingRequest = new Request('https://workers.dev/shipping/calculate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': env.INTER_WORKER_API_KEY,
              'X-Worker-Request': 'true',
            },
            body: JSON.stringify({
              category: item.category,
              shippingMode: itemShippingMode,
              quantity: item.quantity,
              address: {
                // Map zipCode to pincode for shipping calculation
                pincode: orderData.address.zipCode || orderData.address.pincode,
                city: orderData.address.city || '',
                state: orderData.address.state,
              },
              productId: item.productId, // Pass productId for stock-aware warehouse selection
            }),
          });
          
          // Inject trace context
          injectTraceContext(shippingRequest.headers);
          
          return await env.fulfillment_worker.fetch(shippingRequest);
        },
        {
          url: 'https://workers.dev/shipping/calculate',
          method: 'POST',
          system: 'fulfillment-worker',
          operation: 'calculate_shipping',
          productId: item.productId,
          shippingMode: itemShippingMode,
        },
        request
      );
    });
    
    const shippingResults = await Promise.all(shippingPromises);
    const shippingCosts = await Promise.all(shippingResults.map(r => r.json()));
    
    // Ensure all shipping costs are numbers
    const totalShippingCost = shippingCosts.reduce((sum, s) => {
      const cost = typeof s.cost === 'number' ? s.cost : parseFloat(s.cost || 0);
      return sum + (isNaN(cost) ? 0 : cost);
    }, 0);
    
    // Ensure cart totalPrice is a number
    const cartTotal = typeof cart.totalPrice === 'number' 
      ? cart.totalPrice 
      : parseFloat(cart.totalPrice || 0);
    
    const totalAmount = cartTotal + totalShippingCost;
    
    // Ensure amount is a number (not string or undefined)
    const paymentAmount = typeof totalAmount === 'number' ? totalAmount : parseFloat(totalAmount || 0);
    
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      throw new Error(`Invalid payment amount: cartTotal=${cartTotal}, shipping=${totalShippingCost}, total=${totalAmount}`);
    }
    
    addSpanLog(sagaSpan, 'Shipping calculated', { 
      totalShippingCost, 
      cartTotal, 
      paymentAmount,
      itemCount: cart.items.length 
    }, request);
    
    compensationSteps.push({
      name: 'calculateShipping',
      compensate: async () => {
        // No compensation needed
      },
    });
    
    // Step 3: Create payment order using service binding with tracing
    if (!env.payment_worker) {
      throw new Error('Payment worker service binding not available');
    }
    
    console.log('[order-saga] Creating PayPal order for amount:', paymentAmount, 'INR');
    
    // Use provided frontend origin or fallback to default
    const baseUrl = frontendOrigin || 'https://week2ecom-frontend.pages.dev';
    const returnUrl = `${baseUrl}/paypal-return`;
    const cancelUrl = `${baseUrl}/checkout`;
    
    console.log('[order-saga] Using frontend origin:', baseUrl);
    console.log('[order-saga] PayPal return URL:', returnUrl);
    console.log('[order-saga] PayPal cancel URL:', cancelUrl);
    
    // Create PayPal order with tracing
    const paypalResponse = await traceExternalCall(
      'paypal.create_order',
      async () => {
        const paymentRequest = new Request('https://workers.dev/paypal/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
          body: JSON.stringify({
            amount: paymentAmount, // Ensure it's a number
            currency: 'INR', // Changed from USD to INR
            description: `Order for ${cart.items.length} items`,
            returnUrl: returnUrl, // PayPal return URL (dynamic based on request origin)
            cancelUrl: cancelUrl, // PayPal cancel URL (dynamic based on request origin)
          }),
        });
        
        // Inject trace context
        injectTraceContext(paymentRequest.headers);
        
        const paymentResponse = await env.payment_worker.fetch(paymentRequest);
        
        if (!paymentResponse.ok) {
          let errorText;
          try {
            const errorData = await paymentResponse.json();
            errorText = errorData.error?.message || errorData.message || JSON.stringify(errorData);
          } catch (e) {
            errorText = await paymentResponse.text();
          }
          console.error('[order-saga] Failed to create payment order:', paymentResponse.status, errorText);
          throw new ConflictError(`Failed to create payment order: ${errorText}`);
        }
        
        return paymentResponse;
      },
      {
        url: 'https://workers.dev/paypal/create',
        method: 'POST',
        system: 'paypal',
        operation: 'create_order',
        amount: paymentAmount,
        currency: 'INR',
      },
      request
    );
    
    let paymentData;
    try {
      paymentData = await paypalResponse.json();
      console.log('[order-saga] Payment order created:', paymentData.orderId);
    } catch (error) {
      console.error('[order-saga] Failed to parse payment response:', error);
      throw new Error(`Failed to parse payment response: ${error.message}`);
    }
    
    if (!paymentData || !paymentData.orderId) {
      console.error('[order-saga] Invalid payment response:', paymentData);
      throw new Error('Invalid payment response: missing orderId');
    }
    
    sagaState.paypalOrderId = paymentData.orderId;
    sagaState.paymentCreated = true;
    
    addSpanLog(sagaSpan, 'PayPal order created', { 
      paypalOrderId: paymentData.orderId,
      amount: paymentAmount 
    }, request);
    
    compensationSteps.push({
      name: 'createPayment',
      compensate: async () => {
        // PayPal orders can be cancelled, but we'll handle it in the capture step
      },
    });
    
    // Step 4: Create order record
    console.log('[order-saga] Creating order record in database...');
    console.log('[order-saga] Order data:', {
      userId,
      hasUserData: !!orderData.userData,
      hasAddress: !!orderData.address,
      itemsCount: cart.items?.length,
      shippingCostsCount: shippingCosts?.length,
      totalAmount,
    });
    
    let order;
    try {
      // Map items with their individual shipping information
      // Delivery date will be calculated when grouping orders (based on order.createdAt)
      const itemsWithShipping = cart.items.map((item, index) => {
        const shippingInfo = shippingCosts[index] || {};
        const estimatedDays = shippingInfo.estimatedDays || 5;
        
        return {
          ...item,
          shipping: {
            cost: shippingInfo.cost || 0,
            estimatedDays: estimatedDays,
            mode: orderData.itemShippingModes?.[item.productId] || orderData.shippingMode || 'standard',
          },
        };
      });
      
      // D1 doesn't support traditional transactions, so call createOrder directly
      order = await createOrder(env.orders_db, {
        userId,
        userData: orderData.userData || {},
        addressData: orderData.address,
        productData: {
          items: itemsWithShipping,
          shipping: shippingCosts, // Keep for backward compatibility
        },
        shippingData: {
          mode: orderData.shippingMode || (orderData.itemShippingModes ? 'mixed' : 'standard'),
          itemModes: orderData.itemShippingModes || {}, // Per-item shipping modes
          cost: totalShippingCost,
          estimatedDelivery: shippingCosts[0]?.estimatedDays || 5, // Keep for backward compatibility
        },
        totalAmount,
      });
      console.log('[order-saga] Order record created:', order.orderId);
    } catch (error) {
      console.error('[order-saga] Failed to create order record:', error);
      console.error('[order-saga] Error message:', error.message);
      console.error('[order-saga] Error stack:', error.stack);
      throw new Error(`Failed to create order record: ${error.message}`);
    }
    
    if (!order || !order.orderId) {
      console.error('[order-saga] Invalid order created:', order);
      throw new Error('Order creation returned invalid result');
    }
    
    sagaState.orderId = order.orderId;
    sagaState.orderCreated = true;
    
    addSpanLog(sagaSpan, 'Order record created', { 
      orderId: order.orderId,
      totalAmount 
    }, request);
    
    sagaSpan.setAttribute('order.id', order.orderId);
    sagaSpan.setAttribute('order.total_amount', totalAmount);
    
    compensationSteps.push({
      name: 'createOrder',
      compensate: async () => {
        await updateOrderStatus(env.orders_db, order.orderId, 'cancelled');
      },
    });
    
    // Step 5: Reserve stock for all items (with 15-minute TTL)
    if (!env.fulfillment_worker) {
      throw new Error('Fulfillment worker service binding not available');
    }
    
    console.log('[order-saga] Reserving stock for', cart.items.length, 'items...');
    const stockReservationPromises = cart.items.map(async (item) => {
      // Inject trace context for distributed tracing
      const stockHeaders = new Headers({
        'Content-Type': 'application/json',
        'X-API-Key': env.INTER_WORKER_API_KEY,
        'X-Worker-Request': 'true',
      });
      const { injectTraceContext } = await import('../../shared/utils/otel.js');
      injectTraceContext(stockHeaders);
      
      const reserveRequest = new Request('https://workers.dev/stock/' + item.productId + '/reserve', {
        method: 'POST',
        headers: stockHeaders,
        body: JSON.stringify({ 
          quantity: item.quantity,
          orderId: order.orderId,
          ttlMinutes: 15,
        }),
      });
      
      const response = await env.fulfillment_worker.fetch(reserveRequest);
      
      if (!response.ok) {
        let errorText;
        try {
          const errorData = await response.json();
          errorText = errorData.error?.message || errorData.message || JSON.stringify(errorData);
        } catch (e) {
          errorText = await response.text();
        }
        console.error(`[order-saga] Failed to reserve stock for product ${item.productId}:`, response.status, errorText);
        throw new ConflictError(`Failed to reserve stock for product ${item.productId}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`[order-saga] Stock reserved for product ${item.productId}:`, result);
      
      sagaState.stockReserved.push({
        productId: item.productId,
        quantity: item.quantity,
        orderId: order.orderId,
      });
    });
    
    await Promise.all(stockReservationPromises);
    console.log('[order-saga] Stock reservation completed for all items');
    
    compensationSteps.push({
      name: 'reserveStock',
      compensate: async () => {
        // Release reserved stock
        if (!env.fulfillment_worker) {
          console.error('[order-saga] Cannot release stock: fulfillment worker binding not available');
          return;
        }
        
        for (const reservation of sagaState.stockReserved) {
          try {
            const releaseHeaders = new Headers({
              'Content-Type': 'application/json',
              'X-API-Key': env.INTER_WORKER_API_KEY,
              'X-Worker-Request': 'true',
            });
            const { injectTraceContext: injectTraceContextRelease } = await import('../../shared/utils/otel.js');
            injectTraceContextRelease(releaseHeaders);
            
            const releaseRequest = new Request('https://workers.dev/stock/' + reservation.productId + '/release', {
              method: 'POST',
              headers: releaseHeaders,
              body: JSON.stringify({ orderId: reservation.orderId }),
            });
            
            await env.fulfillment_worker.fetch(releaseRequest);
            console.log(`[order-saga] Stock released for product ${reservation.productId}, order ${reservation.orderId}`);
          } catch (error) {
            console.error(`[order-saga] Failed to release stock for ${reservation.productId}:`, error);
          }
        }
      },
    });
    
    // Step 5: Store payment record now that we have orderId
    if (env.payment_worker && paymentData.orderId) {
      try {
        console.log('[order-saga] Storing payment record for order:', order.orderId);
        const storePaymentRequest = new Request('https://workers.dev/paypal/store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
          body: JSON.stringify({
            orderId: order.orderId,
            paypalOrderId: paymentData.orderId,
            paymentData: paymentData,
          }),
        });
        
        const storePaymentResponse = await env.payment_worker.fetch(storePaymentRequest);
        if (storePaymentResponse.ok) {
          console.log('[order-saga] Payment record stored successfully');
        } else {
          console.warn('[order-saga] Failed to store payment record, but continuing...');
        }
      } catch (error) {
        console.warn('[order-saga] Error storing payment record:', error.message);
        // Don't fail the entire saga if payment record storage fails
      }
    }
    
    // Find PayPal approval URL from payment links
    const approvalLink = paymentData.links?.find(link => link.rel === 'approve');
    if (!approvalLink) {
      throw new Error('PayPal approval URL not found in payment response');
    }
    
    // Log successful order creation
    await sendLog(logWorkerBindingOrUrl, 'event', 'Order created successfully', {
      userId,
      orderId: sagaState.orderId,
      paypalOrderId: sagaState.paypalOrderId,
      totalAmount: paymentAmount,
      itemCount: cart.items.length,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    addSpanLog(sagaSpan, 'Order creation saga completed successfully', {
      orderId: sagaState.orderId,
      paypalOrderId: sagaState.paypalOrderId,
      approvalUrl: approvalLink.href,
    }, request);
    
    sagaSpan.setStatus({ code: 1 }); // OK
    sagaSpan.end();
    
    // Return order details with PayPal approval URL
    // Stock and cart will be handled after payment capture
    return {
      success: true,
      orderId: sagaState.orderId,
      paypalOrderId: sagaState.paypalOrderId,
      approvalUrl: approvalLink.href,
      status: 'pending', // Order is pending until payment is captured
    };
    
  } catch (error) {
    // Log order creation failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'Order creation failed', {
      userId,
      error: error.message,
      orderId: sagaState.orderId || null,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    addSpanLog(sagaSpan, 'Order creation saga failed', {
      error: error.message,
      orderId: sagaState.orderId || null,
    }, request);
    
    sagaSpan.setStatus({ 
      code: 2, // ERROR
      message: error.message 
    });
    sagaSpan.recordException(error);
    sagaSpan.end();
    
    // Compensate: Execute compensation steps in reverse order
    console.error('Saga failed, compensating:', error);
    
    for (let i = compensationSteps.length - 1; i >= 0; i--) {
      try {
        await compensationSteps[i].compensate();
      } catch (compError) {
        console.error(`Compensation step ${compensationSteps[i].name} failed:`, compError);
      }
    }
    
    // Update order status if it was created
    if (sagaState.orderCreated) {
      try {
        await updateOrderStatus(env.orders_db, sagaState.orderId, 'failed');
      } catch (updateError) {
        console.error('Failed to update order status:', updateError);
      }
    }
    
    throw error;
  }
}

/**
 * Capture payment and complete order (called after user approves PayPal payment)
 * Steps:
 * 1. Capture PayPal payment
 * 2. Reduce stock
 * 3. Clear cart
 * 4. Update order status to completed
 * 
 * If any step fails, compensate previous steps
 */
export async function capturePaymentSaga(
  orderId,
  paypalOrderId,
  env,
  accessToken = null,
  ctx = null
) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  const sagaState = {
    stockReduced: [],
    cartCleared: false,
    paymentCaptured: false,
  };
  
  const compensationSteps = [];
  
  try {
    // Log payment capture start
    await sendLog(logWorkerBindingOrUrl, 'event', 'Payment capture started', {
      orderId,
      paypalOrderId,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    // Step 1: Capture PayPal payment
    console.log('[payment-saga] Capturing PayPal payment for order:', paypalOrderId);
    
    if (!env.payment_worker) {
      throw new Error('Payment worker service binding not available');
    }
    
    // Inject trace context into the request for distributed tracing
    const { injectTraceContext } = await import('../../shared/utils/otel.js');
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-API-Key': env.INTER_WORKER_API_KEY,
      'X-Worker-Request': 'true',
    });
    injectTraceContext(headers);
    
    const captureRequest = new Request('https://workers.dev/paypal/capture', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId: paypalOrderId,
        internalOrderId: orderId,
      }),
    });
    
    const captureResponse = await env.payment_worker.fetch(captureRequest);
    
    if (!captureResponse.ok) {
      let errorText;
      try {
        const errorData = await captureResponse.json();
        errorText = errorData.error?.message || errorData.message || JSON.stringify(errorData);
      } catch (e) {
        errorText = await captureResponse.text();
      }
      console.error('[payment-saga] Payment capture failed:', captureResponse.status, errorText);
      throw new ConflictError(`Payment capture failed: ${errorText}`);
    }
    
    let captureData;
    try {
      captureData = await captureResponse.json();
      console.log('[payment-saga] Payment captured successfully:', captureData.id || captureData.status);
    } catch (error) {
      console.error('[payment-saga] Failed to parse capture response:', error);
      throw new ConflictError(`Payment capture response invalid: ${error.message}`);
    }
    
    sagaState.paymentCaptured = true;
    
    compensationSteps.push({
      name: 'capturePayment',
      compensate: async () => {
        // Payment is already captured, can't easily reverse
        console.warn('[payment-saga] Payment was captured but order failed. Manual refund may be required.');
      },
    });
    
    // Step 2: Get order to get cart items for stock reduction
    const { getOrderById } = await import('../models/orderModel.js');
    const order = await getOrderById(env.orders_db, orderId);
    
    if (!order) {
      throw new ConflictError(`Order ${orderId} not found`);
    }
    
    const orderItems = typeof order.productData === 'string' 
      ? JSON.parse(order.productData).items 
      : order.productData?.items || [];
    
    if (!orderItems || orderItems.length === 0) {
      throw new ConflictError(`Order ${orderId} has no items`);
    }
    
    // Step 3: Reduce stock for each item
    console.log('[payment-saga] Reducing stock for', orderItems.length, 'items...');
    const stockReductionPromises = orderItems.map(async (item) => {
      if (!env.fulfillment_worker) {
        throw new Error('Fulfillment worker service binding not available');
      }
      
      // Inject trace context for distributed tracing
      const stockHeaders = new Headers({
        'Content-Type': 'application/json',
        'X-API-Key': env.INTER_WORKER_API_KEY,
        'X-Worker-Request': 'true',
      });
      const { injectTraceContext } = await import('../../shared/utils/otel.js');
      injectTraceContext(stockHeaders);
      
      // Use orderId to reduce reserved stock (more efficient and accurate)
      const stockRequest = new Request('https://workers.dev/stock/' + item.productId + '/reduce', {
        method: 'POST',
        headers: stockHeaders,
        body: JSON.stringify({ 
          quantity: item.quantity,
          orderId: orderId, // Pass orderId to reduce the specific reservation
        }),
      });
      
      const response = await env.fulfillment_worker.fetch(stockRequest);
      
      if (!response.ok) {
        let errorText;
        try {
          const errorData = await response.json();
          errorText = errorData.error?.message || errorData.message || JSON.stringify(errorData);
        } catch (e) {
          errorText = await response.text();
        }
        console.error(`[payment-saga] Failed to reduce stock for product ${item.productId}:`, response.status, errorText);
        throw new ConflictError(`Failed to reduce stock for product ${item.productId}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`[payment-saga] Stock reduced for product ${item.productId}:`, result);
      
      sagaState.stockReduced.push({
        productId: item.productId,
        quantity: item.quantity,
      });
    });
    
    await Promise.all(stockReductionPromises);
    console.log('[payment-saga] Stock reduction completed for all items');
    
    compensationSteps.push({
      name: 'reduceStock',
      compensate: async () => {
        // Restore stock
        if (!env.fulfillment_worker) {
          console.error('[payment-saga] Cannot restore stock: fulfillment worker binding not available');
          return;
        }
        
        for (const stock of sagaState.stockReduced) {
          try {
            // Note: This is a simple restore - in production, you might want a proper restore endpoint
            // Inject trace context for distributed tracing
            const restoreHeaders = new Headers({
              'Content-Type': 'application/json',
              'X-API-Key': env.INTER_WORKER_API_KEY,
              'X-Worker-Request': 'true',
            });
            const { injectTraceContext: injectTraceContextRestore } = await import('../../shared/utils/otel.js');
            injectTraceContextRestore(restoreHeaders);
            
            const restoreRequest = new Request('https://workers.dev/stock/' + stock.productId, {
              method: 'PUT',
              headers: restoreHeaders,
              body: JSON.stringify({ quantity: stock.quantity }),
            });
            
            await env.fulfillment_worker.fetch(restoreRequest);
            console.log(`[payment-saga] Stock restored for product ${stock.productId}`);
          } catch (error) {
            console.error(`[payment-saga] Failed to restore stock for ${stock.productId}:`, error);
          }
        }
      },
    });
    
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
        // Don't fail the entire saga if cart clearing fails
      }
    }
    
    compensationSteps.push({
      name: 'clearCart',
      compensate: async () => {
        // Cart is already cleared, can't easily restore
        console.warn('[payment-saga] Cart was cleared but order failed. Cart cannot be restored.');
      },
    });
    
    // Step 5: Update order status to completed
    await updateOrderStatus(env.orders_db, orderId, 'completed');
    console.log('[payment-saga] Order status updated to completed');
    
    // Log order completion
    await sendLog(logWorkerBindingOrUrl, 'event', 'Order completed', {
      orderId,
      paypalOrderId,
      stockReducedCount: sagaState.stockReduced.length,
      cartCleared: sagaState.cartCleared,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    // Notify realtime worker of order status change
    try {
      if (env.realtime_worker) {
        const realtimeRequest = new Request('https://workers.dev/order/' + orderId + '/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          },
          body: JSON.stringify({ status: 'completed' }),
        });
        await env.realtime_worker.fetch(realtimeRequest);
        console.log('[payment-saga] Notified realtime worker of order completion');
      }
    } catch (error) {
      // Log but don't fail - realtime updates are not critical
      console.error('[payment-saga] Failed to notify realtime worker:', error);
    }
    
    return {
      success: true,
      orderId: orderId,
      payment: captureData,
    };
    
  } catch (error) {
    // Log payment capture failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'Payment capture failed', {
      orderId,
      paypalOrderId,
      error: error.message,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    // Compensate: Execute compensation steps in reverse order
    console.error('[payment-saga] Payment capture saga failed, compensating:', error);
    
    for (let i = compensationSteps.length - 1; i >= 0; i--) {
      try {
        await compensationSteps[i].compensate();
      } catch (compError) {
        console.error(`[payment-saga] Compensation step ${compensationSteps[i].name} failed:`, compError);
      }
    }
    
    // Release reserved stock if payment capture failed (order was created but payment failed)
    if (env.fulfillment_worker) {
      try {
        console.log('[payment-saga] Releasing reserved stock for failed payment...');
        const orderItems = typeof order.productData === 'string' 
          ? JSON.parse(order.productData).items 
          : order.productData?.items || [];
        
        const releasePromises = orderItems.map(async (item) => {
          const releaseHeaders = new Headers({
            'Content-Type': 'application/json',
            'X-API-Key': env.INTER_WORKER_API_KEY,
            'X-Worker-Request': 'true',
          });
          const { injectTraceContext } = await import('../../shared/utils/otel.js');
          injectTraceContext(releaseHeaders);
          
          const releaseRequest = new Request('https://workers.dev/stock/' + item.productId + '/release', {
            method: 'POST',
            headers: releaseHeaders,
            body: JSON.stringify({ orderId }),
          });
          
          const response = await env.fulfillment_worker.fetch(releaseRequest);
          if (response.ok) {
            console.log(`[payment-saga] Released reserved stock for product ${item.productId}, order ${orderId}`);
          } else {
            console.warn(`[payment-saga] Failed to release stock for product ${item.productId}:`, response.status);
          }
        });
        
        await Promise.all(releasePromises);
        console.log('[payment-saga] Stock release completed for failed payment');
      } catch (releaseError) {
        console.error('[payment-saga] Error releasing stock after payment failure:', releaseError);
        // Don't fail the error handling if stock release fails
      }
    }
    
    // Update order status to failed
    try {
      await updateOrderStatus(env.orders_db, orderId, 'failed');
    } catch (updateError) {
      console.error('[payment-saga] Failed to update order status:', updateError);
    }
    
    throw error;
  }
}

/**
 * Cancel order and release reserved stock
 * Called when user cancels PayPal payment or order is manually cancelled
 * @param {string} orderId - Order ID
 * @param {Object} env - Environment bindings
 * @param {Object} ctx - Execution context
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function cancelOrderSaga(orderId, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    // Get order to get items
    const { getOrderById } = await import('../models/orderModel.js');
    const order = await getOrderById(env.orders_db, orderId);
    
    if (!order) {
      throw new ConflictError(`Order ${orderId} not found`);
    }
    
    // Only cancel if order is pending or processing (not already completed/failed/cancelled)
    // These statuses indicate the order hasn't been fulfilled yet and may have reserved stock
    const cancellableStatuses = ['pending', 'processing'];
    if (!cancellableStatuses.includes(order.status)) {
      console.log(`[cancel-order-saga] Order ${orderId} is already ${order.status}, cannot cancel`);
      return {
        success: false,
        message: `Order is already ${order.status}, cannot cancel`,
      };
    }
    
    // Release reserved stock for all items
    if (env.fulfillment_worker) {
      const orderItems = typeof order.productData === 'string' 
        ? JSON.parse(order.productData).items 
        : order.productData?.items || [];
      
      console.log(`[cancel-order-saga] Releasing reserved stock for ${orderItems.length} items...`);
      
      const releasePromises = orderItems.map(async (item) => {
        const releaseHeaders = new Headers({
          'Content-Type': 'application/json',
          'X-API-Key': env.INTER_WORKER_API_KEY,
          'X-Worker-Request': 'true',
        });
        
        const releaseBody = { orderId };
        console.log(`[cancel-order-saga] Releasing stock for product ${item.productId}, orderId: ${orderId}, body:`, JSON.stringify(releaseBody));
        
        const releaseRequest = new Request('https://workers.dev/stock/' + item.productId + '/release', {
          method: 'POST',
          headers: releaseHeaders,
          body: JSON.stringify(releaseBody),
        });
        
        const response = await env.fulfillment_worker.fetch(releaseRequest);
        if (response.ok) {
          const responseData = await response.json().catch(() => ({}));
          console.log(`[cancel-order-saga] Released reserved stock for product ${item.productId}, order ${orderId}. Response:`, JSON.stringify(responseData));
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`[cancel-order-saga] Failed to release stock for product ${item.productId}:`, response.status, errorText);
        }
      });
      
      await Promise.all(releasePromises);
      console.log('[cancel-order-saga] Stock release completed');
    }
    
    // Update order status to cancelled
    await updateOrderStatus(env.orders_db, orderId, 'cancelled');
    console.log(`[cancel-order-saga] Order ${orderId} cancelled successfully`);
    
    // Log order cancellation
    await sendLog(logWorkerBindingOrUrl, 'event', 'Order cancelled', {
      orderId,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    return {
      success: true,
      message: 'Order cancelled and stock released',
    };
    
  } catch (error) {
    console.error('[cancel-order-saga] Error cancelling order:', error);
    
    // Log cancellation failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'Order cancellation failed', {
      orderId,
      error: error.message,
      worker: 'orders-worker',
    }, apiKey, ctx);
    
    throw error;
  }
}

