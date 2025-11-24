/**
 * Tests for fulfillmentController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as fulfillmentController from './fulfillmentController.js';
import { ValidationError, AuthenticationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('fulfillmentController', () => {
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
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: { changes: 1 } })
        }),
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 1 } })
      };
    };
    mockEnv.fulfillment_db = mockDb;
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      const request = createMockRequest('https://example.com/health');
      
      const response = await fulfillmentController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.equal('fulfillment-worker');
      expect(data).to.have.property('timestamp');
    });

    it('should return unhealthy status when database fails', async () => {
      const request = createMockRequest('https://example.com/health');
      mockEnv.fulfillment_db.prepare = () => {
        throw new Error('Database connection failed');
      };
      
      const response = await fulfillmentController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      expect(data.service).to.equal('fulfillment-worker');
      expect(data).to.have.property('error');
    });
  });

  describe('validateWorkerRequest', () => {
    it('should throw AuthenticationError when API key is invalid', async () => {
      const request = createMockRequest('https://example.com/stock/product-123', {
        headers: {
          'X-API-Key': 'wrong-key',
          'X-Worker-Request': 'true'
        }
      });
      
      try {
        await fulfillmentController.validateWorkerRequest(request, mockEnv);
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });

    it('should not throw when API key is valid', async () => {
      const request = createMockRequest('https://example.com/stock/product-123', {
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        }
      });
      
      // Should not throw
      await fulfillmentController.validateWorkerRequest(request, mockEnv);
    });
  });

  describe('getStock', () => {
    it('should return stock for product', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/stock/${productId}`);
      request.params = { productId };
      
      const mockStock = {
        productId,
        available: 10,
        reserved: 2
      };
      
      // Mock the service to return stock
      const mockDb = createMockD1WithSequence([
        { first: { product_id: productId, quantity: 10 } }
      ]);
      mockEnv.fulfillment_db = mockDb;
      
      // Mock DO binding
      mockEnv.reserved_stock_do = {
        idFromName: () => ({ fetch: async () => new Response(JSON.stringify({ reserved: 2 }), { status: 200 }) })
      };
      
      const response = await fulfillmentController.getStock(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('productId', productId);
    });
  });

  describe('getStocks', () => {
    it('should throw ValidationError when productIds is missing', async () => {
      const request = createMockRequest('https://example.com/stocks');
      
      try {
        await fulfillmentController.getStocks(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('productIds');
      }
    });

    it('should throw ValidationError when productIds is empty', async () => {
      const request = createMockRequest('https://example.com/stocks?productIds=');
      
      try {
        await fulfillmentController.getStocks(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        // When productIds is empty string, it throws "productIds query parameter is required"
        expect(error.message).to.include('productIds');
      }
    });
  });

  describe('updateStock', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/admin/stock/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({})
      });
      request.params = { productId };
      
      try {
        await fulfillmentController.updateStock(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('reduceStock', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/stock/${productId}/reduce`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      request.params = { productId };
      
      try {
        await fulfillmentController.reduceStock(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('reserveStock', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/stock/${productId}/reserve`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      request.params = { productId };
      
      try {
        await fulfillmentController.reserveStock(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('releaseStock', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/stock/${productId}/release`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      request.params = { productId };
      
      try {
        await fulfillmentController.releaseStock(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('calculateShipping', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const request = createMockRequest('https://example.com/shipping/calculate', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      try {
        await fulfillmentController.calculateShipping(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });
});

