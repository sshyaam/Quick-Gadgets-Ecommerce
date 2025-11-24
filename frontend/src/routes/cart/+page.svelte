<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { cart, user } from '$lib/stores';
	import { cartApi } from '$lib/api';
	import { redirectToLogin, isAuthenticationError } from '$lib/auth.js';
	import { getAccessToken, clearAuthCookies } from '$lib/cookies.js';

	export let data;

	let cartData = data.cart;
	// Track initial cart loading - start as true if we don't have data yet and might need to load it
	let isLoadingCart = (data.cart === null || data.cart === undefined) && !data.requiresAuth;
	
	// Load cart on client-side if not loaded server-side (for localStorage auth)
	onMount(async () => {
		// If we already have cart data from server, use it
		if (data.cart !== null && data.cart !== undefined) {
			cartData = data.cart;
			isLoadingCart = false;
			// Validate cart to check for price changes
			await validateCartPrices();
			return;
		}
		
		// Otherwise, try to load cart client-side if we have a token
		const accessToken = typeof window !== 'undefined' ? getAccessToken() : null;
		
		if (accessToken) {
			isLoadingCart = true;
			try {
				const loadedCart = await cartApi.getCart();
				cart.set(loadedCart);
				cartData = loadedCart;
				// Validate cart to check for price changes
				await validateCartPrices();
			} catch (err) {
				console.error('Error loading cart:', err);
				// If it fails with 401, user might not be logged in
				if (isAuthenticationError(err)) {
					// Clear tokens
					if (typeof window !== 'undefined') {
						clearAuthCookies();
					}
					// Set cartData to null so login message shows
					cartData = null;
				} else {
					// Other error - cart might be empty, set to empty array
					cartData = { items: [] };
				}
			} finally {
				isLoadingCart = false;
			}
		} else {
			// No token - set to null so login message shows
			cartData = null;
			isLoadingCart = false;
		}
	});
	
	async function validateCartPrices() {
		if (!cartData || !cartData.items || cartData.items.length === 0) {
			priceWarnings = [];
			return;
		}
		
		validatingCart = true;
		try {
			const validation = await cartApi.validateCart(cartData);
			if (validation.warnings && Array.isArray(validation.warnings)) {
				priceWarnings = validation.warnings;
				
				// If cart was updated with new prices, reload the cart to get updated prices
				if (validation.cartUpdated) {
					try {
						const updatedCart = await cartApi.getCart();
						cart.set(updatedCart);
						cartData = updatedCart;
					} catch (err) {
						console.error('Error reloading cart after price update:', err);
					}
				}
			} else {
				priceWarnings = [];
			}
		} catch (err) {
			console.error('Error validating cart:', err);
			priceWarnings = [];
		} finally {
			validatingCart = false;
		}
	}
	let loading = false;
	let updatingItems = new Set();
	let errorMessage = '';
	let showClearConfirm = false;
	let priceWarnings = []; // Array of price change warnings
	let validatingCart = false;

	async function updateQuantity(itemId, newQuantity) {
		if (newQuantity < 1) {
			await removeItem(itemId);
			return;
		}

		updatingItems.add(itemId);
		loading = true;
		errorMessage = '';
		try {
			const updatedCart = await cartApi.updateItem(itemId, newQuantity);
			cart.set(updatedCart);
			cartData = updatedCart;
			// Re-validate cart after quantity update
			await validateCartPrices();
		} catch (error) {
			if (isAuthenticationError(error)) {
				redirectToLogin();
			} else {
				errorMessage = error.message || 'Failed to update item';
				setTimeout(() => errorMessage = '', 5000);
			}
		} finally {
			loading = false;
			updatingItems.delete(itemId);
		}
	}

	async function removeItem(itemId) {
		loading = true;
		errorMessage = '';
		try {
			const updatedCart = await cartApi.removeItem(itemId);
			cart.set(updatedCart);
			cartData = updatedCart;
		} catch (error) {
			if (isAuthenticationError(error)) {
				redirectToLogin();
			} else {
				errorMessage = error.message || 'Failed to remove item';
				setTimeout(() => errorMessage = '', 5000);
			}
		} finally {
			loading = false;
		}
	}

	async function clearCart() {
		if (!showClearConfirm) {
			showClearConfirm = true;
			return;
		}
		
		loading = true;
		errorMessage = '';
		try {
			await cartApi.clearCart();
			cart.set(null);
			cartData = null;
			showClearConfirm = false;
		} catch (error) {
			if (isAuthenticationError(error)) {
				redirectToLogin();
			} else {
				errorMessage = error.message || 'Failed to clear cart';
				setTimeout(() => errorMessage = '', 5000);
			}
		} finally {
			loading = false;
		}
	}

	function calculateTotal() {
		if (!cartData || !cartData.items) return 0;
		return cartData.items.reduce((sum, item) => {
			return sum + ((item.price || item.lockedPrice || 0) * item.quantity);
		}, 0);
	}

	function proceedToCheckout() {
		goto('/checkout');
	}
</script>

<svelte:head>
	<title>Shopping Cart - Quick Gadgets</title>
</svelte:head>

{#if isLoadingCart}
	<div class="text-center py-12">
		<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
		<p class="text-gray-600 text-lg">Loading your cart...</p>
	</div>
{:else if data.requiresAuth || (!cartData && typeof window !== 'undefined' && !getAccessToken())}
	<div class="text-center py-12">
		<p class="text-gray-600 text-lg mb-4">Please log in to view your cart.</p>
		<button
			on:click={() => redirectToLogin()}
			class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
		>
			Login
		</button>
	</div>
{:else if !cartData || !cartData.items || cartData.items.length === 0}
	<div class="text-center py-12">
		<p class="text-gray-600 text-lg mb-4">Your cart is empty.</p>
		<button
			on:click={() => goto('/catalog')}
			class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
		>
			Browse Catalog
		</button>
	</div>
{:else}
	<div class="max-w-4xl mx-auto">
		<h1 class="text-3xl font-bold mb-6">Shopping Cart</h1>

		{#if errorMessage}
			<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
				{errorMessage}
			</div>
		{/if}
		
		{#if priceWarnings.length > 0}
			<div class="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
				<p class="font-semibold mb-2">⚠️ Price Changes Detected</p>
				<ul class="list-disc list-inside space-y-1">
					{#each priceWarnings as warning}
						<li>
							<strong>{warning.productName || 'Product'}:</strong> {warning.message}
						</li>
					{/each}
				</ul>
				<p class="text-sm mt-2">Prices have been updated. Please review your cart before checkout.</p>
			</div>
		{/if}

		<div class="bg-white rounded-lg shadow-lg p-6">
			<div class="space-y-4">
				{#each cartData.items as item}
					{@const itemWarning = priceWarnings.find(w => w.itemId === item.itemId || w.productId === item.productId)}
					<div class="flex items-center justify-between border-b pb-4 {itemWarning ? 'bg-yellow-50 border-yellow-200 rounded p-3' : ''}">
						<a 
							href="/product/{item.productId}" 
							class="flex items-center space-x-4 flex-1 hover:opacity-80 transition-opacity"
						>
							{#if item.productImage}
								<img 
									src={item.productImage} 
									alt={item.productName || 'Product'} 
									class="w-20 h-20 object-cover rounded"
									on:error={(e) => { e.target.style.display = 'none'; }}
								/>
							{:else}
								<div class="w-20 h-20 bg-gray-200 rounded flex items-center justify-center">
									<span class="text-gray-400 text-xs">No Image</span>
								</div>
							{/if}
							<div class="flex-1">
								<h3 class="font-semibold text-lg text-blue-600 hover:text-blue-800">{item.productName || 'Product'}</h3>
								<p class="text-gray-600 text-sm">Product ID: {item.productId}</p>
								<div class="flex items-center gap-2">
									<p class="text-gray-600 text-sm">
										Price: ₹{(item.price || item.lockedPrice || 0)?.toFixed(2) || 'N/A'} each
									</p>
									{#if itemWarning}
										<span class="text-yellow-600 text-xs font-semibold bg-yellow-100 px-2 py-1 rounded">
											New: ₹{itemWarning.newPrice?.toFixed(2)}
										</span>
									{/if}
								</div>
							</div>
						</a>
						<div class="flex items-center space-x-4">
							<div class="flex items-center space-x-2">
								<button
									on:click={() => updateQuantity(item.itemId, item.quantity - 1)}
									disabled={loading || updatingItems.has(item.itemId)}
									class="px-3 py-1 border rounded disabled:opacity-50"
								>
									-
								</button>
								<span class="w-12 text-center">{item.quantity}</span>
								<button
									on:click={() => updateQuantity(item.itemId, item.quantity + 1)}
									disabled={loading || updatingItems.has(item.itemId)}
									class="px-3 py-1 border rounded disabled:opacity-50"
								>
									+
								</button>
							</div>
							<div class="w-32 text-right">
								<p class="font-semibold">
									₹{((item.price || item.lockedPrice || 0) * item.quantity).toFixed(2)}
								</p>
							</div>
							<button
								on:click={() => removeItem(item.itemId)}
								disabled={loading}
								class="text-red-500 hover:text-red-700 disabled:opacity-50"
							>
								Remove
							</button>
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-6 pt-6 border-t">
				<div class="flex justify-between items-center mb-4">
					<span class="text-xl font-semibold">Total:</span>
					<span class="text-2xl font-bold text-blue-600">
						₹{calculateTotal().toFixed(2)}
					</span>
				</div>
				<div class="flex space-x-4">
					{#if showClearConfirm}
						<button
							on:click={clearCart}
							disabled={loading}
							class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded disabled:opacity-50"
						>
							Confirm Clear Cart
						</button>
						<button
							on:click={() => showClearConfirm = false}
							disabled={loading}
							class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded disabled:opacity-50"
						>
							Cancel
						</button>
					{:else}
						<button
							on:click={() => showClearConfirm = true}
							disabled={loading}
							class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded disabled:opacity-50"
						>
							Clear Cart
						</button>
						<button
							on:click={proceedToCheckout}
							disabled={loading}
							class="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded disabled:opacity-50"
						>
							Proceed to Checkout
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
