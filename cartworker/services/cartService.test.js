/**
 * Tests for cartService
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  getOrCreateCart,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
} from './cartService.js';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/utils/errors.js';
import { createMockD1, createMockD1WithSequence, createMockEnv } from '../../test/setup.js';

describe('cartService', () => {
  let mockDb;
  let mockEnv;
  let mockCatalogWorker;
  let mockPricingWorker;
  let mockFulfillmentWorker;
  
  beforeEach(() => {
    mockDb = createMockD1();
    mockEnv = createMockEnv();
    mockCatalogWorker = mockEnv.catalog_worker;
    mockPricingWorker = mockEnv.pricing_worker;
    mockFulfillmentWorker = mockEnv.fulfillment_worker;
  });
  
  describe('getOrCreateCart', () => {
    it('should return existing cart', async () => {
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
        { first: mockCart }, // getCartByUserId
      ]);
      
      const result = await getOrCreateCart(userId, mockDb);
      
      expect(result).to.have.property('cartId', 'cart-id');
      expect(result).to.have.property('userId', userId);
      expect(result.items).to.be.an('array');
    });
    
    it('should create new cart if not exists', async () => {
      const userId = 'test-user-id';
      
      // Mock: cart doesn't exist, then create one
      // Note: createCart returns an object directly, not a database row
      mockDb = createMockD1WithSequence([
        { first: null }, // getCartByUserId - no cart
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } }, // createCart
      ]);
      
      const result = await getOrCreateCart(userId, mockDb);
      
      expect(result).to.have.property('cartId');
      expect(result).to.have.property('userId', userId);
    });
  });
  
  describe('addItemToCart', () => {
    it('should add new item to cart', async () => {
      const userId = 'test-user-id';
      const itemData = { productId: 'product-1', quantity: 2 };
      
      const mockCart = {
        cart_id: 'cart-id',
        user_id: userId,
        items: JSON.stringify([]),
        total_price: 0,
      };
      
      // Mock worker responses - use path format matching actual endpoints
      mockCatalogWorker._setResponse('GET', '/product/product-1', { productId: 'product-1', name: 'Product 1' });
      mockPricingWorker._setResponse('GET', '/product/product-1', { price: 1000 }); // getPriceFromWorker uses /product/
      mockFulfillmentWorker._setResponse('GET', '/stock/product-1', { available: 50 });
      
      // Sequence: 
      // 1. getOrCreateCart calls getCartByUserId (returns mockCart)
      // 2. addItemToCart calls updateCart (needs changes > 0)
      mockDb = createMockD1WithSequence([
        { first: mockCart }, // getCartByUserId (from getOrCreateCart)
        { run: { success: true, meta: { changes: 1 } } }, // updateCart (must have changes > 0)
      ]);
      
      const result = await addItemToCart(
        userId,
        itemData,
        mockDb,
        mockCatalogWorker,
        mockPricingWorker,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('cartId');
      expect(result.items).to.be.an('array');
    });
    
    it('should throw ValidationError for invalid input', async () => {
      try {
        await addItemToCart(
          'user-id',
          { productId: '', quantity: 0 },
          mockDb,
          mockCatalogWorker,
          mockPricingWorker,
          mockFulfillmentWorker,
          mockEnv.INTER_WORKER_API_KEY
        );
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
      }
    });
    
    it('should throw NotFoundError when product not found', async () => {
      const userId = 'test-user-id';
      const itemData = { productId: 'non-existent', quantity: 1 };
      
      mockCatalogWorker._setResponse('GET', '/product/non-existent', null, { status: 404 });
      
      try {
        await addItemToCart(
          userId,
          itemData,
          mockDb,
          mockCatalogWorker,
          mockPricingWorker,
          mockFulfillmentWorker,
          mockEnv.INTER_WORKER_API_KEY
        );
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(NotFoundError);
      }
    });
    
    it('should throw ConflictError when stock insufficient', async () => {
      const userId = 'test-user-id';
      const itemData = { productId: 'product-1', quantity: 100 };
      
      const mockCart = {
        cart_id: 'cart-id',
        user_id: userId,
        items: JSON.stringify([]),
        total_price: 0,
      };
      
      mockCatalogWorker._setResponse('GET', '/product/product-1', { productId: 'product-1' });
      mockPricingWorker._setResponse('GET', '/product/product-1', { price: 1000 }); // getPriceFromWorker uses /product/
      mockFulfillmentWorker._setResponse('GET', '/stock/product-1', { available: 10 }); // Only 10 available
      
      mockDb = createMockD1WithSequence([
        { first: mockCart },
      ]);
      
      try {
        await addItemToCart(
          userId,
          itemData,
          mockDb,
          mockCatalogWorker,
          mockPricingWorker,
          mockFulfillmentWorker,
          mockEnv.INTER_WORKER_API_KEY
        );
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('stock');
      }
    });
  });
  
  describe('updateItemQuantity', () => {
    it('should update item quantity', async () => {
      const userId = 'test-user-id';
      const itemId = 'item-id';
      const quantity = 3;
      
      const mockCart = {
        cart_id: 'cart-id',
        user_id: userId,
        items: JSON.stringify([
          { itemId, productId: 'product-1', quantity: 1, lockedPrice: 1000 }
        ]),
        total_price: 1000,
      };
      
      // Sequence: getOrCreateCart -> getCartByUserId, then updateItemQuantity -> updateCart
      mockDb = createMockD1WithSequence([
        { first: mockCart }, // getCartByUserId (from getOrCreateCart)
        { run: { success: true, meta: { changes: 1 } } }, // updateCart (must have changes > 0)
      ]);
      
      mockFulfillmentWorker._setResponse('GET', '/stock/product-1', { available: 50 });
      
      const result = await updateItemQuantity(
        userId,
        itemId,
        quantity,
        mockDb,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('cartId');
    });
  });
  
  describe('removeItemFromCart', () => {
    it('should remove item from cart', async () => {
      const userId = 'test-user-id';
      const itemId = 'item-id';
      
      const mockCart = {
        cart_id: 'cart-id',
        user_id: userId,
        items: JSON.stringify([
          { itemId, productId: 'product-1', quantity: 1 }
        ]),
        total_price: 1000,
      };
      
      // Sequence: getOrCreateCart -> getCartByUserId, then removeItemFromCart -> updateCart
      mockDb = createMockD1WithSequence([
        { first: mockCart }, // getCartByUserId (from getOrCreateCart)
        { run: { success: true, meta: { changes: 1 } } }, // updateCart (must have changes > 0)
      ]);
      
      const result = await removeItemFromCart(
        userId,
        itemId,
        mockDb,
        mockFulfillmentWorker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('cartId');
    });
  });
});

