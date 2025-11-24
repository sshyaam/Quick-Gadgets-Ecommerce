/**
 * Payment controller
 */

import * as paymentService from '../services/paymentService.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { createOrderSchema, captureOrderSchema } from '../validation/paymentValidation.js';
import { sendLog } from '../../shared/utils/logger.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    // Check database
    await env.payment_db.prepare('SELECT 1').first();
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'payment-worker',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        service: 'payment-worker',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Create PayPal order
 */
export async function createPayPalOrder(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  const body = await request.json();
  
  // Validate
  const { error, value } = createOrderSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  // Check if PayPal credentials are configured
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    console.error('[payment-controller] PayPal credentials not configured');
    await sendLog(logWorkerBindingOrUrl, 'error', 'PayPal credentials not configured', {
      orderId: value.orderId || null,
      worker: 'payment-worker',
    }, apiKey, ctx);
    throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET secrets.');
  }
  
  // Log request details for debugging
  console.log('[payment-controller] Creating PayPal order with:', {
    amount: value.amount,
    currency: value.currency,
    description: value.description,
    orderId: value.orderId,
    sandbox: env.PAYPAL_SANDBOX === 'true',
    hasClientId: !!env.PAYPAL_CLIENT_ID,
    hasClientSecret: !!env.PAYPAL_CLIENT_SECRET,
  });
  
  // Log PayPal order creation start
  await sendLog(logWorkerBindingOrUrl, 'event', 'PayPal order creation started', {
    orderId: value.orderId || null,
    amount: value.amount,
    currency: value.currency,
    worker: 'payment-worker',
  }, apiKey, ctx);
  
  // Create PayPal order
  try {
    // Get INR to USD conversion rate from env (default: 83)
    const inrToUsdRate = parseFloat(env.INR_TO_USD_RATE || '83');
    
    const paypalOrder = await paymentService.createPayPalOrder(
      value,
      env.PAYPAL_CLIENT_ID,
      env.PAYPAL_CLIENT_SECRET,
      env.PAYPAL_SANDBOX === 'true' || true, // Default to sandbox
      inrToUsdRate
    );
    
    // Store payment record if orderId is provided
    if (value.orderId) {
      await paymentService.storePayment(
        value.orderId,
        paypalOrder.id,
        paypalOrder,
        env.payment_db,
        env.ENCRYPTION_KEY
      );
    }
    
    // Log successful PayPal order creation
    await sendLog(logWorkerBindingOrUrl, 'event', 'PayPal order created successfully', {
      orderId: value.orderId || null,
      paypalOrderId: paypalOrder.id,
      amount: value.amount,
      currency: value.currency,
      worker: 'payment-worker',
    }, apiKey, ctx);
    
    // Log all PayPal URLs being returned
    if (paypalOrder.links && Array.isArray(paypalOrder.links)) {
      console.log('[payment-controller] PayPal URLs being returned:');
      paypalOrder.links.forEach((link, index) => {
        console.log(`  [${index + 1}] ${link.rel}: ${link.href} (method: ${link.method || 'N/A'})`);
      });
    } else {
      console.log('[payment-controller] No links found in PayPal order response');
    }
    
    return new Response(
      JSON.stringify({
        orderId: paypalOrder.id,
        status: paypalOrder.status,
        links: paypalOrder.links,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[payment-controller] PayPal order creation failed:', error.message);
    // Log PayPal order creation failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'PayPal order creation failed', {
      orderId: value.orderId || null,
      error: error.message,
      worker: 'payment-worker',
    }, apiKey, ctx);
    throw error; // Re-throw to be handled by error handler
  }
}

/**
 * Capture PayPal order
 */
export async function capturePayPalOrder(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  const body = await request.json();
  
  // Validate
  const { error, value } = captureOrderSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }
  
  // Log request details for debugging
  console.log('[payment-controller] Capturing PayPal order with:', {
    orderId: value.orderId,
    internalOrderId: value.internalOrderId,
    sandbox: env.PAYPAL_SANDBOX === 'true',
    hasClientId: !!env.PAYPAL_CLIENT_ID,
    hasClientSecret: !!env.PAYPAL_CLIENT_SECRET,
  });
  
  // Log payment capture start
  await sendLog(logWorkerBindingOrUrl, 'event', 'PayPal payment capture started', {
    orderId: value.orderId,
    internalOrderId: value.internalOrderId || null,
    worker: 'payment-worker',
  }, apiKey, ctx);
  
  // Check if PayPal credentials are configured
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    console.error('[payment-controller] PayPal credentials not configured');
    await sendLog(logWorkerBindingOrUrl, 'error', 'PayPal credentials not configured for capture', {
      orderId: value.orderId,
      internalOrderId: value.internalOrderId || null,
      worker: 'payment-worker',
    }, apiKey, ctx);
    throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET secrets.');
  }
  
  // Capture PayPal order
  let captureResult;
  try {
    captureResult = await paymentService.capturePayPalOrder(
      value.orderId,
      env.PAYPAL_CLIENT_ID,
      env.PAYPAL_CLIENT_SECRET,
      env.PAYPAL_SANDBOX === 'true' || true // Default to sandbox
    );
    
    // Log successful payment capture
    await sendLog(logWorkerBindingOrUrl, 'event', 'PayPal payment captured successfully', {
      orderId: value.orderId,
      internalOrderId: value.internalOrderId || null,
      captureId: captureResult.id || null,
      status: captureResult.status || null,
      worker: 'payment-worker',
    }, apiKey, ctx);
  } catch (error) {
    console.error('[payment-controller] PayPal capture failed:', error.message);
    console.error('[payment-controller] Error stack:', error.stack);
    // Log payment capture failure
    await sendLog(logWorkerBindingOrUrl, 'error', 'PayPal payment capture failed', {
      orderId: value.orderId,
      internalOrderId: value.internalOrderId || null,
      error: error.message,
      worker: 'payment-worker',
    }, apiKey, ctx);
    // Convert to ConflictError to preserve the actual error message
    const { ConflictError } = await import('../../shared/utils/errors.js');
    throw new ConflictError(`Payment capture failed: ${error.message}`);
  }
  
  // Update payment record if orderId is provided
  if (value.internalOrderId) {
    const { getPaymentByOrderId } = await import('../models/paymentModel.js');
    const payment = await getPaymentByOrderId(env.payment_db, value.internalOrderId);
    if (payment) {
      await paymentService.updatePaymentStatus(
        payment.payment_id,
        captureResult.status === 'COMPLETED' ? 'completed' : 'failed',
        captureResult,
        env.payment_db
      );
    }
  }
  
  // Return full capture result so billing address can be extracted
  return new Response(
    JSON.stringify({
      status: captureResult.status,
      payment: captureResult.purchase_units[0]?.payments?.captures[0],
      // Include full capture data for billing address extraction
      purchase_units: captureResult.purchase_units,
      payer: captureResult.payer,
      id: captureResult.id,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Store payment record (called after order creation)
 */
export async function storePayment(request, env, ctx = null) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  const body = await request.json();
  const { orderId, paypalOrderId, paymentData } = body;
  
  if (!orderId || !paypalOrderId || !paymentData) {
    throw new ValidationError('orderId, paypalOrderId, and paymentData are required');
  }
  
  // Check if encryption key is configured
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY not configured');
  }
  
  try {
    const storedPayment = await paymentService.storePayment(
      orderId,
      paypalOrderId,
      paymentData,
      env.payment_db,
      env.ENCRYPTION_KEY
    );
    
    return new Response(
      JSON.stringify({
        success: true,
        paymentId: storedPayment.paymentId,
        orderId: storedPayment.orderId,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[payment-controller] Failed to store payment:', error);
    throw error;
  }
}

