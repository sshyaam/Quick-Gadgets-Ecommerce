/**
 * Tests for catalogworker adminController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as adminController from './adminController.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockD1WithSequence } from '../../test/setup.js';

describe('catalogworker adminController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockEnv.INTER_WORKER_API_KEY = 'test-api-key';
    // Mock auth worker for admin authentication
    mockEnv.auth_worker._setResponse('GET', '/profile', { userId: 'admin-1', isAdmin: true });
  });

  describe('getAllProducts', () => {
    it('should return products with default pagination', async () => {
      const request = createMockRequest('https://example.com/admin/products', {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      const mockProducts = [
        {
          product_id: 'product-1',
          data: JSON.stringify({ name: 'Product 1', category: 'Electronics' }),
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          deleted_at: null
        }
      ];
      
      const mockDb = createMockD1WithSequence([
        { all: { results: mockProducts } },
        { first: { total: 1 } }
      ]);
      mockEnv.catalog_db = mockDb;
      
      // Mock service bindings
      mockEnv.pricing_worker._setResponse('GET', '/prices', {});
      mockEnv.fulfillment_worker._setResponse('GET', '/stocks', {});
      
      const response = await adminController.getAllProducts(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('products');
      expect(data).to.have.property('pagination');
    });
  });

  describe('createProduct', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const request = createMockRequest('https://example.com/admin/products', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({})
      });
      
      try {
        await adminController.createProduct(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
  });

  describe('updateProduct', () => {
    it('should throw ValidationError when body is invalid', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/admin/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({ discountPercentage: 95 }) // Invalid: > 90%
      });
      request.params = { productId };
      
      // Mock product exists
      const mockDb = createMockD1WithSequence([
        { first: { product_id: productId, data: JSON.stringify({ name: 'Product' }) } }
      ]);
      mockEnv.catalog_db = mockDb;
      
      try {
        await adminController.updateProduct(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Discount percentage');
      }
    });
  });

  describe('deleteProduct', () => {
    it('should soft delete product', async () => {
      const productId = 'product-123';
      const request = createMockRequest(`https://example.com/admin/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      request.params = { productId };
      
      // Mock softDeleteProduct - it runs UPDATE and checks meta.changes > 0
      const mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } } // softDeleteProduct UPDATE succeeds
      ]);
      mockEnv.catalog_db = mockDb;
      
      const response = await adminController.deleteProduct(request, mockEnv);
      const data = await response.json();
      
      expect(response.status).to.equal(200);
      expect(data).to.have.property('success', true);
    });
  });
});

