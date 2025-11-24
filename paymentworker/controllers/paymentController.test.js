/**
 * Tests for paymentController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as paymentController from './paymentController.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('paymentController', () => {
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
          run: async () => ({ success: true, meta: { changes: 1 } })
        }),
        first: async () => null,
        run: async () => ({ success: true, meta: { changes: 1 } })
      };
    };
    mockEnv.payment_db = mockDb;
    mockEnv.PAYPAL_CLIENT_ID = 'test-client-id';
    mockEnv.PAYPAL_CLIENT_SECRET = 'test-client-secret';
    mockEnv.PAYPAL_SANDBOX = 'true';
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      const request = createMockRequest('https://example.com/health');
      
      const response = await paymentController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.equal('payment-worker');
      expect(data).to.have.property('timestamp');
    });

    it('should return unhealthy status when database fails', async () => {
      const request = createMockRequest('https://example.com/health');
      mockEnv.payment_db.prepare = () => {
        throw new Error('Database connection failed');
      };
      
      const response = await paymentController.healthCheck(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(503);
      expect(data.status).to.equal('unhealthy');
      expect(data.service).to.equal('payment-worker');
      expect(data).to.have.property('error');
    });
  });

  describe('createPayPalOrder', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const request = createMockRequest('https://example.com/paypal/create', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      try {
        await paymentController.createPayPalOrder(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });

    it('should throw error when PayPal credentials not configured', async () => {
      delete mockEnv.PAYPAL_CLIENT_ID;
      delete mockEnv.PAYPAL_CLIENT_SECRET;
      
      const request = createMockRequest('https://example.com/paypal/create', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'order-123',
          amount: 100,
          currency: 'USD',
          description: 'Test order'
        })
      });
      
      try {
        await paymentController.createPayPalOrder(request, mockEnv);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('PayPal credentials not configured');
      }
    });
  });

  describe('capturePayPalOrder', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const request = createMockRequest('https://example.com/paypal/capture', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      try {
        await paymentController.capturePayPalOrder(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });

    it('should throw error when PayPal credentials not configured', async () => {
      delete mockEnv.PAYPAL_CLIENT_ID;
      delete mockEnv.PAYPAL_CLIENT_SECRET;
      
      const request = createMockRequest('https://example.com/paypal/capture', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'paypal-order-123',
          internalOrderId: 'order-123'
        })
      });
      
      try {
        await paymentController.capturePayPalOrder(request, mockEnv);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('PayPal credentials not configured');
      }
    });
  });

  describe('storePayment', () => {
    it('should throw ValidationError when required fields are missing', async () => {
      const request = createMockRequest('https://example.com/payment/store', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      try {
        await paymentController.storePayment(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('required');
      }
    });

    it('should throw error when ENCRYPTION_KEY not configured', async () => {
      delete mockEnv.ENCRYPTION_KEY;
      
      const request = createMockRequest('https://example.com/payment/store', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'order-123',
          paypalOrderId: 'paypal-123',
          paymentData: { amount: 100 }
        })
      });
      
      try {
        await paymentController.storePayment(request, mockEnv);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('ENCRYPTION_KEY not configured');
      }
    });

    it('should store payment successfully', async () => {
      const mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      mockEnv.payment_db = mockDb;
      mockEnv.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!!';
      
      const request = createMockRequest('https://example.com/payment/store', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'order-123',
          paypalOrderId: 'paypal-123',
          paymentData: { amount: 100, currency: 'USD' }
        })
      });
      
      const response = await paymentController.storePayment(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('success', true);
      expect(data).to.have.property('paymentId');
      expect(data).to.have.property('orderId', 'order-123');
    });
  });
});

