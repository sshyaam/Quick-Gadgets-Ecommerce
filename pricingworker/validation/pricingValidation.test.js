/**
 * Tests for pricingValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { setPriceSchema, updatePriceSchema } from './pricingValidation.js';

describe('pricingValidation', () => {
  describe('setPriceSchema', () => {
    it('should validate correct price data', () => {
      const validData = {
        price: 99.99,
        currency: 'USD'
      };

      const { error, value } = setPriceSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.price).to.equal(99.99);
      expect(value.currency).to.equal('USD');
    });

    it('should default currency to USD when not provided', () => {
      const validData = {
        price: 99.99
      };

      const { error, value } = setPriceSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.currency).to.equal('USD');
    });

    it('should uppercase currency', () => {
      const validData = {
        price: 99.99,
        currency: 'usd'
      };

      const { error, value } = setPriceSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.currency).to.equal('USD');
    });

    it('should reject when price is missing', () => {
      const invalidData = {
        currency: 'USD'
      };

      const { error } = setPriceSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('price');
    });

    it('should reject when price is not positive', () => {
      const invalidData = {
        price: 0
      };

      const { error } = setPriceSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });

    it('should reject when price is negative', () => {
      const invalidData = {
        price: -10
      };

      const { error } = setPriceSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });

    it('should reject when currency is not 3 characters', () => {
      const invalidData = {
        price: 99.99,
        currency: 'US'
      };

      const { error } = setPriceSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });
  });

  describe('updatePriceSchema', () => {
    it('should validate correct price update data', () => {
      const validData = {
        price: 149.99
      };

      const { error, value } = updatePriceSchema.validate(validData);

      expect(error).to.be.undefined;
      expect(value.price).to.equal(149.99);
    });

    it('should reject when price is missing', () => {
      const invalidData = {};

      const { error } = updatePriceSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('price');
    });

    it('should reject when price is not positive', () => {
      const invalidData = {
        price: 0
      };

      const { error } = updatePriceSchema.validate(invalidData);

      expect(error).to.not.be.undefined;
    });
  });
});

