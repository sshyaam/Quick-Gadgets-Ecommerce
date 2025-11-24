/**
 * Tests for ratingValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createRatingSchema } from './ratingValidation.js';

describe('ratingValidation', () => {
  describe('createRatingSchema', () => {
    it('should validate valid rating data', () => {
      const validData = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 5,
        title: 'Great product!',
        comment: 'This is an excellent product.'
      };
      
      const { error, value } = createRatingSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value.rating).to.equal(5);
      expect(value.title).to.equal('Great product!');
    });

    it('should require orderId', () => {
      const data = {
        productId: 'product-456',
        userId: 'user-789',
        rating: 5
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('orderId');
    });

    it('should require productId', () => {
      const data = {
        orderId: 'order-123',
        userId: 'user-789',
        rating: 5
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('productId');
    });

    it('should require userId', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        rating: 5
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('userId');
    });

    it('should require rating', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789'
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('rating');
    });

    it('should reject rating less than 1', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 0
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('greater than or equal');
    });

    it('should reject rating greater than 5', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 6
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('less than or equal');
    });

    it('should reject non-integer rating', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 3.5
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('integer');
    });

    it('should validate title max length', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 5,
        title: 'a'.repeat(201)
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('length must be less than or equal');
    });

    it('should validate comment max length', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 5,
        comment: 'a'.repeat(2001)
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('length must be less than or equal');
    });

    it('should allow optional title and comment', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 5
      };
      
      const { error, value } = createRatingSchema.validate(data);
      
      expect(error).to.be.undefined;
      expect(value.title).to.be.undefined;
      expect(value.comment).to.be.undefined;
    });

    it('should validate title min length', () => {
      const data = {
        orderId: 'order-123',
        productId: 'product-456',
        userId: 'user-789',
        rating: 5,
        title: ''
      };
      
      const { error } = createRatingSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('not allowed to be empty');
    });
  });
});

