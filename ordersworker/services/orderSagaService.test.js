/**
 * Tests for orderSagaService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as orderSagaService from './orderSagaService.js';
import { ConflictError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest } from '../../test/setup.js';

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
      const mockDb = {
        prepare: () => ({
          bind: () => ({
            first: async () => ({
              orderId: 'order-123',
              status: 'pending'
            }),
            run: async () => ({ success: true, meta: { changes: 1 } })
          })
        })
      };
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
  });
});

