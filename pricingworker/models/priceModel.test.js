/**
 * Tests for priceModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getPrice,
  getPrices,
  setPrice,
  updatePrice,
} from './priceModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('priceModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getPrice', () => {
    it('should return price for existing product', async () => {
      const productId = 'product-id';
      const mockPrice = {
        product_id: productId,
        price: 1000,
        currency: 'INR',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockPrice },
      ]);
      
      const result = await getPrice(mockDb, productId);
      
      expect(result).to.not.be.null;
      expect(result.product_id).to.equal(productId);
      expect(result.price).to.equal(1000);
    });
    
    it('should return null for non-existent product', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getPrice(mockDb, 'non-existent-product');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getPrices', () => {
    it('should return prices for multiple products', async () => {
      const productIds = ['product-1', 'product-2'];
      const mockPrices = [
        { product_id: 'product-1', price: 1000, currency: 'INR' },
        { product_id: 'product-2', price: 2000, currency: 'INR' },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockPrices, success: true } },
      ]);
      
      const result = await getPrices(mockDb, productIds);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(2);
    });
    
    it('should return empty array for empty product IDs', async () => {
      const result = await getPrices(mockDb, []);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(0);
    });
    
    it('should return empty array for null product IDs', async () => {
      const result = await getPrices(mockDb, null);
      
      expect(result).to.be.an('array');
      expect(result.length).to.equal(0);
    });
  });
  
  describe('setPrice', () => {
    it('should create a new price successfully', async () => {
      const productId = 'product-id';
      const price = 1000;
      const currency = 'INR';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await setPrice(mockDb, productId, price, currency);
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('price', price);
      expect(result).to.have.property('currency', currency);
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
    });
    
    it('should use default currency if not provided', async () => {
      const productId = 'product-id';
      const price = 1000;
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await setPrice(mockDb, productId, price);
      
      expect(result).to.have.property('currency', 'INR');
    });
    
    it('should throw error if database operation fails', async () => {
      const productId = 'product-id';
      const price = 1000;
      
      mockDb = createMockD1WithSequence([
        { run: { success: false, meta: { changes: 0 } } },
      ]);
      
      try {
        await setPrice(mockDb, productId, price);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to set price');
      }
    });
  });
  
  describe('updatePrice', () => {
    it('should update price successfully', async () => {
      const productId = 'product-id';
      const newPrice = 1500;
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await updatePrice(mockDb, productId, newPrice);
      
      expect(result).to.be.true;
    });
    
    it('should return false if product not found', async () => {
      const productId = 'non-existent-product';
      const newPrice = 1500;
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await updatePrice(mockDb, productId, newPrice);
      
      expect(result).to.be.false;
    });
  });
});

