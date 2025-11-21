/**
 * Log controller
 */

import * as logService from '../services/logService.js';
import { validateApiKey } from '../../shared/utils/interWorker.js';
import { AuthenticationError, ValidationError } from '../../shared/utils/errors.js';
import { logSchema } from '../validation/logValidation.js';
import { traceKvOperation } from '../../shared/utils/otel.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    const logBucket = safeGetBinding(env, 'log_bucket');
    const logState = safeGetBinding(env, 'log_state');
    
    if (!logBucket || !logState) {
      return new Response(
        JSON.stringify({
          status: 'unhealthy',
          service: 'log-worker',
          error: 'Bindings not configured',
          timestamp: new Date().toISOString(),
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Check R2
    await logBucket.head('health-check');
    
    // Check KV
    await logState.get('health-check');
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'log-worker',
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        service: 'log-worker',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Safe getter for bindings (handles error 1042)
 */
function safeGetBinding(env, bindingName) {
  try {
    return env[bindingName];
  } catch (error) {
    const errorStr = String(error || '');
    if (errorStr.includes('1042')) {
      console.error(`[logController] Error 1042 accessing env.${bindingName}:`, error.message);
      return null; // Binding doesn't exist
    }
    throw error; // Re-throw if it's a different error
  }
}

/**
 * Validate worker request (async middleware for itty-router)
 */
export async function validateWorkerRequest(request, env) {
  try {
    console.log('[logController] validateWorkerRequest called');
    const apiKey = safeGetBinding(env, 'INTER_WORKER_API_KEY');
    console.log('[logController] API key from env:', apiKey ? 'present' : 'null');
    
    if (!apiKey) {
      console.error('[logController] INTER_WORKER_API_KEY not available');
      throw new AuthenticationError('API key not configured');
    }
    
    if (!validateApiKey(request, apiKey)) {
      console.error('[logController] Invalid API key');
      throw new AuthenticationError('Invalid API key for inter-worker request');
    }
    
    console.log('[logController] API key validated successfully');
  } catch (error) {
    console.error('[logController] Error in validateWorkerRequest:', error.message, error.stack);
    throw error; // Re-throw to let router handle it
  }
}

/**
 * Debug endpoint handler (no auth for easier testing - can be secured later)
 */
export async function debugKvLogs(request, env) {
  // This is a public endpoint for debugging - you may want to add auth
  return await debugKvLogsHandler(request, env);
}

async function debugKvLogsHandler(request, env) {
  try {
    const logState = env.log_state;
    if (!logState) {
      return new Response(
        JSON.stringify({ error: 'KV namespace not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Get the index
    const indexKey = 'log_keys:index';
    const index = await traceKvOperation(
      'kv.get',
      async () => await logState.get(indexKey, { type: 'json' }),
      { key: indexKey, namespace: 'log_state', operation: 'debug_get_index' },
      request
    );
    
    // Get a few sample logs
    const sampleLogs = [];
    if (index && Array.isArray(index) && index.length > 0) {
      const sampleKeys = index.slice(0, 10); // Get first 10
      for (const key of sampleKeys) {
        try {
          const log = await traceKvOperation(
            'kv.get',
            async () => await logState.get(key, { type: 'json' }),
            { key: key, namespace: 'log_state', operation: 'debug_get_log' },
            request
          );
          if (log) {
            sampleLogs.push({ key, log });
          }
        } catch (error) {
          console.error(`Error fetching log ${key}:`, error.message);
        }
      }
    }
    
    return new Response(
      JSON.stringify({
        totalLogs: index ? index.length : 0,
        sampleLogs: sampleLogs.length,
        logs: sampleLogs,
        indexKeys: index ? index.slice(0, 20) : []
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Receive log
 */
export async function receiveLog(request, env) {
  try {
    console.log('[logController] ========== RECEIVE LOG START ==========');
    console.log('[logController] Received log request');
    console.log('[logController] Request method:', request.method);
    console.log('[logController] Request URL:', request.url);
    console.log('[logController] Request headers:', JSON.stringify(Object.fromEntries(request.headers.entries())));
    
    // Parse body with better error handling
    let body;
    try {
      const bodyText = await request.text();
      console.log('[logController] Raw body text length:', bodyText.length);
      console.log('[logController] Raw body text (first 500 chars):', bodyText.substring(0, 500));
      
      if (!bodyText || bodyText.trim() === '') {
        console.error('[logController] Empty body received');
        return new Response(
          JSON.stringify({ success: false, error: 'Empty request body' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      body = JSON.parse(bodyText);
      console.log('[logController] Parsed body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[logController] JSON parse error:', parseError.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON in request body',
          details: parseError.message 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate with schema
    console.log('[logController] Validating log data with schema...');
    const { error, value } = logSchema.validate(body);
    if (error) {
      console.error('[logController] Validation error:', JSON.stringify(error.details));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Validation failed',
          details: error.details 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[logController] Validation passed, value:', JSON.stringify(value));
    
    // Check if bindings exist (using safe getter to handle error 1042)
    console.log('[logController] Checking bindings...');
    const logBucket = safeGetBinding(env, 'log_bucket');
    const logState = safeGetBinding(env, 'log_state');
    
    console.log('[logController] log_bucket:', logBucket ? 'exists' : 'null');
    console.log('[logController] log_state:', logState ? 'exists' : 'null');
    
    if (!logState) {
      console.error('[logController] log_state binding not available - this is critical!');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'KV namespace not configured',
          details: 'log_state binding is null or undefined'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // R2 bucket is optional (only needed for daily push)
    if (!logBucket) {
      console.warn('[logController] log_bucket binding not available (will fail during daily push)');
    }
    
    console.log('[logController] Bindings available, storing log in KV...');
    console.log('[logController] About to call storeLog with:', {
      hasLogData: !!value,
      hasLogState: !!logState,
      hasLogBucket: !!logBucket,
    });
    
    try {
      await logService.storeLog(value, logBucket, logState);
      console.log('[logController] ✅ Log stored successfully in KV');
      
      // Verify the log was stored by reading it back
      try {
        const indexKey = 'log_keys:index';
        const index = await logState.get(indexKey, { type: 'json' });
        console.log('[logController] Verification: Index now has', index ? index.length : 0, 'log keys');
      } catch (verifyError) {
        console.warn('[logController] Could not verify log storage:', verifyError.message);
      }
      
      return new Response(
        JSON.stringify({ success: true, message: 'Log stored in KV' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (storeError) {
      console.error('[logController] ❌ Error in storeLog:', storeError.message);
      console.error('[logController] Error stack:', storeError.stack);
      // Return error response instead of throwing
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to store log',
          details: storeError.message,
          stack: storeError.stack
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[logController] ❌❌❌ Unexpected error receiving log:', error.message);
    console.error('[logController] Error stack:', error.stack);
    // Return error response instead of throwing to avoid unhandled promise rejection
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to receive log',
        details: error.message,
        stack: error.stack
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    console.log('[logController] ========== RECEIVE LOG END ==========');
  }
}

/**
 * Flush logs to R2 (manual trigger)
 */
export async function flushLogs(request, env) {
  try {
    const logBucket = safeGetBinding(env, 'log_bucket');
    const logState = safeGetBinding(env, 'log_state');
    
    if (!logBucket || !logState) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bindings not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const result = await logService.pushLogsToR2(logBucket, logState);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Logs pushed to R2 and KV cleared',
        ...result
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[logController] Error flushing logs:', error.message, error.stack);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to flush logs',
        details: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

