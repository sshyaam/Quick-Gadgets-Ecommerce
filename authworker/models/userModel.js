/**
 * User model for auth worker
 * Stores user profile data with encrypted PII in JSONB format
 */

/**
 * Create user profile
 * @param {D1Database} db - Database instance
 * @param {Object} userData - User data (email, name, address, etc.)
 * @param {string} encryptedData - Encrypted PII data
 * @returns {Promise<Object>} Created user
 */
export async function createUser(db, userData, encryptedData) {
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const result = await db
    .prepare(
      `INSERT INTO users (user_id, data, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(userId, encryptedData, now, now)
    .run();
  
  if (!result.success) {
    throw new Error('Failed to create user');
  }
  
  return {
    userId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get user by ID
 * @param {D1Database} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User data or null
 */
export async function getUserById(db, userId) {
  const result = await db
    .prepare(
      `SELECT user_id, data, created_at, updated_at 
       FROM users 
       WHERE user_id = ? AND deleted_at IS NULL`
    )
    .bind(userId)
    .first();
  
  return result || null;
}

/**
 * Get user by email
 * Since data is encrypted, we need to get all users and decrypt to find the email
 * In production, consider storing email hash separately for faster lookup
 * @param {D1Database} db - Database instance
 * @param {string} email - Email address
 * @param {string} encryptionKey - Encryption key for decrypting data
 * @returns {Promise<Object|null>} User data or null
 */
export async function getUserByEmail(db, email, encryptionKey) {
  // Get all non-deleted users
  const results = await db
    .prepare(
      `SELECT user_id, data, created_at, updated_at 
       FROM users 
       WHERE deleted_at IS NULL`
    )
    .all();
  
  if (!results || !results.results || results.results.length === 0) {
    return null;
  }
  
  // Decrypt and find matching email (case-insensitive)
  const { decrypt } = await import('../../shared/utils/encryption.js');
  const normalizedSearchEmail = email.toLowerCase().trim();
  
  console.log('[user-model] Searching for email:', normalizedSearchEmail, '(normalized from:', email, ')');
  console.log('[user-model] Total users to check:', results.results.length);
  
  for (const user of results.results) {
    try {
      const decryptedData = JSON.parse(decrypt(user.data, encryptionKey));
      const storedEmail = decryptedData?.email;
      
      if (storedEmail) {
        const normalizedStoredEmail = storedEmail.toLowerCase().trim();
        console.log('[user-model] Checking stored email:', storedEmail, '(normalized:', normalizedStoredEmail, ')');
        
        if (normalizedStoredEmail === normalizedSearchEmail) {
          console.log('[user-model] Email match found!');
          return user;
        }
      }
    } catch (error) {
      // Skip corrupted data - log but continue searching
      console.error(`[user-model] Error decrypting user ${user.user_id}:`, error.message);
      continue;
    }
  }
  
  console.log('[user-model] No matching email found');
  
  return null;
}

/**
 * Update user profile
 * @param {D1Database} db - Database instance
 * @param {string} userId - User ID
 * @param {string} encryptedData - Updated encrypted PII data
 * @returns {Promise<boolean>} True if updated
 */
export async function updateUser(db, userId, encryptedData) {
  const result = await db
    .prepare(
      `UPDATE users 
       SET data = ?, updated_at = ? 
       WHERE user_id = ? AND deleted_at IS NULL`
    )
    .bind(encryptedData, new Date().toISOString(), userId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

/**
 * Soft delete user
 * @param {D1Database} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function softDeleteUser(db, userId) {
  const result = await db
    .prepare(
      `UPDATE users 
       SET deleted_at = ? 
       WHERE user_id = ? AND deleted_at IS NULL`
    )
    .bind(new Date().toISOString(), userId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

