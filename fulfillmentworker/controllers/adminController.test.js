/**
 * Tests for fulfillmentworker adminController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as adminController from './adminController.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1WithSequence } from '../../test/setup.js';

describe('fulfillmentworker adminController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
    // Mock auth worker for admin authentication
    mockEnv.auth_worker._setResponse('GET', '/profile', { userId: 'admin-1', isAdmin: true });
  });

  describe('updateStock', () => {
    it('should throw ValidationError when quantity is missing', async () => {
      const request = createMockRequest('https://example.com/admin/stock/product-123', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({})
      });
      request.params = { productId: 'product-123' };
      
      try {
        await adminController.updateStock(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Quantity is required');
      }
    });

    it('should throw ValidationError when quantity is negative', async () => {
      const request = createMockRequest('https://example.com/admin/stock/product-123', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({ quantity: -1 })
      });
      request.params = { productId: 'product-123' };
      
      try {
        await adminController.updateStock(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('non-negative number');
      }
    });
  });

  describe('getAllStocks', () => {
    it('should return stocks with default pagination', async () => {
      const request = createMockRequest('https://example.com/admin/stocks', {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      const mockStocks = [
        {
          inventory_id: 'inv-1',
          product_id: 'product-1',
          warehouse_id: 'WH-MUM-001',
          quantity: 10,
          reserved_quantity: 2
        }
      ];
      
      const mockDb = createMockD1WithSequence([
        { all: { results: mockStocks } },
        { first: { total: 1 } }
      ]);
      mockEnv.fulfillment_db = mockDb;
      
      const response = await adminController.getAllStocks(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('stocks');
      expect(data).to.have.property('pagination');
    });
  });
});

