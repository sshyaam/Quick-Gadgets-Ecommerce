/**
 * Tests for userModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
} from './userModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('userModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
      };
      const encryptedData = 'encrypted-pii-data';
      
      const result = await createUser(mockDb, userData, encryptedData);
      
      expect(result).to.have.property('userId');
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
      expect(result.userId).to.be.a('string');
      expect(result.userId.length).to.be.greaterThan(0);
    });
    
    it('should throw error if database operation fails', async () => {
      const userData = { email: 'test@example.com', name: 'Test' };
      const encryptedData = 'encrypted-data';
      
      // Mock database to fail
      mockDb.prepare = () => ({
        bind: () => ({
          run: async () => ({ success: false }),
        }),
      });
      
      try {
        await createUser(mockDb, userData, encryptedData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to create user');
      }
    });
  });
  
  describe('getUserById', () => {
    it('should return user when found', async () => {
      const userId = 'test-user-id';
      const mockUser = {
        user_id: userId,
        data: '{"email":"test@example.com"}',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockUser },
      ]);
      
      const result = await getUserById(mockDb, userId);
      
      expect(result).to.not.be.null;
      expect(result.user_id).to.equal(userId);
    });
    
    it('should return null when user not found', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getUserById(mockDb, 'non-existent-id');
      
      expect(result).to.be.null;
    });
    
    it('should return null when user is soft deleted', async () => {
      const userId = 'deleted-user-id';
      const mockUser = {
        user_id: userId,
        data: '{"email":"test@example.com"}',
        deleted_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: null }, // Query excludes deleted_at IS NULL
      ]);
      
      const result = await getUserById(mockDb, userId);
      
      expect(result).to.be.null;
    });
  });
  
  describe('getUserByEmail', () => {
    it('should return user when found by email', async () => {
      const email = 'test@example.com';
      const { encrypt } = await import('../../shared/utils/encryption.js');
      const encryptedData = encrypt(JSON.stringify({ email: 'test@example.com' }), 'encryption-key');
      const mockUser = {
        user_id: 'user-id',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockUser], success: true } },
      ]);
      
      const result = await getUserByEmail(mockDb, email, 'encryption-key');
      
      expect(result).to.not.be.null;
      expect(result.user_id).to.equal('user-id');
    });
    
    it('should return null when user not found', async () => {
      mockDb = createMockD1WithSequence([
        { all: { results: [], success: true } },
      ]);
      
      const result = await getUserByEmail(mockDb, 'notfound@example.com', 'key');
      
      expect(result).to.be.null;
    });
    
    it('should normalize email to lowercase', async () => {
      const email = 'Test@Example.COM';
      const { encrypt } = await import('../../shared/utils/encryption.js');
      const encryptedData = encrypt(JSON.stringify({ email: 'test@example.com' }), 'key');
      const mockUser = {
        user_id: 'user-id',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockUser], success: true } },
      ]);
      
      const result = await getUserByEmail(mockDb, email, 'key');
      
      // Should find user even with different case
      expect(result).to.not.be.null;
    });
  });
  
  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const userId = 'test-user-id';
      const encryptedData = 'updated-encrypted-data';
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        },
      ]);
      
      const result = await updateUser(mockDb, userId, encryptedData);
      
      expect(result).to.be.true;
    });
    
    it('should return false if user not found', async () => {
      const userId = 'non-existent-id';
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 },
          },
        },
      ]);
      
      const result = await updateUser(mockDb, userId, 'data');
      
      expect(result).to.be.false;
    });
  });
});

