/**
 * OpenTelemetry utilities for Cloudflare Workers
 * Provides tracing with Honeycomb integration and CF Ray ID propagation
 */

import { trace, context, propagation } from '@opentelemetry/api';

/**
 * Get the current tracer
 * @param {string} serviceName - Service name for the tracer
 * @returns {Tracer} OpenTelemetry tracer
 */
export function getTracer(serviceName) {
  return trace.getTracer(serviceName || 'cloudflare-worker');
}

/**
 * Get the current active span
 * @returns {Span|undefined} Active span or undefined
 */
export function getActiveSpan() {
  return trace.getActiveSpan();
}

/**
 * Get trace context (trace ID, span ID, etc.)
 * @returns {Object} Trace context with traceId, spanId, traceFlags
 */
export function getTraceContext() {
  const span = getActiveSpan();
  if (!span) {
    return {
      traceId: null,
      spanId: null,
      traceFlags: null,
    };
  }

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
    isRemote: spanContext.isRemote,
  };
}

/**
 * Get CF Ray ID from request headers
 * @param {Request} request - HTTP request
 * @returns {string|null} CF Ray ID or null
 */
export function getCfRayId(request) {
  if (!request || !request.headers) {
    return null;
  }
  return request.headers.get('cf-ray') || 
         request.headers.get('CF-Ray') || 
         null;
}

/**
 * Add attributes to active span
 * @param {Object} attributes - Attributes to add
 */
export function addSpanAttributes(attributes) {
  const span = getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        span.setAttribute(key, String(value));
      }
    });
  }
}

/**
 * Add CF Ray ID and trace context to span
 * @param {Span} span - OpenTelemetry span
 * @param {Request|null} request - HTTP request (optional, for CF Ray ID)
 */
function addSpanContext(span, request = null) {
  const traceContext = getTraceContext();
  const cfRayId = request ? getCfRayId(request) : null;
  
  // Add trace ID and span ID as attributes
  if (traceContext.traceId) {
    span.setAttribute('trace.id', traceContext.traceId);
  }
  if (traceContext.spanId) {
    span.setAttribute('span.id', traceContext.spanId);
  }
  
  // Add CF Ray ID if available
  if (cfRayId) {
    span.setAttribute('cf.ray_id', cfRayId);
  }
  
  // Add structured log as span event
  const logData = {
    traceId: traceContext.traceId || null,
    spanId: traceContext.spanId || null,
    cfRayId: cfRayId || null,
    timestamp: new Date().toISOString(),
  };
  
  span.addEvent('log', {
    'log.data': JSON.stringify(logData),
    'log.message': `Span started: ${span._name || 'unknown'}`,
  });
}

/**
 * Add a structured log as a span event
 * @param {Span} span - OpenTelemetry span
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @param {Request|null} request - HTTP request (optional, for CF Ray ID)
 */
export function addSpanLog(span, message, metadata = {}, request = null) {
  if (!span) return;
  
  const traceContext = getTraceContext();
  const cfRayId = request ? getCfRayId(request) : null;
  
  const logData = {
    message,
    traceId: traceContext.traceId || null,
    spanId: traceContext.spanId || null,
    cfRayId: cfRayId || null,
    ...metadata,
    timestamp: new Date().toISOString(),
  };
  
  span.addEvent('log', {
    'log.data': JSON.stringify(logData),
    'log.message': message,
  });
}

/**
 * Create a span for a database operation
 * @param {string} operation - Operation name (e.g., 'db.query', 'db.insert')
 * @param {Function} callback - Async function to execute within the span
 * @param {Object} attributes - Additional attributes (e.g., { table: 'users', query: 'SELECT ...' })
 * @param {Request|null} request - HTTP request (optional, for CF Ray ID)
 * @returns {Promise<any>} Result of the callback
 */
export async function traceDbOperation(operation, callback, attributes = {}, request = null) {
  const tracer = getTracer('db-tracer');
  const span = tracer.startSpan(operation);
  
  // Add default DB attributes
  span.setAttribute('db.system', 'd1');
  span.setAttribute('db.operation', operation);
  
  // Add custom attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      span.setAttribute(`db.${key}`, String(value));
    }
  });

  // Add CF Ray ID and trace context
  addSpanContext(span, request);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), callback);
    span.setStatus({ code: 1 }); // OK
    addSpanLog(span, `DB operation completed: ${operation}`, { operation }, request);
    return result;
  } catch (error) {
    span.setStatus({ 
      code: 2, // ERROR
      message: error.message 
    });
    span.recordException(error);
    addSpanLog(span, `DB operation failed: ${operation}`, { 
      operation, 
      error: error.message 
    }, request);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for a KV operation
 * @param {string} operation - Operation name (e.g., 'kv.get', 'kv.put', 'kv.delete')
 * @param {Function} callback - Async function to execute within the span
 * @param {Object} attributes - Additional attributes (e.g., { key: 'user:123', namespace: 'cache' })
 * @param {Request|null} request - HTTP request (optional, for CF Ray ID)
 * @returns {Promise<any>} Result of the callback
 */
export async function traceKvOperation(operation, callback, attributes = {}, request = null) {
  const tracer = getTracer('kv-tracer');
  const span = tracer.startSpan(operation);
  
  // Add default KV attributes
  span.setAttribute('kv.system', 'cloudflare-kv');
  span.setAttribute('kv.operation', operation);
  
  // Add custom attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      span.setAttribute(`kv.${key}`, String(value));
    }
  });

  // Add CF Ray ID and trace context
  addSpanContext(span, request);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), callback);
    span.setStatus({ code: 1 }); // OK
    addSpanLog(span, `KV operation completed: ${operation}`, { operation }, request);
    return result;
  } catch (error) {
    span.setStatus({ 
      code: 2, // ERROR
      message: error.message 
    });
    span.recordException(error);
    addSpanLog(span, `KV operation failed: ${operation}`, { 
      operation, 
      error: error.message 
    }, request);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for an external HTTP call (PayPal, etc.)
 * @param {string} operation - Operation name (e.g., 'paypal.create_order', 'external.fetch')
 * @param {Function} callback - Async function to execute within the span
 * @param {Object} attributes - Additional attributes (e.g., { url: 'https://api.paypal.com/...', method: 'POST' })
 * @param {Request|null} request - HTTP request (optional, for CF Ray ID)
 * @returns {Promise<any>} Result of the callback
 */
export async function traceExternalCall(operation, callback, attributes = {}, request = null) {
  const tracer = getTracer('external-tracer');
  const span = tracer.startSpan(operation);
  
  // Add default HTTP attributes
  span.setAttribute('external.system', attributes.system || 'http');
  span.setAttribute('external.operation', operation);
  
  // Add custom attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      // Map common HTTP attributes to OpenTelemetry semantic conventions
      if (key === 'url') {
        span.setAttribute('url.full', String(value));
      } else if (key === 'method') {
        span.setAttribute('http.request.method', String(value));
      } else if (key === 'statusCode') {
        span.setAttribute('http.response.status_code', Number(value));
      } else {
        span.setAttribute(`external.${key}`, String(value));
      }
    }
  });

  // Add CF Ray ID and trace context
  addSpanContext(span, request);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), callback);
    
    // Try to extract status code from result if it's a Response
    if (result && typeof result === 'object' && 'status' in result) {
      span.setAttribute('http.response.status_code', result.status);
      span.setStatus({ 
        code: result.status >= 200 && result.status < 400 ? 1 : 2,
        message: result.statusText || undefined
      });
      addSpanLog(span, `External call completed: ${operation}`, { 
        operation, 
        statusCode: result.status 
      }, request);
    } else {
      span.setStatus({ code: 1 }); // OK
      addSpanLog(span, `External call completed: ${operation}`, { operation }, request);
    }
    
    return result;
  } catch (error) {
    span.setStatus({ 
      code: 2, // ERROR
      message: error.message 
    });
    span.recordException(error);
    addSpanLog(span, `External call failed: ${operation}`, { 
      operation, 
      error: error.message 
    }, request);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for a payment operation
 * @param {string} operation - Operation name (e.g., 'paypal.create', 'paypal.capture')
 * @param {Function} callback - Async function to execute within the span
 * @param {Object} attributes - Additional attributes (e.g., { orderId: '...', amount: 100 })
 * @param {Request|null} request - HTTP request (optional, for CF Ray ID)
 * @returns {Promise<any>} Result of the callback
 */
export async function tracePaymentOperation(operation, callback, attributes = {}, request = null) {
  const tracer = getTracer('payment-tracer');
  const span = tracer.startSpan(operation);
  
  // Add default payment attributes
  span.setAttribute('payment.system', attributes.system || 'paypal');
  span.setAttribute('payment.operation', operation);
  
  // Add custom attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      span.setAttribute(`payment.${key}`, String(value));
    }
  });

  // Add CF Ray ID and trace context
  addSpanContext(span, request);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), callback);
    span.setStatus({ code: 1 }); // OK
    addSpanLog(span, `Payment operation completed: ${operation}`, { operation }, request);
    return result;
  } catch (error) {
    span.setStatus({ 
      code: 2, // ERROR
      message: error.message 
    });
    span.recordException(error);
    addSpanLog(span, `Payment operation failed: ${operation}`, { 
      operation, 
      error: error.message 
    }, request);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Inject trace context into headers for propagation to other workers
 * @param {Headers} headers - Headers object to inject trace context into
 */
export function injectTraceContext(headers) {
  if (!headers || typeof headers.set !== 'function') {
    return;
  }

  const carrier = {};
  propagation.inject(context.active(), carrier);
  
  // Add trace context headers
  Object.entries(carrier).forEach(([key, value]) => {
    headers.set(key, String(value));
  });
}

/**
 * Extract trace context from headers (for receiving requests)
 * @param {Headers|Object} headers - Headers object or plain object with headers
 * @returns {Context} OpenTelemetry context with extracted trace context
 */
export function extractTraceContext(headers) {
  const carrier = {};
  
  // Convert Headers to plain object if needed
  if (headers && typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      carrier[key] = value;
    });
  } else if (headers && typeof headers === 'object') {
    Object.assign(carrier, headers);
  }

  return propagation.extract(context.active(), carrier);
}

/**
 * Execute a function within an extracted trace context
 * This is used when receiving inter-worker requests to continue the same trace
 * @param {Headers|Object} headers - Headers object with trace context
 * @param {Function} callback - Function to execute within the trace context
 * @returns {Promise<any>} Result of the callback
 */
export async function withTraceContext(headers, callback) {
  const extractedContext = extractTraceContext(headers);
  return await context.with(extractedContext, callback);
}

/**
 * Create structured log data with trace IDs and CF Ray ID
 * @param {Request} request - HTTP request
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Structured log data
 */
export function createStructuredLog(request, message, metadata = {}) {
  const traceContext = getTraceContext();
  const cfRayId = getCfRayId(request);
  
  return {
    message,
    timestamp: new Date().toISOString(),
    traceId: traceContext.traceId || null,
    spanId: traceContext.spanId || null,
    cfRayId: cfRayId,
    ...metadata,
  };
}

