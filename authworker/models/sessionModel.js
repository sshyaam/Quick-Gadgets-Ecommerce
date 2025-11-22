/**
 * Session model for auth worker
 * Hybrid Session ID + JWT approach
 */

// Test change in auth worker

/**
 * Create session
 * @param {D1Database} db - Database instance
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} Created session
 */
export async function createSession(db, userId, refreshToken) {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  
  const result = await db
    .prepare(
      `INSERT INTO sessions (session_id, user_id, refresh_token, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(sessionId, userId, refreshToken, expiresAt, now, now)
    .run();
  
  if (!result.success) {
    throw new Error('Failed to create session');
  }
  
  return {
    sessionId,
    userId,
    expiresAt,
    createdAt: now,
  };
}

/**
 * Get session by session ID
 * @param {D1Database} db - Database instance
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Session data or null
 */
export async function getSessionById(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT session_id, user_id, refresh_token, expires_at, created_at, updated_at
       FROM sessions 
       WHERE session_id = ? AND deleted_at IS NULL`
    )
    .bind(sessionId)
    .first();
  
  if (!result) {
    return null;
  }
  
  // Check if session is expired
  if (new Date(result.expires_at) < new Date()) {
    return null;
  }
  
  return result;
}

/**
 * Get session by refresh token
 * @param {D1Database} db - Database instance
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object|null>} Session data or null
 */
export async function getSessionByRefreshToken(db, refreshToken) {
  const result = await db
    .prepare(
      `SELECT session_id, user_id, refresh_token, expires_at, created_at, updated_at
       FROM sessions 
       WHERE refresh_token = ? AND deleted_at IS NULL`
    )
    .bind(refreshToken)
    .first();
  
  if (!result) {
    return null;
  }
  
  // Check if session is expired
  if (new Date(result.expires_at) < new Date()) {
    return null;
  }
  
  return result;
}

/**
 * Update session refresh token
 * @param {D1Database} db - Database instance
 * @param {string} sessionId - Session ID
 * @param {string} newRefreshToken - New refresh token
 * @returns {Promise<boolean>} True if updated
 */
export async function updateSessionRefreshToken(db, sessionId, newRefreshToken) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  
  const result = await db
    .prepare(
      `UPDATE sessions 
       SET refresh_token = ?, expires_at = ?, updated_at = ? 
       WHERE session_id = ? AND deleted_at IS NULL`
    )
    .bind(newRefreshToken, expiresAt, new Date().toISOString(), sessionId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

/**
 * Delete session (logout)
 * @param {D1Database} db - Database instance
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteSession(db, sessionId) {
  const result = await db
    .prepare(
      `UPDATE sessions 
       SET deleted_at = ? 
       WHERE session_id = ? AND deleted_at IS NULL`
    )
    .bind(new Date().toISOString(), sessionId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

/**
 * Clean up expired sessions
 * @param {D1Database} db - Database instance
 * @returns {Promise<number>} Number of sessions deleted
 */
export async function cleanupExpiredSessions(db) {
  const result = await db
    .prepare(
      `UPDATE sessions 
       SET deleted_at = ? 
       WHERE expires_at < ? AND deleted_at IS NULL`
    )
    .bind(new Date().toISOString(), new Date().toISOString())
    .run();
  
  return result.meta.changes || 0;
}

