/**
 * Tests for ordersController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as ordersController from './ordersController.js';
import { ValidationError, NotFoundError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('ordersController', () => {
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
          all: async () => ({ results: [] })
        }),
        first: async () => null,
        all: async () => ({ results: [] })
      };
    };
    mockEnv.orders_db = mockDb;
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      const request = createMockRequest('https://example.com/health');
      
      const response = await ordersController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.equal('orders-worker');
      expect(data).to.have.property('timestamp');
    });

    it('should return unhealthy status when database fails', async () => {
      const request = createMockRequest('https://example.com/health');
      mockEnv.orders_db.prepare = () => {
        throw new Error('Database connection failed');
      };
      
      const response = await ordersController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      expect(data.service).to.equal('orders-worker');
      expect(data).to.have.property('error');
    });
  });

  describe('getOrders', () => {
    it('should return orders with default pagination', async () => {
      const request = createMockRequest('https://example.com/orders');
      request.user = { userId: 'user-123' };
      
      // Mock database to return orders
      const mockOrders = [
        {
          orderId: 'order-1',
          status: 'pending',
          totalAmount: 100,
          createdAt: '2024-01-01',
          productData: { items: [] },
          shippingData: null
        }
      ];
      
      const mockDb = createMockD1WithSequence([
        { all: { results: mockOrders } },
        { first: { total: 1 } }
      ]);
      mockEnv.orders_db = mockDb;
      
      const response = await ordersController.getOrders(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('orders');
      expect(data).to.have.property('pagination');
    });

    it('should handle custom page and limit', async () => {
      const request = createMockRequest('https://example.com/orders?page=2&limit=20');
      request.user = { userId: 'user-123' };
      
      const mockDb = createMockD1WithSequence([
        { all: { results: [] } },
        { first: { total: 0 } }
      ]);
      mockEnv.orders_db = mockDb;
      
      const response = await ordersController.getOrders(request, mockEnv);
      
      expect(response.status).to.equal(200);
    });

    it('should handle status filter', async () => {
      const request = createMockRequest('https://example.com/orders?status=completed');
      request.user = { userId: 'user-123' };
      
      const mockDb = createMockD1WithSequence([
        { all: { results: [] } },
        { first: { total: 0 } }
      ]);
      mockEnv.orders_db = mockDb;
      
      const response = await ordersController.getOrders(request, mockEnv);
      
      expect(response.status).to.equal(200);
    });
  });

  describe('getOrder', () => {
    it('should return order details', async () => {
      const orderId = 'order-123';
      const userId = 'user-123';
      const request = createMockRequest(`https://example.com/orders/${orderId}`);
      request.params = { orderId };
      request.user = { userId };
      
      // Mock database returns snake_case fields (as D1 would)
      const mockOrder = {
        order_id: orderId,
        user_id: userId, // Must match request.user.userId
        status: 'pending',
        total_amount: 100,
        user_data: JSON.stringify({}),
        address_data: JSON.stringify({}),
        product_data: JSON.stringify({ items: [] }),
        shipping_data: JSON.stringify({}),
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      };
      
      const mockDb = createMockD1WithSequence([
        { first: mockOrder }
      ]);
      mockEnv.orders_db = mockDb;
      
      const response = await ordersController.getOrder(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('orderId', orderId);
    });

    it('should throw NotFoundError when order not found', async () => {
      const orderId = 'non-existent';
      const request = createMockRequest(`https://example.com/orders/${orderId}`);
      request.params = { orderId };
      request.user = { userId: 'user-123' };
      
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);
      mockEnv.orders_db = mockDb;
      
      try {
        await ordersController.getOrder(request, mockEnv);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
  });
});

