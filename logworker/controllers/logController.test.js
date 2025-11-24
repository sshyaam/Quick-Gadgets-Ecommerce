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

    it('should return 400 when body is empty', async () => {
      const request = createMockRequest('https://example.com/log', {
        method: 'POST',
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        },
        body: ''
      });
      
      const response = await logController.receiveLog(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(400);
      expect(data).to.have.property('success', false);
      expect(data.error).to.include('Empty request body');
    });

    it('should return 500 when log_state binding is missing', async () => {
      const request = createMockRequest('https://example.com/log', {
        method: 'POST',
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        },
        body: JSON.stringify({
          level: 'event',
          message: 'Test log'
        })
      });
      
      delete mockEnv.log_state;
      
      const response = await logController.receiveLog(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(500);
      expect(data).to.have.property('success', false);
      expect(data.error).to.include('KV namespace not configured');
    });

    it('should store log successfully', async () => {
      const request = createMockRequest('https://example.com/log', {
        method: 'POST',
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        },
        body: JSON.stringify({
          level: 'event',
          message: 'Test log message',
          worker: 'test-worker'
        })
      });
      
      // Mock KV to store log successfully
      mockEnv.log_state.get = async (key) => {
        if (key === 'log_keys:index') {
          return JSON.stringify(['log:123']);
        }
        return null;
      };
      mockEnv.log_state.put = async () => {};
      
      const response = await logController.receiveLog(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('success', true);
    });
  });

  describe('debugKvLogs', () => {
    it('should return debug logs from KV', async () => {
      const request = createMockRequest('https://example.com/logs/debug');
      
      // Mock KV to return index and logs
      mockEnv.log_state.get = async (key) => {
        if (key === 'log_keys:index') {
          return JSON.stringify(['log:123', 'log:456']);
        }
        if (key === 'log:123') {
          return JSON.stringify({ level: 'event', message: 'Test log 1' });
        }
        if (key === 'log:456') {
          return JSON.stringify({ level: 'error', message: 'Test log 2' });
        }
        return null;
      };
      
      const response = await logController.debugKvLogs(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('totalLogs');
      expect(data).to.have.property('sampleLogs');
      expect(data).to.have.property('logs');
    });

    it('should return 500 when log_state is missing', async () => {
      const request = createMockRequest('https://example.com/logs/debug');
      delete mockEnv.log_state;
      
      const response = await logController.debugKvLogs(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(500);
      expect(data).to.have.property('error');
    });
  });

  describe('flushLogs', () => {
    it('should flush logs to R2 successfully', async () => {
      const request = createMockRequest('https://example.com/logs/flush', {
        method: 'POST',
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        }
      });
      
      // Mock KV and R2 for flush operation
      mockEnv.log_state.get = async (key) => {
        if (key === 'log_keys:index') {
          return JSON.stringify(['log:123']);
        }
        if (key === 'log:123') {
          return JSON.stringify({ level: 'event', message: 'Test' });
        }
        return null;
      };
      mockEnv.log_state.delete = async () => {};
      mockEnv.log_state.put = async () => {};
      mockEnv.log_bucket.put = async () => {};
      
      const response = await logController.flushLogs(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('success', true);
    });

    it('should return 500 when bindings are missing', async () => {
      const request = createMockRequest('https://example.com/logs/flush', {
        method: 'POST',
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        }
      });
      
      delete mockEnv.log_bucket;
      delete mockEnv.log_state;
      
      const response = await logController.flushLogs(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(500);
      expect(data).to.have.property('success', false);
      expect(data.error).to.include('Bindings not configured');
    });
  });
});

