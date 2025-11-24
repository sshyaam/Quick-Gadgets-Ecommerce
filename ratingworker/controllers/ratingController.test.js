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
  });
});

