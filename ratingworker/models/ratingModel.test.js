/**
 * Tests for ratingModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  createRating,
  getRatingByOrderAndProduct,
  getRatingsByOrder,
  getRatingsByProduct,
} from './ratingModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('ratingModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('createRating', () => {
    it('should create a rating successfully', async () => {
      const ratingData = {
        orderId: 'order-id',
        productId: 'product-id',
        userId: 'user-id',
        rating: 5,
        title: 'Great product',
        comment: 'Very satisfied',
      };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await createRating(mockDb, ratingData);
      
      expect(result).to.have.property('ratingId');
      expect(result).to.have.property('orderId', ratingData.orderId);
      expect(result).to.have.property('productId', ratingData.productId);
      expect(result).to.have.property('userId', ratingData.userId);
      expect(result).to.have.property('rating', ratingData.rating);
      expect(result).to.have.property('title', ratingData.title);
      expect(result).to.have.property('comment', ratingData.comment);
      expect(result).to.have.property('createdAt');
    });
    
    it('should create rating without title and comment', async () => {
      const ratingData = {
        orderId: 'order-id',
        productId: 'product-id',
        userId: 'user-id',
        rating: 4,
      };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await createRating(mockDb, ratingData);
      
      expect(result).to.have.property('ratingId');
      expect(result.title).to.be.null;
      expect(result.comment).to.be.null;
    });
    
    it('should throw error if database operation fails', async () => {
      const ratingData = {
        orderId: 'order-id',
        productId: 'product-id',
        userId: 'user-id',
        rating: 5,
      };
      
      mockDb = createMockD1WithSequence([
        { run: { success: false, meta: { changes: 0 }, error: 'Database error' } },
      ]);
      
      try {
        await createRating(mockDb, ratingData);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create rating');
      }
    });
  });
  
  describe('getRatingByOrderAndProduct', () => {
    it('should return rating for existing order and product', async () => {
      const orderId = 'order-id';
      const productId = 'product-id';
      const mockRating = {
        rating_id: 'rating-id',
        order_id: orderId,
        product_id: productId,
        user_id: 'user-id',
        rating: 5,
        title: 'Great product',
        comment: 'Very satisfied',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockRating },
      ]);
      
      const result = await getRatingByOrderAndProduct(mockDb, orderId, productId);
      
      expect(result).to.not.be.null;
      expect(result.order_id).to.equal(orderId);
      expect(result.product_id).to.equal(productId);
    });
    
    it('should return null for non-existent rating', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getRatingByOrderAndProduct(mockDb, 'order-id', 'product-id');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getRatingsByOrder', () => {
    it('should return all ratings for an order', async () => {
      const orderId = 'order-id';
      const mockRatings = [
        {
          rating_id: 'rating-1',
          order_id: orderId,
          product_id: 'product-1',
          user_id: 'user-id',
          rating: 5,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          rating_id: 'rating-2',
          order_id: orderId,
          product_id: 'product-2',
          user_id: 'user-id',
          rating: 4,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockRatings, success: true } },
      ]);
      
      const result = await getRatingsByOrder(mockDb, orderId);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(2);
    });
    
    it('should return empty array if no ratings exist', async () => {
      const orderId = 'order-id';
      
      mockDb = createMockD1WithSequence([
        { all: { results: [], success: true } },
      ]);
      
      const result = await getRatingsByOrder(mockDb, orderId);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(0);
    });
  });
  
  describe('getRatingsByProduct', () => {
    it('should return ratings with pagination and average', async () => {
      const productId = 'product-id';
      const mockRatings = [
        {
          rating_id: 'rating-1',
          order_id: 'order-1',
          product_id: productId,
          user_id: 'user-1',
          rating: 5,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          rating_id: 'rating-2',
          order_id: 'order-2',
          product_id: productId,
          user_id: 'user-2',
          rating: 4,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockRatings, success: true } },
        { first: { total: 2, average: 4.5 } },
      ]);
      
      const result = await getRatingsByProduct(mockDb, productId, 1, 20);
      
      expect(result).to.have.property('ratings');
      expect(result.ratings).to.be.an('array');
      expect(result).to.have.property('average', 4.5);
      expect(result).to.have.property('total', 2);
      expect(result).to.have.property('pagination');
      expect(result.pagination).to.have.property('page', 1);
    });
    
    it('should handle pagination correctly', async () => {
      const productId = 'product-id';
      
      mockDb = createMockD1WithSequence([
        { all: { results: [], success: true } },
        { first: { total: 25, average: 4.0 } },
      ]);
      
      const result = await getRatingsByProduct(mockDb, productId, 2, 10);
      
      expect(result).to.have.property('pagination');
      expect(result.pagination).to.have.property('page', 2);
      expect(result.pagination).to.have.property('totalPages', 3);
      expect(result.pagination).to.have.property('hasNext', true);
      expect(result.pagination).to.have.property('hasPrev', true);
    });
  });
});

