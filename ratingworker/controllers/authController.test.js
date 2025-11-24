/**
 * Tests for ratingworker authController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as authController from './authController.js';
import jwt from 'jsonwebtoken';
import { createMockEnv, createMockRequest } from '../../test/setup.js';

describe('ratingworker authController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockEnv.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!!';
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
  });

  describe('authenticate', () => {
    it('should return 401 when no access token is provided', async () => {
      const request = createMockRequest('https://example.com/rating');
      
      const response = await authController.authenticate(request, mockEnv);
      
      expect(response).to.be.instanceOf(Response);
      expect(response.status).to.equal(401);
      const data = await response.json();
      expect(data.error.code).to.equal('AUTHENTICATION_ERROR');
    });

    it('should return 401 when token is invalid', async () => {
      const request = createMockRequest('https://example.com/rating', {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });
      
      const response = await authController.authenticate(request, mockEnv);
      
      expect(response).to.be.instanceOf(Response);
      expect(response.status).to.equal(401);
      const data = await response.json();
      expect(data.error.code).to.equal('AUTHENTICATION_ERROR');
    });

    it('should return 401 when session verification fails', async () => {
      const token = jwt.sign(
        { userId: 'user-123', sessionId: 'session-123' },
        mockEnv.ENCRYPTION_KEY
      );
      
      const request = createMockRequest('https://example.com/rating', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Mock auth worker to return 404
      mockEnv.auth_worker._setResponse('GET', '/session/session-123', null, { status: 404 });
      
      const response = await authController.authenticate(request, mockEnv);
      
      expect(response).to.be.instanceOf(Response);
      expect(response.status).to.equal(401);
      const data = await response.json();
      expect(data.error.code).to.equal('AUTHENTICATION_ERROR');
    });

    it('should set request.user when authentication succeeds', async () => {
      const token = jwt.sign(
        { userId: 'user-123', sessionId: 'session-123' },
        mockEnv.ENCRYPTION_KEY
      );
      
      const request = createMockRequest('https://example.com/rating', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Mock auth worker to return valid session
      mockEnv.auth_worker._setResponse('GET', '/session/session-123', { sessionId: 'session-123', userId: 'user-123' });
      
      const response = await authController.authenticate(request, mockEnv);
      
      expect(response).to.be.null; // Returns null to continue
      expect(request.user).to.have.property('userId', 'user-123');
      expect(request.user).to.have.property('sessionId', 'session-123');
    });
  });
});

