/**
 * Tests for orderValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createOrderSchema } from './orderValidation.js';

describe('orderValidation', () => {
  describe('createOrderSchema', () => {
    it('should validate valid order data', () => {
      const validData = {
        address: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India',
        },
        itemShippingModes: {
          'product-1': 'standard',
          'product-2': 'express',
        },
      };
      
      const { error, value } = createOrderSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.have.property('address');
      expect(value).to.have.property('itemShippingModes');
    });
    
    it('should initialize empty itemShippingModes if not provided', () => {
      const validData = {
        address: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India',
        },
      };
      
      const { error, value } = createOrderSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.have.property('itemShippingModes');
      expect(value.itemShippingModes).to.deep.equal({});
    });
    
    it('should reject missing address', () => {
      const invalidData = {
        itemShippingModes: {},
      };
      
      const { error } = createOrderSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('address');
    });
    
    it('should reject missing required address fields', () => {
      const invalidData = {
        address: {
          street: '123 Main St',
          // Missing city, state, zipCode, country
        },
        itemShippingModes: {},
      };
      
      const { error } = createOrderSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject unknown fields', () => {
      const invalidData = {
        address: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India',
        },
        unknownField: 'should be rejected',
      };
      
      const { error } = createOrderSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
});

