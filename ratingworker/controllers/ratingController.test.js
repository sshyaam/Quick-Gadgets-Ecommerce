/**
 * Tests for ratingController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as ratingController from './ratingController.js';
import { ValidationError, AuthenticationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('ratingController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    // Setup mock database for health check
    const mockDb = createMockD1();
    mockDb.prepare = (query) => {
      if (query && query.includes('SELECT 1')) {
        return {
          first: async () => ({ '1': 1 }),
          bind: () => ({
            first: async () => ({ '1': 1 })
          })
        };
      }
      return {
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: { changes: 1 } })
        }),
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 1 } })
      };
    };
    mockEnv.rating_db = mockDb;
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      const request = createMockRequest('https://example.com/health');
      
      const response = await ratingController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.equal('rating-worker');
      expect(data).to.have.property('timestamp');
    });

    it('should return unhealthy status when database fails', async () => {
      const request = createMockRequest('https://example.com/health');
      mockEnv.rating_db.prepare = () => {
        throw new Error('Database connection failed');
      };
      
      const response = await ratingController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      expect(data.service).to.equal('rating-worker');
      expect(data).to.have.property('error');
    });
  });

  describe('validateWorkerRequest', () => {
    it('should throw AuthenticationError when API key is invalid', () => {
      const request = createMockRequest('https://example.com/rating', {
        headers: {
          'X-API-Key': 'wrong-key',
          'X-Worker-Request': 'true'
        }
      });
      
      try {
        ratingController.validateWorkerRequest(request, mockEnv);
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });

    it('should not throw when API key is valid', () => {
      const request = createMockRequest('https://example.com/rating', {
        headers: {
          'X-API-Key': 'test-api-key',
          'X-Worker-Request': 'true'
        }
      });
      
      // Should not throw
      ratingController.validateWorkerRequest(request, mockEnv);
    });
  });

  describe('createRating', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const request = createMockRequest('https://example.com/rating', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      try {
        await ratingController.createRating(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('createRating', () => {
    it('should create rating successfully', async () => {
      const request = createMockRequest('https://example.com/rating', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'order-123',
          productId: 'product-123',
          userId: 'user-123',
          rating: 5,
          title: 'Great product',
          comment: 'Very satisfied'
        })
      });
      
      // submitRating first checks for existing rating, then creates in transaction
      // executeTransaction calls the callback which calls createRating
      // createRating returns an object with camelCase fields
      const mockDb = createMockD1WithSequence([
        { first: null }, // getRatingByOrderAndProduct - no existing rating
        { run: { success: true, meta: { changes: 1 } } } // createRating INSERT (inside executeTransaction)
      ]);
      mockEnv.rating_db = mockDb;
      
      // Mock executeTransaction to return the created rating object
      const originalExecuteTransaction = (await import('../../shared/utils/database.js')).executeTransaction;
      // We can't easily mock ES modules, so we'll just verify the response structure
      // The actual createRating returns { ratingId, orderId, productId, userId, rating, title, comment, createdAt }
      
      const response = await ratingController.createRating(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(201);
      // createRating returns camelCase: ratingId, not rating_id
      expect(data).to.have.property('ratingId');
      expect(data).to.have.property('orderId', 'order-123');
      expect(data).to.have.property('productId', 'product-123');
    });
  });

  describe('getRatings', () => {
    it('should return ratings for product with default pagination', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/ratings/${productId}`);
      request.params = { productId };
      
      const mockRatings = {
        ratings: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
      };
      
      const mockDb = createMockD1WithSequence([
        { all: { results: [] } },
        { first: { total: 0 } }
      ]);
      mockEnv.rating_db = mockDb;
      
      const response = await ratingController.getRatings(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('ratings');
      expect(data).to.have.property('pagination');
    });

    it('should handle custom page and limit', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/ratings/${productId}?page=2&limit=10`);
      request.params = { productId };
      
      const mockDb = createMockD1WithSequence([
        { all: { results: [] } },
        { first: { total: 0 } }
      ]);
      mockEnv.rating_db = mockDb;
      
      const response = await ratingController.getRatings(request, mockEnv);
      
      expect(response.status).to.equal(200);
    });

    it('should fetch user names when ratings exist', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/ratings/${productId}`);
      request.params = { productId };
      
      const mockRatings = [
        { rating_id: 'rating-1', user_id: 'user-123', rating: 5, title: 'Great', comment: 'Good', created_at: '2024-01-01', updated_at: '2024-01-01' }
      ];
      
      const mockDb = createMockD1WithSequence([
        { all: { results: mockRatings } },
        { first: { total: 1 } }
      ]);
      mockEnv.rating_db = mockDb;
      
      // Mock auth worker to return user names
      mockEnv.auth_worker._setResponse('GET', '/users/batch', { users: { 'user-123': { name: 'John Doe', profileImage: 'image.jpg' } } });
      
      const response = await ratingController.getRatings(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.ratings[0]).to.have.property('userName', 'John Doe');
      expect(data.ratings[0]).to.have.property('userProfileImage', 'image.jpg');
    });

    it('should handle auth worker fallback to HTTP', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/ratings/${productId}`);
      request.params = { productId };
      
      const mockRatings = [
        { rating_id: 'rating-1', user_id: 'user-123', rating: 5, title: 'Great', comment: 'Good', created_at: '2024-01-01', updated_at: '2024-01-01' }
      ];
      
      const mockDb = createMockD1WithSequence([
        { all: { results: mockRatings } },
        { first: { total: 1 } }
      ]);
      mockEnv.rating_db = mockDb;
      
      // Remove auth_worker to trigger HTTP fallback
      delete mockEnv.auth_worker;
      mockEnv.AUTH_WORKER_URL = 'https://auth-worker.test';
      
      // Mock global fetch for HTTP fallback
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        if (url.includes('/users/batch')) {
          return new Response(JSON.stringify({ users: { 'user-123': { name: 'John Doe' } } }), { status: 200 });
        }
        return originalFetch(url);
      };
      
      const response = await ratingController.getRatings(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.ratings[0]).to.have.property('userName', 'John Doe');
      
      // Restore fetch
      global.fetch = originalFetch;
    });

    it('should handle auth worker error gracefully', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/ratings/${productId}`);
      request.params = { productId };
      
      const mockRatings = [
        { rating_id: 'rating-1', user_id: 'user-123', rating: 5, title: 'Great', comment: 'Good', created_at: '2024-01-01', updated_at: '2024-01-01' }
      ];
      
      const mockDb = createMockD1WithSequence([
        { all: { results: mockRatings } },
        { first: { total: 1 } }
      ]);
      mockEnv.rating_db = mockDb;
      
      // Mock auth worker to return error
      mockEnv.auth_worker._setResponse('GET', '/users/batch', null, { status: 500 });
      
      const response = await ratingController.getRatings(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.ratings[0]).to.have.property('userName', 'Anonymous');
    });
  });

  describe('getRating', () => {
    it('should return rating when found', async () => {
      const orderId = 'order-123';
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/rating/${orderId}/${productId}`);
      request.params = { orderId, productId };
      
      const mockRating = {
        rating_id: 'rating-123',
        order_id: orderId,
        product_id: productId,
        user_id: 'user-123',
        rating: 5,
        title: 'Great',
        comment: 'Good',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      };
      
      const mockDb = createMockD1WithSequence([
        { first: mockRating }
      ]);
      mockEnv.rating_db = mockDb;
      
      const response = await ratingController.getRating(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('rating_id', 'rating-123');
    });

    it('should return 404 when rating not found', async () => {
      const orderId = 'order-123';
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/rating/${orderId}/${productId}`);
      request.params = { orderId, productId };
      
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);
      mockEnv.rating_db = mockDb;
      
      const response = await ratingController.getRating(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(404);
      expect(data).to.have.property('error', 'Rating not found');
    });
  });

  describe('getOrderRatings', () => {
    it('should return order ratings as map', async () => {
      const orderId = 'order-123';
      const request = createMockRequest(`https://example.com/order/${orderId}/ratings`);
      request.params = { orderId };
      
      const mockRatings = [
        { rating_id: 'rating-1', order_id: orderId, product_id: 'product-1', user_id: 'user-123', rating: 5, title: 'Great', comment: 'Good', created_at: '2024-01-01', updated_at: '2024-01-01' },
        { rating_id: 'rating-2', order_id: orderId, product_id: 'product-2', user_id: 'user-123', rating: 4, title: 'OK', comment: 'Fine', created_at: '2024-01-01', updated_at: '2024-01-01' }
      ];
      
      const mockDb = createMockD1WithSequence([
        { all: { results: mockRatings } }
      ]);
      mockEnv.rating_db = mockDb;
      
      // Mock auth worker
      mockEnv.auth_worker._setResponse('GET', '/users/batch', { users: { 'user-123': { name: 'John Doe' } } });
      
      const response = await ratingController.getOrderRatings(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('ratings');
      expect(data.ratings).to.have.property('product-1');
      expect(data.ratings).to.have.property('product-2');
      expect(data.ratings['product-1']).to.have.property('userName', 'John Doe');
    });

    it('should handle empty ratings array', async () => {
      const orderId = 'order-123';
      const request = createMockRequest(`https://example.com/order/${orderId}/ratings`);
      request.params = { orderId };
      
      const mockDb = createMockD1WithSequence([
        { all: { results: [] } }
      ]);
      mockEnv.rating_db = mockDb;
      
      const response = await ratingController.getOrderRatings(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('ratings');
      expect(Object.keys(data.ratings).length).to.equal(0);
    });
  });
});

