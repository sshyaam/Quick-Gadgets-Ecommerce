/**
 * Tests for paymentService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  createPayPalOrder,
  capturePayPalOrder,
} from './paymentService.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence, createMockEnv } from '../../test/setup.js';

describe('paymentService', () => {
  let mockDb;
  let mockEnv;
  
  beforeEach(() => {
    mockDb = createMockD1();
    mockEnv = createMockEnv();
  });
  
  describe('createPayPalOrder', () => {
    it('should create PayPal order successfully', async () => {
      const orderData = {
        amount: 1000,
        currency: 'USD',
        description: 'Test order',
      };
      
      // Mock PayPal API responses
      global.fetch = async (url, options) => {
        if (url.includes('/oauth2/token')) {
          return new Response(JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }), { status: 200 });
        }
        if (url.includes('/v2/checkout/orders')) {
          return new Response(JSON.stringify({
            id: 'paypal-order-id',
            status: 'CREATED',
            links: [{
              rel: 'approve',
              href: 'https://www.sandbox.paypal.com/checkoutnow?token=test-token',
            }],
          }), { status: 201 });
        }
        return new Response('Not found', { status: 404 });
      };
      
      const result = await createPayPalOrder(
        orderData,
        mockEnv.PAYPAL_CLIENT_ID,
        mockEnv.PAYPAL_CLIENT_SECRET,
        true
      );
      
      expect(result).to.have.property('id');
      expect(result).to.have.property('status', 'CREATED');
      expect(result.links).to.be.an('array');
    });
    
    it('should convert INR to USD for sandbox', async () => {
      const orderData = {
        amount: 8300, // 8300 INR = ~100 USD at rate 83
        currency: 'INR',
        description: 'Test order',
      };
      
      let capturedAmount = null;
      
      global.fetch = async (url, options) => {
        if (url.includes('/oauth2/token')) {
          return new Response(JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }), { status: 200 });
        }
        if (url.includes('/v2/checkout/orders')) {
          const body = JSON.parse(options.body);
          capturedAmount = parseFloat(body.purchase_units[0].amount.value);
          return new Response(JSON.stringify({
            id: 'paypal-order-id',
            status: 'CREATED',
            links: [],
          }), { status: 201 });
        }
        return new Response('Not found', { status: 404 });
      };
      
      await createPayPalOrder(
        orderData,
        mockEnv.PAYPAL_CLIENT_ID,
        mockEnv.PAYPAL_CLIENT_SECRET,
        true,
        83
      );
      
      // Should convert 8300 INR to ~100 USD
      expect(capturedAmount).to.be.closeTo(100, 1);
    });
    
    it('should throw error when PayPal token request fails', async () => {
      const orderData = {
        amount: 1000,
        currency: 'USD',
      };
      
      global.fetch = async (url) => {
        if (url.includes('/oauth2/token')) {
          return new Response(JSON.stringify({
            error: 'invalid_client',
            error_description: 'Invalid client credentials',
          }), { status: 401 });
        }
        return new Response('Not found', { status: 404 });
      };
      
      try {
        await createPayPalOrder(
          orderData,
          'invalid-client-id',
          'invalid-secret',
          true
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('PayPal access token');
      }
    });
  });
  
  describe('capturePayPalOrder', () => {
    it('should capture PayPal order successfully', async () => {
      const paypalOrderId = 'paypal-order-id';
      
      global.fetch = async (url, options) => {
        if (url.includes('/oauth2/token')) {
          return new Response(JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }), { status: 200 });
        }
        if (url.includes(`/v2/checkout/orders/${paypalOrderId}/capture`)) {
          return new Response(JSON.stringify({
            id: paypalOrderId,
            status: 'COMPLETED',
            purchase_units: [{
              payments: {
                captures: [{
                  id: 'capture-id',
                  status: 'COMPLETED',
                  amount: { value: '100.00', currency_code: 'USD' },
                }],
              },
            }],
          }), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      };
      
      const result = await capturePayPalOrder(
        paypalOrderId,
        mockEnv.PAYPAL_CLIENT_ID,
        mockEnv.PAYPAL_CLIENT_SECRET,
        true
      );
      
      expect(result).to.have.property('status', 'COMPLETED');
      expect(result.purchase_units[0].payments.captures).to.be.an('array');
    });
    
    it('should throw error when capture fails', async () => {
      const paypalOrderId = 'invalid-order-id';
      
      global.fetch = async (url, options) => {
        if (url.includes('/oauth2/token')) {
          return new Response(JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }), { status: 200 });
        }
        if (url.includes(`/v2/checkout/orders/${paypalOrderId}/capture`)) {
          return new Response(JSON.stringify({
            error: 'RESOURCE_NOT_FOUND',
            message: 'Order not found',
          }), { status: 404 });
        }
        return new Response('Not found', { status: 404 });
      };
      
      try {
        await capturePayPalOrder(
          paypalOrderId,
          mockEnv.PAYPAL_CLIENT_ID,
          mockEnv.PAYPAL_CLIENT_SECRET,
          true
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('PayPal');
      }
    });
  });
});

