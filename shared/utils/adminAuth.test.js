/**
 * Tests for adminAuth utility
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as adminAuth from './adminAuth.js';
import { AuthenticationError, AuthorizationError } from './errors.js';
import { createMockEnv, createMockRequest } from '../../test/setup.js';

describe('adminAuth', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  describe('authenticateAdmin', () => {
    it('should throw AuthorizationError for non-admin user', async () => {
      const regularUser = {
        userId: 'user-1',
        email: 'user@test.com',
        isAdmin: false
      };
      
      const request = createMockRequest('https://example.com/admin', {
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      });
      
      // Mock auth worker to return user profile
      mockEnv.auth_worker._setResponse('GET', '/profile', regularUser);
      
      try {
        await adminAuth.authenticateAdmin(request, mockEnv);
        expect.fail('Should have thrown AuthorizationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthorizationError);
        expect(error.message).to.include('Admin access required');
      }
    });

    it('should throw AuthenticationError when user is not authenticated', async () => {
      const request = createMockRequest('https://example.com/admin');
      
      // Mock auth worker to return 401
      mockEnv.auth_worker._setResponse('GET', '/profile', null, { status: 401 });
      
      try {
        await adminAuth.authenticateAdmin(request, mockEnv);
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });
  });
});

