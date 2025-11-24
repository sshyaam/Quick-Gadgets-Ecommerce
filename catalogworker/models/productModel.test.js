/**
 * Tests for productModel
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as productModel from './productModel.js';
import { createMockD1WithSequence } from '../../test/setup.js';

describe('productModel', () => {
  describe('getProductById', () => {
    it('should return product when it exists', async () => {
      const product = {
        product_id: 'prod-123',
        data: JSON.stringify({ name: 'Test Product', category: 'electronics' }),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mockDb = createMockD1WithSequence([
        { first: product }
      ]);

      const result = await productModel.getProductById(mockDb, 'prod-123');

      expect(result).to.not.be.null;
      expect(result.product_id).to.equal('prod-123');
    });

    it('should return null when product does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);

      const result = await productModel.getProductById(mockDb, 'invalid-prod');

      expect(result).to.be.null;
    });
  });

  describe('getProducts', () => {
    it('should return products with pagination', async () => {
      const products = [
        { product_id: 'prod-1', data: JSON.stringify({ name: 'Product 1' }) },
        { product_id: 'prod-2', data: JSON.stringify({ name: 'Product 2' }) }
      ];

      const mockDb = createMockD1WithSequence([
        { all: { results: products, success: true } },
        { first: { total: 2 } }
      ]);

      const result = await productModel.getProducts(mockDb, 1, 20);

      expect(result.products).to.have.length(2);
      expect(result.pagination.total).to.equal(2);
      expect(result.pagination.page).to.equal(1);
    });

    it('should filter by category when provided', async () => {
      const products = [
        { product_id: 'prod-1', data: JSON.stringify({ name: 'Product 1', category: 'electronics' }) }
      ];

      const mockDb = createMockD1WithSequence([
        { all: { results: products, success: true } },
        { first: { total: 1 } }
      ]);

      const result = await productModel.getProducts(mockDb, 1, 20, 'electronics');

      expect(result.products).to.have.length(1);
    });
  });

  describe('searchProducts', () => {
    it('should return products matching search term', async () => {
      const products = [
        { product_id: 'prod-1', data: JSON.stringify({ name: 'Test Product', description: 'A test item' }) }
      ];

      const mockDb = createMockD1WithSequence([
        { all: { results: products, success: true } },
        { first: { total: 1 } }
      ]);

      const result = await productModel.searchProducts(mockDb, 'Test', 1, 20);

      expect(result.products).to.have.length(1);
    });

    it('should filter by category when provided', async () => {
      const products = [
        { product_id: 'prod-1', data: JSON.stringify({ name: 'Test Product', category: 'electronics' }) }
      ];

      const mockDb = createMockD1WithSequence([
        { all: { results: products, success: true } },
        { first: { total: 1 } }
      ]);

      const result = await productModel.searchProducts(mockDb, 'Test', 1, 20, 'electronics');

      expect(result.products).to.have.length(1);
    });
  });

  describe('createProduct', () => {
    it('should create product successfully', async () => {
      const productData = {
        name: 'New Product',
        category: 'electronics',
        description: 'A new product'
      };

      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1, last_row_id: 0 }
          }
        }
      ]);

      const result = await productModel.createProduct(mockDb, 'prod-123', productData);

      expect(result).to.have.property('productId', 'prod-123');
      expect(result.data).to.deep.equal(productData);
      expect(result).to.have.property('createdAt');
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
        await productModel.createProduct(mockDb, 'prod-123', { name: 'Product' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create product');
      }
    });
  });

  describe('updateProduct', () => {
    it('should update product successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await productModel.updateProduct(mockDb, 'prod-123', { name: 'Updated Product' });

      expect(result).to.be.true;
    });

    it('should return false when product does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 }
          }
        }
      ]);

      const result = await productModel.updateProduct(mockDb, 'invalid-prod', { name: 'Updated' });

      expect(result).to.be.false;
    });
  });

  describe('softDeleteProduct', () => {
    it('should soft delete product successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await productModel.softDeleteProduct(mockDb, 'prod-123');

      expect(result).to.be.true;
    });

    it('should return false when product does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 }
          }
        }
      ]);

      const result = await productModel.softDeleteProduct(mockDb, 'invalid-prod');

      expect(result).to.be.false;
    });
  });
});

