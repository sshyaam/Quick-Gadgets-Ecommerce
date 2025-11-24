/**
 * Tests for cartModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as cartModel from './cartModel.js';
import { createMockD1WithSequence, createMockD1 } from '../../test/setup.js';

describe('cartModel', () => {
  describe('getCartByUserId', () => {
    it('should return cart when user has a cart', async () => {
      const cart = {
        cart_id: 'cart-123',
        user_id: 'user-123',
        items: JSON.stringify([{ productId: 'prod-1', quantity: 2 }]),
        total_price: 100,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mockDb = createMockD1WithSequence([
        { first: cart }
      ]);

      const result = await cartModel.getCartByUserId(mockDb, 'user-123');

      expect(result).to.not.be.null;
      expect(result.cart_id).to.equal('cart-123');
      expect(result.user_id).to.equal('user-123');
    });

    it('should return null when user has no cart', async () => {
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);

      const result = await cartModel.getCartByUserId(mockDb, 'user-123');

      expect(result).to.be.null;
    });
  });

  describe('getCartById', () => {
    it('should return cart when cart exists', async () => {
      const cart = {
        cart_id: 'cart-123',
        user_id: 'user-123',
        items: JSON.stringify([]),
        total_price: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mockDb = createMockD1WithSequence([
        { first: cart }
      ]);

      const result = await cartModel.getCartById(mockDb, 'cart-123');

      expect(result).to.not.be.null;
      expect(result.cart_id).to.equal('cart-123');
    });

    it('should return null when cart does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        { first: null }
      ]);

      const result = await cartModel.getCartById(mockDb, 'invalid-cart');

      expect(result).to.be.null;
    });
  });

  describe('createCart', () => {
    it('should create a new cart successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1, last_row_id: 0 }
          }
        }
      ]);

      const result = await cartModel.createCart(mockDb, 'user-123');

      expect(result).to.have.property('cartId');
      expect(result).to.have.property('userId', 'user-123');
      expect(result.items).to.be.an('array').that.is.empty;
      expect(result.totalPrice).to.equal(0);
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
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
        await cartModel.createCart(mockDb, 'user-123');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create cart');
      }
    });
  });

  describe('updateCart', () => {
    it('should update cart successfully', async () => {
      const items = [
        { itemId: 'item-1', productId: 'prod-1', quantity: 2, price: 50 }
      ];

      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await cartModel.updateCart(mockDb, 'cart-123', items, 100);

      expect(result).to.be.true;
    });

    it('should return false when no rows are updated', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 }
          }
        }
      ]);

      const result = await cartModel.updateCart(mockDb, 'cart-123', [], 0);

      expect(result).to.be.false;
    });

    it('should return false when update fails', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: false,
            meta: { changes: 0 }
          }
        }
      ]);

      const result = await cartModel.updateCart(mockDb, 'cart-123', [], 0);

      expect(result).to.be.false;
    });

    it('should throw error when database operation fails', async () => {
      const mockDb = {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              throw new Error('Database error');
            }
          })
        })
      };

      try {
        await cartModel.updateCart(mockDb, 'cart-123', [], 0);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Database error');
      }
    });
  });

  describe('clearCart', () => {
    it('should clear cart successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await cartModel.clearCart(mockDb, 'cart-123');

      expect(result).to.be.true;
    });

    it('should return false when cart does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 }
          }
        }
      ]);

      const result = await cartModel.clearCart(mockDb, 'invalid-cart');

      expect(result).to.be.false;
    });
  });

  describe('softDeleteCart', () => {
    it('should soft delete cart successfully', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 }
          }
        }
      ]);

      const result = await cartModel.softDeleteCart(mockDb, 'cart-123');

      expect(result).to.be.true;
    });

    it('should return false when cart does not exist', async () => {
      const mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 }
          }
        }
      ]);

      const result = await cartModel.softDeleteCart(mockDb, 'invalid-cart');

      expect(result).to.be.false;
    });
  });
});

