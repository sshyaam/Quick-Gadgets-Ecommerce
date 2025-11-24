/**
 * Tests for pricingController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as pricingController from './pricingController.js';
import { ValidationError, AuthenticationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('pricingController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    // Setup mock database for health check
    const mockDb = createMockD1();
    mockDb.prepare = (query) => {
      if (query && query.includes('SELECT 1')) {
        return {
          first: async () => ({ '1': 1 }),
          bind: () => ({
            first: async () => ({ '1': 1 })
          })
        };
      }
      return {
        bind: () => ({
          first: async () => null,
          run: async () => ({ success: true, meta: { changes: 1 } })
        }),
        first: async () => null,
        run: async () => ({ success: true, meta: { changes: 1 } })
      };
    };
    mockEnv.pricing_db = mockDb;
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      const request = createMockRequest('https://example.com/health');
      
      const response = await pricingController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.equal('pricing-worker');
      expect(data).to.have.property('timestamp');
    });

    it('should return unhealthy status when database fails', async () => {
      const request = createMockRequest('https://example.com/health');
      mockEnv.pricing_db.prepare = () => {
        throw new Error('Database connection failed');
      };
      
      const response = await pricingController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      expect(data.service).to.equal('pricing-worker');
      expect(data).to.have.property('error');
    });
  });

  describe('validateWorkerRequest', () => {
    it('should throw AuthenticationError when API key is invalid', async () => {
      const request = createMockRequest('https://example.com/price/product-123', {
        headers: {
          'X-API-Key': 'wrong-key',
          'X-Worker-Request': 'true'
        }
      });
      
      try {
        await pricingController.validateWorkerRequest(request, mockEnv);
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });

    it('should not throw when API key is valid', async () => {
      const request = createMockRequest('https://example.com/price/product-123', {
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        }
      });
      
      // Should not throw
      await pricingController.validateWorkerRequest(request, mockEnv);
    });
  });

  describe('getPrice', () => {
    it('should return price for product', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/price/${productId}`);
      request.params = { productId };
      
      const mockPrice = {
        productId,
        price: 100,
        currency: 'INR'
      };
      
      const mockDb = createMockD1WithSequence([
        { first: mockPrice }
      ]);
      mockEnv.pricing_db = mockDb;
      
      const response = await pricingController.getPrice(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('productId', productId);
    });
  });

  describe('setPrice', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const request = createMockRequest('https://example.com/admin/price/product-123', {
        method: 'POST',
        body: JSON.stringify({})
      });
      request.params = { productId: 'product-123' };
      
      try {
        await pricingController.setPrice(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('updatePrice', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const request = createMockRequest('https://example.com/admin/price/product-123', {
        method: 'PUT',
        body: JSON.stringify({})
      });
      request.params = { productId: 'product-123' };
      
      try {
        await pricingController.updatePrice(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });
});

