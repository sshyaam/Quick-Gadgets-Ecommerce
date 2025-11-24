/**
 * Tests for warehouseModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getWarehouseById,
  getWarehousesByPincode,
  calculateZone,
  getNearestWarehouse,
  getProductInventoryAcrossWarehouses,
  getTotalAvailableStock,
} from './warehouseModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('warehouseModel', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockD1();
  });

  describe('getWarehouseById', () => {
    it('should return warehouse when found', async () => {
      const warehouseId = 'WH-MUM-001';
      const mockWarehouse = {
        warehouse_id: warehouseId,
        name: 'Mumbai Warehouse',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra',
        address: 'Mumbai Address',
        is_active: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockWarehouse }
      ]);
      
      const result = await getWarehouseById(mockDb, warehouseId);
      
      expect(result).to.not.be.null;
      expect(result.warehouse_id).to.equal(warehouseId);
    });

    it('should return null when warehouse not found', async () => {
      const warehouseId = 'non-existent';
      
      mockDb = createMockD1WithSequence([
        { first: null }
      ]);
      
      const result = await getWarehouseById(mockDb, warehouseId);
      
      expect(result).to.be.null;
    });
  });

  describe('getWarehousesByPincode', () => {
    it('should return warehouses serving a pincode', async () => {
      const pincode = '400001';
      const mockWarehouses = [
        {
          warehouse_id: 'WH-MUM-001',
          name: 'Mumbai Warehouse',
          pincode: '400001',
          standard_available: 1,
          express_available: 1
        }
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockWarehouses } }
      ]);
      
      const result = await getWarehousesByPincode(mockDb, pincode);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should return empty array when no warehouses serve pincode', async () => {
      const pincode = '999999';
      
      mockDb = createMockD1WithSequence([
        { all: { results: [] } }
      ]);
      
      const result = await getWarehousesByPincode(mockDb, pincode);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(0);
    });
  });

  describe('calculateZone', () => {
    it('should return zone 1 for same postal region', () => {
      const zone = calculateZone('400001', '400002');
      expect(zone).to.equal(1);
    });

    it('should return zone 2 for same state, different region', () => {
      const zone = calculateZone('400001', '411001'); // Different region, same state (Maharashtra)
      expect(zone).to.equal(2);
    });

    it('should return zone 3 for different state', () => {
      const zone = calculateZone('400001', '600001'); // Different state
      expect(zone).to.equal(3);
    });

    it('should return zone 3 when pincodes are missing', () => {
      const zone = calculateZone(null, '400001');
      expect(zone).to.equal(3);
    });
  });

  describe('getNearestWarehouse', () => {
    it('should return nearest warehouse for pincode', async () => {
      const pincode = '400001';
      const state = 'Maharashtra';
      const city = 'Mumbai';
      
      const mockWarehouse = {
        warehouse_id: 'WH-MUM-001',
        name: 'Mumbai Warehouse',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra'
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockWarehouse] } }
      ]);
      
      const result = await getNearestWarehouse(mockDb, pincode, state, city);
      
      expect(result).to.not.be.null;
      expect(result.warehouse_id).to.equal('WH-MUM-001');
    });

    it('should return null when no warehouse found', async () => {
      const pincode = '999999';
      const state = 'Unknown';
      const city = 'Unknown';
      
      mockDb = createMockD1WithSequence([
        { all: { results: [] } },
        { first: null }
      ]);
      
      const result = await getNearestWarehouse(mockDb, pincode, state, city);
      
      expect(result).to.be.null;
    });
  });

  describe('getProductInventoryAcrossWarehouses', () => {
    it('should return inventory across all warehouses', async () => {
      const productId = 'product-123';
      const mockInventory = [
        {
          inventory_id: 'inv-1',
          product_id: productId,
          warehouse_id: 'WH-MUM-001',
          quantity: 10,
          reserved_quantity: 2,
          warehouse_name: 'Mumbai Warehouse',
          city: 'Mumbai',
          state: 'Maharashtra'
        }
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockInventory } }
      ]);
      
      const result = await getProductInventoryAcrossWarehouses(mockDb, productId);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe('getTotalAvailableStock', () => {
    it('should calculate total available stock across warehouses', async () => {
      const productId = 'product-123';
      const mockInventory = [
        {
          inventory_id: 'inv-1',
          product_id: productId,
          quantity: 10,
          reserved_quantity: 2
        },
        {
          inventory_id: 'inv-2',
          product_id: productId,
          quantity: 20,
          reserved_quantity: 5
        }
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockInventory } }
      ]);
      
      const result = await getTotalAvailableStock(mockDb, productId);
      
      // (10 - 2) + (20 - 5) = 8 + 15 = 23
      expect(result).to.equal(23);
    });

    it('should return 0 when no inventory found', async () => {
      const productId = 'non-existent';
      
      mockDb = createMockD1WithSequence([
        { all: { results: [] } }
      ]);
      
      const result = await getTotalAvailableStock(mockDb, productId);
      
      expect(result).to.equal(0);
    });
  });
});

