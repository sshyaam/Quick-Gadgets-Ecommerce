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
    it('should create payment record', async () => {
      const orderId = 'order-123';
      const encryptedPaymentId = 'encrypted-paypal-id';
      const paymentData = { paypalOrderId: 'paypal-123', amount: 100 };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      
      const result = await createPayment(mockDb, orderId, encryptedPaymentId, paymentData);
      
      expect(result).to.have.property('paymentId');
      expect(result).to.have.property('orderId', orderId);
      expect(result).to.have.property('status', 'pending');
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
    });

    it('should throw error when database insert fails', async () => {
      const orderId = 'order-123';
      const encryptedPaymentId = 'encrypted-paypal-id';
      const paymentData = { paypalOrderId: 'paypal-123' };
      
      mockDb = createMockD1WithSequence([
        { run: { success: false, meta: { changes: 0 } } }
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
    it('should return payment when found', async () => {
      const paymentId = 'payment-123';
      const mockPayment = {
        payment_id: paymentId,
        order_id: 'order-123',
        encrypted_payment_id: 'encrypted-id',
        payment_data: JSON.stringify({ amount: 100 }),
        status: 'pending',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockPayment }
      ]);
      
      const result = await getPaymentById(mockDb, paymentId);
      
      expect(result).to.not.be.null;
      expect(result.payment_id).to.equal(paymentId);
    });

    it('should return null when payment not found', async () => {
      const paymentId = 'non-existent';
      
      mockDb = createMockD1WithSequence([
        { first: null }
      ]);
      
      const result = await getPaymentById(mockDb, paymentId);
      
      expect(result).to.be.null;
    });
  });

  describe('getPaymentByOrderId', () => {
    it('should return payment when found', async () => {
      const orderId = 'order-123';
      const mockPayment = {
        payment_id: 'payment-123',
        order_id: orderId,
        encrypted_payment_id: 'encrypted-id',
        payment_data: JSON.stringify({ amount: 100 }),
        status: 'pending',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockPayment }
      ]);
      
      const result = await getPaymentByOrderId(mockDb, orderId);
      
      expect(result).to.not.be.null;
      expect(result.order_id).to.equal(orderId);
    });

    it('should return null when payment not found', async () => {
      const orderId = 'non-existent';
      
      mockDb = createMockD1WithSequence([
        { first: null }
      ]);
      
      const result = await getPaymentByOrderId(mockDb, orderId);
      
      expect(result).to.be.null;
    });
  });

  describe('updatePayment', () => {
    it('should update payment status', async () => {
      const paymentId = 'payment-123';
      const newStatus = 'completed';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      
      const result = await updatePayment(mockDb, paymentId, newStatus);
      
      expect(result).to.be.true;
    });

    it('should update payment status and data', async () => {
      const paymentId = 'payment-123';
      const newStatus = 'completed';
      const paymentData = { captureId: 'capture-123' };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      
      const result = await updatePayment(mockDb, paymentId, newStatus, paymentData);
      
      expect(result).to.be.true;
    });

    it('should return false when payment not found', async () => {
      const paymentId = 'non-existent';
      const newStatus = 'completed';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } }
      ]);
      
      const result = await updatePayment(mockDb, paymentId, newStatus);
      
      expect(result).to.be.false;
    });
  });
});

