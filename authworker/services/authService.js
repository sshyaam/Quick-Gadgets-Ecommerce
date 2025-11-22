/**
 * Authentication service
 * Handles JWT tokens, password hashing, and session management
 */

import jwt from 'jsonwebtoken';
import { createSession, getSessionById, getSessionByRefreshToken, updateSessionRefreshToken, deleteSession } from '../models/sessionModel.js';
import { createUser, getUserByEmail, getUserById } from '../models/userModel.js';
import { encrypt, decrypt } from '../../shared/utils/encryption.js';
import { sendLog } from '../../shared/utils/logger.js';
import { AuthenticationError, ConflictError, NotFoundError } from '../../shared/utils/errors.js';

/**
 * Hash password (simple implementation - in production use bcrypt)
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {Promise<boolean>} True if match
 */
async function verifyPassword(password, hashedPassword) {
  const hashed = await hashPassword(password);
  return hashed === hashedPassword;
}

/**
 * Generate access token (15 minutes)
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {string} secret - JWT secret
 * @returns {string} JWT access token
 */
export function generateAccessToken(userId, sessionId, secret) {
  return jwt.sign(
    { userId, sessionId, type: 'access' },
    secret,
    { expiresIn: '15m' }
  );
}

/**
 * Generate refresh token (7 days)
 * @returns {string} Refresh token
 */
export function generateRefreshToken() {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}

/**
 * Verify access token
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @returns {Object} Decoded token payload
 */
export function verifyAccessToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new AuthenticationError('Invalid or expired access token');
  }
}

/**
 * Sign up new user
 * @param {Object} userData - User registration data
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @param {string} logWorkerUrl - Log worker URL
 * @param {string} apiKey - API key for log worker
 * @returns {Promise<Object>} Created user and session
 */
export async function signup(userData, db, encryptionKey, logWorkerBindingOrUrl, apiKey, ctx = null) {
  // Normalize email (lowercase for case-insensitive matching)
  const normalizedEmail = userData.email.toLowerCase().trim();
  
  // Check if user already exists (pass encryption key to decrypt and search)
  const existingUser = await getUserByEmail(db, normalizedEmail, encryptionKey);
  if (existingUser) {
    throw new ConflictError('User with this email already exists');
  }

  // Hash password
  const hashedPassword = await hashPassword(userData.password);

  // Encrypt PII data (store normalized email)
  const piiData = {
    email: normalizedEmail,
    name: userData.name,
    contactNumber: userData.contactNumber || null,
    address: userData.address || null, // Keep for backward compatibility
    password: hashedPassword, // Store hashed password in encrypted data
    isAdmin: userData.isAdmin === true, // Store admin flag
    savedAddresses: [], // Initialize saved addresses array
  };

  // If address is provided during signup, add it to savedAddresses
  if (userData.address) {
    // Generate UUID using Web Crypto API (available in Cloudflare Workers)
    const addressId = crypto.randomUUID();
    const savedAddress = {
      addressId,
      ...userData.address,
      createdAt: new Date().toISOString(),
    };
    piiData.savedAddresses.push(savedAddress);
  }

  const encryptedData = encrypt(JSON.stringify(piiData), encryptionKey);

  // Create user
  const user = await createUser(db, userData, encryptedData);

  // Generate tokens
  const refreshToken = generateRefreshToken();
  const session = await createSession(db, user.userId, refreshToken);

  // Generate access token
  const accessToken = generateAccessToken(user.userId, session.sessionId, encryptionKey);

  await sendLog(logWorkerBindingOrUrl, 'event', 'User signed up', { userId: user.userId, worker: 'auth-worker' }, apiKey, ctx);

  return {
    userId: user.userId,
    sessionId: session.sessionId,
    accessToken,
    refreshToken,
  };
}

/**
 * Login user
 * @param {string} email - Email address
 * @param {string} password - Plain text password
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @param {string} logWorkerUrl - Log worker URL
 * @param {string} apiKey - API key for log worker
 * @returns {Promise<Object>} User session and tokens
 */
export async function login(email, password, db, encryptionKey, logWorkerBindingOrUrl, apiKey, ctx = null) {
  // Normalize email (lowercase for case-insensitive matching)
  const normalizedEmail = email.toLowerCase().trim();
  
  console.log('[auth-service] Login attempt for email:', normalizedEmail);
  
  // Get user by email (pass encryption key to decrypt and search)
  // Try both normalized and original email in case user was created before normalization
  let user = await getUserByEmail(db, normalizedEmail, encryptionKey);
  
  // If not found with normalized email, try original email (for backwards compatibility)
  if (!user && email !== normalizedEmail) {
    console.log('[auth-service] User not found with normalized email, trying original:', email);
    user = await getUserByEmail(db, email, encryptionKey);
  }
  
  if (!user) {
    console.log('[auth-service] User not found for email:', normalizedEmail, 'or', email);
    throw new AuthenticationError('Invalid email or password');
  }

  console.log('[auth-service] User found, decrypting data...');
  // Decrypt user data
  let decryptedData;
  try {
    decryptedData = JSON.parse(decrypt(user.data, encryptionKey));
  } catch (decryptError) {
    console.error('[auth-service] Failed to decrypt user data:', decryptError.message);
    throw new AuthenticationError('Invalid email or password');
  }
  
  console.log('[auth-service] Decrypted email from DB:', decryptedData.email);
  console.log('[auth-service] Decrypted data keys:', Object.keys(decryptedData || {}));
  console.log('[auth-service] Decrypted data (without password):', JSON.stringify({ ...decryptedData, password: '[REDACTED]' }));
  
  // Check for password field (might be stored differently)
  const storedPassword = decryptedData.password || decryptedData.hashedPassword || decryptedData.passwordHash;
  
  if (!decryptedData || !storedPassword) {
    console.error('[auth-service] Decrypted data missing password field');
    console.error('[auth-service] Available fields:', Object.keys(decryptedData || {}));
    console.error('[auth-service] Full decrypted data structure:', JSON.stringify(decryptedData, null, 2));
    
    // Special case: If user exists but has no password, this is a legacy user
    // We need to allow them to set a password, but they can't login without one
    // For now, throw error but with a helpful message
    throw new AuthenticationError(
      'Password not set for this account. Please contact support or create a new account. ' +
      'If you have access, you can set a password via PUT /profile/password endpoint.'
    );
  }
  
  console.log('[auth-service] Found password field, length:', storedPassword.length);

  console.log('[auth-service] Verifying password...');
  console.log('[auth-service] Password hash length in DB:', storedPassword?.length || 'missing');
  console.log('[auth-service] Input password length:', password?.length || 'missing');
  
  // Verify password - trim password to handle accidental whitespace
  const trimmedPassword = password.trim();
  const inputPasswordHash = await hashPassword(trimmedPassword);
  console.log('[auth-service] Input password hash length:', inputPasswordHash.length);
  console.log('[auth-service] Stored hash (first 20 chars):', storedPassword?.substring(0, 20) || 'missing');
  console.log('[auth-service] Input hash (first 20 chars):', inputPasswordHash.substring(0, 20));
  console.log('[auth-service] Hashes match:', inputPasswordHash === storedPassword);
  
  const isValidPassword = await verifyPassword(trimmedPassword, storedPassword);
  if (!isValidPassword) {
    console.log('[auth-service] Password verification failed');
    console.log('[auth-service] Full stored hash:', storedPassword);
    console.log('[auth-service] Full input hash:', inputPasswordHash);
    throw new AuthenticationError('Invalid email or password');
  }
  
  console.log('[auth-service] Password verified successfully');

  // Generate tokens
  const refreshToken = generateRefreshToken();
  const session = await createSession(db, user.user_id, refreshToken);

  // Generate access token
  const accessToken = generateAccessToken(user.user_id, session.sessionId, encryptionKey);

  await sendLog(logWorkerBindingOrUrl, 'event', 'User logged in', { userId: user.user_id, worker: 'auth-worker' }, apiKey, ctx);

  return {
    userId: user.user_id,
    sessionId: session.sessionId,
    accessToken,
    refreshToken,
  };
}

/**
 * Get user by email for password reset (checks if password exists)
 * @param {string} email - Email address
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object|null>} User with hasPassword flag or null
 */
export async function getUserByEmailForPasswordReset(email, db, encryptionKey) {
  const user = await getUserByEmail(db, email, encryptionKey);
  if (!user) {
    return null;
  }
  
  // Decrypt to check if password exists
  const decryptedData = JSON.parse(decrypt(user.data, encryptionKey));
  const hasPassword = !!(decryptedData.password || decryptedData.hashedPassword || decryptedData.passwordHash);
  
  return {
    userId: user.user_id,
    email: decryptedData.email,
    hasPassword,
  };
}

/**
 * Refresh access token
 * @param {string} refreshToken - Refresh token
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} New access token
 */
export async function refreshAccessToken(refreshToken, db, encryptionKey) {
  console.log('[auth-service] Refreshing token, looking up session...');
  console.log('[auth-service] Refresh token (first 20 chars):', refreshToken.substring(0, 20));
  
  // Get session by refresh token
  const session = await getSessionByRefreshToken(db, refreshToken);
  if (!session) {
    console.error('[auth-service] Session not found for refresh token');
    console.error('[auth-service] This could mean:');
    console.error('[auth-service]   1. Refresh token was already rotated (used twice)');
    console.error('[auth-service]   2. Session was deleted/logged out');
    console.error('[auth-service]   3. Session expired');
    console.error('[auth-service]   4. Refresh token is invalid');
    
    // Debug: Check if there are any sessions at all
    const allSessions = await db.prepare('SELECT COUNT(*) as count FROM sessions WHERE deleted_at IS NULL').first();
    console.log('[auth-service] Total active sessions in DB:', allSessions?.count || 0);
    
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  console.log('[auth-service] Session found:', {
    sessionId: session.session_id,
    userId: session.user_id,
    expiresAt: session.expires_at,
    currentRefreshToken: session.refresh_token.substring(0, 20) + '...'
  });

  // Generate new access token
  const accessToken = generateAccessToken(session.user_id, session.session_id, encryptionKey);

  // Rotate refresh token for security (prevents token reuse attacks)
  const newRefreshToken = generateRefreshToken();
  console.log('[auth-service] Rotating refresh token...');
  console.log('[auth-service] Old token (first 20):', session.refresh_token.substring(0, 20));
  console.log('[auth-service] New token (first 20):', newRefreshToken.substring(0, 20));
  
  const updateSuccess = await updateSessionRefreshToken(db, session.session_id, newRefreshToken);
  
  if (!updateSuccess) {
    console.error('[auth-service] Failed to update refresh token in session');
    console.error('[auth-service] Session ID:', session.session_id);
    throw new AuthenticationError('Failed to refresh token');
  }

  console.log('[auth-service] Refresh token rotated successfully in database');

  return {
    accessToken,
    refreshToken: newRefreshToken,
    sessionId: session.session_id, // Include sessionId for cookie setting
  };
}

/**
 * Logout user
 * @param {string} sessionId - Session ID
 * @param {D1Database} db - Database instance
 * @returns {Promise<boolean>} True if logged out
 */
export async function logout(sessionId, db) {
  return await deleteSession(db, sessionId);
}

/**
 * Authenticate request using access token
 * @param {string} accessToken - Access token
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} User and session data
 */
export async function authenticate(accessToken, db, encryptionKey) {
  // Verify token
  const decoded = verifyAccessToken(accessToken, encryptionKey);

  // Verify session exists and is valid
  const session = await getSessionById(db, decoded.sessionId);
  if (!session) {
    throw new AuthenticationError('Session not found or expired');
  }

  // Get user
  const user = await getUserById(db, decoded.userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  return {
    userId: user.user_id,
    sessionId: session.session_id,
    user,
  };
}

