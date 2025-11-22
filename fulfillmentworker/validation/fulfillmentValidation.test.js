/**
 * Tests for fulfillmentValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  updateStockSchema,
  reduceStockSchema,
  calculateShippingSchema,
  calculateBatchShippingSchema,
} from './fulfillmentValidation.js';

describe('fulfillmentValidation', () => {
  describe('updateStockSchema', () => {
    it('should validate valid stock update data', () => {
      const validData = {
        quantity: 100,
      };
      
      const { error, value } = updateStockSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.deep.equal(validData);
    });
    
    it('should allow zero quantity', () => {
      const validData = {
        quantity: 0,
      };
      
      const { error } = updateStockSchema.validate(validData);
      
      expect(error).to.be.undefined;
    });
    
    it('should reject negative quantity', () => {
      const invalidData = {
        quantity: -1,
      };
      
      const { error } = updateStockSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject non-integer quantity', () => {
      const invalidData = {
        quantity: 10.5,
      };
      
      const { error } = updateStockSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
  
  describe('reduceStockSchema', () => {
    it('should validate valid stock reduction data', () => {
      const validData = {
        quantity: 5,
      };
      
      const { error, value } = reduceStockSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.deep.equal(validData);
    });
    
    it('should reject zero quantity', () => {
      const invalidData = {
        quantity: 0,
      };
      
      const { error } = reduceStockSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject negative quantity', () => {
      const invalidData = {
        quantity: -1,
      };
      
      const { error } = reduceStockSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
  
  describe('calculateShippingSchema', () => {
    it('should validate valid shipping calculation data', () => {
      const validData = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 2,
        address: {
          pincode: '400001',
          city: 'Mumbai',
          state: 'Maharashtra',
        },
      };
      
      const { error, value } = calculateShippingSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.have.property('category', 'electronics');
      expect(value).to.have.property('shippingMode', 'standard');
    });
    
    it('should reject invalid shipping mode', () => {
      const invalidData = {
        category: 'electronics',
        shippingMode: 'invalid-mode',
        quantity: 2,
        address: {
          pincode: '400001',
          state: 'Maharashtra',
        },
      };
      
      const { error } = calculateShippingSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject invalid pincode format', () => {
      const invalidData = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 2,
        address: {
          pincode: '12345', // Invalid: not 6 digits
          state: 'Maharashtra',
        },
      };
      
      const { error } = calculateShippingSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should accept empty city', () => {
      const validData = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 2,
        address: {
          pincode: '400001',
          city: '',
          state: 'Maharashtra',
        },
      };
      
      const { error } = calculateShippingSchema.validate(validData);
      
      expect(error).to.be.undefined;
    });
  });
  
  describe('calculateBatchShippingSchema', () => {
    it('should validate valid batch shipping data', () => {
      const validData = {
        items: [
          { productId: 'product-1', category: 'electronics', quantity: 2 },
          { productId: 'product-2', category: 'accessories', quantity: 1 },
        ],
        address: {
          pincode: '400001',
          city: 'Mumbai',
          state: 'Maharashtra',
        },
      };
      
      const { error, value } = calculateBatchShippingSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value.items).to.be.an('array');
      expect(value.items.length).to.equal(2);
    });
    
    it('should reject empty items array', () => {
      const invalidData = {
        items: [],
        address: {
          pincode: '400001',
          state: 'Maharashtra',
        },
      };
      
      const { error } = calculateBatchShippingSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject missing productId in item', () => {
      const invalidData = {
        items: [
          { category: 'electronics', quantity: 2 },
        ],
        address: {
          pincode: '400001',
          state: 'Maharashtra',
        },
      };
      
      const { error } = calculateBatchShippingSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
});

