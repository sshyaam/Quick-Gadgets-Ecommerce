/**
 * Tests for productModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getProductById,
  getProducts,
  searchProducts,
  createProduct,
  updateProduct,
  softDeleteProduct,
} from './productModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('productModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getProductById', () => {
    it('should return product for existing product ID', async () => {
      const productId = 'product-id';
      const mockProduct = {
        product_id: productId,
        data: JSON.stringify({ name: 'Test Product', category: 'electronics' }),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockProduct },
      ]);
      
      const result = await getProductById(mockDb, productId);
      
      expect(result).to.not.be.null;
      expect(result.product_id).to.equal(productId);
    });
    
    it('should return null for non-existent product ID', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getProductById(mockDb, 'non-existent-product');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getProducts', () => {
    it('should return products with pagination', async () => {
      const mockProducts = [
        { product_id: 'product-1', data: JSON.stringify({ name: 'Product 1' }) },
        { product_id: 'product-2', data: JSON.stringify({ name: 'Product 2' }) },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockProducts, success: true } },
        { first: { total: 10 } },
      ]);
      
      const result = await getProducts(mockDb, 1, 20);
      
      expect(result).to.have.property('products');
      expect(result.products).to.be.an('array');
      expect(result).to.have.property('pagination');
      expect(result.pagination).to.have.property('page', 1);
      expect(result.pagination).to.have.property('limit', 20);
      expect(result.pagination).to.have.property('total', 10);
    });
    
    it('should filter by category', async () => {
      const mockProducts = [
        { product_id: 'product-1', data: JSON.stringify({ name: 'Product 1', category: 'electronics' }) },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockProducts, success: true } },
        { first: { total: 1 } },
      ]);
      
      const result = await getProducts(mockDb, 1, 20, 'electronics');
      
      expect(result).to.have.property('products');
      expect(result.pagination).to.have.property('total', 1);
    });
  });
  
  describe('searchProducts', () => {
    it('should search products by name or description', async () => {
      const mockProducts = [
        { product_id: 'product-1', data: JSON.stringify({ name: 'Test Product', description: 'Test description' }) },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockProducts, success: true } },
        { first: { total: 1 } },
      ]);
      
      const result = await searchProducts(mockDb, 'Test', 1, 20);
      
      expect(result).to.have.property('products');
      expect(result.pagination).to.have.property('total', 1);
    });
    
    it('should search with category filter', async () => {
      const mockProducts = [
        { product_id: 'product-1', data: JSON.stringify({ name: 'Test Product', category: 'electronics' }) },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockProducts, success: true } },
        { first: { total: 1 } },
      ]);
      
      const result = await searchProducts(mockDb, 'Test', 1, 20, 'electronics');
      
      expect(result).to.have.property('products');
      expect(result.pagination).to.have.property('total', 1);
    });
  });
  
  describe('createProduct', () => {
    it('should create a new product successfully', async () => {
      const productId = 'product-id';
      const productData = {
        name: 'Test Product',
        description: 'Test description',
        category: 'electronics',
      };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await createProduct(mockDb, productId, productData);
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('data');
      expect(result.data).to.deep.equal(productData);
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
    });
    
    it('should throw error if database operation fails', async () => {
      const productId = 'product-id';
      const productData = { name: 'Test Product' };
      
      mockDb = createMockD1WithSequence([
        { run: { success: false, meta: { changes: 0 } } },
      ]);
      
      try {
        await createProduct(mockDb, productId, productData);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create product');
      }
    });
  });
  
  describe('updateProduct', () => {
    it('should update product successfully', async () => {
      const productId = 'product-id';
      const productData = {
        name: 'Updated Product',
        description: 'Updated description',
      };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await updateProduct(mockDb, productId, productData);
      
      expect(result).to.be.true;
    });
    
    it('should return false if product not found', async () => {
      const productId = 'non-existent-product';
      const productData = { name: 'Updated Product' };
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await updateProduct(mockDb, productId, productData);
      
      expect(result).to.be.false;
    });
  });
  
  describe('softDeleteProduct', () => {
    it('should soft delete product successfully', async () => {
      const productId = 'product-id';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await softDeleteProduct(mockDb, productId);
      
      expect(result).to.be.true;
    });
    
    it('should return false if product not found', async () => {
      const productId = 'non-existent-product';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await softDeleteProduct(mockDb, productId);
      
      expect(result).to.be.false;
    });
  });
});

