/**
 * Cart service
 * Handles cart operations with price and stock locking
 * Uses Service Bindings for inter-worker communication
 */

import { 
  getCartByUserId, 
  getCartById,
  createCart, 
  updateCart, 
  clearCart 
} from '../models/cartModel.js';
import { getWorkerBinding, postWorkerBinding } from '../../shared/utils/interWorker.js';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/utils/errors.js';

/**
 * Get or create cart for user
 */
export async function getOrCreateCart(userId, db) {
  console.log(`[cart-service] Getting or creating cart for userId: ${userId}`);
  
  let cart = await getCartByUserId(db, userId);
  
  if (!cart) {
    console.log(`[cart-service] Cart not found, creating new cart`);
    cart = await createCart(db, userId);
    console.log(`[cart-service] Cart created: ${cart.cartId}`);
  } else {
    console.log(`[cart-service] Cart found: ${cart.cart_id}`);
  }
  
  // Parse items
  let items;
  try {
    items = typeof cart.items === 'string' 
      ? JSON.parse(cart.items) 
      : (cart.items || []);
  } catch (parseError) {
    console.error(`[cart-service] Error parsing cart items:`, parseError.message);
    items = [];
  }
  
  console.log(`[cart-service] Cart has ${items.length} items`);
  
  return {
    cartId: cart.cart_id || cart.cartId,
    userId: cart.user_id || cart.userId,
    items,
    totalPrice: cart.total_price || cart.totalPrice || 0,
    createdAt: cart.created_at || cart.createdAt,
    updatedAt: cart.updated_at || cart.updatedAt,
  };
}

/**
 * Add item to cart (locks price and stock)
 */
export async function addItemToCart(
  userId,
  itemData,
  db,
  catalogWorkerBinding,
  pricingWorkerBinding,
  fulfillmentWorkerBinding,
  apiKey
) {
  const { productId, quantity } = itemData;
  
  if (!productId || !quantity || quantity <= 0) {
    throw new ValidationError('productId and positive quantity are required');
  }
  
  // Get or create cart
  const cart = await getOrCreateCart(userId, db);
  const items = cart.items || [];
  
  // Check if item already exists in cart
  const existingItemIndex = items.findIndex(item => item.productId === productId);
  
  try {
    console.log(`[cart-service] Adding item to cart - userId: ${userId}, productId: ${productId}, quantity: ${quantity}`);
    
    if (existingItemIndex >= 0) {
      // Item already exists - check stock considering what's already in cart
      console.log(`[cart-service] Item already in cart, updating quantity`);
      const currentCartQuantity = items[existingItemIndex].quantity;
      const newTotalQuantity = currentCartQuantity + quantity;
      
      // Get current stock to validate
      const stockResponse = await getWorkerBinding(
        fulfillmentWorkerBinding,
        `/stock/${productId}`,
        {},
        apiKey
      );
      
      if (!stockResponse.ok) {
        if (stockResponse.status === 404) {
          throw new NotFoundError('Product stock');
        }
        throw new Error(`Failed to get product stock: ${stockResponse.status}`);
      }
      
      const stockData = await stockResponse.json();
      
      // Validate stock data
      if (!stockData || typeof stockData.available !== 'number') {
        console.error(`[cart-service] Invalid stock data:`, stockData);
        throw new Error(`Invalid stock data received. Expected number, got: ${typeof stockData?.available}`);
      }
      
      // Check: availableStock >= newTotalQuantity (user-level validation with cart)
      if (stockData.available < newTotalQuantity) {
        throw new ConflictError(
          `Insufficient stock. Available: ${stockData.available}, ` +
          `Already in cart: ${currentCartQuantity}, ` +
          `Requested additional: ${quantity}, ` +
          `Total needed: ${newTotalQuantity}`
        );
      }
      
      // Update quantity
      items[existingItemIndex].quantity = newTotalQuantity;
      console.log(`[cart-service] Quantity updated: ${currentCartQuantity} -> ${newTotalQuantity}`);
    } else {
      console.log(`[cart-service] New item, fetching product details, price and stock`);
      // Get product details (name, image), price and stock from workers using Service Bindings
      const [productResponse, priceResponse, stockResponse] = await Promise.all([
        getWorkerBinding(catalogWorkerBinding, `/product/${productId}`, {}, apiKey),
        getWorkerBinding(pricingWorkerBinding, `/product/${productId}`, {}, apiKey),
        getWorkerBinding(fulfillmentWorkerBinding, `/stock/${productId}`, {}, apiKey),
      ]);
      
      // Check if responses are OK
      if (!productResponse.ok) {
        if (productResponse.status === 404) {
          throw new NotFoundError('Product');
        }
        throw new Error(`Failed to get product details: ${productResponse.status}`);
      }
      
      if (!priceResponse.ok) {
        if (priceResponse.status === 404) {
          throw new NotFoundError('Product price');
        }
        throw new Error(`Failed to get product price: ${priceResponse.status}`);
      }
      
      if (!stockResponse.ok) {
        if (stockResponse.status === 404) {
          throw new NotFoundError('Product stock');
        }
        throw new Error(`Failed to get product stock: ${stockResponse.status}`);
      }
      
      let productData, priceData, stockData;
      try {
        productData = await productResponse.json();
        priceData = await priceResponse.json();
        stockData = await stockResponse.json();
        console.log(`[cart-service] Product data keys:`, Object.keys(productData));
        console.log(`[cart-service] Product data sample:`, JSON.stringify({ 
          name: productData.name, 
          image: productData.image,
          imageUrl: productData.imageUrl,
          image_url: productData.image_url,
          images: productData.images
        }));
        console.log(`[cart-service] Price data:`, JSON.stringify(priceData));
        console.log(`[cart-service] Stock data:`, JSON.stringify(stockData));
      } catch (parseError) {
        console.error(`[cart-service] Error parsing JSON:`, parseError.message);
        throw new Error(`Failed to parse response data: ${parseError.message}`);
      }
      
      // Validate price data
      if (!priceData || typeof priceData.price !== 'number') {
        console.error(`[cart-service] Invalid price data:`, priceData);
        throw new Error(`Invalid price data received. Expected number, got: ${typeof priceData?.price}`);
      }
      
      // Validate stock data
      if (!stockData || typeof stockData.available !== 'number') {
        console.error(`[cart-service] Invalid stock data:`, stockData);
        throw new Error(`Invalid stock data received. Expected number, got: ${typeof stockData?.available}`);
      }
      
      // Check stock availability (but don't reserve - reserve only at checkout)
      if (stockData.available < quantity) {
        throw new ConflictError(`Insufficient stock. Available: ${stockData.available}, Requested: ${quantity}`);
      }
      
      // Extract image from various possible field names
      const productImage = productData.image || productData.imageUrl || productData.image_url || 
                           (productData.images && Array.isArray(productData.images) && productData.images.length > 0 ? productData.images[0] : null) ||
                           null;
      
      // Apply discount if discountPercentage is set (0-90%)
      const discountPercentage = productData.discountPercentage || 0;
      let finalPrice = priceData.price;
      if (discountPercentage > 0 && discountPercentage <= 90) {
        finalPrice = priceData.price * (1 - discountPercentage / 100);
      }
      
      // Add item with product details, price (with discount applied, not locked - will validate at checkout)
      // DO NOT reserve stock here - reserve only during payment/checkout
      // Store all product data for future use, but keep existing fields for backward compatibility with frontend
      const newItem = {
        itemId: crypto.randomUUID(),
        productId,
        productName: productData.name || 'Product',
        productImage: productImage,
        quantity,
        price: finalPrice, // Store price with discount applied, validate at checkout
        currency: priceData.currency || 'INR',
        addedAt: new Date().toISOString(),
        // Store full product data (all attributes from catalog worker)
        productData: productData,
      };
      console.log(`[cart-service] Adding item to cart:`, JSON.stringify(newItem));
      items.push(newItem);
    }
    
    // Calculate total price (support both price and lockedPrice for backward compatibility)
    const totalPrice = items.reduce((sum, item) => {
      return sum + ((item.price || item.lockedPrice || 0) * item.quantity);
    }, 0);
    
    // Update cart (D1 doesn't support traditional transactions, so we do direct update)
    console.log(`[cart-service] Updating cart ${cart.cartId} with ${items.length} items, total: ${totalPrice}`);
    try {
      const updated = await updateCart(db, cart.cartId, items, totalPrice);
      if (!updated) {
        console.error(`[cart-service] Cart update returned false - cart might not exist`);
        throw new Error('Failed to update cart - cart not found or no changes made');
      }
      console.log(`[cart-service] Cart updated successfully`);
    } catch (updateError) {
      console.error(`[cart-service] Error updating cart:`, updateError.message, updateError.stack);
      throw updateError;
    }
    
    // Success - return cart
    return {
      cartId: cart.cartId,
      userId,
      items,
      totalPrice,
      createdAt: cart.created_at,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[cart-service] Error in addItemToCart:`, error.message, error.stack);
    // Re-throw the original error (no stock to release since we don't reserve in cart)
    throw error;
  }
}

/**
 * Update item quantity
 */
export async function updateItemQuantity(
  userId,
  itemId,
  quantity,
  db,
  fulfillmentWorkerBinding,
  apiKey
) {
  // Note: We don't reserve stock when updating quantity in cart
  // Stock is only reserved during checkout/payment
  if (quantity <= 0) {
    throw new ValidationError('Quantity must be greater than 0');
  }
  
  const cart = await getOrCreateCart(userId, db);
  const items = cart.items || [];
  
  const itemIndex = items.findIndex(item => item.itemId === itemId);
  if (itemIndex === -1) {
    throw new NotFoundError('Cart item');
  }
  
  const item = items[itemIndex];
  const quantityChange = quantity - item.quantity;
  
  console.log(`[cart-service] Updating item quantity - itemId: ${itemId}, current: ${item.quantity}, new: ${quantity}, change: ${quantityChange}`);
  
  if (quantityChange !== 0) {
    // Only check stock if increasing quantity (decreasing is always allowed)
    if (quantityChange > 0) {
      // Check stock availability considering what's already in cart
      // For update: we're replacing the old quantity, so check availableStock >= newQuantity
      // But we need to account for other items of same product in cart (shouldn't happen, but be safe)
      console.log(`[cart-service] Increasing quantity, checking stock availability`);
      const stockResponse = await getWorkerBinding(
        fulfillmentWorkerBinding,
        `/stock/${item.productId}`,
        {},
        apiKey
      );
      
      if (!stockResponse.ok) {
        throw new NotFoundError('Product stock');
      }
      
      const stockData = await stockResponse.json();
      
      // Validate stock data
      if (!stockData || typeof stockData.available !== 'number') {
        throw new Error(`Invalid stock data received. Expected number, got: ${typeof stockData?.available}`);
      }
      
      // Calculate total quantity of this product in cart (should be just this item, but check all)
      const totalInCart = items
        .filter(i => i.productId === item.productId)
        .reduce((sum, i) => sum + i.quantity, 0);
      
      // Calculate available stock after removing current cart quantity
      // availableStock - (totalInCart - item.quantity) = stock available for this update
      const availableForUpdate = stockData.available - (totalInCart - item.quantity);
      
      // Check: availableForUpdate >= newQuantity (user-level validation with cart)
      if (availableForUpdate < quantity) {
        throw new ConflictError(
          `Insufficient stock. Available: ${stockData.available}, ` +
          `Already in cart: ${totalInCart - item.quantity}, ` +
          `Available for update: ${availableForUpdate}, ` +
          `Requested: ${quantity}`
        );
      }
      
      // DO NOT reserve stock here - reserve only during checkout/payment
      console.log(`[cart-service] Stock check passed, updating quantity (no reservation)`);
    } else {
      // Decreasing quantity - no stock check needed
      console.log(`[cart-service] Decreasing quantity, no stock check needed`);
    }
    
    item.quantity = quantity;
  }
  
  // Calculate total price (support both price and lockedPrice for backward compatibility)
  const totalPrice = items.reduce((sum, item) => {
    return sum + ((item.price || item.lockedPrice || 0) * item.quantity);
  }, 0);
  
  // Update cart (D1 doesn't support traditional transactions)
  console.log(`[cart-service] Updating cart with new quantity, totalPrice: ${totalPrice}`);
  try {
    const updated = await updateCart(db, cart.cartId, items, totalPrice);
    if (!updated) {
      throw new Error('Failed to update cart - cart not found or no changes made');
    }
    console.log(`[cart-service] Cart updated successfully`);
  } catch (updateError) {
    console.error(`[cart-service] Error updating cart:`, updateError.message, updateError.stack);
    throw updateError;
  }
  
  return {
    cartId: cart.cartId,
    userId,
    items,
    totalPrice,
    createdAt: cart.created_at,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove item from cart
 */
export async function removeItemFromCart(
  userId,
  itemId,
  db,
  fulfillmentWorkerBinding,
  apiKey
) {
  console.log(`[cart-service] Removing item from cart - userId: ${userId}, itemId: ${itemId}`);
  
  const cart = await getOrCreateCart(userId, db);
  const items = cart.items || [];
  
  const itemIndex = items.findIndex(item => item.itemId === itemId);
  if (itemIndex === -1) {
    throw new NotFoundError('Cart item');
  }
  
  const item = items[itemIndex];
  console.log(`[cart-service] Found item to remove: productId ${item.productId}, quantity ${item.quantity}`);
  
  // DO NOT release stock here - stock is not reserved in cart, only at checkout
  // Remove item
  items.splice(itemIndex, 1);
  console.log(`[cart-service] Item removed from cart, ${items.length} items remaining`);
  
  // Calculate total price (support both price and lockedPrice for backward compatibility)
  const totalPrice = items.reduce((sum, item) => {
    return sum + ((item.price || item.lockedPrice || 0) * item.quantity);
  }, 0);
  
  // Update cart (D1 doesn't support traditional transactions)
  console.log(`[cart-service] Updating cart after removal, totalPrice: ${totalPrice}`);
  try {
    const updated = await updateCart(db, cart.cartId, items, totalPrice);
    if (!updated) {
      throw new Error('Failed to update cart - cart not found or no changes made');
    }
    console.log(`[cart-service] Cart updated successfully after item removal`);
  } catch (updateError) {
    console.error(`[cart-service] Error updating cart:`, updateError.message, updateError.stack);
    throw updateError;
  }
  
  return {
    cartId: cart.cartId,
    userId,
    items,
    totalPrice,
    createdAt: cart.created_at,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validate cart (revalidate prices and stocks)
 * Now accounts for discount percentage changes
 */
export async function validateCart(
  cartId,
  db,
  pricingWorkerBinding,
  fulfillmentWorkerBinding,
  catalogWorkerBinding,
  apiKey
) {
  const cart = await getCartById(db, cartId);
  if (!cart) {
    throw new NotFoundError('Cart');
  }
  
  const items = typeof cart.items === 'string' 
    ? JSON.parse(cart.items) 
    : cart.items;
  
  const warnings = [];
  const errors = [];
  
  // Validate each item
  for (const item of items) {
    // Get current base price from pricing worker
    const priceResponse = await getWorkerBinding(
      pricingWorkerBinding,
      `/product/${item.productId}`,
      {},
      apiKey
    );
    
    if (!priceResponse.ok) {
      errors.push(`Product ${item.productId}: Price not found`);
      continue;
    }
    
    const priceData = await priceResponse.json();
    const basePrice = priceData.price;
    
    // Get product data to check current discount percentage
    let currentDiscountPercentage = 0;
    let productName = item.productName || 'Product';
    
    if (catalogWorkerBinding) {
      try {
        const productResponse = await getWorkerBinding(
          catalogWorkerBinding,
          `/product/${item.productId}`,
          {},
          apiKey
        );
        
        if (productResponse.ok) {
          const productData = await productResponse.json();
          productName = productData.name || productName;
          currentDiscountPercentage = productData.discountPercentage || 0;
        }
      } catch (productError) {
        console.warn(`[cart-service] Failed to get product data for ${item.productId}:`, productError.message);
        // Continue without product data - we'll still check price
      }
    }
    
    // Calculate current discounted price
    let currentDiscountedPrice = basePrice;
    if (currentDiscountPercentage > 0 && currentDiscountPercentage <= 90) {
      currentDiscountedPrice = basePrice * (1 - currentDiscountPercentage / 100);
    }
    
    // Get cart item price (this is the price when item was added, with discount applied)
    const cartItemPrice = item.price || item.lockedPrice || 0;
    
    // Check if the discounted price has changed (allow small floating point differences)
    const priceDifference = Math.abs(currentDiscountedPrice - cartItemPrice);
    if (priceDifference > 0.01) { // More than 1 paisa difference
      const oldPriceDisplay = cartItemPrice.toFixed(2);
      const newPriceDisplay = currentDiscountedPrice.toFixed(2);
      
      // Update the item price to the current discounted price
      item.price = currentDiscountedPrice;
      // Remove lockedPrice if it exists (use price instead)
      if (item.lockedPrice) {
        delete item.lockedPrice;
      }
      
      warnings.push({
        productId: item.productId,
        productName: productName,
        message: `Price updated from ₹${oldPriceDisplay} to ₹${newPriceDisplay}`,
        oldPrice: cartItemPrice,
        newPrice: currentDiscountedPrice,
        itemId: item.itemId
      });
    }
    
    // Get current stock
    const stockResponse = await getWorkerBinding(
      fulfillmentWorkerBinding,
      `/stock/${item.productId}`,
      {},
      apiKey
    );
    
    if (!stockResponse.ok) {
      errors.push(`Product ${item.productId}: Stock not found`);
      continue;
    }
    
    const stockData = await stockResponse.json();
    
    // Check if stock is available (don't check lockedStock - we validate at checkout)
    if (stockData.available < item.quantity) {
      errors.push(`Product ${item.productId}: Insufficient stock. Available: ${stockData.available}, Requested: ${item.quantity}`);
    }
  }
  
  // If prices were updated, save the cart with updated prices
  if (warnings.length > 0) {
    // Recalculate total price with updated prices
    const totalPrice = items.reduce((sum, item) => {
      return sum + ((item.price || item.lockedPrice || 0) * item.quantity);
    }, 0);
    
    // Update cart in database with new prices
    try {
      const updated = await updateCart(db, cartId, items, totalPrice);
      if (updated) {
        console.log(`[cart-service] Cart prices updated successfully. New total: ${totalPrice}`);
      } else {
        console.warn(`[cart-service] Failed to update cart prices in database`);
      }
    } catch (updateError) {
      console.error(`[cart-service] Error updating cart prices:`, updateError.message, updateError.stack);
      // Don't fail validation if price update fails - we still want to return warnings
    }
  }
  
  const result = {
    valid: errors.length === 0,
    warnings: warnings.length > 0 ? warnings : undefined,
    errors: errors.length > 0 ? errors : undefined,
    cartUpdated: warnings.length > 0, // Indicate if cart was updated
  };
  
  if (errors.length > 0) {
    console.log(`[cart-service] Cart validation failed with ${errors.length} error(s):`, errors);
  } else if (warnings.length > 0) {
    console.log(`[cart-service] Cart validation passed with ${warnings.length} warning(s). Prices updated.`, warnings);
  } else {
    console.log('[cart-service] Cart validation passed with no errors or warnings');
  }
  
  return result;
}

/**
 * Clear cart
 */
export async function clearUserCart(userId, db, fulfillmentWorkerBinding, apiKey) {
  console.log(`[cart-service] Clearing cart for userId: ${userId}`);
  
  const cart = await getOrCreateCart(userId, db);
  const items = cart.items || [];
  
  // DO NOT release stock here - stock is not reserved in cart, only at checkout
  // Clear cart
  console.log(`[cart-service] Clearing cart ${cart.cartId}`);
  try {
    const cleared = await clearCart(db, cart.cartId);
    if (!cleared) {
      throw new Error('Failed to clear cart');
    }
    console.log(`[cart-service] Cart cleared successfully`);
  } catch (clearError) {
    console.error(`[cart-service] Error clearing cart:`, clearError.message, clearError.stack);
    throw clearError;
  }
  
  return {
    cartId: cart.cartId,
    userId,
    items: [],
    totalPrice: 0,
    createdAt: cart.created_at,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Clear cart by cart ID (inter-worker)
 */
export async function clearCartById(cartId, db) {
  return await clearCart(db, cartId);
}
