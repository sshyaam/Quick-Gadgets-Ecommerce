/**
 * Tests for orderModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  createOrder,
  getOrderById,
  getOrdersByUserId,
  updateOrderStatus,
} from './orderModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('orderModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('createOrder', () => {
    it('should create a new order successfully', async () => {
      const orderData = {
        userId: 'user-id',
        userData: { name: 'Test User', email: 'test@example.com' },
        addressData: { street: '123 Main St', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001' },
        productData: { items: [{ productId: 'product-1', quantity: 1 }] },
        shippingData: { mode: 'standard', cost: 50 },
        totalAmount: 1050,
      };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await createOrder(mockDb, orderData);
      
      expect(result).to.have.property('orderId');
      expect(result).to.have.property('userId', orderData.userId);
      expect(result).to.have.property('status', 'processing');
      expect(result).to.have.property('totalAmount', orderData.totalAmount);
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
    });
    
    it('should throw error if database operation fails', async () => {
      const orderData = {
        userId: 'user-id',
        userData: {},
        addressData: {},
        productData: {},
        totalAmount: 1000,
      };
      
      mockDb = createMockD1WithSequence([
        { run: { success: false, meta: { changes: 0 } } },
      ]);
      
      try {
        await createOrder(mockDb, orderData);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create order');
      }
    });
  });
  
  describe('getOrderById', () => {
    it('should return order for existing order ID', async () => {
      const orderId = 'order-id';
      const mockOrder = {
        order_id: orderId,
        user_id: 'user-id',
        user_data: JSON.stringify({ name: 'Test User' }),
        address_data: JSON.stringify({ street: '123 Main St' }),
        product_data: JSON.stringify({ items: [] }),
        shipping_data: JSON.stringify({ mode: 'standard' }),
        total_amount: 1000,
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockOrder },
      ]);
      
      const result = await getOrderById(mockDb, orderId);
      
      expect(result).to.not.be.null;
      expect(result.orderId).to.equal(orderId);
      expect(result).to.have.property('userData');
      expect(result).to.have.property('addressData');
      expect(result).to.have.property('productData');
    });
    
    it('should return null for non-existent order ID', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getOrderById(mockDb, 'non-existent-order');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getOrdersByUserId', () => {
    it('should return orders with pagination', async () => {
      const userId = 'user-id';
      const mockOrders = [
        {
          order_id: 'order-1',
          user_id: userId,
          user_data: JSON.stringify({}),
          address_data: JSON.stringify({}),
          product_data: JSON.stringify({}),
          shipping_data: JSON.stringify({}),
          total_amount: 1000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockOrders, success: true } },
        { first: { total: 1 } },
      ]);
      
      const result = await getOrdersByUserId(mockDb, userId, 1, 10);
      
      expect(result).to.have.property('orders');
      expect(result.orders).to.be.an('array');
      expect(result).to.have.property('pagination');
      expect(result.pagination).to.have.property('page', 1);
      expect(result.pagination).to.have.property('total', 1);
    });
    
    it('should filter by status', async () => {
      const userId = 'user-id';
      const mockOrders = [
        {
          order_id: 'order-1',
          user_id: userId,
          user_data: JSON.stringify({}),
          address_data: JSON.stringify({}),
          product_data: JSON.stringify({}),
          shipping_data: JSON.stringify({}),
          total_amount: 1000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockOrders, success: true } },
        { first: { total: 1 } },
      ]);
      
      const result = await getOrdersByUserId(mockDb, userId, 1, 10, 'completed');
      
      expect(result).to.have.property('orders');
      expect(result.pagination).to.have.property('total', 1);
    });
    
    it('should filter by date range', async () => {
      const userId = 'user-id';
      const mockOrders = [];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockOrders, success: true } },
        { first: { total: 0 } },
      ]);
      
      const result = await getOrdersByUserId(mockDb, userId, 1, 10, null, '2024-01-01', '2024-01-31');
      
      expect(result).to.have.property('orders');
      expect(result.pagination).to.have.property('total', 0);
    });
  });
  
  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      const orderId = 'order-id';
      const status = 'completed';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await updateOrderStatus(mockDb, orderId, status);
      
      expect(result).to.be.true;
    });
    
    it('should return false if order not found', async () => {
      const orderId = 'non-existent-order';
      const status = 'completed';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await updateOrderStatus(mockDb, orderId, status);
      
      expect(result).to.be.false;
    });
  });
});

