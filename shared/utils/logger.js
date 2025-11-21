/**
 * Logger utility for sending logs to log worker
 * Enhanced with OpenTelemetry trace IDs and CF Ray IDs
 */

import { getTraceContext, getCfRayId, createStructuredLog } from './otel.js';

/**
 * Send log to log worker using Service Binding (avoids error 1042)
 * Automatically includes trace IDs and CF Ray ID if available
 * @param {Fetcher|string} logWorkerBindingOrUrl - Service binding for log worker (preferred) OR URL (fallback)
 * @param {string} level - Log level: 'event', 'debug', or 'error'
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @param {string} apiKey - API key for authentication
 * @param {ExecutionContext} ctx - Cloudflare execution context (optional, for ctx.waitUntil)
 * @param {Request} request - HTTP request (optional, for CF Ray ID extraction)
 */
export async function sendLog(logWorkerBindingOrUrl, level, message, metadata = {}, apiKey, ctx = null, request = null) {
  console.log('[logger] sendLog called:', { 
    level, 
    message, 
    hasBinding: typeof logWorkerBindingOrUrl === 'object' && typeof logWorkerBindingOrUrl?.fetch === 'function',
    hasUrl: typeof logWorkerBindingOrUrl === 'string',
    hasApiKey: !!apiKey,
    hasCtx: !!ctx,
    metadata 
  });
  
  if (!['event', 'debug', 'error'].includes(level)) {
    console.error('[logger] Invalid log level:', level);
    throw new Error(`Invalid log level: ${level}. Must be 'event', 'debug', or 'error'`);
  }

  // Fire and forget - don't wait for response
  // Use ctx.waitUntil or just don't await
  if (!logWorkerBindingOrUrl || !apiKey) {
    // If log worker is not configured, just return
    console.warn('[logger] Log worker binding/URL or API key not configured:', { 
      hasLogWorkerBindingOrUrl: !!logWorkerBindingOrUrl, 
      hasApiKey: !!apiKey 
    });
    return Promise.resolve();
  }

  // Get trace context and CF Ray ID
  const traceContext = getTraceContext();
  const cfRayId = request ? getCfRayId(request) : null;
  
  // Create structured log with trace IDs and CF Ray ID
  const structuredLog = createStructuredLog(request, message, {
    level,
    ...metadata,
    worker: metadata.worker || 'unknown',
  });
  
  const logData = {
    ...structuredLog,
    // Ensure trace context is included
    traceId: structuredLog.traceId || traceContext.traceId || null,
    spanId: structuredLog.spanId || traceContext.spanId || null,
    cfRayId: structuredLog.cfRayId || cfRayId || null,
  };
  
  // Log to console with structured JSON format for Honeycomb
  console.log(JSON.stringify({
    ...logData,
    logLevel: level,
    service: metadata.worker || 'unknown',
  }));
  
  // Use Service Binding if available (prevents error 1042), otherwise fall back to HTTP
  let logPromise;
  
  if (typeof logWorkerBindingOrUrl === 'object' && typeof logWorkerBindingOrUrl.fetch === 'function') {
    // Use Service Binding (preferred - avoids error 1042)
    console.log('[logger] Using service binding to send log');
    const url = 'https://workers.dev/log'; // Path is what matters for service bindings
    const request = new Request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Worker-Request': 'true',
      },
      body: JSON.stringify(logData),
    });
    
    logPromise = logWorkerBindingOrUrl.fetch(request)
      .then(async (response) => {
        console.log('[logger] Log worker response received (via binding), status:', response.status);
        if (!response.ok) {
          const errorText = await response.text().catch(() => `HTTP ${response.status}`);
          console.error(`[logger] Log worker returned error ${response.status}:`, errorText);
          throw new Error(`Log worker error: ${response.status} - ${errorText}`);
        } else {
          const responseText = await response.text().catch(() => '');
          console.log('[logger] Log sent successfully (via binding), response:', responseText);
          console.log('[logger] ✅ Log successfully stored in log worker');
        }
      })
      .catch(error => {
        // Don't throw - logging failures shouldn't break the application
        console.error(`[logger] ❌ Error sending log (via binding):`, error.message);
        console.error(`[logger] Error stack:`, error.stack);
      });
  } else {
    // Fallback to HTTP fetch (will fail with error 1042 if same zone, but at least we tried)
    console.warn('[logger] Service binding not available, falling back to HTTP fetch (may cause error 1042)');
    const logUrl = typeof logWorkerBindingOrUrl === 'string' 
      ? (logWorkerBindingOrUrl.endsWith('/log') ? logWorkerBindingOrUrl : `${logWorkerBindingOrUrl}/log`)
      : null;
    
    if (!logUrl) {
      console.error('[logger] Invalid log worker URL or binding');
      return Promise.resolve();
    }
    
    console.log('[logger] Making HTTP fetch request to:', logUrl);
    
    logPromise = fetch(logUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Worker-Request': 'true',
      },
      body: JSON.stringify(logData),
    })
    .then(async (response) => {
      console.log('[logger] Log worker response received (via HTTP), status:', response.status);
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        console.error(`[logger] Log worker returned error ${response.status}:`, errorText);
        throw new Error(`Log worker error: ${response.status} - ${errorText}`);
      } else {
        const responseText = await response.text().catch(() => '');
        console.log('[logger] Log sent successfully (via HTTP), response:', responseText);
        console.log('[logger] ✅ Log successfully stored in log worker');
      }
    })
    .catch(error => {
      // Don't throw - logging failures shouldn't break the application
      console.error(`[logger] ❌ Error sending log (via HTTP):`, error.message);
      console.error(`[logger] Error stack:`, error.stack);
    });
  }
  
  // Use ctx.waitUntil to ensure the log request completes even after main request finishes
  // Only use ctx.waitUntil if ctx is available and has the waitUntil method
  if (ctx != null && typeof ctx === 'object' && typeof ctx.waitUntil === 'function') {
    console.log('[logger] Using ctx.waitUntil to ensure log request completes');
    try {
      ctx.waitUntil(logPromise);
      console.log('[logger] ctx.waitUntil called successfully');
    } catch (error) {
      console.error('[logger] Error using ctx.waitUntil:', error.message);
      // Continue even if waitUntil fails
    }
  } else {
    console.warn('[logger] ctx.waitUntil not available, log request may be cancelled');
  }
  
  // Still return the promise for cases where ctx is not available
  return logPromise;
}

