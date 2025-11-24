/**
 * Tests for orderValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createOrderSchema } from './orderValidation.js';

describe('orderValidation', () => {
  describe('createOrderSchema', () => {
    it('should validate correct order data with required address', () => {
      const validData = {
        address: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        }
      };

      const { error, value } = createOrderSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.address.street).to.equal('123 Main St');
    });

    it('should validate with shippingMode', () => {
      const validData = {
        address: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        },
        shippingMode: 'express'
      };

      const { error, value } = createOrderSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.shippingMode).to.equal('express');
    });

    it('should validate with itemShippingModes', () => {
      const validData = {
        address: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        },
        itemShippingModes: {
          'prod-1': 'express',
          'prod-2': 'standard'
        }
      };

      const { error, value } = createOrderSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.itemShippingModes).to.have.property('prod-1', 'express');
    });

    it('should reject when address is missing', () => {
      const invalidData = {};

      const { error } = createOrderSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('address');
    });

    it('should reject when address.street is missing', () => {
      const invalidData = {
        address: {
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        }
      };

      const { error } = createOrderSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('street');
    });

    it('should reject when shippingMode is invalid', () => {
      const invalidData = {
        address: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        },
        shippingMode: 'invalid-mode'
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
          country: 'India'
        },
        unknownField: 'value'
      };

      const { error } = createOrderSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('unknownField');
    });
  });
});

