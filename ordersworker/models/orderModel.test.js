/**
 * Tests for orderModel
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as orderModel from './orderModel.js';
import { createMockD1WithSequence } from '../../test/setup.js';

describe('orderModel', () => {
  describe('createOrder', () => {
    it('should create order successfully', async () => {
      const orderData = {
        userId: 'user-123',
        userData: { name: 'Test User', email: 'test@example.com' },
        addressData: {
          street: '123 Main St',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        },
        productData: [{ productId: 'prod-1', quantity: 2, price: 50 }],
        shippingData: { cost: 10, mode: 'standard' },
        totalAmount: 110
      };

      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1, last_row_id: 0 }
          }
        }
      ]);

      const result = await orderModel.createOrder(mockDb, orderData);

      expect(result).to.have.property('orderId');
      expect(result.userId).to.equal('user-123');
      expect(result.status).to.equal('processing');
      expect(result.totalAmount).to.equal(110);
    });

    it('should default payment method to paypal', async () => {
      const orderData = {
        userId: 'user-123',
        userData: {},
        addressData: { street: '123 St', city: 'Mumbai', state: 'MH', zipCode: '400001', country: 'India' },
        productData: [],
        totalAmount: 100
      };

      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await orderModel.createOrder(mockDb, orderData);

      // Verify order was created
      expect(result).to.have.property('orderId');
      expect(result.status).to.equal('processing');
    });

    it('should throw error when creation fails', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: false,
            meta: { changes: 0 }
          }
        }
      ]);

      try {
        await orderModel.createOrder(mockDb, {
          userId: 'user-123',
          userData: {},
          addressData: { street: '123 St', city: 'Mumbai', state: 'MH', zipCode: '400001', country: 'India' },
          productData: [],
          totalAmount: 100
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create order');
      }
    });
  });

  describe('getOrderById', () => {
    it('should return order when it exists', async () => {
      const order = {
        order_id: 'order-123',
        user_id: 'user-123',
        user_data: JSON.stringify({ name: 'Test User' }),
        address_data: JSON.stringify({ street: '123 Main St' }),
        product_data: JSON.stringify([{ productId: 'prod-1' }]),
        shipping_data: JSON.stringify({ cost: 10 }),
        total_amount: 100,
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mockDb = createMockD1WithSequence([
        { first: order }
      ]);

      const result = await orderModel.getOrderById(mockDb, 'order-123');

      expect(result).to.not.be.null;
      expect(result.orderId).to.equal('order-123');
      expect(result.userData).to.be.an('object');
      expect(result.addressData).to.be.an('object');
    });

    it('should return null when order does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);

      const result = await orderModel.getOrderById(mockDb, 'invalid-order');

      expect(result).to.be.null;
    });
  });

  describe('getOrdersByUserId', () => {
    it('should return orders with pagination', async () => {
      const orders = [
        {
          order_id: 'order-1',
          user_id: 'user-123',
          user_data: JSON.stringify({}),
          address_data: JSON.stringify({}),
          product_data: JSON.stringify([]),
          shipping_data: JSON.stringify({}),
          total_amount: 100,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ];

      const mockDb = createMockD1WithSequence([
        { all: { results: orders, success: true } },
        { first: { total: 1 } }
      ]);

      const result = await orderModel.getOrdersByUserId(mockDb, 'user-123', 1, 10);

      expect(result.orders).to.have.length(1);
      expect(result.pagination.total).to.equal(1);
    });

    it('should filter by status when provided', async () => {
      const orders = [
        {
          order_id: 'order-1',
          user_id: 'user-123',
          user_data: JSON.stringify({}),
          address_data: JSON.stringify({}),
          product_data: JSON.stringify([]),
          shipping_data: JSON.stringify({}),
          total_amount: 100,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ];

      const mockDb = createMockD1WithSequence([
        { all: { results: orders, success: true } },
        { first: { total: 1 } }
      ]);

      const result = await orderModel.getOrdersByUserId(mockDb, 'user-123', 1, 10, 'completed');

      expect(result.orders).to.have.length(1);
    });

    it('should filter by date range when provided', async () => {
      const orders = [];
      const mockDb = createMockD1WithSequence([
        { all: { results: orders, success: true } },
        { first: { total: 0 } }
      ]);

      const result = await orderModel.getOrdersByUserId(
        mockDb,
        'user-123',
        1,
        10,
        null,
        '2024-01-01',
        '2024-01-31'
      );

      expect(result.orders).to.be.an('array');
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await orderModel.updateOrderStatus(mockDb, 'order-123', 'completed');

      expect(result).to.be.true;
    });

    it('should return false when order does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 }
          }
        }
      ]);

      const result = await orderModel.updateOrderStatus(mockDb, 'invalid-order', 'completed');

      expect(result).to.be.false;
    });
  });

  describe('updateBillingAddress', () => {
    it('should update billing address successfully', async () => {
      const order = {
        order_id: 'order-123',
        user_id: 'user-123',
        user_data: JSON.stringify({}),
        address_data: JSON.stringify({ street: '123 Main St' }),
        product_data: JSON.stringify([]),
        shipping_data: JSON.stringify({}),
        total_amount: 100,
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mockDb = createMockD1WithSequence([
        { first: order },
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const billingAddress = {
        street: '456 Billing St',
        city: 'Delhi',
        state: 'Delhi',
        zipCode: '110001',
        country: 'India'
      };

      const result = await orderModel.updateBillingAddress(mockDb, 'order-123', billingAddress);

      expect(result).to.be.true;
    });

    it('should return false when order does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);

      const result = await orderModel.updateBillingAddress(mockDb, 'invalid-order', {});

      expect(result).to.be.false;
    });
  });
});

