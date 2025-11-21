/**
 * OpenTelemetry configuration for Cloudflare Workers
 * Provides Honeycomb integration with automatic instrumentation
 */

import { instrument } from '@microlabs/otel-cf-workers';
import { trace } from '@opentelemetry/api';
import { getCfRayId as getCfRayIdFromOtel } from './otel.js';

/**
 * Create OpenTelemetry configuration for Honeycomb
 * @param {Object} env - Environment variables
 * @param {string} serviceName - Service name
 * @returns {Object} OpenTelemetry configuration
 */
export function createOtelConfig(env, serviceName) {
  const config = {
    exporter: {
      url: env.HONEYCOMB_ENDPOINT || 'https://api.honeycomb.io/v1/traces',
      headers: {
        'x-honeycomb-team': env.HONEYCOMB_API_KEY || '',
        'x-honeycomb-dataset': env.HONEYCOMB_DATASET || serviceName || 'cloudflare-worker',
      },
    },
    service: {
      name: serviceName || 'cloudflare-worker',
      version: env.SERVICE_VERSION || '1.0.0',
    },
    // Enable automatic instrumentation
    fetchInstrumentation: {
      enabled: true,
      // Propagate trace context in fetch calls
      propagateTraceContext: true,
    },
  };

  return config;
}

/**
 * Wrap a worker handler with OpenTelemetry instrumentation
 * @param {Function} handler - Worker fetch handler
 * @param {Function|Object} config - Configuration function or object
 * @returns {Function} Instrumented handler
 */
export function instrumentHandler(handler, config) {
  // If config is a function, use it as ResolveConfigFn
  if (typeof config === 'function') {
    return instrument(handler, config);
  }
  
  // Otherwise, create a ResolveConfigFn from the config object
  const resolveConfig = (env) => {
    const serviceName = config.serviceName || env.SERVICE_NAME || 'cloudflare-worker';
    return createOtelConfig(env, serviceName);
  };
  
  return instrument(handler, resolveConfig);
}

/**
 * Initialize request tracing with CF Ray ID
 * Should be called at the start of each request handler
 * @param {Request} request - HTTP request
 * @param {string} serviceName - Service name
 */
export function initRequestTrace(request, serviceName) {
  const tracer = trace.getTracer(serviceName || 'cloudflare-worker');
  const cfRayId = getCfRayIdFromOtel(request);
  const span = trace.getActiveSpan();
  
  if (span) {
    const traceContext = span.spanContext();
    
    // Add CF Ray ID to the active span (required)
    if (cfRayId) {
      span.setAttribute('cf.ray_id', cfRayId);
    }
    
    // Add trace ID and span ID as attributes
    if (traceContext.traceId) {
      span.setAttribute('trace.id', traceContext.traceId);
    }
    if (traceContext.spanId) {
      span.setAttribute('span.id', traceContext.spanId);
    }
    
    // Add request metadata
    span.setAttribute('http.method', request.method);
    span.setAttribute('http.url', request.url);
    span.setAttribute('http.user_agent', request.headers.get('user-agent') || '');
    
    // Add structured log as span event
    const traceContextData = getTraceContext();
    const logData = {
      message: `Request started: ${request.method} ${new URL(request.url).pathname}`,
      traceId: traceContextData.traceId || traceContext.traceId || null,
      spanId: traceContextData.spanId || traceContext.spanId || null,
      cfRayId: cfRayId || null,
      method: request.method,
      path: new URL(request.url).pathname,
      service: serviceName,
      timestamp: new Date().toISOString(),
    };
    
    span.addEvent('log', {
      'log.data': JSON.stringify(logData),
      'log.message': logData.message,
    });
    
    // Add trace ID to response headers for client correlation
    // (This will be done in the response)
  }
}

/**
 * Get trace context helper (needed for initRequestTrace)
 */
function getTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) {
    return { traceId: null, spanId: null };
  }
  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Add trace headers to response for client correlation
 * @param {Response} response - HTTP response
 * @param {Request} request - Original HTTP request
 * @returns {Response} Response with trace headers
 */
export function addTraceHeaders(response, request) {
  const traceContext = trace.getActiveSpan()?.spanContext();
  const cfRayId = getCfRayIdFromOtel(request);
  
  if (!traceContext) {
    return response;
  }

  // Clone response to add headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  // Add trace context headers
  newResponse.headers.set('X-Trace-ID', traceContext.traceId);
  newResponse.headers.set('X-Span-ID', traceContext.spanId);
  
  if (cfRayId) {
    newResponse.headers.set('X-CF-Ray-ID', cfRayId);
  }

  return newResponse;
}

