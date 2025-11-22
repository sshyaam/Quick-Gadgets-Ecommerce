/**
 * Tests for cartModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getCartByUserId,
  getCartById,
  createCart,
  updateCart,
  clearCart,
  softDeleteCart,
} from './cartModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('cartModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('getCartByUserId', () => {
    it('should return cart for existing user', async () => {
      const userId = 'test-user-id';
      const mockCart = {
        cart_id: 'cart-id',
        user_id: userId,
        items: JSON.stringify([{ productId: 'product-1', quantity: 1 }]),
        total_price: 1000,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockCart },
      ]);
      
      const result = await getCartByUserId(mockDb, userId);
      
      expect(result).to.not.be.null;
      expect(result.cart_id).to.equal('cart-id');
      expect(result.user_id).to.equal(userId);
    });
    
    it('should return null for non-existent user', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getCartByUserId(mockDb, 'non-existent-user');
      
      expect(result).to.be.null;
    });
  });
  
  describe('getCartById', () => {
    it('should return cart for existing cart ID', async () => {
      const cartId = 'cart-id';
      const mockCart = {
        cart_id: cartId,
        user_id: 'user-id',
        items: JSON.stringify([]),
        total_price: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockCart },
      ]);
      
      const result = await getCartById(mockDb, cartId);
      
      expect(result).to.not.be.null;
      expect(result.cart_id).to.equal(cartId);
    });
    
    it('should return null for non-existent cart ID', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getCartById(mockDb, 'non-existent-cart');
      
      expect(result).to.be.null;
    });
  });
  
  describe('createCart', () => {
    it('should create a new cart successfully', async () => {
      const userId = 'test-user-id';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } },
      ]);
      
      const result = await createCart(mockDb, userId);
      
      expect(result).to.have.property('cartId');
      expect(result).to.have.property('userId', userId);
      expect(result).to.have.property('items');
      expect(result.items).to.be.an('array');
      expect(result.items.length).to.equal(0);
      expect(result).to.have.property('totalPrice', 0);
      expect(result).to.have.property('createdAt');
      expect(result).to.have.property('updatedAt');
    });
    
    it('should throw error if database operation fails', async () => {
      const userId = 'test-user-id';
      
      mockDb = createMockD1WithSequence([
        { run: { success: false, meta: { changes: 0 } } },
      ]);
      
      try {
        await createCart(mockDb, userId);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create cart');
      }
    });
  });
  
  describe('updateCart', () => {
    it('should update cart successfully', async () => {
      const cartId = 'cart-id';
      const items = [{ productId: 'product-1', quantity: 2 }];
      const totalPrice = 2000;
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await updateCart(mockDb, cartId, items, totalPrice);
      
      expect(result).to.be.true;
    });
    
    it('should return false if cart not found', async () => {
      const cartId = 'non-existent-cart';
      const items = [];
      const totalPrice = 0;
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await updateCart(mockDb, cartId, items, totalPrice);
      
      expect(result).to.be.false;
    });
  });
  
  describe('clearCart', () => {
    it('should clear cart successfully', async () => {
      const cartId = 'cart-id';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await clearCart(mockDb, cartId);
      
      expect(result).to.be.true;
    });
    
    it('should return false if cart not found', async () => {
      const cartId = 'non-existent-cart';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await clearCart(mockDb, cartId);
      
      expect(result).to.be.false;
    });
  });
  
  describe('softDeleteCart', () => {
    it('should soft delete cart successfully', async () => {
      const cartId = 'cart-id';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } },
      ]);
      
      const result = await softDeleteCart(mockDb, cartId);
      
      expect(result).to.be.true;
    });
    
    it('should return false if cart not found', async () => {
      const cartId = 'non-existent-cart';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } },
      ]);
      
      const result = await softDeleteCart(mockDb, cartId);
      
      expect(result).to.be.false;
    });
  });
});

