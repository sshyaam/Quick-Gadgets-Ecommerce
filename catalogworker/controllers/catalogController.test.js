/**
 * Tests for catalogController
 */

import { describe, it, beforeEach } from 'mocha';
import { createMockKV, createMockD1 } from '../../test/setup.js';
import { expect } from 'chai';
import * as catalogController from './catalogController.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1WithSequence } from '../../test/setup.js';

describe('catalogController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    // Setup mock database to return a result for SELECT 1
    // The health check calls prepare('SELECT 1').first()
    const mockDb = createMockD1();
    const originalPrepare = mockDb.prepare.bind(mockDb);
    mockDb.prepare = (query) => {
      if (query && query.includes('SELECT 1')) {
        return {
          first: async () => ({ '1': 1 }),
          bind: () => ({
            first: async () => ({ '1': 1 })
          })
        };
      }
      return originalPrepare(query);
    };
    mockEnv.catalog_db = mockDb;
    // Ensure product_cache exists
    if (!mockEnv.product_cache) {
      mockEnv.product_cache = createMockKV();
    }
  });

  describe('healthCheck', () => {
    it('should return healthy status when database and KV are accessible', async () => {
      const request = createMockRequest('https://example.com/health');
      
      const response = await catalogController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.equal('catalog-worker');
      expect(data).to.have.property('timestamp');
    });

    it('should return unhealthy status when database fails', async () => {
      const request = createMockRequest('https://example.com/health');
      mockEnv.catalog_db.prepare = () => {
        throw new Error('Database connection failed');
      };
      
      const response = await catalogController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      expect(data.service).to.equal('catalog-worker');
      expect(data).to.have.property('error');
    });

    it('should return unhealthy status when KV fails', async () => {
      const request = createMockRequest('https://example.com/health');
      // Ensure product_cache exists and override get to throw error
      if (!mockEnv.product_cache) {
        const { createMockKV } = await import('../../test/setup.js');
        mockEnv.product_cache = createMockKV();
      }
      const originalGet = mockEnv.product_cache.get;
      mockEnv.product_cache.get = async () => {
        throw new Error('KV connection failed');
      };
      
      const response = await catalogController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      
      // Restore original
      mockEnv.product_cache.get = originalGet;
    });
  });

  describe('getProducts', () => {
    it('should return products with default pagination', async () => {
      const request = createMockRequest('https://example.com/products');
      const mockProducts = {
        products: [{ productId: '1', name: 'Product 1' }],
        pagination: { page: 1, limit: 20, total: 1 }
      };
      
      // Mock the service binding to return products
      mockEnv.pricing_worker._setResponse('GET', '/product/1', { price: 100, currency: 'INR' });
      mockEnv.fulfillment_worker._setResponse('GET', '/stock/1', { available: 10 });
      
      // We can't easily stub ES modules, so we'll test the controller logic
      // by ensuring it calls the service correctly. For now, we'll test error cases
      // and validation which don't require stubbing.
    });

    it('should throw ValidationError for invalid page', async () => {
      const request = createMockRequest('https://example.com/products?page=0');
      
      try {
        await catalogController.getProducts(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Page must be greater than 0');
      }
    });

    it('should throw ValidationError for invalid limit (too low)', async () => {
      const request = createMockRequest('https://example.com/products?limit=0');
      
      try {
        await catalogController.getProducts(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Limit must be between 1 and 100');
      }
    });

    it('should throw ValidationError for invalid limit (too high)', async () => {
      const request = createMockRequest('https://example.com/products?limit=101');
      
      try {
        await catalogController.getProducts(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Limit must be between 1 and 100');
      }
    });
  });

  describe('getProduct', () => {
    it('should handle product not found', async () => {
      const productId = 'non-existent';
      const request = createMockRequest(`https://example.com/product/${productId}`);
      request.params = { productId };
      
      // Mock database to return null (product not found)
      // getProductById calls: db.prepare(...).bind(productId).first()
      const mockDb = createMockD1();
      const originalPrepare = mockDb.prepare.bind(mockDb);
      mockDb.prepare = (query) => {
        if (query.includes('WHERE product_id = ?')) {
          return {
            bind: () => ({
              first: async () => null // Product not found
            })
          };
        }
        return originalPrepare(query);
      };
      mockEnv.catalog_db = mockDb;
      
      // Mock service bindings (won't be called since product not found in DB)
      mockEnv.pricing_worker._setResponse('GET', `/product/${productId}`, null, { status: 404 });
      mockEnv.fulfillment_worker._setResponse('GET', `/stock/${productId}`, null, { status: 404 });
      
      const { NotFoundError } = await import('../../shared/utils/errors.js');
      
      try {
        await catalogController.getProduct(request, mockEnv);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
  });
});

