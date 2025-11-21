/**
 * Profile service
 * Handles user profile operations
 */

import { getUserById, updateUser } from '../models/userModel.js';
import { encrypt, decrypt } from '../../shared/utils/encryption.js';
import { NotFoundError } from '../../shared/utils/errors.js';

/**
 * Get user profile
 * @param {string} userId - User ID
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} User profile (decrypted)
 */
export async function getProfile(userId, db, encryptionKey) {
  const user = await getUserById(db, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Decrypt user data
  const decryptedData = JSON.parse(decrypt(user.data, encryptionKey));

  // Initialize savedAddresses array if it doesn't exist
  if (!decryptedData.savedAddresses) {
    decryptedData.savedAddresses = [];
  }

  // Initialize isAdmin if not present (default to false for existing users)
  if (decryptedData.isAdmin === undefined) {
    decryptedData.isAdmin = false;
  }

  // Remove sensitive data before returning
  const { password, ...profileData } = decryptedData;

  return {
    userId: user.user_id,
    ...profileData,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updates - Profile updates
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} Updated profile
 */
export async function updateProfile(userId, updates, db, encryptionKey) {
  const user = await getUserById(db, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Decrypt existing data
  const existingData = JSON.parse(decrypt(user.data, encryptionKey));

  // Initialize savedAddresses array if it doesn't exist
  if (!existingData.savedAddresses) {
    existingData.savedAddresses = [];
  }

  // Merge updates (don't allow password updates through this endpoint)
  const { password, ...updatedData } = {
    ...existingData,
    ...updates,
  };

  // Re-encrypt
  const encryptedData = encrypt(JSON.stringify(updatedData), encryptionKey);

  // Update in database
  const success = await updateUser(db, userId, encryptedData);
  if (!success) {
    throw new Error('Failed to update profile');
  }

  // Return updated profile (without password)
  return {
    userId,
    ...updatedData,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add saved address to user profile
 * @param {string} userId - User ID
 * @param {Object} address - Address data
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} Updated profile
 */
export async function addSavedAddress(userId, address, db, encryptionKey) {
  const user = await getUserById(db, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Decrypt existing data
  const existingData = JSON.parse(decrypt(user.data, encryptionKey));

  // Initialize savedAddresses array if it doesn't exist
  if (!existingData.savedAddresses) {
    existingData.savedAddresses = [];
  }

  // Generate address ID and add to array
  const addressId = crypto.randomUUID();
  const newAddress = {
    addressId,
    ...address,
    createdAt: new Date().toISOString(),
  };
  existingData.savedAddresses.push(newAddress);

  // Re-encrypt
  const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);

  // Update in database
  const success = await updateUser(db, userId, encryptedData);
  if (!success) {
    throw new Error('Failed to add address');
  }

  // Return updated profile (without password)
  const { password, ...profileData } = existingData;
  return {
    userId,
    ...profileData,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update saved address in user profile
 * @param {string} userId - User ID
 * @param {string} addressId - Address ID
 * @param {Object} updates - Address updates
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} Updated profile
 */
export async function updateSavedAddress(userId, addressId, updates, db, encryptionKey) {
  const user = await getUserById(db, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Decrypt existing data
  const existingData = JSON.parse(decrypt(user.data, encryptionKey));

  // Initialize savedAddresses array if it doesn't exist
  if (!existingData.savedAddresses) {
    existingData.savedAddresses = [];
  }

  // Find and update address
  const addressIndex = existingData.savedAddresses.findIndex(addr => addr.addressId === addressId);
  if (addressIndex === -1) {
    throw new NotFoundError('Address');
  }

  existingData.savedAddresses[addressIndex] = {
    ...existingData.savedAddresses[addressIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Re-encrypt
  const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);

  // Update in database
  const success = await updateUser(db, userId, encryptedData);
  if (!success) {
    throw new Error('Failed to update address');
  }

  // Return updated profile (without password)
  const { password, ...profileData } = existingData;
  return {
    userId,
    ...profileData,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Delete saved address from user profile
 * @param {string} userId - User ID
 * @param {string} addressId - Address ID
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<Object>} Updated profile
 */
export async function deleteSavedAddress(userId, addressId, db, encryptionKey) {
  const user = await getUserById(db, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Decrypt existing data
  const existingData = JSON.parse(decrypt(user.data, encryptionKey));

  // Initialize savedAddresses array if it doesn't exist
  if (!existingData.savedAddresses) {
    existingData.savedAddresses = [];
  }

  // Remove address
  const initialLength = existingData.savedAddresses.length;
  existingData.savedAddresses = existingData.savedAddresses.filter(addr => addr.addressId !== addressId);
  
  if (existingData.savedAddresses.length === initialLength) {
    throw new NotFoundError('Address');
  }

  // Re-encrypt
  const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);

  // Update in database
  const success = await updateUser(db, userId, encryptedData);
  if (!success) {
    throw new Error('Failed to delete address');
  }

  // Return updated profile (without password)
  const { password, ...profileData } = existingData;
  return {
    userId,
    ...profileData,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update or set password for a user
 * This is used to fix users who were created without a password
 * @param {string} userId - User ID
 * @param {string} newPassword - New password (plain text)
 * @param {D1Database} db - Database instance
 * @param {string} encryptionKey - Encryption key
 * @returns {Promise<boolean>} True if updated
 */
export async function updatePassword(userId, newPassword, db, encryptionKey) {
  const { getUserById, updateUser } = await import('../models/userModel.js');
  const { encrypt, decrypt } = await import('../../shared/utils/encryption.js');
  
  // Import hashPassword function
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  const user = await getUserById(db, userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Decrypt existing data
  const existingData = JSON.parse(decrypt(user.data, encryptionKey));

  // Hash the new password
  const hashedPassword = await hashPassword(newPassword);

  // Update password in existing data
  const updatedData = {
    ...existingData,
    password: hashedPassword,
  };

  // Re-encrypt
  const encryptedData = encrypt(JSON.stringify(updatedData), encryptionKey);

  // Update in database
  const success = await updateUser(db, userId, encryptedData);
  if (!success) {
    throw new Error('Failed to update password');
  }

  return true;
}

