/**
 * Database utility functions
 * Handles transactions and common database operations
 * Enhanced with OpenTelemetry tracing
 */

// Sample thing to see if runners are deploying everything

import { traceDbOperation } from './otel.js';

/**
 * Execute a database transaction
 * Note: D1 doesn't support explicit transactions (BEGIN/COMMIT/ROLLBACK)
 * D1 operations are already atomic, so this function just executes the callback
 * Includes OpenTelemetry tracing
 * @param {D1Database} db - D1 database instance
 * @param {Function} callback - Async function that performs DML operations
 * @param {Object} attributes - Optional attributes for tracing (e.g., { table: 'users', operation: 'insert' })
 * @returns {Promise<any>} Result of the callback
 */
export async function executeTransaction(db, callback, attributes = {}) {
  if (!db || typeof callback !== 'function') {
    throw new Error('Database instance and callback function are required');
  }

  // Wrap in OpenTelemetry span
  const operation = attributes.operation || 'db.transaction';
  return await traceDbOperation(operation, async () => {
    // D1 doesn't support explicit transactions, but operations are atomic
    // Just execute the callback directly
    return await callback(db);
  }, attributes);
}

/**
 * Soft delete a record
 * @param {D1Database} db - D1 database instance
 * @param {string} table - Table name
 * @param {string} idColumn - ID column name
 * @param {string|number} id - Record ID
 * @returns {Promise<boolean>} True if successful
 */
export async function softDelete(db, table, idColumn, id) {
  const result = await db
    .prepare(`UPDATE ${table} SET deleted_at = ? WHERE ${idColumn} = ? AND deleted_at IS NULL`)
    .bind(new Date().toISOString(), id)
    .run();
  
  return result.success && result.meta.changes > 0;
}

/**
 * Query JSONB field using JSON_EXTRACT
 * @param {D1Database} db - D1 database instance
 * @param {string} table - Table name
 * @param {string} jsonbColumn - JSONB column name
 * @param {string} jsonPath - JSON path (e.g., '$.email', '$.address.city')
 * @param {any} value - Value to match
 * @returns {D1PreparedStatement} Prepared statement
 */
export function queryJsonbField(db, table, jsonbColumn, jsonPath, value) {
  return db
    .prepare(
      `SELECT * FROM ${table} 
       WHERE JSON_EXTRACT(${jsonbColumn}, ?) = ? 
       AND deleted_at IS NULL`
    )
    .bind(jsonPath, typeof value === 'string' ? value : JSON.stringify(value));
}

