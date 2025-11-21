/**
 * Tests for pricingService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getProductPrice,
  getProductPrices,
  setProductPrice,
} from './pricingService.js';
import { NotFoundError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('pricingService', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getProductPrice', () => {
    it('should return price when found', async () => {
      const productId = 'test-product-id';
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
      
      const result = await getProductPrice(productId, mockDb);
      
      expect(result).to.have.property('product_id', productId);
      expect(result).to.have.property('price', 1000);
      expect(result).to.have.property('currency', 'INR');
    });
    
    it('should throw NotFoundError when price not found', async () => {
      const productId = 'non-existent-id';
      
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      try {
        await getProductPrice(productId, mockDb);
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
  });
  
  describe('getProductPrices', () => {
    it('should return price map for multiple products', async () => {
      const productIds = ['product-1', 'product-2'];
      const mockPrices = [
        { product_id: 'product-1', price: 1000, currency: 'INR', updated_at: '2024-01-01T00:00:00Z' },
        { product_id: 'product-2', price: 2000, currency: 'INR', updated_at: '2024-01-01T00:00:00Z' },
      ];
      
      mockDb = createMockD1WithSequence([
        { all: { results: mockPrices, success: true } },
      ]);
      
      const result = await getProductPrices(productIds, mockDb);
      
      expect(result).to.be.an('object');
      expect(result['product-1']).to.have.property('price', 1000);
      expect(result['product-2']).to.have.property('price', 2000);
    });
  });
  
  describe('setProductPrice', () => {
    it('should set price successfully', async () => {
      const productId = 'test-product-id';
      const newPrice = 1500;
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        },
      ]);
      
      const result = await setProductPrice(productId, newPrice, 'INR', mockDb);
      
      expect(result).to.have.property('productId', productId);
      expect(result).to.have.property('price', newPrice);
    });
  });
});

