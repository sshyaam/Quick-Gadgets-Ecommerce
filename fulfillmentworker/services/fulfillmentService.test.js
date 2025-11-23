/**
 * Tests for fulfillmentService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getProductStock,
  getProductStocks,
  updateProductStock,
  reserveProductStock,
  releaseProductStock,
  reduceProductStock,
} from './fulfillmentService.js';
import { NotFoundError, ConflictError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('fulfillmentService', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getProductStock', () => {
    it('should return stock when found', async () => {
      const productId = 'test-product-id';
      const mockStock = {
        product_id: productId,
        quantity: 100,
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      // Mock DO to return reserved quantity
      const mockDO = {
        idFromName: (name) => ({ toString: () => name }),
        get: (id) => ({
          fetch: async (request) => {
            const url = typeof request === 'string' ? new URL(request) : new URL(request.url);
            if (url.pathname.includes('/status')) {
              return new Response(JSON.stringify({ reserved: 20 }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return new Response(JSON.stringify({ reserved: 0 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockStock },
      ]);
      
      const result = await getProductStock(productId, mockDb, mockDO);
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('quantity', 100);
      expect(result).to.have.property('available', 80);
      expect(result).to.have.property('reservedQuantity', 20);
    });
    
    it('should return zero stock when product not found', async () => {
      const productId = 'non-existent-id';
      
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getProductStock(productId, mockDb);
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('quantity', 0);
      expect(result).to.have.property('available', 0);
      expect(result).to.have.property('reservedQuantity', 0);
    });
    
    it('should handle data inconsistency when reserved > quantity', async () => {
      const productId = 'test-product-id';
      const mockStock = {
        product_id: productId,
        quantity: 50,
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      // Mock DO to return more reserved than available
      const mockDO = {
        idFromName: (name) => ({ toString: () => name }),
        get: (id) => ({
          fetch: async (request) => {
            const url = typeof request === 'string' ? new URL(request) : new URL(request.url);
            if (url.pathname.includes('/status')) {
              return new Response(JSON.stringify({ reserved: 100 }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return new Response(JSON.stringify({ reserved: 0 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockStock },
      ]);
      
      const result = await getProductStock(productId, mockDb, mockDO);
      
      expect(result).to.have.property('available', 0); // Should be 0, not negative
    });
  });
  
  describe('getProductStocks', () => {
    it('should return stock map for multiple products', async () => {
      const productIds = ['product-1', 'product-2'];
      const mockStocks = [
        { product_id: 'product-1', quantity: 100, updated_at: '2024-01-01T00:00:00Z' },
        { product_id: 'product-2', quantity: 50, updated_at: '2024-01-01T00:00:00Z' },
      ];
      
      // Mock DO to return reserved quantities
      const mockDO = {
        idFromName: (name) => ({ toString: () => name }),
        get: (id) => ({
          fetch: async (request) => {
            const url = typeof request === 'string' ? new URL(request) : new URL(request.url);
            if (url.pathname.includes('/status')) {
              const productId = id.toString();
              const reserved = productId === 'product-1' ? 10 : productId === 'product-2' ? 5 : 0;
              return new Response(JSON.stringify({ reserved }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return new Response(JSON.stringify({ reserved: 0 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockStocks, success: true } },
      ]);
      
      const result = await getProductStocks(productIds, mockDb, mockDO);
      
      expect(result).to.be.an('object');
      expect(result['product-1']).to.have.property('quantity', 100);
      expect(result['product-1']).to.have.property('available', 90);
      expect(result['product-2']).to.have.property('quantity', 50);
      expect(result['product-2']).to.have.property('available', 45);
    });
    
    it('should fill missing products with zero stock', async () => {
      const productIds = ['product-1', 'product-2', 'product-3'];
      const mockStocks = [
        { product_id: 'product-1', quantity: 100, reserved_quantity: 10, updated_at: '2024-01-01T00:00:00Z' },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockStocks, success: true } },
      ]);
      
      const result = await getProductStocks(productIds, mockDb);
      
      expect(result['product-1']).to.have.property('quantity', 100);
      expect(result['product-2']).to.have.property('quantity', 0);
      expect(result['product-3']).to.have.property('quantity', 0);
    });
  });
  
  describe('updateProductStock', () => {
    it('should update stock successfully', async () => {
      const productId = 'test-product-id';
      const newQuantity = 150;
      
      const mockExistingStock = {
        product_id: productId,
        quantity: 100,
        reserved_quantity: 10,
      };
      
      const mockWarehouse = {
        warehouse_id: 'warehouse-1',
      };
      
      // updateProductStock calls getStock, then either setStock (if no stock) or updateStock
      // Since we have existing stock, it will call updateStock
      mockDb = createMockD1WithSequence([
        { first: mockExistingStock }, // getStock - existing stock found
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        }, // updateStock - update existing stock
      ]);
      
      const result = await updateProductStock(productId, newQuantity, mockDb);
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('quantity', newQuantity);
    });
    
    it('should throw error for negative quantity', async () => {
      try {
        await updateProductStock('product-id', -10, mockDb);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('cannot be negative');
      }
    });
  });
  
  describe('reserveProductStock', () => {
    it('should reserve stock successfully', async () => {
      const productId = 'test-product-id';
      const quantity = 10;
      const mockStock = {
        product_id: productId,
        quantity: 100,
        reserved_quantity: 20,
      };
      
      const mockWarehouseStock = {
        inventory_id: 'inv-1',
        warehouse_id: 'warehouse-1',
        quantity: 100,
        reserved_quantity: 20,
        available: 80,
      };
      
      // Mock DO for reserving stock
      const mockDO = {
        idFromName: (name) => ({ toString: () => name }),
        get: (id) => ({
          fetch: async (request) => {
            const url = typeof request === 'string' ? new URL(request) : new URL(request.url);
            if (url.pathname.includes('/status')) {
              return new Response(JSON.stringify({ reserved: 0 }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            if (url.pathname.includes('/reserve')) {
              return new Response(JSON.stringify({ success: true, reserved: quantity, totalReserved: quantity }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return new Response(JSON.stringify({ reserved: 0 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      };
      
      // getAvailableStock calls getStock internally, which also calls DO for reserved status
      // reserveStock also calls getStock
      mockDb = createMockD1WithSequence([
        { first: { product_id: productId, quantity: 100, updated_at: '2024-01-01T00:00:00Z' } }, // getAvailableStock -> getStock
        { first: { product_id: productId, quantity: 100, updated_at: '2024-01-01T00:00:00Z' } }, // reserveStock -> getStock
      ]);
      
      const result = await reserveProductStock(productId, quantity, mockDb, null, mockDO, 'test-order-id');
      
      expect(result).to.be.true;
    });
    
    it('should throw ConflictError when insufficient stock', async () => {
      const productId = 'test-product-id';
      const quantity = 100;
      const orderId = 'test-order-id';
      const mockStock = {
        product_id: productId,
        quantity: 50,
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      // Mock DO to return reserved status
      const mockDO = {
        idFromName: (name) => ({ toString: () => name }),
        get: (id) => ({
          fetch: async (request) => {
            const url = typeof request === 'string' ? new URL(request) : new URL(request.url);
            if (url.pathname.includes('/status')) {
              return new Response(JSON.stringify({ reserved: 0 }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return new Response(JSON.stringify({ reserved: 0 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockStock },
      ]);
      
      try {
        await reserveProductStock(productId, quantity, mockDb, null, mockDO, orderId);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('stock');
      }
    });
  });
  
  describe('releaseProductStock', () => {
    it('should release reserved stock successfully', async () => {
      const productId = 'test-product-id';
      const orderId = 'test-order-id';
      
      // Mock DO for releasing stock
      const mockDO = {
        idFromName: (name) => ({ toString: () => name }),
        get: (id) => ({
          fetch: async (request) => {
            const url = typeof request === 'string' ? new URL(request) : new URL(request.url);
            if (url.pathname.includes('/release')) {
              return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return new Response(JSON.stringify({ reserved: 0 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      };
      
      mockDb = createMockD1WithSequence([
        // No DB calls needed for release (it's handled by DO)
      ]);
      
      const result = await releaseProductStock(productId, orderId, mockDb, null, mockDO);
      
      expect(result).to.be.true;
    });
  });
});

