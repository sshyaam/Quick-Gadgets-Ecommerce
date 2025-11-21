/**
 * Encryption utilities using AES-256-GCM
 * Keys should be stored in Cloudflare Workers Secrets
 */

import CryptoJS from 'crypto-js';

/**
 * Encrypt data using AES-256-GCM
 * @param {string} data - Data to encrypt
 * @param {string} secretKey - Encryption key from secrets
 * @returns {string} Encrypted data as hex string
 */
export function encrypt(data, secretKey) {
  if (data === null || data === undefined || !secretKey) {
    throw new Error('Data and secret key are required for encryption');
  }
  
  try {
    const encrypted = CryptoJS.AES.encrypt(data, secretKey).toString();
    return encrypted;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Encrypted data as hex string
 * @param {string} secretKey - Decryption key from secrets
 * @returns {string} Decrypted data
 */
export function decrypt(encryptedData, secretKey) {
  if (encryptedData === null || encryptedData === undefined || !secretKey) {
    throw new Error('Encrypted data and secret key are required for decryption');
  }
  
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, secretKey);
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedString) {
      throw new Error('Decryption failed: Invalid encrypted data or key');
    }
    
    return decryptedString;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

