/**
 * Tests for healthcheck worker
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { createMockEnv, createMockRequest, createMockServiceBinding } from '../test/setup.js';

describe('healthcheckworker', () => {
  let mockEnv;
  let handler;
  
  beforeEach(async () => {
    mockEnv = createMockEnv();
    // Import the handler
    const module = await import('../healthcheckworker/index.js');
    handler = module.default;
  });
  
  describe('health check', () => {
    it('should return health status for all services', async () => {
      // Mock all service bindings to return healthy
      mockEnv.auth_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.catalog_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.pricing_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.fulfillment_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.cart_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.payment_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.orders_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.rating_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.log_worker = createMockServiceBinding('log-worker');
      mockEnv.log_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      mockEnv.realtime_worker = createMockServiceBinding('realtime-worker');
      mockEnv.realtime_worker._setResponse('GET', '/health', { status: 'healthy', timestamp: new Date().toISOString() });
      
      // Mock database checks
      mockEnv.auth_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.catalog_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.pricing_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.fulfillment_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.cart_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.payment_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.orders_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.rating_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      
      const request = createMockRequest('https://healthcheck-worker.test/health');
      const response = await handler.fetch(request, mockEnv);
      
      expect(response.status).to.equal(200);
      const body = await response.json();
      expect(body).to.have.property('timestamp');
      expect(body).to.have.property('services');
      expect(body).to.have.property('overall');
    });
    
    it('should handle service failures', async () => {
      // Mock one service as unhealthy
      mockEnv.auth_worker._setResponse('GET', '/health', null, { status: 503 });
      mockEnv.catalog_worker._setResponse('GET', '/health', { status: 'healthy' });
      mockEnv.pricing_worker._setResponse('GET', '/health', { status: 'healthy' });
      
      // Mock database checks
      mockEnv.auth_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      mockEnv.catalog_db = {
        prepare: () => ({
          first: async () => ({ result: 1 }),
        }),
      };
      
      const request = createMockRequest('https://healthcheck-worker.test/health');
      const response = await handler.fetch(request, mockEnv);
      
      expect(response.status).to.be.oneOf([200, 503]); // May return 200 with unhealthy status or 503
      const body = await response.json();
      expect(body).to.have.property('timestamp');
      expect(body).to.have.property('services');
      expect(body).to.have.property('overall');
    });
  });
});

