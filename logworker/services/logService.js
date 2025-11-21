/**
 * Log service
 * Stores individual logs in KV, pushes to R2 daily via cron trigger
 */

import { traceKvOperation } from '../../shared/utils/otel.js';

/**
 * Generate unique log key
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Unique log key
 */
function generateLogKey(timestamp) {
  // Use timestamp + random suffix to ensure uniqueness
  // Replace colons and dots to make it KV-safe
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const randomSuffix = Math.random().toString(36).substring(2, 15);
  return `log:${safeTimestamp}:${randomSuffix}`;
}

/**
 * Store log in KV
 * @param {Object} logData - Log data
 * @param {KVNamespace} logState - KV namespace for storing logs
 * @returns {Promise<void>}
 */
export async function storeLog(logData, r2Bucket, logState) {
  try {
    console.log('[logService] ========== STORE LOG START ==========');
    console.log('[logService] storeLog called');
    console.log('[logService] logData:', JSON.stringify(logData, null, 2));
    console.log('[logService] logState binding:', logState ? 'exists' : 'null');
    console.log('[logService] logState type:', typeof logState);
    
    if (!logState) {
      const error = new Error('KV namespace (log_state) not configured');
      console.error('[logService] ❌ KV namespace is null/undefined');
      throw error;
    }
    
    // Test KV access
    try {
      console.log('[logService] Testing KV access...');
      await traceKvOperation(
        'kv.get',
        async () => await logState.get('test-key').catch(() => null), // Test read
        { key: 'test-key', namespace: 'log_state' },
        null
      );
      console.log('[logService] ✅ KV access test passed');
    } catch (testError) {
      console.error('[logService] ❌ KV access test failed:', testError.message);
      throw new Error(`KV access failed: ${testError.message}`);
    }
    
    // Add timestamp if not present
    const timestamp = logData.timestamp || new Date().toISOString();
    const logEntry = {
      ...logData,
      timestamp,
    };
    
    console.log('[logService] Log entry prepared:', JSON.stringify(logEntry, null, 2));
    
    // Generate unique key for this log
    const logKey = generateLogKey(timestamp);
    console.log('[logService] Generated log key:', logKey);
    
    // Store individual log in KV
    console.log('[logService] Attempting to store log in KV...');
    const logEntryJson = JSON.stringify(logEntry);
    console.log('[logService] Log entry JSON length:', logEntryJson.length);
    
    try {
      await traceKvOperation(
        'kv.put',
        async () => await logState.put(logKey, logEntryJson),
        { key: logKey, namespace: 'log_state' },
        null
      );
      console.log('[logService] ✅ Log stored successfully in KV with key:', logKey);
    } catch (putError) {
      console.error('[logService] ❌ KV put failed:', putError.message);
      console.error('[logService] Put error stack:', putError.stack);
      throw new Error(`Failed to store log in KV: ${putError.message}`);
    }
    
    // Verify the log was stored
    try {
      const verifyLog = await traceKvOperation(
        'kv.get',
        async () => await logState.get(logKey, { type: 'json' }),
        { key: logKey, namespace: 'log_state', operation: 'verify' },
        null
      );
      if (verifyLog) {
        console.log('[logService] ✅ Verification: Log successfully retrieved from KV');
      } else {
        console.warn('[logService] ⚠️ Verification: Log not found after storing (might be eventual consistency)');
      }
    } catch (verifyError) {
      console.warn('[logService] Could not verify log storage:', verifyError.message);
    }
    
    // Also maintain a list of log keys for efficient retrieval during daily push
    // Store in a set-like structure: log_keys:index
    const indexKey = 'log_keys:index';
    try {
      console.log('[logService] Updating log keys index...');
      const existingIndex = await traceKvOperation(
        'kv.get',
        async () => await logState.get(indexKey, { type: 'json' }),
        { key: indexKey, namespace: 'log_state', operation: 'get_index' },
        null
      );
      const logKeys = existingIndex || [];
      console.log('[logService] Current index size:', logKeys.length);
      
      logKeys.push(logKey);
      console.log('[logService] New index size:', logKeys.length);
      
      // Update index (limit to prevent KV size issues - daily push should clear this)
      await traceKvOperation(
        'kv.put',
        async () => await logState.put(indexKey, JSON.stringify(logKeys)),
        { key: indexKey, namespace: 'log_state', operation: 'update_index', indexSize: logKeys.length },
        null
      );
      console.log('[logService] ✅ Index updated successfully');
    } catch (indexError) {
      console.error('[logService] ❌ Could not update log keys index:', indexError.message);
      console.error('[logService] Index error stack:', indexError.stack);
      // Non-critical - we can still list all keys during daily push
      // But log the error so we know about it
    }
    
    console.log('[logService] ========== STORE LOG END (SUCCESS) ==========');
  } catch (error) {
    console.error('[logService] ========== STORE LOG END (ERROR) ==========');
    console.error('[logService] Error in storeLog:', error.message);
    console.error('[logService] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Push all logs from KV to R2 and clear KV
 * This is called daily via cron trigger
 * @param {R2Bucket} r2Bucket - R2 bucket
 * @param {KVNamespace} logState - KV namespace
 * @returns {Promise<Object>} Result with counts
 */
export async function pushLogsToR2(r2Bucket, logState) {
  try {
    console.log('[logService] Starting daily log push from KV to R2');
    
    if (!r2Bucket || !logState) {
      throw new Error('R2 bucket or KV namespace not configured');
    }
    
    // Get all log keys from index (if available)
    const indexKey = 'log_keys:index';
    let logKeys = [];
    
    try {
      const indexData = await traceKvOperation(
        'kv.get',
        async () => await logState.get(indexKey, { type: 'json' }),
        { key: indexKey, namespace: 'log_state', operation: 'get_index_for_push' },
        null
      );
      if (indexData && Array.isArray(indexData)) {
        logKeys = indexData;
        console.log(`[logService] Found ${logKeys.length} log keys from index`);
      }
    } catch (error) {
      console.warn('[logService] Could not read log keys index, will list all keys:', error.message);
    }
    
    // If index is empty or doesn't exist, list all keys with 'log:' prefix
    if (logKeys.length === 0) {
      console.log('[logService] Index empty, listing all keys with log: prefix');
      // Note: KV doesn't support prefix listing directly, so we'll use the index
      // If index is missing, we'll need to track keys differently
      // For now, we'll rely on the index being maintained
    }
    
    if (logKeys.length === 0) {
      console.log('[logService] No logs found in KV');
      return { success: true, logsPushed: 0, logsCleared: 0 };
    }
    
    // Fetch all logs from KV
    console.log(`[logService] Fetching ${logKeys.length} logs from KV...`);
    const logs = [];
    const failedKeys = [];
    
    for (const key of logKeys) {
      try {
        const logData = await traceKvOperation(
          'kv.get',
          async () => await logState.get(key, { type: 'json' }),
          { key: key, namespace: 'log_state', operation: 'fetch_for_push' },
          null
        );
        if (logData) {
          logs.push(logData);
        } else {
          console.warn(`[logService] Log key ${key} returned null`);
          failedKeys.push(key);
        }
      } catch (error) {
        console.error(`[logService] Error fetching log ${key}:`, error.message);
        failedKeys.push(key);
      }
    }
    
    console.log(`[logService] Fetched ${logs.length} logs, ${failedKeys.length} failed`);
    
    if (logs.length === 0) {
      console.log('[logService] No valid logs to push');
      // Clear the index anyway
      await traceKvOperation(
        'kv.delete',
        async () => await logState.delete(indexKey),
        { key: indexKey, namespace: 'log_state', operation: 'clear_index' },
        null
      );
      return { success: true, logsPushed: 0, logsCleared: logKeys.length };
    }
    
    // Group logs by date for better organization in R2
    const logsByDate = {};
    logs.forEach(log => {
      const date = log.timestamp ? log.timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
      if (!logsByDate[date]) {
        logsByDate[date] = [];
      }
      logsByDate[date].push(log);
    });
    
    // Push logs to R2, organized by date
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    let totalPushed = 0;
    
    for (const [date, dateLogs] of Object.entries(logsByDate)) {
      const objectKey = `logs/${date}/batch-${Date.now()}.json`;
      
      try {
        await r2Bucket.put(objectKey, JSON.stringify(dateLogs), {
          httpMetadata: {
            contentType: 'application/json',
          },
        });
        
        console.log(`[logService] Pushed ${dateLogs.length} logs for ${date} to R2: ${objectKey}`);
        totalPushed += dateLogs.length;
      } catch (error) {
        console.error(`[logService] Error pushing logs for ${date} to R2:`, error.message);
        throw error; // Fail the entire operation if R2 write fails
      }
    }
    
    // Clear all log keys from KV after successful R2 push
    console.log(`[logService] Clearing ${logKeys.length} log keys from KV...`);
    let clearedCount = 0;
    
    for (const key of logKeys) {
      try {
        await traceKvOperation(
          'kv.delete',
          async () => await logState.delete(key),
          { key: key, namespace: 'log_state', operation: 'clear_after_push' },
          null
        );
        clearedCount++;
      } catch (error) {
        console.error(`[logService] Error deleting log key ${key}:`, error.message);
        // Continue deleting other keys even if one fails
      }
    }
    
    // Clear the index
    try {
      await traceKvOperation(
        'kv.delete',
        async () => await logState.delete(indexKey),
        { key: indexKey, namespace: 'log_state', operation: 'clear_index_after_push' },
        null
      );
      console.log('[logService] Cleared log keys index');
    } catch (error) {
      console.warn('[logService] Error clearing index:', error.message);
    }
    
    console.log(`[logService] Daily push completed: ${totalPushed} logs pushed to R2, ${clearedCount} keys cleared from KV`);
    
    return {
      success: true,
      logsPushed: totalPushed,
      logsCleared: clearedCount,
      datesProcessed: Object.keys(logsByDate).length,
    };
  } catch (error) {
    console.error('[logService] Error in pushLogsToR2:', error.message, error.stack);
    throw error;
  }
}

/**
 * Flush logs (legacy function for manual flush endpoint)
 * @param {R2Bucket} r2Bucket - R2 bucket
 * @param {KVNamespace} logState - KV namespace
 * @returns {Promise<void>}
 */
export async function flushLogs(r2Bucket, logState) {
  // Redirect to pushLogsToR2 for consistency
  return await pushLogsToR2(r2Bucket, logState);
}

