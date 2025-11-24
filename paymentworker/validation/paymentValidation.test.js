/**
 * Tests for paymentValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createOrderSchema, captureOrderSchema } from './paymentValidation.js';

describe('paymentValidation', () => {
  describe('createOrderSchema', () => {
    it('should validate valid order data', () => {
      const validData = {
        amount: 100.50,
        currency: 'USD',
        description: 'Test order',
        orderId: 'order-123',
        returnUrl: 'https://example.com/return',
        cancelUrl: 'https://example.com/cancel'
      };
      
      const { error, value } = createOrderSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value.amount).to.equal(100.50);
      expect(value.currency).to.equal('USD');
    });

    it('should default currency to USD', () => {
      const data = { amount: 100 };
      
      const { error, value } = createOrderSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.currency).to.equal('USD');
    });

    it('should uppercase currency', () => {
      const data = { amount: 100, currency: 'usd' };
      
      const { error, value } = createOrderSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.currency).to.equal('USD');
    });

    it('should reject negative amount', () => {
      const data = { amount: -100 };
      
      const { error } = createOrderSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('positive');
    });

    it('should reject zero amount', () => {
      const data = { amount: 0 };
      
      const { error } = createOrderSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('positive');
    });

    it('should require amount', () => {
      const data = {};
      
      const { error } = createOrderSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('amount');
    });

    it('should validate currency length', () => {
      const data = { amount: 100, currency: 'US' };
      
      const { error } = createOrderSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('length');
    });

    it('should validate returnUrl as URI', () => {
      const data = { amount: 100, returnUrl: 'not-a-uri' };
      
      const { error } = createOrderSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('uri');
    });

    it('should validate cancelUrl as URI', () => {
      const data = { amount: 100, cancelUrl: 'not-a-uri' };
      
      const { error } = createOrderSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('uri');
    });
  });

  describe('captureOrderSchema', () => {
    it('should validate valid capture data', () => {
      const validData = {
        orderId: 'paypal-order-123',
        internalOrderId: 'internal-order-456'
      };
      
      const { error, value } = captureOrderSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value.orderId).to.equal('paypal-order-123');
      expect(value.internalOrderId).to.equal('internal-order-456');
    });

    it('should require orderId', () => {
      const data = {};
      
      const { error } = captureOrderSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('orderId');
    });

    it('should allow optional internalOrderId', () => {
      const data = { orderId: 'paypal-order-123' };
      
      const { error, value } = captureOrderSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.internalOrderId).to.be.undefined;
    });
  });
});

