/**
 * Tests for shippingModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getShippingOptionsForProduct,
  calculateShippingCost,
} from './shippingModel.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('shippingModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getShippingOptionsForProduct', () => {
    it('should return shipping options for product with address', async () => {
      const productId = 'test-product-id';
      const category = 'electronics';
      const address = {
        pincode: '600001',
        state: 'Maharashtra',
        city: 'Mumbai',
      };
      
      const mockWarehouse = {
        warehouse_id: 'warehouse-1',
        name: 'Mumbai Warehouse',
        pincode: '600001',
        zone: 1,
      };
      
      const mockShippingRule = {
        rule_id: 'rule-1',
        warehouse_id: 'warehouse-1',
        category: 'electronics',
        rules: JSON.stringify({
          standard: { base_cost: 50, per_kg_cost: 10, estimatedDays: 5 },
          express: { base_cost: 150, per_kg_cost: 20, estimatedDays: 2 },
        }),
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockWarehouse }, // getNearestWarehouseWithStock
        { first: { product_id: productId, quantity: 100 } }, // getStockFromWarehouse
        { first: mockShippingRule }, // getShippingRulesByWarehouseAndCategory
      ]);
      
      const result = await getShippingOptionsForProduct(mockDb, productId, category, address);
      
      expect(result).to.have.property('standard');
      expect(result).to.have.property('express');
      expect(result.standard).to.have.property('available');
      expect(result.standard).to.have.property('cost');
    });
    
    it('should return default options when no address provided', async () => {
      const productId = 'test-product-id';
      const category = 'electronics';
      
      const result = await getShippingOptionsForProduct(mockDb, productId, category, null);
      
      expect(result).to.have.property('standard');
      expect(result).to.have.property('express');
      expect(result.standard.cost).to.equal(50);
      expect(result.express.cost).to.equal(150);
    });
  });
  
  describe('calculateShippingCost', () => {
    it('should calculate shipping cost based on category and zone', async () => {
      const params = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 1,
        address: {
          pincode: '600001',
          state: 'Maharashtra',
          city: 'Mumbai',
        },
      };
      
      const mockWarehouse = {
        warehouse_id: 'warehouse-1',
        pincode: '600001',
        zone: 1,
      };
      
      const mockShippingRule = {
        rule_id: 'rule-1',
        warehouse_id: 'warehouse-1',
        category: 'electronics',
        rules: JSON.stringify({
          standard: { base_cost: 50, per_kg_cost: 10, estimatedDays: 5 },
          express: { base_cost: 150, per_kg_cost: 20, estimatedDays: 2 },
        }),
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockWarehouse }, // getNearestWarehouseWithStock
        { first: { product_id: params.productId, quantity: 100 } }, // getStockFromWarehouse (if productId provided)
        { first: mockShippingRule }, // getShippingRulesByWarehouseAndCategory
      ]);
      
      const result = await calculateShippingCost(mockDb, params);
      
      expect(result).to.have.property('cost');
      expect(result).to.have.property('estimatedDays');
      expect(result.cost).to.be.a('number');
      expect(result.cost).to.be.greaterThan(0);
    });
    
    it('should throw error when address is missing', async () => {
      const params = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 1,
      };
      
      try {
        await calculateShippingCost(mockDb, params);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Address');
      }
    });
  });
  
});

