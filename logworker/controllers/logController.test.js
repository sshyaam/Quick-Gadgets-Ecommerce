/**
 * Tests for logController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as logController from './logController.js';
import { ValidationError, AuthenticationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockKV, createMockR2 } from '../../test/setup.js';

describe('logController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockEnv.log_bucket = createMockR2();
    mockEnv.log_state = createMockKV();
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
  });

  describe('healthCheck', () => {
    it('should return healthy status when bindings are accessible', async () => {
      const request = createMockRequest('https://example.com/health');
      
      // Ensure bindings have head and get methods
      mockEnv.log_bucket.head = async () => ({});
      mockEnv.log_state.get = async () => null;
      
      const response = await logController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.equal('log-worker');
      expect(data).to.have.property('timestamp');
    });

    it('should return unhealthy status when bindings are missing', async () => {
      const request = createMockRequest('https://example.com/health');
      delete mockEnv.log_bucket;
      delete mockEnv.log_state;
      
      const response = await logController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      expect(data.service).to.equal('log-worker');
      expect(data).to.have.property('error');
    });

    it('should return unhealthy status when R2 fails', async () => {
      const request = createMockRequest('https://example.com/health');
      mockEnv.log_bucket.head = async () => {
        throw new Error('R2 connection failed');
      };
      
      const response = await logController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
    });
  });

  describe('validateWorkerRequest', () => {
    it('should throw AuthenticationError when API key is invalid', async () => {
      const request = createMockRequest('https://example.com/log', {
        headers: {
          'X-API-Key': 'wrong-key',
          'X-Worker-Request': 'true'
        }
      });
      
      try {
        await logController.validateWorkerRequest(request, mockEnv);
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });

    it('should throw AuthenticationError when API key is not configured', async () => {
      delete mockEnv.INTER_WORKER_API_KEY;
      const request = createMockRequest('https://example.com/log', {
        headers: {
          'X-API-Key': 'test-key',
          'X-Worker-Request': 'true'
        }
      });
      
      try {
        await logController.validateWorkerRequest(request, mockEnv);
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect(error.message).to.include('API key not configured');
      }
    });

    it('should not throw when API key is valid', async () => {
      const request = createMockRequest('https://example.com/log', {
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        }
      });
      
      // Should not throw
      await logController.validateWorkerRequest(request, mockEnv);
    });
  });

  describe('receiveLog', () => {
    it('should return 400 when body is invalid', async () => {
      const request = createMockRequest('https://example.com/log', {
        method: 'POST',
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        },
        body: JSON.stringify({}) // Missing required fields: level, message
      });
      
      // Ensure log_bucket and log_state are set
      if (!mockEnv.log_bucket) {
        mockEnv.log_bucket = createMockR2();
      }
      if (!mockEnv.log_state) {
        mockEnv.log_state = createMockKV();
      }
      
      const response = await logController.receiveLog(request, mockEnv);
      const data = await response.json();
      
      // receiveLog returns a Response with 400 status for validation errors
      expect(response.status).to.equal(400);
      expect(data).to.have.property('success', false);
      expect(data).to.have.property('error');
    });
  });
});

