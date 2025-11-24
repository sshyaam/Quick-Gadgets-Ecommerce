/**
 * Tests for cartValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { addItemSchema, updateItemSchema } from './cartValidation.js';

describe('cartValidation', () => {
  describe('addItemSchema', () => {
    it('should validate correct add item data', () => {
      const validData = {
        productId: 'prod-123',
        quantity: 2
      };

      const { error, value } = addItemSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.productId).to.equal('prod-123');
      expect(value.quantity).to.equal(2);
    });

    it('should reject when productId is missing', () => {
      const invalidData = {
        quantity: 2
      };

      const { error } = addItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('productId');
    });

    it('should reject when quantity is missing', () => {
      const invalidData = {
        productId: 'prod-123'
      };

      const { error } = addItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('quantity');
    });

    it('should reject when quantity is not positive', () => {
      const invalidData = {
        productId: 'prod-123',
        quantity: 0
      };

      const { error } = addItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });

    it('should reject when quantity is negative', () => {
      const invalidData = {
        productId: 'prod-123',
        quantity: -1
      };

      const { error } = addItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });

    it('should reject when quantity is not an integer', () => {
      const invalidData = {
        productId: 'prod-123',
        quantity: 1.5
      };

      const { error } = addItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });
  });

  describe('updateItemSchema', () => {
    it('should validate correct update item data', () => {
      const validData = {
        quantity: 5
      };

      const { error, value } = updateItemSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.quantity).to.equal(5);
    });

    it('should reject when quantity is missing', () => {
      const invalidData = {};

      const { error } = updateItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('quantity');
    });

    it('should reject when quantity is not positive', () => {
      const invalidData = {
        quantity: 0
      };

      const { error } = updateItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });

    it('should reject when quantity is negative', () => {
      const invalidData = {
        quantity: -1
      };

      const { error } = updateItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });

    it('should reject when quantity is not an integer', () => {
      const invalidData = {
        quantity: 2.5
      };

      const { error } = updateItemSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });
  });
});

