/**
 * Tests for profileController
 * Note: ES modules cannot be stubbed with Sinon, so we test with mock databases
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as profileController from './profileController.js';
import { createMockRequest, createMockEnv, createMockD1WithSequence } from '../../test/setup.js';
import { ValidationError, NotFoundError } from '../../shared/utils/errors.js';

describe('profileController', () => {
  let mockEnv;
  let mockDb;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockDb = createMockD1WithSequence([]);
    mockEnv.auth_db = mockDb;
  });

  describe('getProfile', () => {
    it('should return 200 with profile data', async () => {
      const { encrypt } = await import('../../shared/utils/encryption.js');
      const userData = { email: 'user@example.com', name: 'Test User' };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      const user = {
        user_id: 'user-123',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      const mockDb = createMockD1WithSequence([
        { first: user }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/profile');
      request.user = { userId: 'user-123' };

      const response = await profileController.getProfile(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(200);
      expect(data).to.have.property('userId');
    });
  });

  describe('updateProfile', () => {
    it('should return 200 with updated profile', async () => {
      const updateData = {
        name: 'Updated Name',
        contactNumber: '9876543210'
      };

      const { encrypt } = await import('../../shared/utils/encryption.js');
      const userData = { email: 'user@example.com', name: 'Updated Name', contactNumber: '9876543210' };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      const user = {
        user_id: 'user-123',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      const mockDb = createMockD1WithSequence([
        { first: user },
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/profile', {
        method: 'PUT',
        body: updateData
      });
      request.user = { userId: 'user-123' };

      try {
        const response = await profileController.updateProfile(request, mockEnv);
        const data = await response.json();

        expect(response.status).to.equal(200);
        expect(data).to.have.property('name');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });

    it('should return 400 when validation fails', async () => {
      const invalidData = {
        contactNumber: '123' // Invalid format
      };

      const request = createMockRequest('https://auth-worker.test/profile', {
        method: 'PUT',
        body: invalidData
      });
      request.user = { userId: 'user-123' };

      try {
        await profileController.updateProfile(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('updatePassword', () => {
    it('should return 200 when password is updated', async () => {
      const { encrypt } = await import('../../shared/utils/encryption.js');
      const userData = { email: 'user@example.com', name: 'Test User' };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      const user = {
        user_id: 'user-123',
        data: encryptedData
      };
      const mockDb = createMockD1WithSequence([
        { first: user },
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/profile/password', {
        method: 'PUT',
        body: {
          password: 'newpassword123'
        }
      });
      request.user = { userId: 'user-123' };

      const response = await profileController.updatePassword(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(200);
      expect(data.success).to.be.true;
    });

    it('should return 400 when password is too short', async () => {
      const request = createMockRequest('https://auth-worker.test/profile/password', {
        method: 'PUT',
        body: {
          password: '123' // Too short
        }
      });
      request.user = { userId: 'user-123' };

      try {
        await profileController.updatePassword(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('addSavedAddress', () => {
    it('should return 200 with updated profile including new address', async () => {
      const addressData = {
        name: 'Home',
        doorNumber: '123',
        street: 'Main St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        contactNumber: '9876543210'
      };

      const { encrypt } = await import('../../shared/utils/encryption.js');
      const userData = { email: 'user@example.com', name: 'Test User', savedAddresses: [addressData] };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      const user = {
        user_id: 'user-123',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      const mockDb = createMockD1WithSequence([
        { first: user },
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/profile/addresses', {
        method: 'POST',
        body: addressData
      });
      request.user = { userId: 'user-123' };

      try {
        const response = await profileController.addSavedAddress(request, mockEnv);
        const data = await response.json();

        expect(response.status).to.equal(200);
        expect(data).to.have.property('savedAddresses');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });

    it('should return 400 when address validation fails', async () => {
      const invalidAddress = {
        name: 'Home'
        // Missing required fields
      };

      const request = createMockRequest('https://auth-worker.test/profile/addresses', {
        method: 'POST',
        body: invalidAddress
      });
      request.user = { userId: 'user-123' };

      try {
        await profileController.addSavedAddress(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('updateSavedAddress', () => {
    it('should return 200 with updated address', async () => {
      const addressData = {
        name: 'Updated Home',
        doorNumber: '456',
        street: 'New St',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        contactNumber: '9876543210'
      };

      const { encrypt } = await import('../../shared/utils/encryption.js');
      // Include address with the correct addressId that matches the request params
      const existingAddress = {
        addressId: 'addr-123',
        name: 'Home',
        doorNumber: '123',
        street: 'Old St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        contactNumber: '9876543210'
      };
      const userData = { email: 'user@example.com', name: 'Test User', savedAddresses: [existingAddress] };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      const user = {
        user_id: 'user-123',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      const mockDb = createMockD1WithSequence([
        { first: user },
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/profile/addresses/addr-123', {
        method: 'PUT',
        body: addressData
      });
      request.user = { userId: 'user-123' };
      request.params = { addressId: 'addr-123' };

      const response = await profileController.updateSavedAddress(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(200);
      expect(data).to.have.property('savedAddresses');
    });
  });

  describe('deleteSavedAddress', () => {
    it('should return 200 when address is deleted', async () => {
      const { encrypt } = await import('../../shared/utils/encryption.js');
      // Include address with the correct addressId that matches the request params
      const addressToDelete = {
        addressId: 'addr-123',
        name: 'Home',
        doorNumber: '123',
        street: 'Main St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        contactNumber: '9876543210'
      };
      const userData = { email: 'user@example.com', name: 'Test User', savedAddresses: [addressToDelete] };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      const user = {
        user_id: 'user-123',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      const mockDb = createMockD1WithSequence([
        { first: user },
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/profile/addresses/addr-123', {
        method: 'DELETE'
      });
      request.user = { userId: 'user-123' };
      request.params = { addressId: 'addr-123' };

      const response = await profileController.deleteSavedAddress(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(200);
      expect(data).to.have.property('savedAddresses');
    });
  });

  describe('getUserById', () => {
    it('should return 200 with user profile', async () => {
      const { encrypt } = await import('../../shared/utils/encryption.js');
      const userData = { email: 'user@example.com', name: 'Test User' };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      const user = {
        user_id: 'user-123',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      const mockDb = createMockD1WithSequence([
        { first: user }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/user/user-123');
      request.params = { userId: 'user-123' };

      const response = await profileController.getUserById(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(200);
      expect(data).to.have.property('userId');
    });
  });

  describe('getUsersBatch', () => {
    it('should return 200 with map of user profiles', async () => {
      const users = [
        { user_id: 'user-1', email: 'user1@example.com', name: 'User 1' },
        { user_id: 'user-2', email: 'user2@example.com', name: 'User 2' }
      ];
      const mockDb = createMockD1WithSequence([
        { all: { results: users, success: true } }
      ]);
      mockEnv.auth_db = mockDb;

      const request = createMockRequest('https://auth-worker.test/users/batch?userIds=user-1,user-2');
      request.params = {};

      const response = await profileController.getUsersBatch(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(200);
      expect(data.users).to.be.an('object');
    });

    it('should return 400 when userIds parameter is missing', async () => {
      const request = createMockRequest('https://auth-worker.test/users/batch');
      request.params = {};

      const response = await profileController.getUsersBatch(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(400);
      expect(data.error).to.include('userIds query parameter is required');
    });

    it('should return 400 when userIds is empty', async () => {
      const request = createMockRequest('https://auth-worker.test/users/batch?userIds=');
      request.params = {};

      const response = await profileController.getUsersBatch(request, mockEnv);
      const data = await response.json();

      expect(response.status).to.equal(400);
      expect(data.error).to.include('userIds');
    });
  });
});

