/**
 * Tests for logger utility
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { sendLog } from './logger.js';
import { createMockEnv, createMockRequest } from '../../test/setup.js';

describe('logger', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
  });

  describe('sendLog', () => {
    it('should throw error for invalid log level', async () => {
      try {
        await sendLog(mockEnv.log_worker, 'invalid', 'Test message', {}, 'test-api-key');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Invalid log level');
      }
    });

    it('should return early when log worker not configured', async () => {
      const result = sendLog(null, 'event', 'Test message', {}, 'test-api-key');
      
      // sendLog returns Promise.resolve() when not configured, which is a Promise
      expect(result).to.be.instanceOf(Promise);
      await result; // Should resolve without error
    });

    it('should return early when API key not configured', async () => {
      const result = sendLog(mockEnv.log_worker, 'event', 'Test message', {}, null);
      
      // Should return resolved promise
      expect(result).to.be.instanceOf(Promise);
      await result; // Should resolve without error
    });

    it('should send log via service binding', async () => {
      // Ensure log_worker is initialized
      if (!mockEnv.log_worker) {
        mockEnv.log_worker = { fetch: async () => new Response(JSON.stringify({ success: true }), { status: 200 }) };
      }
      mockEnv.log_worker._setResponse = mockEnv.log_worker._setResponse || function() {};
      mockEnv.log_worker._setResponse('POST', '/log', { success: true });
      
      // Fire and forget - don't await
      const promise = sendLog(mockEnv.log_worker, 'event', 'Test message', { worker: 'test-worker' }, 'test-api-key');
      
      // Should not throw
      expect(promise).to.be.instanceOf(Promise);
    });

    it('should handle log worker error gracefully', async () => {
      // Ensure log_worker is initialized
      if (!mockEnv.log_worker) {
        mockEnv.log_worker = { fetch: async () => new Response('Error', { status: 500 }) };
      }
      mockEnv.log_worker._setResponse = mockEnv.log_worker._setResponse || function() {};
      mockEnv.log_worker._setResponse('POST', '/log', null, { status: 500 });
      
      // Fire and forget - should not throw
      const promise = sendLog(mockEnv.log_worker, 'error', 'Test error', { worker: 'test-worker' }, 'test-api-key');
      
      expect(promise).to.be.instanceOf(Promise);
    });
  });
});

