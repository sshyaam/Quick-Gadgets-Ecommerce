/**
 * Payment service
 * Handles PayPal Sandbox integration
 * Enhanced with OpenTelemetry tracing
 */

import { createPayment, updatePayment, getPaymentByOrderId as getPaymentByOrderIdModel } from '../models/paymentModel.js';
import { encrypt } from '../../shared/utils/encryption.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { tracePaymentOperation, traceExternalCall } from '../../shared/utils/otel.js';

/**
 * Create PayPal order
 * @param {Object} orderData - Order data
 * @param {string} paypalClientId - PayPal client ID
 * @param {string} paypalClientSecret - PayPal client secret
 * @param {boolean} isSandbox - Whether to use sandbox
 * @param {number} inrToUsdRate - INR to USD conversion rate (default: 83)
 * @returns {Promise<Object>} PayPal order response
 */
export async function createPayPalOrder(orderData, paypalClientId, paypalClientSecret, isSandbox = true, inrToUsdRate = 83) {
  const baseUrl = isSandbox 
    ? 'https://api.sandbox.paypal.com' 
    : 'https://api.paypal.com';
  
  // PayPal Sandbox has limited currency support
  // Common supported currencies: USD, EUR, GBP, CAD, AUD, JPY
  // INR (Indian Rupees) is NOT supported in Sandbox
  let currency = (orderData.currency || 'USD').toUpperCase();
  let amount = typeof orderData.amount === 'number' 
    ? orderData.amount 
    : parseFloat(orderData.amount || 0);
  
  // Convert INR to USD for PayPal Sandbox (INR not supported in Sandbox)
  // Conversion rate: 1 USD = inrToUsdRate INR (default: 83, approximate current rate)
  if (isSandbox && currency === 'INR') {
    console.log(`[payment-service] Converting INR ${amount.toFixed(2)} to USD for PayPal Sandbox (rate: 1 USD = ${inrToUsdRate} INR)`);
    amount = amount / inrToUsdRate;
    currency = 'USD';
    console.log(`[payment-service] Converted amount: USD ${amount.toFixed(2)}`);
  }
  
  // Get access token
  const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  
  if (!tokenResponse.ok) {
    let tokenError;
    try {
      const errorData = await tokenResponse.json();
      tokenError = errorData.error_description || errorData.error || JSON.stringify(errorData);
    } catch (e) {
      tokenError = await tokenResponse.text();
    }
    console.error('[payment-service] PayPal token error:', tokenResponse.status, tokenError);
    throw new Error(`Failed to get PayPal access token: ${tokenResponse.status} - ${tokenError}`);
  }
  
  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  
  if (!accessToken) {
    throw new Error('PayPal access token not received');
  }
  
  // Format amount for PayPal (must be string with 2 decimal places)
  const amountValue = amount.toFixed(2);
  const currencyCode = currency;
  
  // PayPal order payload with return URLs
  // Note: In production, these should be configurable via environment variables
  const returnUrl = orderData.returnUrl || 'https://week2ecom-frontend.pages.dev/paypal-return';
  const cancelUrl = orderData.cancelUrl || 'https://week2ecom-frontend.pages.dev/checkout';
  
  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: currencyCode,
        value: amountValue,
      },
      description: orderData.description || 'Order payment',
    }],
    application_context: {
      return_url: returnUrl,
      cancel_url: cancelUrl,
      brand_name: 'E-Commerce Store',
      landing_page: 'BILLING',
      user_action: 'PAY_NOW',
    },
  };
  
  console.log('[payment-service] Creating PayPal order:', JSON.stringify(orderPayload, null, 2));
  
  // Create PayPal order with OpenTelemetry tracing
  const orderUrl = `${baseUrl}/v2/checkout/orders`;
  const orderResponse = await tracePaymentOperation(
    'paypal.create_order',
    async () => {
      return await fetch(orderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(orderPayload),
      });
    },
    {
      system: 'paypal',
      url: orderUrl,
      method: 'POST',
      amount: amountValue,
      currency: currencyCode,
      orderId: orderData.orderId || null,
    }
  );
  
  if (!orderResponse.ok) {
    let errorData;
    let errorText = '';
    try {
      errorData = await orderResponse.json();
      errorText = JSON.stringify(errorData, null, 2);
    } catch (e) {
      errorText = await orderResponse.text();
      errorData = { raw: errorText };
    }
    
    console.error('[payment-service] PayPal order creation failed:');
    console.error('[payment-service] Status:', orderResponse.status, orderResponse.statusText);
    console.error('[payment-service] Error response:', errorText);
    console.error('[payment-service] Request payload:', JSON.stringify(orderPayload, null, 2));
    
    // Extract detailed error message
    const errorMessage = errorData?.details?.[0]?.description 
      || errorData?.message 
      || errorData?.error_description 
      || errorData?.error 
      || errorText 
      || 'Unknown error';
    
    throw new Error(`Failed to create PayPal order (${orderResponse.status}): ${errorMessage}`);
  }
  
  const orderResult = await orderResponse.json();
  console.log('[payment-service] PayPal order created successfully:', orderResult.id);
  
  // Log all PayPal URLs (links array)
  if (orderResult.links && Array.isArray(orderResult.links)) {
    console.log('[payment-service] PayPal URLs (links):');
    orderResult.links.forEach((link, index) => {
      console.log(`  [${index + 1}] ${link.rel}: ${link.href} (method: ${link.method || 'N/A'})`);
    });
  } else {
    console.log('[payment-service] No links found in PayPal response');
  }
  
  return orderResult;
}

/**
 * Capture PayPal order
 * @param {string} orderId - PayPal order ID
 * @param {string} paypalClientId - PayPal client ID
 * @param {string} paypalClientSecret - PayPal client secret
 * @param {boolean} isSandbox - Whether to use sandbox
 * @returns {Promise<Object>} Capture response
 */
export async function capturePayPalOrder(orderId, paypalClientId, paypalClientSecret, isSandbox = true) {
  const baseUrl = isSandbox 
    ? 'https://api.sandbox.paypal.com' 
    : 'https://api.paypal.com';
  
  console.log(`[payment-service] Capturing PayPal order: ${orderId} (sandbox: ${isSandbox})`);
  
  // Get access token with OpenTelemetry tracing
  const tokenUrl = `${baseUrl}/v1/oauth2/token`;
  const tokenResponse = await traceExternalCall(
    'paypal.get_access_token',
    async () => {
      return await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
        },
        body: 'grant_type=client_credentials',
      });
    },
    {
      url: tokenUrl,
      method: 'POST',
      system: 'paypal',
      operation: 'get_access_token',
    }
  );
  
  if (!tokenResponse.ok) {
    let tokenError;
    try {
      const errorData = await tokenResponse.json();
      tokenError = errorData.error_description || errorData.error || JSON.stringify(errorData);
    } catch (e) {
      tokenError = await tokenResponse.text();
    }
    console.error('[payment-service] PayPal token error:', tokenResponse.status, tokenError);
    throw new Error(`Failed to get PayPal access token: ${tokenResponse.status} - ${tokenError}`);
  }
  
  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  
  if (!accessToken) {
    throw new Error('PayPal access token not received');
  }
  
  // Check order status with OpenTelemetry tracing
  const orderCheckUrl = `${baseUrl}/v2/checkout/orders/${orderId}`;
  const orderCheckResponse = await traceExternalCall(
    'paypal.check_order_status',
    async () => {
      return await fetch(orderCheckUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
    },
    {
      url: orderCheckUrl,
      method: 'GET',
      system: 'paypal',
      operation: 'check_order_status',
      orderId: orderId,
    }
  );
  
  if (orderCheckResponse.ok) {
    const orderData = await orderCheckResponse.json();
    console.log('[payment-service] PayPal order status:', orderData.status);
    
    if (orderData.status !== 'APPROVED' && orderData.status !== 'CREATED') {
      throw new Error(`PayPal order is in ${orderData.status} state. Order must be APPROVED before capture. Current status: ${orderData.status}`);
    }
  } else {
    console.warn('[payment-service] Could not check order status before capture, proceeding anyway...');
  }
  
  // Capture order with OpenTelemetry tracing
  const captureUrl = `${baseUrl}/v2/checkout/orders/${orderId}/capture`;
  const captureResponse = await tracePaymentOperation(
    'paypal.capture_order',
    async () => {
      return await fetch(captureUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
    },
    {
      system: 'paypal',
      url: captureUrl,
      method: 'POST',
      orderId: orderId,
    }
  );
  
  if (!captureResponse.ok) {
    let errorData;
    let errorText = '';
    try {
      errorData = await captureResponse.json();
      errorText = JSON.stringify(errorData, null, 2);
    } catch (e) {
      errorText = await captureResponse.text();
      errorData = { raw: errorText };
    }
    
    console.error('[payment-service] PayPal capture failed:');
    console.error('[payment-service] Status:', captureResponse.status, captureResponse.statusText);
    console.error('[payment-service] Error response:', errorText);
    console.error('[payment-service] Order ID:', orderId);
    
    // Extract detailed error message
    const errorMessage = errorData?.details?.[0]?.description 
      || errorData?.details?.[0]?.issue
      || errorData?.message 
      || errorData?.error_description 
      || errorData?.error 
      || errorText 
      || 'Unknown error';
    
    throw new Error(`Failed to capture PayPal order (${captureResponse.status}): ${errorMessage}`);
  }
  
  const captureResult = await captureResponse.json();
  console.log('[payment-service] PayPal order captured successfully:', captureResult.id || captureResult.status);
  return captureResult;
}

/**
 * Store payment record
 * @param {string} orderId - Order ID
 * @param {string} paypalOrderId - PayPal order ID
 * @param {Object} paymentData - Payment data
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} Payment record
 */
export async function storePayment(orderId, paypalOrderId, paymentData, db, encryptionKey) {
  // Encrypt PayPal order ID
  const encryptedPaymentId = encrypt(paypalOrderId, encryptionKey);
  
  // Store payment
  return await createPayment(db, orderId, encryptedPaymentId, paymentData);
}

/**
 * Update payment status
 * @param {string} paymentId - Payment ID
 * @param {string} status - New status
 * @param {Object} paymentData - Updated payment data
 * @param {D1Database} db - Database instance
 * @returns {Promise<boolean>} True if updated
 */
export async function updatePaymentStatus(paymentId, status, paymentData, db) {
  return await updatePayment(db, paymentId, status, paymentData);
}

/**
 * Get payment by order ID
 * @param {string} orderId - Order ID
 * @param {D1Database} db - Database instance
 * @returns {Promise<Object|null>} Payment data or null
 */
export async function getPaymentByOrderId(orderId, db) {
  return await getPaymentByOrderIdModel(db, orderId);
}

