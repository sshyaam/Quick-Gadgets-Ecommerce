/**
 * Tests for inventoryModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getStock,
  getStocks,
  setStock,
  updateStock,
  reduceStock,
  reserveStock,
  releaseReservedStock,
} from './inventoryModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('inventoryModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getStock', () => {
    it('should return stock when found', async () => {
      const productId = 'test-product-id';
      const mockStock = {
        product_id: productId,
        quantity: 100,
        reserved_quantity: 20,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockStock },
      ]);
      
      const result = await getStock(mockDb, productId);
      
      expect(result).to.not.be.null;
      expect(result.product_id).to.equal(productId);
      expect(result.quantity).to.equal(100);
    });
    
    it('should return null when stock not found', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getStock(mockDb, 'non-existent-id');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getStocks', () => {
    it('should return multiple stocks', async () => {
      const productIds = ['product-1', 'product-2'];
      const mockStocks = [
        { product_id: 'product-1', quantity: 100, reserved_quantity: 10 },
        { product_id: 'product-2', quantity: 50, reserved_quantity: 5 },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockStocks, success: true } },
      ]);
      
      const result = await getStocks(mockDb, productIds);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(2);
      expect(result[0].product_id).to.equal('product-1');
    });
  });
  
  describe('setStock', () => {
    it('should create new stock entry', async () => {
      const productId = 'test-product-id';
      const warehouseId = 'warehouse-1';
      const quantity = 100;
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1, last_row_id: 1 },
          },
        },
      ]);
      
      // setStock signature: setStock(db, productId, quantity, warehouseId)
      const result = await setStock(mockDb, productId, quantity, warehouseId);
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('warehouseId', warehouseId);
      expect(result).to.have.property('quantity', quantity);
    });
  });
  
  describe('updateStock', () => {
    it('should update stock quantity', async () => {
      const productId = 'test-product-id';
      const quantity = 150;
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        },
      ]);
      
      const result = await updateStock(mockDb, productId, quantity);
      
      expect(result).to.be.true;
    });
  });
  
  describe('reserveStock', () => {
    it('should reserve stock successfully', async () => {
      const productId = 'test-product-id';
      const quantity = 10;
      
      const mockWarehouseStock = {
        inventory_id: 'inv-1',
        warehouse_id: 'warehouse-1',
        quantity: 100,
        reserved_quantity: 0,
        available: 100,
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockWarehouseStock], success: true } }, // Find warehouses with stock
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        }, // Update reserved_quantity
      ]);
      
      const result = await reserveStock(mockDb, productId, quantity);
      
      expect(result).to.be.true;
    });
  });
  
  describe('releaseReservedStock', () => {
    it('should release reserved stock', async () => {
      const productId = 'test-product-id';
      const quantity = 10;
      
      const mockWarehouseStock = {
        inventory_id: 'inv-1',
        warehouse_id: 'warehouse-1',
        quantity: 100,
        reserved_quantity: 20,
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockWarehouseStock], success: true } }, // Find warehouses with reserved stock
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        }, // Update reserved_quantity
      ]);
      
      const result = await releaseReservedStock(mockDb, productId, quantity);
      
      expect(result).to.be.true;
    });
  });
  
});

