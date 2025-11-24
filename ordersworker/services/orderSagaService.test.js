/**
 * Tests for orderSagaService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as orderSagaService from './orderSagaService.js';
import { ConflictError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1WithSequence } from '../../test/setup.js';

describe('orderSagaService', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
  });

  describe('createOrderSaga', () => {
    it('should throw error when cart worker binding not available', async () => {
      delete mockEnv.cart_worker;
      
      const orderData = {
        cart: { items: [] },
        accessToken: 'test-token'
      };
      
      try {
        await orderSagaService.createOrderSaga('user-123', orderData, mockEnv);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Cart worker service binding not available');
      }
    });

    it('should throw ConflictError when access token not provided', async () => {
      const orderData = {
        cart: { items: [] }
        // No accessToken
      };
      
      try {
        await orderSagaService.createOrderSaga('user-123', orderData, mockEnv);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('Access token required');
      }
    });

    it('should throw ConflictError when cart is empty', async () => {
      const orderData = {
        cart: { items: [] },
        accessToken: 'test-token'
      };
      
      // Mock cart worker to return empty cart
      mockEnv.cart_worker._setResponse('GET', '/cart', { cartId: 'cart-123', items: [] });
      
      try {
        await orderSagaService.createOrderSaga('user-123', orderData, mockEnv);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('Cart is empty');
      }
    });

    it('should throw ConflictError when cart validation fails', async () => {
      const orderData = {
        cart: { items: [{ productId: 'product-1', quantity: 1 }] },
        accessToken: 'test-token'
      };
      
      // Mock cart worker responses
      mockEnv.cart_worker._setResponse('GET', '/cart', { 
        cartId: 'cart-123', 
        items: [{ productId: 'product-1', quantity: 1 }] 
      });
      mockEnv.cart_worker._setResponse('POST', '/cart/validate', { 
        valid: false, 
        errors: [{ message: 'Stock unavailable' }] 
      });
      
      try {
        await orderSagaService.createOrderSaga('user-123', orderData, mockEnv);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('Cart validation failed');
      }
    });
  });

  describe('capturePaymentSaga', () => {
    it('should throw error when payment worker binding not available', async () => {
      delete mockEnv.payment_worker;
      
      try {
        await orderSagaService.capturePaymentSaga('order-123', 'paypal-123', mockEnv);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Payment worker service binding not available');
      }
    });
  });

  describe('cancelOrderSaga', () => {
    it('should handle order cancellation', async () => {
      // Mock database
      const mockDb = createMockD1WithSequence([
        { first: { order_id: 'order-123', status: 'pending', user_id: 'user-123' } },
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      mockEnv.orders_db = mockDb;
      
      // Mock service bindings
      mockEnv.fulfillment_worker._setResponse('POST', '/stock/release', { success: true });
      mockEnv.cart_worker._setResponse('POST', '/cart/unlock', { success: true });
      
      const result = await orderSagaService.cancelOrderSaga('order-123', mockEnv);
      
      expect(result).to.have.property('success', true);
    });
  });

  describe('createCODOrderSaga', () => {
    it('should throw error when cart worker binding not available', async () => {
      delete mockEnv.cart_worker;
      
      const orderData = {
        cart: { items: [] },
        accessToken: 'test-token'
      };
      
      try {
        await orderSagaService.createCODOrderSaga('user-123', orderData, mockEnv);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Cart worker service binding not available');
      }
    });

    it('should throw ConflictError when access token not provided', async () => {
      const orderData = {
        cart: { items: [] }
        // No accessToken
      };
      
      try {
        await orderSagaService.createCODOrderSaga('user-123', orderData, mockEnv);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('Access token required');
      }
    });

    it('should throw ConflictError when cart is empty', async () => {
      const orderData = {
        cart: { items: [] },
        accessToken: 'test-token'
      };
      
      // Mock cart worker to return empty cart
      mockEnv.cart_worker._setResponse('GET', '/cart', { cartId: 'cart-123', items: [] });
      
      try {
        await orderSagaService.createCODOrderSaga('user-123', orderData, mockEnv);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('Cart is empty');
      }
    });
  });
});

