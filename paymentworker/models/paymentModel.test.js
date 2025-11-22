/**
 * Tests for paymentModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  createPayment,
  getPaymentById,
  getPaymentByOrderId,
  updatePayment,
} from './paymentModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('paymentModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('createPayment', () => {
    it('should create a payment record successfully', async () => {
      const orderId = 'order-id';
      const encryptedPaymentId = 'encrypted-paypal-id';
      const paymentData = { paypalOrderId: 'paypal-123', amount: 1000 };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await createPayment(mockDb, orderId, encryptedPaymentId, paymentData);
      
      expect(result).to.have.property('paymentId');
      expect(result).to.have.property('orderId', orderId);
      expect(result).to.have.property('status', 'pending');
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
    });
    
    it('should throw error if database operation fails', async () => {
      const orderId = 'order-id';
      const encryptedPaymentId = 'encrypted-id';
      const paymentData = {};
      
      mockDb = createMockD1WithSequence([
        { run: { success: false, meta: { changes: 0 } } },
      ]);
      
      try {
        await createPayment(mockDb, orderId, encryptedPaymentId, paymentData);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create payment record');
      }
    });
  });
  
  describe('getPaymentById', () => {
    it('should return payment for existing payment ID', async () => {
      const paymentId = 'payment-id';
      const mockPayment = {
        payment_id: paymentId,
        order_id: 'order-id',
        encrypted_payment_id: 'encrypted-id',
        payment_data: JSON.stringify({ paypalOrderId: 'paypal-123' }),
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockPayment },
      ]);
      
      const result = await getPaymentById(mockDb, paymentId);
      
      expect(result).to.not.be.null;
      expect(result.payment_id).to.equal(paymentId);
    });
    
    it('should return null for non-existent payment ID', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getPaymentById(mockDb, 'non-existent-payment');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getPaymentByOrderId', () => {
    it('should return payment for existing order ID', async () => {
      const orderId = 'order-id';
      const mockPayment = {
        payment_id: 'payment-id',
        order_id: orderId,
        encrypted_payment_id: 'encrypted-id',
        payment_data: JSON.stringify({}),
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockPayment },
      ]);
      
      const result = await getPaymentByOrderId(mockDb, orderId);
      
      expect(result).to.not.be.null;
      expect(result.order_id).to.equal(orderId);
    });
    
    it('should return null for non-existent order ID', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getPaymentByOrderId(mockDb, 'non-existent-order');
      
      expect(result).to.be.null;
    });
  });
  
  describe('updatePayment', () => {
    it('should update payment status successfully', async () => {
      const paymentId = 'payment-id';
      const status = 'completed';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await updatePayment(mockDb, paymentId, status);
      
      expect(result).to.be.true;
    });
    
    it('should update payment with data', async () => {
      const paymentId = 'payment-id';
      const status = 'completed';
      const paymentData = { captureId: 'capture-123' };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await updatePayment(mockDb, paymentId, status, paymentData);
      
      expect(result).to.be.true;
    });
    
    it('should return false if payment not found', async () => {
      const paymentId = 'non-existent-payment';
      const status = 'completed';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await updatePayment(mockDb, paymentId, status);
      
      expect(result).to.be.false;
    });
  });
});

