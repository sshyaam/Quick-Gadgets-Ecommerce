/**
 * Tests for orderService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getOrderById,
  getOrdersByUserId,
  groupOrdersByDeliveryDate,
} from './orderService.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence, createMockEnv } from '../../test/setup.js';

describe('orderService', () => {
  let mockDb;
  let mockEnv;
  
  beforeEach(() => {
    mockDb = createMockD1();
    mockEnv = createMockEnv();
  });
  
  describe('getOrderById', () => {
    it('should return order when found', async () => {
      const orderId = 'test-order-id';
      const mockOrder = {
        order_id: orderId,
        user_id: 'user-id',
        user_data: JSON.stringify({ name: 'Test User' }),
        address_data: JSON.stringify({ pincode: '600001' }),
        product_data: JSON.stringify({ items: [] }),
        shipping_data: JSON.stringify({}),
        total_amount: 1000,
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockOrder },
      ]);
      
      const result = await getOrderById(orderId, mockDb);
      
      // The model transforms snake_case to camelCase
      expect(result).to.have.property('orderId', orderId);
      expect(result).to.have.property('status', 'pending');
    });
    
    it('should throw NotFoundError when order not found', async () => {
      const orderId = 'non-existent-id';
      
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      try {
        await getOrderById(orderId, mockDb);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
  });
  
  describe('getOrdersByUserId', () => {
    it('should return paginated orders', async () => {
      const userId = 'test-user-id';
      const page = 1;
      const limit = 10;
      
      const mockOrders = [
        {
          order_id: 'order-1',
          user_id: userId,
          data: JSON.stringify({ items: [] }),
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          order_id: 'order-2',
          user_id: userId,
          data: JSON.stringify({ items: [] }),
          status: 'pending',
          created_at: '2024-01-02T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockOrders, success: true } },
        { first: { count: 2 } }, // Count query
      ]);
      
      const result = await getOrdersByUserId(userId, page, limit, mockDb);
      
      expect(result).to.have.property('orders');
      expect(result).to.have.property('pagination');
      expect(result.orders).to.be.an('array');
    });
  });
  
  describe('groupOrdersByDeliveryDate', () => {
    it('should group orders by delivery date', () => {
      const orders = [
        {
          orderId: 'order-1',
          createdAt: '2024-01-01T00:00:00Z',
          items: [{ productId: 'prod-1', quantity: 1 }],
          shippingData: { estimatedDelivery: 5 },
        },
        {
          orderId: 'order-2',
          createdAt: '2024-01-01T00:00:00Z',
          items: [{ productId: 'prod-2', quantity: 1 }],
          shippingData: { estimatedDelivery: 7 },
        },
        {
          orderId: 'order-3',
          createdAt: '2024-01-02T00:00:00Z',
          items: [{ productId: 'prod-3', quantity: 1 }],
          shippingData: { estimatedDelivery: 5 },
        },
      ];
      
      const result = groupOrdersByDeliveryDate(orders);
      
      expect(result).to.be.an('object');
      expect(Object.keys(result).length).to.be.greaterThan(0);
      
      // Check that each grouped order has deliveryDate
      Object.values(result).forEach(orderGroup => {
        orderGroup.forEach(order => {
          expect(order).to.have.property('deliveryDate');
          expect(order).to.have.property('items');
        });
      });
    });
    
    it('should group items with different delivery dates separately', () => {
      const orders = [
        {
          orderId: 'order-1',
          createdAt: '2024-01-01T00:00:00Z',
          items: [
            {
              productId: 'prod-1',
              quantity: 1,
              shipping: { estimatedDays: 5 }, // Delivery: 2024-01-06
            },
            {
              productId: 'prod-2',
              quantity: 2,
              shipping: { estimatedDays: 7 }, // Delivery: 2024-01-08
            },
          ],
          shippingData: { estimatedDelivery: 5 },
        },
      ];
      
      const result = groupOrdersByDeliveryDate(orders);
      
      // Should create two groups (one for each delivery date)
      const dateKeys = Object.keys(result);
      expect(dateKeys.length).to.equal(2);
      
      // Check that each group has the correct items
      dateKeys.forEach(dateKey => {
        const orderGroup = result[dateKey];
        expect(orderGroup.length).to.equal(1);
        const order = orderGroup[0];
        expect(order.orderId).to.equal('order-1');
        expect(order.items.length).to.equal(1); // Each group should have only one item
        expect(order).to.have.property('deliveryDate', dateKey);
      });
    });
    
    it('should use default estimatedDelivery of 5 days', () => {
      const orders = [
        {
          orderId: 'order-1',
          createdAt: '2024-01-01T00:00:00Z',
          items: [{ productId: 'prod-1', quantity: 1 }],
          shippingData: {},
        },
      ];
      
      const result = groupOrdersByDeliveryDate(orders);
      
      const dateKeys = Object.keys(result);
      expect(dateKeys.length).to.be.greaterThan(0);
      const firstGroup = result[dateKeys[0]];
      expect(firstGroup[0]).to.have.property('deliveryDate');
    });
  });
});

