/**
 * Tests for cartValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { addItemSchema, updateItemSchema } from './cartValidation.js';

describe('cartValidation', () => {
  describe('addItemSchema', () => {
    it('should validate valid add item data', () => {
      const validData = {
        productId: 'product-123',
        quantity: 2,
      };
      
      const { error, value } = addItemSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.deep.equal(validData);
    });
    
    it('should reject missing productId', () => {
      const invalidData = {
        quantity: 2,
      };
      
      const { error } = addItemSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('productId');
    });
    
    it('should reject missing quantity', () => {
      const invalidData = {
        productId: 'product-123',
      };
      
      const { error } = addItemSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('quantity');
    });
    
    it('should reject negative quantity', () => {
      const invalidData = {
        productId: 'product-123',
        quantity: -1,
      };
      
      const { error } = addItemSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject zero quantity', () => {
      const invalidData = {
        productId: 'product-123',
        quantity: 0,
      };
      
      const { error } = addItemSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject non-integer quantity', () => {
      const invalidData = {
        productId: 'product-123',
        quantity: 1.5,
      };
      
      const { error } = addItemSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
  
  describe('updateItemSchema', () => {
    it('should validate valid update item data', () => {
      const validData = {
        quantity: 5,
      };
      
      const { error, value } = updateItemSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.deep.equal(validData);
    });
    
    it('should reject missing quantity', () => {
      const invalidData = {};
      
      const { error } = updateItemSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('quantity');
    });
    
    it('should reject negative quantity', () => {
      const invalidData = {
        quantity: -1,
      };
      
      const { error } = updateItemSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
});

