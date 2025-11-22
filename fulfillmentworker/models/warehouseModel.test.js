/**
 * Tests for warehouseModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getWarehouseById,
  getWarehousesByPincode,
  calculateZone,
} from './warehouseModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('warehouseModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getWarehouseById', () => {
    it('should return warehouse for existing warehouse ID', async () => {
      const warehouseId = 'warehouse-id';
      const mockWarehouse = {
        warehouse_id: warehouseId,
        name: 'Test Warehouse',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra',
        address: 'Test Address',
        is_active: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockWarehouse },
      ]);
      
      const result = await getWarehouseById(mockDb, warehouseId);
      
      expect(result).to.not.be.null;
      expect(result.warehouse_id).to.equal(warehouseId);
      expect(result.name).to.equal('Test Warehouse');
    });
    
    it('should return null for non-existent warehouse ID', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getWarehouseById(mockDb, 'non-existent-warehouse');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getWarehousesByPincode', () => {
    it('should return warehouses serving a pincode', async () => {
      const pincode = '400001';
      const mockWarehouses = [
        {
          warehouse_id: 'warehouse-1',
          name: 'Warehouse 1',
          pincode: '400001',
          city: 'Mumbai',
          state: 'Maharashtra',
          standard_available: 1,
          express_available: 1,
        },
        {
          warehouse_id: 'warehouse-2',
          name: 'Warehouse 2',
          pincode: '400002',
          city: 'Mumbai',
          state: 'Maharashtra',
          standard_available: 1,
          express_available: 0,
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockWarehouses, success: true } },
      ]);
      
      const result = await getWarehousesByPincode(mockDb, pincode);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(2);
      expect(result[0]).to.have.property('warehouse_id');
    });
    
    it('should return empty array if no warehouses serve the pincode', async () => {
      mockDb = createMockD1WithSequence([
        { all: { results: [], success: true } },
      ]);
      
      const result = await getWarehousesByPincode(mockDb, '999999');
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(0);
    });
  });
  
  describe('calculateZone', () => {
    it('should return zone 1 for same postal region (first 3 digits match)', () => {
      const warehousePincode = '400001';
      const customerPincode = '400002';
      
      const zone = calculateZone(warehousePincode, customerPincode);
      
      expect(zone).to.equal(1);
    });
    
    it('should return zone 2 for same state, different region', () => {
      const warehousePincode = '400001'; // Mumbai
      const customerPincode = '411001'; // Pune (same state, different region)
      
      const zone = calculateZone(warehousePincode, customerPincode);
      
      expect(zone).to.equal(2);
    });
    
    it('should return zone 3 for different state', () => {
      const warehousePincode = '400001'; // Maharashtra
      const customerPincode = '110001'; // Delhi (different state)
      
      const zone = calculateZone(warehousePincode, customerPincode);
      
      expect(zone).to.equal(3);
    });
    
    it('should return zone 3 for invalid pincodes', () => {
      const zone1 = calculateZone(null, '400001');
      const zone2 = calculateZone('400001', null);
      const zone3 = calculateZone('', '400001');
      const zone4 = calculateZone('400001', '');
      
      expect(zone1).to.equal(3);
      expect(zone2).to.equal(3);
      expect(zone3).to.equal(3);
      expect(zone4).to.equal(3);
    });
    
    it('should return zone 3 for pincodes with different first digit', () => {
      const warehousePincode = '100001'; // First digit: 1
      const customerPincode = '200001'; // First digit: 2
      
      const zone = calculateZone(warehousePincode, customerPincode);
      
      expect(zone).to.equal(3);
    });
  });
});

