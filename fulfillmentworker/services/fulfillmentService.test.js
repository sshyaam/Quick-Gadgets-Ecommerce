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
        reserved_quantity: 20,
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockStock },
      ]);
      
      const result = await getProductStock(productId, mockDb);
      
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
        reserved_quantity: 100, // More reserved than available
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockStock },
      ]);
      
      const result = await getProductStock(productId, mockDb);
      
      expect(result).to.have.property('available', 0); // Should be 0, not negative
    });
  });
  
  describe('getProductStocks', () => {
    it('should return stock map for multiple products', async () => {
      const productIds = ['product-1', 'product-2'];
      const mockStocks = [
        { product_id: 'product-1', quantity: 100, reserved_quantity: 10, updated_at: '2024-01-01T00:00:00Z' },
        { product_id: 'product-2', quantity: 50, reserved_quantity: 5, updated_at: '2024-01-01T00:00:00Z' },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockStocks, success: true } },
      ]);
      
      const result = await getProductStocks(productIds, mockDb);
      
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
      
      // getAvailableStock calls getStock internally
      // reserveStock needs to find warehouses with available stock
      mockDb = createMockD1WithSequence([
        { first: mockStock }, // getAvailableStock -> getStock
        { all: { results: [mockWarehouseStock], success: true } }, // reserveStock -> find warehouses with stock
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        }, // reserveStock -> update reserved_quantity
      ]);
      
      const result = await reserveProductStock(productId, quantity, mockDb);
      
      expect(result).to.be.true;
    });
    
    it('should throw ConflictError when insufficient stock', async () => {
      const productId = 'test-product-id';
      const quantity = 100;
      const mockStock = {
        product_id: productId,
        quantity: 50,
        reserved_quantity: 0,
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockStock },
      ]);
      
      try {
        await reserveProductStock(productId, quantity, mockDb);
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
      const quantity = 10;
      
      const mockWarehouseStock = {
        inventory_id: 'inv-1',
        warehouse_id: 'warehouse-1',
        quantity: 100,
        reserved_quantity: 20,
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockWarehouseStock], success: true } }, // releaseReservedStock -> find warehouses
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        }, // releaseReservedStock -> update
      ]);
      
      const result = await releaseProductStock(productId, quantity, mockDb);
      
      expect(result).to.be.true;
    });
  });
});

