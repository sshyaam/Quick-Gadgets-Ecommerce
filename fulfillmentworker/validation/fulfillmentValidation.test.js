/**
 * Tests for fulfillmentValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  updateStockSchema,
  reduceStockSchema,
  reserveStockSchema,
  releaseStockSchema,
  calculateShippingSchema,
  calculateBatchShippingSchema
} from './fulfillmentValidation.js';

describe('fulfillmentValidation', () => {
  describe('updateStockSchema', () => {
    it('should validate valid stock update', () => {
      const data = { quantity: 100 };
      
      const { error, value } = updateStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.quantity).to.equal(100);
    });

    it('should allow zero quantity', () => {
      const data = { quantity: 0 };
      
      const { error, value } = updateStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.quantity).to.equal(0);
    });

    it('should reject negative quantity', () => {
      const data = { quantity: -1 };
      
      const { error } = updateStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('greater than or equal');
    });

    it('should reject non-integer quantity', () => {
      const data = { quantity: 10.5 };
      
      const { error } = updateStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('integer');
    });

    it('should require quantity', () => {
      const data = {};
      
      const { error } = updateStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('quantity');
    });
  });

  describe('reduceStockSchema', () => {
    it('should validate valid stock reduction', () => {
      const data = { quantity: 10, orderId: 'order-123' };
      
      const { error, value } = reduceStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.quantity).to.equal(10);
    });

    it('should require positive quantity', () => {
      const data = { quantity: 0 };
      
      const { error } = reduceStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('positive');
    });

    it('should allow optional orderId', () => {
      const data = { quantity: 10 };
      
      const { error, value } = reduceStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.orderId).to.be.undefined;
    });
  });

  describe('reserveStockSchema', () => {
    it('should validate valid stock reservation', () => {
      const data = { quantity: 10, orderId: 'order-123', ttlMinutes: 30 };
      
      const { error, value } = reserveStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.quantity).to.equal(10);
      expect(value.orderId).to.equal('order-123');
      expect(value.ttlMinutes).to.equal(30);
    });

    it('should default ttlMinutes to 15', () => {
      const data = { quantity: 10, orderId: 'order-123' };
      
      const { error, value } = reserveStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.ttlMinutes).to.equal(15);
    });

    it('should require orderId', () => {
      const data = { quantity: 10 };
      
      const { error } = reserveStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('orderId');
    });

    it('should validate ttlMinutes min value', () => {
      const data = { quantity: 10, orderId: 'order-123', ttlMinutes: 0 };
      
      const { error } = reserveStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('positive');
    });

    it('should validate ttlMinutes max value', () => {
      const data = { quantity: 10, orderId: 'order-123', ttlMinutes: 61 };
      
      const { error } = reserveStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('less than or equal');
    });
  });

  describe('releaseStockSchema', () => {
    it('should validate release by orderId', () => {
      const data = { orderId: 'order-123' };
      
      const { error, value } = releaseStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.orderId).to.equal('order-123');
    });

    it('should validate release by quantity', () => {
      const data = { quantity: 10 };
      
      const { error, value } = releaseStockSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.quantity).to.equal(10);
    });

    it('should reject when neither orderId nor quantity provided', () => {
      const data = {};
      
      const { error } = releaseStockSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('contain at least one');
    });
  });

  describe('calculateShippingSchema', () => {
    it('should validate valid shipping calculation', () => {
      const data = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 2,
        productId: 'product-123',
        address: {
          pincode: '123456',
          city: 'Mumbai',
          state: 'Maharashtra'
        }
      };
      
      const { error, value } = calculateShippingSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.category).to.equal('electronics');
      expect(value.shippingMode).to.equal('standard');
    });

    it('should validate pincode pattern', () => {
      const data = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 2,
        address: {
          pincode: '012345', // Invalid: starts with 0
          state: 'Maharashtra'
        }
      };
      
      const { error } = calculateShippingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('pincode');
    });

    it('should validate shippingMode enum', () => {
      const data = {
        category: 'electronics',
        shippingMode: 'invalid',
        quantity: 2,
        address: {
          pincode: '123456',
          state: 'Maharashtra'
        }
      };
      
      const { error } = calculateShippingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('standard');
    });

    it('should allow empty city', () => {
      const data = {
        category: 'electronics',
        shippingMode: 'standard',
        quantity: 2,
        address: {
          pincode: '123456',
          city: '',
          state: 'Maharashtra'
        }
      };
      
      const { error, value } = calculateShippingSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.address.city).to.equal('');
    });
  });

  describe('calculateBatchShippingSchema', () => {
    it('should validate valid batch shipping calculation', () => {
      const data = {
        items: [
          { productId: 'product-1', category: 'electronics', quantity: 2 },
          { productId: 'product-2', category: 'clothing', quantity: 1 }
        ],
        address: {
          pincode: '123456',
          city: 'Mumbai',
          state: 'Maharashtra'
        }
      };
      
      const { error, value } = calculateBatchShippingSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.items).to.have.length(2);
    });

    it('should require at least one item', () => {
      const data = {
        items: [],
        address: {
          pincode: '123456',
          state: 'Maharashtra'
        }
      };
      
      const { error } = calculateBatchShippingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('contain at least 1');
    });

    it('should validate each item structure', () => {
      const data = {
        items: [
          { productId: 'product-1' } // Missing category and quantity
        ],
        address: {
          pincode: '123456',
          state: 'Maharashtra'
        }
      };
      
      const { error } = calculateBatchShippingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
    });
  });
});

