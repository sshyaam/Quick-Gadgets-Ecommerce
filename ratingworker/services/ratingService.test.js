/**
 * Tests for ratingService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  submitRating,
  getProductRatings,
  getRating,
  getOrderRatings,
} from './ratingService.js';
import { ConflictError, NotFoundError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('ratingService', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('submitRating', () => {
    it('should create rating successfully', async () => {
      const ratingData = {
        orderId: 'order-id',
        productId: 'product-id',
        userId: 'user-id',
        rating: 5,
        comment: 'Great product!',
      };
      
      // Mock: no existing rating
      mockDb = createMockD1WithSequence([
        { first: null }, // getRatingByOrderAndProduct - no existing rating
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } }, // createRating (in transaction)
      ]);
      
      const result = await submitRating(ratingData, mockDb);
      
      expect(result).to.have.property('ratingId');
      expect(result).to.have.property('rating', 5);
      expect(result).to.have.property('comment', 'Great product!');
    });
    
    it('should throw ConflictError if rating already exists', async () => {
      const ratingData = {
        orderId: 'order-id',
        productId: 'product-id',
        userId: 'user-id',
        rating: 5,
      };
      
      const existingRating = {
        rating_id: 'rating-id',
        order_id: 'order-id',
        product_id: 'product-id',
        user_id: 'user-id',
        rating: 4,
      };
      
      mockDb = createMockD1WithSequence([
        { first: existingRating }, // getRatingByOrderAndProduct - rating exists
      ]);
      
      try {
        await submitRating(ratingData, mockDb);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('already exists');
      }
    });
  });
  
  describe('getProductRatings', () => {
    it('should return ratings for a product', async () => {
      const productId = 'test-product-id';
      const mockRatings = [
        {
          rating_id: 'rating-1',
          product_id: productId,
          user_id: 'user-1',
          rating: 5,
          comment: 'Excellent',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          rating_id: 'rating-2',
          product_id: productId,
          user_id: 'user-2',
          rating: 4,
          comment: 'Good',
          created_at: '2024-01-02T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockRatings, success: true } },
        { first: { count: 2 } }, // Count query
      ]);
      
      const result = await getProductRatings(productId, 1, 10, mockDb);
      
      expect(result).to.have.property('ratings');
      expect(result).to.have.property('pagination');
      expect(result.ratings).to.be.an('array');
    });
  });
  
  describe('getRating', () => {
    it('should return rating when found', async () => {
      const orderId = 'order-id';
      const productId = 'product-id';
      const mockRating = {
        rating_id: 'rating-id',
        order_id: orderId,
        product_id: productId,
        user_id: 'user-id',
        rating: 5,
        comment: 'Great!',
        created_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockRating },
      ]);
      
      const result = await getRating(orderId, productId, mockDb);
      
      expect(result).to.not.be.null;
      expect(result.rating_id).to.equal('rating-id');
      expect(result.rating).to.equal(5);
    });
    
    it('should return null when rating not found', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getRating('order-id', 'product-id', mockDb);
      
      expect(result).to.be.null;
    });
  });
  
  describe('getOrderRatings', () => {
    it('should return all ratings for an order', async () => {
      const orderId = 'order-id';
      const mockRatings = [
        {
          rating_id: 'rating-1',
          order_id: orderId,
          product_id: 'product-1',
          rating: 5,
        },
        {
          rating_id: 'rating-2',
          order_id: orderId,
          product_id: 'product-2',
          rating: 4,
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockRatings, success: true } },
      ]);
      
      const result = await getOrderRatings(orderId, mockDb);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(2);
    });
  });
});

