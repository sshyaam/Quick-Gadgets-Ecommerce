/**
 * Tests for profileService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getProfile,
  updateProfile,
  addSavedAddress,
  updateSavedAddress,
  deleteSavedAddress,
  getProfilesBatch,
} from './profileService.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';
import { encrypt, decrypt } from '../../shared/utils/encryption.js';

describe('profileService', () => {
  let mockDb;
  const encryptionKey = 'test-encryption-key-32-chars-long!!';
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getProfile', () => {
    it('should return user profile successfully', async () => {
      const userId = 'user-id';
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        contactNumber: '9876543210',
        savedAddresses: [],
      };
      const encryptedData = encrypt(JSON.stringify(userData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
      ]);
      
      const result = await getProfile(userId, mockDb, encryptionKey);
      
      expect(result).to.have.property('userId', userId);
      expect(result).to.have.property('email', userData.email);
      expect(result).to.have.property('name', userData.name);
      expect(result).to.not.have.property('password');
      expect(result).to.have.property('savedAddresses');
    });
    
    it('should initialize savedAddresses if missing', async () => {
      const userId = 'user-id';
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
      };
      const encryptedData = encrypt(JSON.stringify(userData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
      ]);
      
      const result = await getProfile(userId, mockDb, encryptionKey);
      
      expect(result).to.have.property('savedAddresses');
      expect(result.savedAddresses).to.be.an('array');
    });
    
    it('should throw NotFoundError if user does not exist', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      try {
        await getProfile('non-existent-user', mockDb, encryptionKey);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
  });
  
  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const userId = 'user-id';
      const existingData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed-password',
        savedAddresses: [],
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const updates = { name: 'Updated Name' };
      const result = await updateProfile(userId, updates, mockDb, encryptionKey);
      
      expect(result).to.have.property('name', 'Updated Name');
      expect(result).to.not.have.property('password');
    });
    
    it('should not allow password updates through this endpoint', async () => {
      const userId = 'user-id';
      const existingData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'old-hashed-password',
        savedAddresses: [],
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const updates = { password: 'new-password' };
      const result = await updateProfile(userId, updates, mockDb, encryptionKey);
      
      // Password should not be updated
      expect(result).to.not.have.property('password');
    });
    
    it('should throw NotFoundError if user does not exist', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      try {
        await updateProfile('non-existent-user', {}, mockDb, encryptionKey);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
  });
  
  describe('addSavedAddress', () => {
    it('should add saved address successfully', async () => {
      const userId = 'user-id';
      const existingData = {
        email: 'test@example.com',
        name: 'Test User',
        savedAddresses: [],
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const address = {
        name: 'John Doe',
        contactNumber: '9876543210',
        doorNumber: '123',
        street: 'Main St',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra',
      };
      
      const result = await addSavedAddress(userId, address, mockDb, encryptionKey);
      
      expect(result).to.have.property('savedAddresses');
      expect(result.savedAddresses).to.be.an('array');
      expect(result.savedAddresses.length).to.equal(1);
      expect(result.savedAddresses[0]).to.have.property('addressId');
      expect(result.savedAddresses[0]).to.have.property('name', address.name);
    });
    
    it('should initialize savedAddresses array if missing', async () => {
      const userId = 'user-id';
      const existingData = {
        email: 'test@example.com',
        name: 'Test User',
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const address = {
        name: 'John Doe',
        contactNumber: '9876543210',
        doorNumber: '123',
        street: 'Main St',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra',
      };
      
      const result = await addSavedAddress(userId, address, mockDb, encryptionKey);
      
      expect(result.savedAddresses).to.be.an('array');
      expect(result.savedAddresses.length).to.equal(1);
    });
  });
  
  describe('updateSavedAddress', () => {
    it('should update saved address successfully', async () => {
      const userId = 'user-id';
      const addressId = 'address-id';
      const existingData = {
        email: 'test@example.com',
        name: 'Test User',
        savedAddresses: [
          {
            addressId,
            name: 'John Doe',
            contactNumber: '9876543210',
            doorNumber: '123',
            street: 'Main St',
            pincode: '400001',
            city: 'Mumbai',
            state: 'Maharashtra',
          },
        ],
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const updates = { name: 'Jane Doe', doorNumber: '456' };
      const result = await updateSavedAddress(userId, addressId, updates, mockDb, encryptionKey);
      
      expect(result.savedAddresses[0]).to.have.property('name', 'Jane Doe');
      expect(result.savedAddresses[0]).to.have.property('doorNumber', '456');
      expect(result.savedAddresses[0]).to.have.property('updatedAt');
    });
    
    it('should throw NotFoundError if address does not exist', async () => {
      const userId = 'user-id';
      const existingData = {
        email: 'test@example.com',
        savedAddresses: [],
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
      ]);
      
      try {
        await updateSavedAddress(userId, 'non-existent-address', {}, mockDb, encryptionKey);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
        expect(error.message).to.include('Address');
      }
    });
  });
  
  describe('deleteSavedAddress', () => {
    it('should delete saved address successfully', async () => {
      const userId = 'user-id';
      const addressId = 'address-id';
      const existingData = {
        email: 'test@example.com',
        savedAddresses: [
          { addressId, name: 'John Doe' },
          { addressId: 'address-2', name: 'Jane Doe' },
        ],
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await deleteSavedAddress(userId, addressId, mockDb, encryptionKey);
      
      expect(result.savedAddresses.length).to.equal(1);
      expect(result.savedAddresses[0].addressId).to.equal('address-2');
    });
    
    it('should throw NotFoundError if address does not exist', async () => {
      const userId = 'user-id';
      const existingData = {
        email: 'test@example.com',
        savedAddresses: [],
      };
      const encryptedData = encrypt(JSON.stringify(existingData), encryptionKey);
      
      const mockUser = {
        user_id: userId,
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
      ]);
      
      try {
        await deleteSavedAddress(userId, 'non-existent-address', mockDb, encryptionKey);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
        expect(error.message).to.include('Address');
      }
    });
  });
  
  describe('getProfilesBatch', () => {
    it('should return multiple profiles', async () => {
      const userIds = ['user-1', 'user-2'];
      const user1Data = { email: 'user1@example.com', name: 'User 1' };
      const user2Data = { email: 'user2@example.com', name: 'User 2' };
      
      const mockUsers = [
        {
          user_id: 'user-1',
          data: encrypt(JSON.stringify(user1Data), encryptionKey),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          user_id: 'user-2',
          data: encrypt(JSON.stringify(user2Data), encryptionKey),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockUsers, success: true } },
      ]);
      
      const result = await getProfilesBatch(userIds, mockDb, encryptionKey);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(2);
      expect(result[0]).to.have.property('userId', 'user-1');
      expect(result[1]).to.have.property('userId', 'user-2');
    });
    
    it('should return empty array for empty user IDs', async () => {
      const result = await getProfilesBatch([], mockDb, encryptionKey);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(0);
    });
    
    it('should skip corrupted data and continue', async () => {
      const userIds = ['user-1', 'user-2'];
      const user1Data = { email: 'user1@example.com', name: 'User 1' };
      
      const mockUsers = [
        {
          user_id: 'user-1',
          data: encrypt(JSON.stringify(user1Data), encryptionKey),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          user_id: 'user-2',
          data: 'invalid-encrypted-data',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockUsers, success: true } },
      ]);
      
      const result = await getProfilesBatch(userIds, mockDb, encryptionKey);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(1);
      expect(result[0]).to.have.property('userId', 'user-1');
    });
  });
});

