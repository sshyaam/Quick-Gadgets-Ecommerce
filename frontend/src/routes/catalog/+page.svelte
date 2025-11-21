<script>
	import { page } from '$app/stores';
	import { goto, afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { cart } from '$lib/stores';
	import { cartApi, fulfillmentApi } from '$lib/api';
	import Pagination from '$lib/components/Pagination.svelte';

	export let data;

	let products = data.products || [];
	let pagination = data.pagination || {};
	let loading = false;
	
	// Initialize from URL params - these are NOT reactive to allow free typing
	let searchQuery = '';
	let categoryFilter = '';
	
	let errorMessage = '';
	let successMessage = '';
	
	// Pincode for shipping estimates
	let pincode = '';
	let city = '';
	let state = '';
	let shippingOptions = {}; // productId -> shipping options
	let loadingShipping = new Set();
	let isLoadingShipping = false; // Flag to prevent concurrent loads
	let lastProductIds = ''; // Track last product IDs to detect changes
	
	// Reactive statement to update products when data changes
	$: {
		products = data.products || [];
		pagination = data.pagination || {};
		
		// Reload shipping options when products change (e.g., after search/filter)
		if (pincode && products.length > 0 && !isLoadingShipping) {
			// Create a stable string representation of product IDs
			const productIds = products.map(p => p.productId).sort().join(',');
			
			// Only reload if product list actually changed
			if (productIds !== lastProductIds) {
				lastProductIds = productIds;
				shippingOptions = {}; // Clear old shipping options
				loadShippingOptionsForProducts();
			}
		}
	}
	
	onMount(() => {
		// Initialize search/category from URL params (only once on mount)
		searchQuery = $page.url.searchParams.get('search') || '';
		categoryFilter = $page.url.searchParams.get('category') || '';
		
		// Load pincode from localStorage
		if (typeof window !== 'undefined') {
			pincode = localStorage.getItem('shippingPincode') || '';
			city = localStorage.getItem('shippingCity') || '';
			state = localStorage.getItem('shippingState') || '';
			
			// Initialize lastProductIds to prevent immediate reload
			if (products.length > 0) {
				lastProductIds = products.map(p => p.productId).sort().join(',');
			}
			
			// If pincode exists, load shipping options for all products
			if (pincode && products.length > 0) {
				loadShippingOptionsForProducts();
			}
		}
	});
	
	// Sync from URL after navigation completes (not reactively)
	afterNavigate(() => {
		// Sync search/category from URL after navigation
		// This happens after handleSearch() completes
		searchQuery = $page.url.searchParams.get('search') || '';
		categoryFilter = $page.url.searchParams.get('category') || '';
	});
	
	async function savePincode() {
		if (!pincode || pincode.length !== 6) {
			errorMessage = 'Please enter a valid 6-digit pincode';
			setTimeout(() => errorMessage = '', 5000);
			return;
		}
		
		// Save to localStorage
		if (typeof window !== 'undefined') {
			localStorage.setItem('shippingPincode', pincode);
			if (city) localStorage.setItem('shippingCity', city);
			if (state) localStorage.setItem('shippingState', state);
		}
		
		// Load shipping options for all products
		await loadShippingOptionsForProducts();
		successMessage = 'Delivery estimates updated!';
		setTimeout(() => successMessage = '', 3000);
	}
	
	async function loadShippingOptionsForProducts() {
		if (!pincode || products.length === 0 || isLoadingShipping) return;
		
		isLoadingShipping = true;
		
		try {
			// Collect all products that need shipping options
			const productsToLoad = products.filter(
				p => p.category && !shippingOptions[p.productId] && !loadingShipping.has(p.productId)
			);
			
			if (productsToLoad.length === 0) {
				isLoadingShipping = false;
				return;
			}
			
			// Mark all as loading
			productsToLoad.forEach(p => loadingShipping.add(p.productId));
			
			// Load all shipping options in parallel (but batched)
			const promises = productsToLoad.map(async (product) => {
				try {
					const options = await fulfillmentApi.getShippingOptions(
						product.productId,
						product.category,
						pincode,
						city,
						state
					);
					return { productId: product.productId, options, error: null };
				} catch (error) {
					return { 
						productId: product.productId, 
						options: null, 
						error: { error: true, message: 'Failed to load shipping options' }
					};
				} finally {
					loadingShipping.delete(product.productId);
				}
			});
			
			// Wait for all requests to complete
			const results = await Promise.all(promises);
			
			// Batch update shipping options once (prevents multiple reactive triggers)
			const newShippingOptions = { ...shippingOptions };
			results.forEach(({ productId, options, error }) => {
				if (error) {
					newShippingOptions[productId] = error;
				} else if (options) {
					newShippingOptions[productId] = options;
				}
			});
			
			// Single update to prevent reactive loop
			shippingOptions = newShippingOptions;
		} finally {
			isLoadingShipping = false;
		}
	}
	
	function getShippingEstimate(productId) {
		const options = shippingOptions[productId];
		
		if (!options || options.error) {
			return null;
		}
		
		// Don't show delivery estimate if stock is not available
		if (options.stockAvailable === false || (options.availableStock !== undefined && options.availableStock <= 0)) {
			return null;
		}
		
		// Check if standard is available
		const standardAvailable = options.standard && (
			options.standard.available === true || 
			options.standard.available === 1 ||
			options.standard.available === 'true' ||
			options.standard.available === '1'
		);
		
		// Check if express is available
		const expressAvailable = options.express && (
			options.express.available === true || 
			options.express.available === 1 ||
			options.express.available === 'true' ||
			options.express.available === '1'
		);
		
		// Prefer standard shipping estimate
		if (standardAvailable) {
			const estimate = options.standard.estimatedDaysRange || `${options.standard.estimatedDays || 5} days`;
			return estimate;
		}
		
		// Fallback to express
		if (expressAvailable) {
			const estimate = options.express.estimatedDaysRange || `${options.express.estimatedDays || 2} days`;
			return estimate;
		}
		
		return null;
	}

	async function handleSearch() {
		loading = true;
		const params = new URLSearchParams();
		if (searchQuery && searchQuery.trim()) {
			params.set('search', searchQuery.trim());
		}
		if (categoryFilter) {
			params.set('category', categoryFilter);
		}
		params.set('page', '1');
		
		// Navigate and invalidate to reload data
		// afterNavigate() will sync the inputs after navigation completes
		await goto(`/catalog?${params}`, { invalidateAll: true, noScroll: true });
		loading = false;
	}

	async function handleAddToCart(product) {
		if (!product.price || !product.stock) {
			errorMessage = 'Product price or stock information unavailable';
			setTimeout(() => errorMessage = '', 5000);
			return;
		}

		loading = true;
		errorMessage = '';
		successMessage = '';
		try {
			const updatedCart = await cartApi.addItem(
				product.productId,
				1
			);
			cart.set(updatedCart);
			successMessage = 'Item added to cart!';
			setTimeout(() => successMessage = '', 3000);
		} catch (error) {
			if (error.message.includes('401') || error.message.includes('Access token required') || error.message.includes('Unauthorized')) {
				goto('/login');
			} else {
				errorMessage = error.message || 'Failed to add item to cart';
				setTimeout(() => errorMessage = '', 5000);
			}
		} finally {
			loading = false;
		}
	}

	function goToProduct(productId) {
		goto(`/product/${productId}`);
	}
	
	// Extract first image from product data
	function getProductImage(product) {
		if (!product) return null;
		
		// Check for images array first
		if (product.images && Array.isArray(product.images) && product.images.length > 0) {
			return product.images[0];
		}
		
		// Check for single image fields
		const singleImage = product.image || product.imageUrl || product.image_url || product.productImage || product.thumbnail || product.thumbnailUrl;
		if (singleImage) {
			return singleImage;
		}
		
		// Recursively search for image fields in nested objects
		function findImage(obj, depth = 0) {
			if (!obj || typeof obj !== 'object' || depth > 3) return null;
			
			const imageFields = ['image', 'imageUrl', 'image_url', 'images', 'photo', 'photoUrl', 'thumbnail', 'thumbnailUrl'];
			
			for (const [key, value] of Object.entries(obj)) {
				if (imageFields.includes(key.toLowerCase())) {
					if (Array.isArray(value) && value.length > 0) {
						return value[0];
					} else if (typeof value === 'string' && value.trim()) {
						return value.trim();
					} else if (typeof value === 'object' && value !== null && value.url) {
						return value.url;
					}
				} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
					const found = findImage(value, depth + 1);
					if (found) return found;
				}
			}
			
			return null;
		}
		
		return findImage(product);
	}
</script>

<svelte:head>
	<title>Catalog - Quick Gadgets</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold mb-6">Product Catalog</h1>
	
	<!-- Success/Error Messages -->
	{#if successMessage}
		<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
			{successMessage}
		</div>
	{/if}
	
	{#if errorMessage}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			{errorMessage}
		</div>
	{/if}
	
	<!-- Pincode Input for Shipping Estimates -->
	<div class="bg-blue-50 border border-blue-200 p-4 rounded-lg shadow mb-6">
		<div class="flex flex-col md:flex-row gap-4 items-end">
			<div class="flex-1">
				<label class="block text-sm font-medium text-gray-700 mb-2">
					Enter Pincode for Delivery Estimates
				</label>
				<div class="flex gap-2">
			<input
				type="text"
				bind:value={pincode}
				placeholder="6-digit pincode"
				maxlength="6"
				pattern="[0-9]{6}"
				class="flex-1 px-4 py-2 border rounded-lg"
				on:keydown={(e) => e.key === 'Enter' && savePincode()}
				on:input={() => {
					// Clear shipping options when pincode changes
					if (pincode.length === 6) {
						shippingOptions = {};
						lastProductIds = ''; // Reset to allow reload
					}
				}}
			/>
					<input
						type="text"
						bind:value={city}
						placeholder="City (optional)"
						class="flex-1 px-4 py-2 border rounded-lg"
					/>
					<input
						type="text"
						bind:value={state}
						placeholder="State (optional)"
						class="flex-1 px-4 py-2 border rounded-lg"
					/>
				</div>
			</div>
			<button
				on:click={savePincode}
				class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg whitespace-nowrap"
			>
				Update Estimates
			</button>
		</div>
	</div>
	
	<!-- Search and Filter -->
	<div class="bg-white p-4 rounded-lg shadow mb-6">
		<div class="flex flex-col md:flex-row gap-4">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search products..."
				class="flex-1 px-4 py-2 border rounded-lg"
				on:keydown={(e) => {
					if (e.key === 'Enter') {
						handleSearch();
					}
				}}
			/>
			<select
				bind:value={categoryFilter}
				class="px-4 py-2 border rounded-lg"
				on:change={() => {
					// Trigger search immediately on category change
					handleSearch();
				}}
			>
				<option value="">All Categories</option>
				<option value="smartphones">Smartphones</option>
				<option value="laptops">Laptops</option>
				<option value="tablets">Tablets</option>
				<option value="accessories">Accessories</option>
			</select>
			<button
				on:click={handleSearch}
				class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg"
			>
				Search
			</button>
		</div>
	</div>

	<!-- Error Message -->
	{#if data.error}
		<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
			<p><strong>Warning:</strong> {data.error}</p>
			<p class="text-sm mt-2">The catalog may be empty or the service may be unavailable. Please try again later.</p>
		</div>
	{/if}

	<!-- Products Grid -->
	{#if products.length === 0}
		<div class="text-center py-12">
			<p class="text-gray-600 text-lg">No products found.</p>
			{#if !data.error}
				<p class="text-gray-500 text-sm mt-2">Try adjusting your search or filters.</p>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
			{#each products as product}
				<article 
					class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
				>
					<button
						type="button"
						class="w-full text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
						on:click={() => goToProduct(product.productId)}
						on:keydown={(e) => e.key === 'Enter' && goToProduct(product.productId)}
					>
						{#if getProductImage(product)}
							<div class="h-48 bg-gray-100 rounded-t-lg overflow-hidden">
								<img 
									src={getProductImage(product)} 
									alt={product.name || 'Product'} 
									class="w-full h-full object-cover"
									on:error={(e) => { 
										e.target.style.display = 'none';
										e.target.nextElementSibling.style.display = 'flex';
									}}
								/>
								<div class="hidden h-48 bg-gray-200 flex items-center justify-center">
									<span class="text-gray-400">Image not available</span>
								</div>
							</div>
						{:else}
							<div class="h-48 bg-gray-200 flex items-center justify-center">
								<span class="text-gray-400">No Image</span>
							</div>
						{/if}
						<div class="p-4">
							<h3 class="font-semibold text-lg mb-2">{product.name || 'Product'}</h3>
							<p class="text-gray-600 text-sm mb-2 line-clamp-2">
								{product.description || 'No description available'}
							</p>
							<div class="flex items-center justify-between mb-3">
								<span class="text-2xl font-bold text-blue-600">
									₹{product.price?.toFixed(2) || 'N/A'}
								</span>
								<span class="text-sm text-gray-500">
									Stock: {product.stock || 0}
								</span>
							</div>
			{#if pincode}
				<div class="text-xs text-gray-600 mt-2">
					{#if loadingShipping.has(product.productId)}
						<span class="text-gray-400">Loading delivery estimate...</span>
					{:else if shippingOptions[product.productId]?.error}
						<span class="text-yellow-600">Unable to load delivery estimate</span>
					{:else if shippingOptions[product.productId] && getShippingEstimate(product.productId)}
						<span class="text-green-600">
							🚚 Delivery: {getShippingEstimate(product.productId)}
						</span>
					{:else if shippingOptions[product.productId]}
						<span class="text-gray-500">Check delivery options on product page</span>
					{/if}
				</div>
			{/if}
						</div>
					</button>
					<div class="p-4 pt-0">
						<button
							type="button"
							on:click={() => handleAddToCart(product)}
							disabled={loading || !product.stock || product.stock === 0}
							class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 rounded"
						>
							Add to Cart
						</button>
					</div>
				</article>
			{/each}
		</div>

	<!-- Pagination -->
	<Pagination {pagination} baseUrl="/catalog" preserveParams={true} />
	{/if}
</div>
