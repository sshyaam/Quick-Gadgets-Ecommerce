<script>
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores';
	import { cartApi, ratingApi, fulfillmentApi } from '$lib/api';
	import { onMount } from 'svelte';

	export let data;

	let product = data.product;
	let quantity = 1;
	let loading = false;
	let ratings = [];
	let showRatings = false;
	let errorMessage = '';
	let successMessage = '';
	
	// Shipping options
	let pincode = '';
	let shippingOptions = null;
	let loadingShipping = false;
	
	// Image carousel state
	let currentImageIndex = 0;
	let productImages = [];
	
	// Extract all images from product data
	function extractImages(productData) {
		const images = [];
		
		// Helper function to recursively search for image fields
		function findImages(obj, path = '') {
			if (!obj || typeof obj !== 'object') return;
			
			// Check common image field names
			const imageFields = ['image', 'imageUrl', 'image_url', 'images', 'photo', 'photoUrl', 'thumbnail', 'thumbnailUrl'];
			
			for (const [key, value] of Object.entries(obj)) {
				if (imageFields.includes(key.toLowerCase())) {
					if (Array.isArray(value)) {
						value.forEach(img => {
							if (typeof img === 'string' && img.trim()) {
								images.push(img.trim());
							} else if (typeof img === 'object' && img.url) {
								images.push(img.url);
							}
						});
					} else if (typeof value === 'string' && value.trim()) {
						images.push(value.trim());
					} else if (typeof value === 'object' && value.url) {
						images.push(value.url);
					}
				} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
					// Recursively search nested objects
					findImages(value, path ? `${path}.${key}` : key);
				}
			}
		}
		
		findImages(productData);
		
		// Remove duplicates
		return [...new Set(images)];
	}
	
	// Get all product fields excluding system fields
	function getProductFields(product) {
		if (!product) return {};
		
		const systemFields = ['productId', 'price', 'stock', 'createdAt', 'updatedAt', 'name', 'description', 'category'];
		const fields = {};
		
		for (const [key, value] of Object.entries(product)) {
			if (!systemFields.includes(key)) {
				fields[key] = value;
			}
		}
		
		return fields;
	}
	
	// Format field name for display
	function formatFieldName(key) {
		return key
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, str => str.toUpperCase())
			.trim();
	}
	
	// Check if value should be displayed
	function shouldDisplay(value) {
		if (value === null || value === undefined) return false;
		if (typeof value === 'string' && value.trim() === '') return false;
		return true;
	}
	
	// Render value based on type
	function renderValue(value, depth = 0) {
		if (depth > 3) return '...'; // Prevent infinite nesting
		
		if (value === null || value === undefined) return 'N/A';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'number') return value;
		if (typeof value === 'string') return value;
		
		if (Array.isArray(value)) {
			if (value.length === 0) return 'None';
			return value.map((item, index) => {
				if (typeof item === 'object') {
					return renderValue(item, depth + 1);
				}
				return String(item);
			}).join(', ');
		}
		
		if (typeof value === 'object') {
			return Object.entries(value)
				.filter(([k, v]) => shouldDisplay(v))
				.map(([k, v]) => `${formatFieldName(k)}: ${renderValue(v, depth + 1)}`)
				.join(', ');
		}
		
		return String(value);
	}
	
	onMount(() => {
		if (product) {
			productImages = extractImages(product);
			if (productImages.length === 0) {
				// Try to get single image fields
				const singleImage = product.image || product.imageUrl || product.image_url;
				if (singleImage) {
					productImages = [singleImage];
				}
			}
		}
		
		// Load pincode from localStorage
		if (typeof window !== 'undefined') {
			pincode = localStorage.getItem('shippingPincode') || '';
			
			// Load shipping options if pincode exists
			if (pincode && product?.productId && product?.category) {
				loadShippingOptions();
			}
		}
	});
	
	async function loadShippingOptions() {
		if (!pincode || pincode.length !== 6 || !product?.productId || !product?.category) return;
		
		loadingShipping = true;
		try {
			const options = await fulfillmentApi.getShippingOptions(
				product.productId,
				product.category,
				pincode,
				'', // city - not needed
				''  // state - not needed
			);
			shippingOptions = options;
		} catch (error) {
			console.error('Error loading shipping options:', error);
			errorMessage = 'Failed to load shipping options';
			setTimeout(() => errorMessage = '', 5000);
		} finally {
			loadingShipping = false;
		}
	}
	
	async function updateShippingPincode() {
		if (!pincode || pincode.length !== 6) {
			errorMessage = 'Please enter a valid 6-digit pincode';
			setTimeout(() => errorMessage = '', 5000);
			return;
		}
		
		// Save to localStorage
		if (typeof window !== 'undefined') {
			localStorage.setItem('shippingPincode', pincode);
		}
		
		// Load shipping options
		await loadShippingOptions();
		successMessage = 'Delivery estimates updated!';
		setTimeout(() => successMessage = '', 3000);
	}
	
	function nextImage() {
		if (productImages.length > 0) {
			currentImageIndex = (currentImageIndex + 1) % productImages.length;
		}
	}
	
	function prevImage() {
		if (productImages.length > 0) {
			currentImageIndex = (currentImageIndex - 1 + productImages.length) % productImages.length;
		}
	}
	
	function goToImage(index) {
		currentImageIndex = index;
	}

	async function loadRatings() {
		if (!product?.productId) return;
		try {
			const result = await ratingApi.getRatings(product.productId);
			// Rating API returns {ratings: [], average: 0, total: 0, pagination: {}}
			ratings = result.ratings || [];
			showRatings = true;
		} catch (error) {
			console.error('Error loading ratings:', error);
			errorMessage = `Error loading ratings: ${error.message}`;
			setTimeout(() => errorMessage = '', 5000);
		}
	}

	async function handleAddToCart() {
		if (!product.price || !product.stock) {
			errorMessage = 'Product price or stock information unavailable';
			setTimeout(() => errorMessage = '', 5000);
			return;
		}

		if (quantity < 1 || quantity > product.stock) {
			errorMessage = `Quantity must be between 1 and ${product.stock}`;
			setTimeout(() => errorMessage = '', 5000);
			return;
		}

		loading = true;
		errorMessage = '';
		successMessage = '';
		try {
			const updatedCart = await cartApi.addItem(
				product.productId,
				quantity
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
</script>

<svelte:head>
	<title>{product?.name || 'Product'} - Quick Gadgets</title>
</svelte:head>

{#if !product}
	<div class="text-center py-12">
		<p class="text-gray-600 text-lg">Product not found.</p>
		<button
			on:click={() => goto('/catalog')}
			class="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
		>
			Back to Catalog
		</button>
	</div>
{:else}
	<div class="max-w-6xl mx-auto">
		<button
			on:click={() => goto('/catalog')}
			class="mb-4 text-blue-600 hover:text-blue-800"
		>
			← Back to Catalog
		</button>

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

		<div class="bg-white rounded-lg shadow-lg p-8">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
				<!-- Product Image Carousel -->
				<div class="relative">
					{#if productImages.length > 0}
						<!-- Main Image -->
						<div class="relative h-96 bg-gray-100 rounded-lg overflow-hidden mb-4">
							<img 
								src={productImages[currentImageIndex]} 
								alt={product.name || 'Product'} 
								class="w-full h-full object-contain"
								on:error={(e) => { 
									e.target.style.display = 'none';
									e.target.nextElementSibling.style.display = 'flex';
								}}
							/>
							<div class="hidden absolute inset-0 bg-gray-200 rounded-lg flex items-center justify-center">
								<span class="text-gray-400">Image not available</span>
							</div>
							
							<!-- Navigation Arrows (only if multiple images) -->
							{#if productImages.length > 1}
								<button
									on:click={prevImage}
									class="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-2 rounded-full"
									aria-label="Previous image"
								>
									←
								</button>
								<button
									on:click={nextImage}
									class="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-2 rounded-full"
									aria-label="Next image"
								>
									→
								</button>
								
								<!-- Image Counter -->
								<div class="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
									{currentImageIndex + 1} / {productImages.length}
								</div>
							{/if}
						</div>
						
						<!-- Thumbnail Navigation (if multiple images) -->
						{#if productImages.length > 1}
							<div class="flex space-x-2 overflow-x-auto pb-2">
								{#each productImages as image, index}
									<button
										on:click={() => goToImage(index)}
										class="flex-shrink-0 w-20 h-20 rounded border-2 {currentImageIndex === index ? 'border-blue-500' : 'border-gray-300'} overflow-hidden hover:border-blue-400 transition-colors"
									>
										<img 
											src={image} 
											alt={`Thumbnail ${index + 1}`}
											class="w-full h-full object-cover"
											on:error={(e) => { e.target.style.display = 'none'; }}
										/>
									</button>
								{/each}
							</div>
						{/if}
					{:else}
						<!-- No Images -->
						<div class="h-96 bg-gray-200 rounded-lg flex items-center justify-center">
							<span class="text-gray-400">No Image Available</span>
						</div>
					{/if}
				</div>

				<!-- Product Details -->
				<div>
					<h1 class="text-3xl font-bold mb-4">{product.name || 'Product'}</h1>
					<p class="text-gray-600 mb-6">{product.description || 'No description available'}</p>
					
					<div class="mb-6">
						<span class="text-4xl font-bold text-blue-600">
							₹{product.price?.toFixed(2) || 'N/A'}
						</span>
						<div class="mt-2">
							<span class="text-sm text-gray-500">
								Stock: {product.stock || 0} available
							</span>
						</div>
					</div>
					
					<!-- Shipping Options -->
					<div class="mb-6 p-4 bg-gray-50 rounded-lg">
						<h3 class="font-semibold mb-3">Delivery Information</h3>
						{#if !pincode || pincode.length !== 6 || !shippingOptions}
							<div class="mb-3">
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
										class="flex-1 px-3 py-2 border rounded"
										on:keydown={(e) => {
											if (e.key === 'Enter' && pincode.length === 6) {
												updateShippingPincode();
											}
										}}
										on:input={() => {
											// Clear shipping options when pincode changes
											if (shippingOptions) {
												shippingOptions = null;
											}
										}}
									/>
									<button
										on:click={updateShippingPincode}
										disabled={!pincode || pincode.length !== 6}
										class="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded"
									>
										Check
									</button>
								</div>
							</div>
						{:else}
							<div class="mb-3">
								<div class="flex items-center justify-between mb-2">
									<span class="text-sm text-gray-600">Pincode: {pincode}</span>
									<button
										on:click={() => { 
											pincode = ''; 
											shippingOptions = null; 
										}}
										class="text-xs text-blue-600 hover:text-blue-800"
									>
										Change
									</button>
								</div>
								{#if loadingShipping}
									<div class="text-sm text-gray-500">Loading delivery estimates...</div>
								{:else if shippingOptions}
									<div class="space-y-2">
										{#if shippingOptions.standard && shippingOptions.standard.available}
											<div class="flex justify-between items-center p-2 bg-white rounded">
												<div>
													<span class="font-medium text-sm">Standard Delivery</span>
													<div class="text-xs text-gray-600">
														{shippingOptions.standard.estimatedDaysRange || `${shippingOptions.standard.estimatedDays} days`}
													</div>
												</div>
												<span class="font-semibold">₹{shippingOptions.standard.cost?.toFixed(2) || 'N/A'}</span>
											</div>
										{/if}
										{#if shippingOptions.express && shippingOptions.express.available}
											<div class="flex justify-between items-center p-2 bg-white rounded">
												<div>
													<span class="font-medium text-sm">Express Delivery</span>
													<div class="text-xs text-gray-600">
														{shippingOptions.express.estimatedDaysRange || `${shippingOptions.express.estimatedDays} days`}
													</div>
												</div>
												<span class="font-semibold">₹{shippingOptions.express.cost?.toFixed(2) || 'N/A'}</span>
											</div>
										{/if}
										{#if (!shippingOptions.standard?.available && !shippingOptions.express?.available)}
											<div class="text-sm text-yellow-600">
												{shippingOptions.standard?.message || shippingOptions.express?.message || 'Using default shipping rates. Delivery time may vary.'}
											</div>
										{/if}
									</div>
								{:else if shippingOptions === null}
									<div class="text-sm text-gray-500">Enter pincode to see delivery estimates</div>
								{/if}
							</div>
						{/if}
					</div>

					<div class="flex items-center space-x-4 mb-6">
						<label class="font-semibold">Quantity:</label>
						<input
							type="number"
							bind:value={quantity}
							min="1"
							max={product.stock || 1}
							class="w-20 px-3 py-2 border rounded"
						/>
					</div>

					<button
						on:click={handleAddToCart}
						disabled={loading || !product.stock || product.stock === 0}
						class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-3 rounded-lg text-lg font-semibold"
					>
						{loading ? 'Adding...' : 'Add to Cart'}
					</button>

					<button
						on:click={loadRatings}
						class="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded"
					>
						View Ratings
					</button>
				</div>
			</div>
			
			<!-- All Product Fields Section -->
			<div class="mt-8 border-t pt-8">
				<h2 class="text-2xl font-bold mb-6">Product Details</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					{#each Object.entries(getProductFields(product)) as [key, value]}
						{#if shouldDisplay(value)}
							<div class="border-b pb-4">
								<h3 class="font-semibold text-gray-700 mb-2">{formatFieldName(key)}</h3>
								<div class="text-gray-600 text-sm">
									{#if typeof value === 'object' && !Array.isArray(value) && value !== null}
										<!-- Nested Object -->
										<div class="ml-4 space-y-2">
											{#each Object.entries(value) as [nestedKey, nestedValue]}
												{#if shouldDisplay(nestedValue)}
													<div>
														<span class="font-medium">{formatFieldName(nestedKey)}:</span>
														<span class="ml-2">{renderValue(nestedValue, 1)}</span>
													</div>
												{/if}
											{/each}
										</div>
									{:else if Array.isArray(value) && value.length > 0}
										<!-- Array -->
										<ul class="list-disc list-inside ml-4">
											{#each value as item}
												<li>
													{#if typeof item === 'object' && item !== null}
														{renderValue(item, 1)}
													{:else}
														{String(item)}
													{/if}
												</li>
											{/each}
										</ul>
									{:else}
										<!-- Simple Value -->
										{renderValue(value)}
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Ratings Section -->
			{#if showRatings}
				<div class="mt-8 border-t pt-8">
					<h2 class="text-2xl font-bold mb-4">Product Ratings</h2>
					{#if ratings.length === 0}
						<p class="text-gray-600">No ratings yet. Be the first to rate this product!</p>
					{:else}
						<div class="space-y-4">
							{#each ratings as rating}
								<div class="border-b pb-4">
									<div class="flex items-start justify-between mb-2">
										<div class="flex-1">
											<div class="flex items-center gap-2 mb-1">
												<span class="font-semibold text-gray-800">
													{rating.userName || 'Anonymous'}
												</span>
												<span class="text-yellow-500 text-sm">
													{'★'.repeat(rating.rating)}{'☆'.repeat(5 - rating.rating)} {rating.rating}/5
												</span>
											</div>
											<span class="text-gray-500 text-xs">
												{new Date(rating.created_at || rating.createdAt).toLocaleDateString()}
											</span>
										</div>
									</div>
									{#if rating.title}
										<p class="font-semibold text-gray-800 mt-2 mb-1">{rating.title}</p>
									{/if}
									{#if rating.comment}
										<p class="text-gray-700 mt-1">{rating.comment}</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
