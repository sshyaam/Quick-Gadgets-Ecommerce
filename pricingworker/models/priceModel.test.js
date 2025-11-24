/**
 * Tests for priceModel
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as priceModel from './priceModel.js';
import { createMockD1WithSequence } from '../../test/setup.js';

describe('priceModel', () => {
  describe('getPrice', () => {
    it('should return price when product has price', async () => {
      const price = {
        product_id: 'prod-123',
        price: 99.99,
        currency: 'INR',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mockDb = createMockD1WithSequence([
        { first: price }
      ]);

      const result = await priceModel.getPrice(mockDb, 'prod-123');

      expect(result).to.not.be.null;
      expect(result.product_id).to.equal('prod-123');
      expect(result.price).to.equal(99.99);
    });

    it('should return null when product has no price', async () => {
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);

      const result = await priceModel.getPrice(mockDb, 'invalid-prod');

      expect(result).to.be.null;
    });
  });

  describe('getPrices', () => {
    it('should return prices for multiple products', async () => {
      const prices = [
        { product_id: 'prod-1', price: 100, currency: 'INR' },
        { product_id: 'prod-2', price: 200, currency: 'INR' }
      ];

      const mockDb = createMockD1WithSequence([
        { all: { results: prices, success: true } }
      ]);

      const result = await priceModel.getPrices(mockDb, ['prod-1', 'prod-2']);

      expect(result).to.have.length(2);
    });

    it('should return empty array when no productIds provided', async () => {
      const result = await priceModel.getPrices(null, []);

      expect(result).to.be.an('array').that.is.empty;
    });

    it('should return empty array when productIds is null', async () => {
      const result = await priceModel.getPrices(null, null);

      expect(result).to.be.an('array').that.is.empty;
    });
  });

  describe('setPrice', () => {
    it('should create price successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1, last_row_id: 0 }
          }
        }
      ]);

      const result = await priceModel.setPrice(mockDb, 'prod-123', 99.99, 'INR');

      expect(result).to.have.property('productId', 'prod-123');
      expect(result.price).to.equal(99.99);
      expect(result.currency).to.equal('INR');
      expect(result).to.have.property('createdAt');
    });

    it('should default currency to INR when not provided', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await priceModel.setPrice(mockDb, 'prod-123', 99.99);

      expect(result.currency).to.equal('INR');
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
        await priceModel.setPrice(mockDb, 'prod-123', 99.99);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to set price');
      }
    });
  });

  describe('updatePrice', () => {
    it('should update price successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await priceModel.updatePrice(mockDb, 'prod-123', 149.99);

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

      const result = await priceModel.updatePrice(mockDb, 'invalid-prod', 149.99);

      expect(result).to.be.false;
    });
  });
});

