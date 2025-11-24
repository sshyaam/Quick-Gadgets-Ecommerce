/**
 * Tests for catalogService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  getProductWithDetails,
  getProductsWithDetails,
  invalidateProductCache,
} from './catalogService.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence, createMockKV, createMockEnv } from '../../test/setup.js';
import * as productModel from '../models/productModel.js';

describe('catalogService', () => {
  let mockDb;
  let mockKv;
  let mockEnv;
  let mockPricingWorker;
  let mockFulfillmentWorker;
  
  beforeEach(() => {
    mockDb = createMockD1();
    mockKv = createMockKV();
    mockEnv = createMockEnv();
    mockPricingWorker = mockEnv.pricing_worker;
    mockFulfillmentWorker = mockEnv.fulfillment_worker;
  });
  
  describe('getProductWithDetails', () => {
    it('should return product with price and stock from cache', async () => {
      const productId = 'test-product-id';
      const cachedProduct = {
        productId,
        name: 'Test Product',
        description: 'Test Description',
        category: 'Electronics',
      };
      
      mockKv._setData(`product:${productId}`, JSON.stringify(cachedProduct));
      
      // Mock worker responses - getPriceFromWorker uses `/product/${productId}`, not `/price/`
      mockPricingWorker._setResponse('GET', `/product/${productId}`, { price: 1000 });
      mockFulfillmentWorker._setResponse('GET', `/stock/${productId}`, { available: 50 });
      
      const result = await getProductWithDetails(
        productId,
        mockDb,
        mockKv,
        mockPricingWorker,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('name', 'Test Product');
      // Price and stock come from workers - verify they're set correctly
      expect(result.price).to.equal(1000);
      expect(result.stock).to.equal(50);
      expect(result).to.not.have.property('_cachedStock');
      expect(result).to.not.have.property('_cachedPrice');
    });
    
    it('should fetch product from database when not in cache', async () => {
      const productId = 'test-product-id';
      const productData = {
        name: 'Test Product',
        description: 'Test Description',
        category: 'Electronics',
      };
      
      const mockProduct = {
        product_id: productId,
        data: JSON.stringify(productData),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockProduct },
      ]);
      
      // Use mock database sequence instead of stubbing
      mockDb = createMockD1WithSequence([
        { first: mockProduct }, // getProductById
      ]);
      
      // Mock worker responses - getPriceFromWorker uses `/product/${productId}`, not `/price/`
      mockPricingWorker._setResponse('GET', `/product/${productId}`, { price: 1000 });
      mockFulfillmentWorker._setResponse('GET', `/stock/${productId}`, { available: 50 });
      
      const result = await getProductWithDetails(
        productId,
        mockDb,
        mockKv,
        mockPricingWorker,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('name', 'Test Product');
      expect(result.price).to.equal(1000);
      expect(result.stock).to.equal(50);
      
      // Verify it was cached
      const cached = await mockKv.get(`product:${productId}`, { type: 'json' });
      expect(cached).to.not.be.null;
      expect(cached).to.not.have.property('price');
      expect(cached).to.not.have.property('stock');
    });
    
    it('should throw NotFoundError when product does not exist', async () => {
      const productId = 'non-existent-id';
      
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      mockDb = createMockD1WithSequence([
        { first: null }, // getProductById - not found
      ]);
      
      try {
        await getProductWithDetails(
          productId,
          mockDb,
          mockKv,
          mockPricingWorker,
          mockFulfillmentWorker,
          mockEnv.INTER_WORKER_API_KEY
        );
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
    
    it('should always fetch fresh stock even from cache', async () => {
      const productId = 'test-product-id';
      const cachedProduct = {
        productId,
        name: 'Test Product',
        // Note: stock and price should not be in cache, but test with them to verify they're ignored
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      mockKv._setData(`product:${productId}`, JSON.stringify(cachedProduct));
      
      // Mock worker responses with different values - getPriceFromWorker uses `/product/${productId}`
      mockPricingWorker._setResponse('GET', `/product/${productId}`, { price: 1000 });
      mockFulfillmentWorker._setResponse('GET', `/stock/${productId}`, { available: 25 });
      
      const result = await getProductWithDetails(
        productId,
        mockDb,
        mockKv,
        mockPricingWorker,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      // Should use fresh stock from worker, not cached (which doesn't have stock anyway)
      expect(result.stock).to.equal(25);
      expect(result.price).to.equal(1000);
      expect(result.name).to.equal('Test Product');
    });
  });
  
  describe('getProductsWithDetails', () => {
    it('should return paginated products with details', async () => {
      const page = 1;
      const limit = 10;
      
      const mockProducts = [
        {
          product_id: 'product-1',
          data: JSON.stringify({ name: 'Product 1', category: 'Electronics' }),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          product_id: 'product-2',
          data: JSON.stringify({ name: 'Product 2', category: 'Electronics' }),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      
      // Create a new mockDb for this test to avoid conflicts
      const testDb = createMockD1WithSequence([
        { all: { results: mockProducts, success: true } }, // getProducts query
        { first: { total: 2 } } // count query
      ]);
      
      // Mock worker batch responses
      mockPricingWorker._setResponse('GET', '/products', { 
        'product-1': { price: 1000 },
        'product-2': { price: 2000 }
      });
      mockFulfillmentWorker._setResponse('GET', '/stocks', { 
        'product-1': { available: 50 },
        'product-2': { available: 30 }
      });
      
      const result = await getProductsWithDetails(
        page,
        limit,
        null, // category
        null, // search
        testDb,
        mockPricingWorker,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('products');
      expect(result).to.have.property('pagination');
      expect(result.products).to.be.an('array');
    });

    it('should handle category filter', async () => {
      const page = 1;
      const limit = 10;
      const category = 'Electronics';
      
      const testDb = createMockD1WithSequence([
        { all: { results: [], success: true } },
        { first: { total: 0 } }
      ]);
      
      mockPricingWorker._setResponse('GET', '/products', {});
      mockFulfillmentWorker._setResponse('GET', '/stocks', {});
      
      const result = await getProductsWithDetails(
        page,
        limit,
        category,
        null, // search
        testDb,
        mockPricingWorker,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('products');
      expect(result).to.have.property('pagination');
    });

    it('should handle worker errors gracefully', async () => {
      const page = 1;
      const limit = 10;
      
      const mockProducts = [
        {
          product_id: 'product-1',
          data: JSON.stringify({ name: 'Product 1' }),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
      ];
      
      const testDb = createMockD1WithSequence([
        { all: { results: mockProducts, success: true } },
        { first: { total: 1 } }
      ]);
      
      // Mock worker to return error
      mockPricingWorker._setResponse('GET', '/products', null, { status: 500 });
      mockFulfillmentWorker._setResponse('GET', '/stocks', null, { status: 500 });
      
      const result = await getProductsWithDetails(
        page,
        limit,
        null, // category
        null, // search
        testDb,
        mockPricingWorker,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      // Should still return products even if worker calls fail
      expect(result).to.have.property('products');
      expect(result.products[0]).to.have.property('price', null);
      expect(result.products[0]).to.have.property('stock', 0);
    });
  });

  describe('invalidateProductCache', () => {
    it('should delete product from cache', async () => {
      const productId = 'product-123';
      let deletedKey = null;
      
      mockKv.delete = async (key) => {
        deletedKey = key;
      };
      
      await invalidateProductCache(productId, mockKv);
      
      expect(deletedKey).to.equal(`product:${productId}`);
    });
  });
});

