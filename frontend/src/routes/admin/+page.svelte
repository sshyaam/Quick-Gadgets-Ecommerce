<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user } from '$lib/stores';
	import { adminApi, apiRequest } from '$lib/api';
	import Pagination from '$lib/components/Pagination.svelte';
	
	let activeTab = 'products'; // 'products', 'stock', 'warehouses', or 'shipping-rules'
	let loading = false;
	let error = null;
	let message = null;
	
	// Products state
	let products = [];
	let pagination = { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false };
	let editingProduct = null;
	let showAddProductForm = false;
	
	// Stock state
	let stocks = [];
	let stockPagination = { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false };
	
	// Warehouses state
	let warehouses = [];
	
	// Shipping rules state
	let shippingRules = [];
	let shippingRuleFilters = {
		warehouseId: '',
		category: ''
	};
	
	// Product form state
	let productForm = {
		name: '',
		description: '',
		category: '',
		brand: '',
		sku: '',
		price: 0,
		stock: 0,
		rating: 0,
		reviews: 0,
		discountPercentage: 0,
		tags: [],
		images: [],
		customFields: {}
	};
	
	// Image upload
	let imageInput = null;
	let imagePreviews = [];
	
	// Custom fields editor
	let customFieldName = '';
	let customFieldValue = '';
	let customFields = [];
	
	// Stock editing (key: productId_warehouseId)
	let editingStock = {};
	
	onMount(async () => {
		// Check if user is admin
		if (!$user || !$user.isAdmin) {
			goto('/');
			return;
		}
		
		// Load data based on active tab
		if (activeTab === 'stock') {
			await loadStocks();
		} else if (activeTab === 'warehouses') {
			await loadWarehouses();
		} else if (activeTab === 'shipping-rules') {
			await loadShippingRules();
		} else {
			await loadProducts();
		}
		
	});
	
	// Reactive statement to reload data when page URL param changes
	$: if (typeof window !== 'undefined' && $page.url.searchParams.get('page')) {
		const pageNum = parseInt($page.url.searchParams.get('page') || '1', 10);
		if (activeTab === 'products' && pagination.page !== pageNum && !loading) {
			loadProducts(pageNum);
		} else if (activeTab === 'stock' && stockPagination.page !== pageNum && !loading) {
			loadStocks(pageNum);
		}
	}
	
	async function loadProducts(pageNum = null) {
		loading = true;
		error = null;
		try {
			const currentPage = pageNum || parseInt($page.url.searchParams.get('page') || '1', 10);
			pagination.page = currentPage;
			const data = await adminApi.getAllProducts(pagination.page, pagination.limit);
			products = data.products || [];
			pagination = {
				...data.pagination,
				hasNext: data.pagination?.page < data.pagination?.totalPages,
				hasPrev: data.pagination?.page > 1
			} || pagination;
		} catch (err) {
			console.error('Error loading products:', err);
			error = err.message || 'Failed to load products';
		} finally {
			loading = false;
		}
	}
	
	async function loadStocks(pageNum = null) {
		loading = true;
		error = null;
		try {
			const currentPage = pageNum || parseInt($page.url.searchParams.get('page') || '1', 10);
			stockPagination.page = currentPage;
			const data = await adminApi.getAllStocks(stockPagination.page, stockPagination.limit);
			stocks = data.stocks || [];
			stockPagination = {
				...data.pagination,
				hasNext: data.pagination?.page < data.pagination?.totalPages,
				hasPrev: data.pagination?.page > 1
			} || stockPagination;
		} catch (err) {
			console.error('Error loading stocks:', err);
			const errorMsg = err.message || 'Failed to load stocks';
			error = errorMsg;
			
			// Check if it's an authentication error
			if (errorMsg.includes('401') || errorMsg.includes('AUTHENTICATION_ERROR') || errorMsg.includes('Invalid or expired access token')) {
				error = 'Authentication failed. Please refresh the page and try again.';
			}
		} finally {
			loading = false;
		}
	}
	
	function startAddProduct() {
		productForm = {
			name: '',
			description: '',
			category: '',
			brand: '',
			sku: '',
			price: 0,
			stock: 0,
			rating: 0,
			reviews: 0,
			discountPercentage: 0,
			tags: [],
			images: [],
			customFields: {}
		};
		imagePreviews = [];
		customFields = [];
		showAddProductForm = true;
		editingProduct = null;
	}
	
	function startEditProduct(product) {
		editingProduct = product.productId;
		productForm = {
			name: product.name || '',
			description: product.description || '',
			category: product.category || '',
			brand: product.brand || '',
			sku: product.sku || '',
			price: 0, // Price comes from pricing worker
			stock: product.stock || 0,
			rating: product.rating || 0,
			reviews: product.reviews || 0,
			discountPercentage: product.discountPercentage || 0,
			tags: Array.isArray(product.tags) ? product.tags : [],
			images: Array.isArray(product.images) ? product.images : [],
			customFields: {}
		};
		
		// Extract custom fields (everything except standard fields)
		const standardFields = ['name', 'description', 'category', 'brand', 'sku', 'thumbnail', 'images', 'productImage', 'rating', 'reviews', 'discountPercentage', 'tags', 'stock', 'availabilityStatus', 'minimumOrderQuantity', 'specs'];
		customFields = [];
		for (const [key, value] of Object.entries(product)) {
			if (!standardFields.includes(key)) {
				customFields.push({ name: key, value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value) });
				productForm.customFields[key] = value;
			}
		}
		
		imagePreviews = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : []);
		console.log('[admin] Loading product for edit, images:', imagePreviews);
		showAddProductForm = true;
	}
	
	function cancelEdit() {
		showAddProductForm = false;
		editingProduct = null;
		productForm = {};
		imagePreviews = [];
		customFields = [];
	}
	
	async function handleImageSelect(event) {
		const files = Array.from(event.target.files || []);
		
		if (files.length === 0) return;
		
		loading = true;
		error = null;
		
		const uploadedImages = [];
		const errors = [];
		
		try {
			// Upload all images in parallel for better performance
			const uploadPromises = files.map(async (file) => {
				if (!file.type.startsWith('image/')) {
					errors.push(`${file.name}: Not an image file`);
					return null;
				}
				
				if (file.size > 5 * 1024 * 1024) { // 5MB limit
					errors.push(`${file.name}: Size must be less than 5MB`);
					return null;
				}
				
				try {
					// Upload to R2
					const result = await adminApi.uploadImage(file);
					if (result && result.success && result.imageUrl) {
						return result.imageUrl;
					} else {
						errors.push(`${file.name}: Upload failed - ${result?.message || 'Unknown error'}`);
						return null;
					}
				} catch (err) {
					console.error(`Error uploading ${file.name}:`, err);
					errors.push(`${file.name}: ${err.message || 'Upload failed'}`);
					return null;
				}
			});
			
			// Wait for all uploads to complete
			const results = await Promise.all(uploadPromises);
			
			// Filter out null results (failed uploads)
			const successfulImages = results.filter(url => url !== null);
			
			if (successfulImages.length > 0) {
				// Add all successfully uploaded images to previews
				console.log('[admin] Adding images to previews:', successfulImages);
				imagePreviews = [...imagePreviews, ...successfulImages];
				productForm.images = [...imagePreviews];
				console.log('[admin] imagePreviews after add:', imagePreviews);
				console.log('[admin] productForm.images after add:', productForm.images);
			}
			
			// Show errors if any
			if (errors.length > 0) {
				if (successfulImages.length > 0) {
					error = `Some images failed to upload: ${errors.join(', ')}`;
				} else {
					error = `Failed to upload images: ${errors.join(', ')}`;
				}
			}
		} catch (err) {
			console.error('Error uploading images:', err);
			error = err.message || 'Failed to upload images';
		} finally {
			loading = false;
			if (imageInput) {
				imageInput.value = '';
			}
		}
	}
	
	function removeImage(index) {
		imagePreviews = imagePreviews.filter((_, i) => i !== index);
		productForm.images = [...imagePreviews];
	}
	
	function addCustomField() {
		if (!customFieldName.trim()) return;
		
		// Parse value as JSON if possible, otherwise treat as string
		let parsedValue = customFieldValue;
		try {
			if (customFieldValue.trim().startsWith('{') || customFieldValue.trim().startsWith('[')) {
				parsedValue = JSON.parse(customFieldValue);
			}
		} catch (e) {
			// Not JSON, use as string
		}
		
		customFields.push({ name: customFieldName, value: customFieldValue });
		productForm.customFields[customFieldName] = parsedValue;
		
		customFieldName = '';
		customFieldValue = '';
	}
	
	function removeCustomField(index) {
		const field = customFields[index];
		delete productForm.customFields[field.name];
		customFields.splice(index, 1);
	}
	
	async function saveProduct() {
		if (!productForm.name || !productForm.description || !productForm.category) {
			error = 'Name, description, and category are required';
			return;
		}
		
		if (!editingProduct && (!productForm.price || productForm.price <= 0)) {
			error = 'Price is required when creating a new product';
			return;
		}
		
		loading = true;
		error = null;
		message = null;
		
		try {
			// Prepare tags
			let tagsArray = [];
			if (typeof productForm.tags === 'string') {
				tagsArray = productForm.tags.split(',').map(t => t.trim()).filter(t => t);
			} else if (Array.isArray(productForm.tags)) {
				tagsArray = productForm.tags;
			}
			
			const productData = {
				name: productForm.name,
				description: productForm.description,
				category: productForm.category,
				brand: productForm.brand || null,
				sku: productForm.sku || null,
				price: productForm.price || 0,
				stock: productForm.stock || 0,
				rating: productForm.rating || 0,
				reviews: productForm.reviews || 0,
				discountPercentage: productForm.discountPercentage || 0,
				tags: tagsArray,
				images: Array.isArray(productForm.images) ? productForm.images : (productForm.images ? [productForm.images] : []), // Always send images array, even if empty
				...productForm.customFields // Merge custom fields at root level
			};
			
			console.log('[admin] Saving product with images:', productData.images);
			
			if (editingProduct) {
				await adminApi.updateProduct(editingProduct, productData);
				message = 'Product updated successfully!';
			} else {
				const result = await adminApi.createProduct(productData);
				message = 'Product created successfully!';
				
				// Set price and stock separately
				if (productForm.price > 0) {
					try {
						await apiRequest(`https://pricing-worker.shyaamdps.workers.dev/product/${result.productId}`, {
							method: 'POST',
							headers: {
								'X-API-Key': 'ECOMSECRET',
								'X-Worker-Request': 'true',
								'Content-Type': 'application/json'
							},
							body: JSON.stringify({ price: productForm.price, currency: 'INR' })
						});
					} catch (err) {
						console.error('Failed to set price:', err);
						error = 'Product created but price setting failed. Please set price manually.';
					}
				}
				
				if (productForm.stock > 0) {
					try {
						await adminApi.updateStock(result.productId, productForm.stock);
					} catch (err) {
						console.error('Failed to set stock:', err);
						error = error || 'Product created but stock setting failed. Please set stock manually.';
					}
				}
			}
			
			setTimeout(() => message = null, 3000);
			await loadProducts();
			cancelEdit();
		} catch (err) {
			console.error('Error saving product:', err);
			error = err.message || 'Failed to save product';
		} finally {
			loading = false;
		}
	}
	
	async function deleteProduct(productId) {
		if (!confirm('Are you sure you want to delete this product?')) {
			return;
		}
		
		loading = true;
		error = null;
		try {
			await adminApi.deleteProduct(productId);
			message = 'Product deleted successfully!';
			setTimeout(() => message = null, 3000);
			await loadProducts();
		} catch (err) {
			console.error('Error deleting product:', err);
			error = err.message || 'Failed to delete product';
		} finally {
			loading = false;
		}
	}
	
	async function updateStock(productId, newQuantity, warehouseId = 'WH-MUM-001') {
		if (typeof newQuantity !== 'number' || newQuantity < 0) {
			error = 'Quantity must be a non-negative number';
			return;
		}
		
		// Get warehouse ID from stock item if available
		const stockItem = stocks.find(s => s.productId === productId);
		if (stockItem && stockItem.warehouseId) {
			warehouseId = stockItem.warehouseId;
		}
		
		loading = true;
		error = null;
		try {
			await adminApi.updateStock(productId, newQuantity, warehouseId);
			message = 'Stock updated successfully!';
			setTimeout(() => message = null, 3000);
			const stockKey = `${productId}_${warehouseId}`;
			delete editingStock[stockKey];
			editingStock = {...editingStock}; // Trigger reactivity
			await loadStocks();
		} catch (err) {
			console.error('Error updating stock:', err);
			error = err.message || 'Failed to update stock';
			
			// Check if it's an authentication error
			if (err.message && (err.message.includes('401') || err.message.includes('AUTHENTICATION_ERROR') || err.message.includes('Invalid or expired access token'))) {
				error = 'Authentication failed. Please refresh the page and try again.';
			}
		} finally {
			loading = false;
		}
	}
	
	async function loadWarehouses() {
		loading = true;
		error = null;
		try {
			const data = await adminApi.getAllWarehouses();
			warehouses = data.warehouses || [];
		} catch (err) {
			console.error('Error loading warehouses:', err);
			error = err.message || 'Failed to load warehouses';
		} finally {
			loading = false;
		}
	}
	
	async function loadShippingRules() {
		loading = true;
		error = null;
		try {
			const data = await adminApi.getAllShippingRules(
				shippingRuleFilters.warehouseId || null,
				shippingRuleFilters.category || null
			);
			shippingRules = data.rules || [];
		} catch (err) {
			console.error('Error loading shipping rules:', err);
			error = err.message || 'Failed to load shipping rules';
		} finally {
			loading = false;
		}
	}
	
	function switchTab(tab) {
		activeTab = tab;
		if (tab === 'stock') {
			loadStocks();
		} else if (tab === 'warehouses') {
			loadWarehouses();
		} else if (tab === 'shipping-rules') {
			loadShippingRules();
		} else {
			loadProducts();
		}
	}
</script>

<svelte:head>
	<title>Admin Panel - Quick Gadgets</title>
</svelte:head>

<div class="max-w-7xl mx-auto">
	<h1 class="text-3xl font-bold mb-6">Admin Panel</h1>

	{#if error}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			<p class="font-bold">Error</p>
			<p>{error}</p>
		</div>
	{/if}

	{#if message}
		<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
			<p class="font-bold">Success</p>
			<p>{message}</p>
		</div>
	{/if}

	<!-- Tabs -->
	<div class="border-b border-gray-200 mb-6">
		<div class="flex space-x-4 flex-wrap">
			<button
				on:click={() => switchTab('products')}
				class="px-4 py-2 font-medium {activeTab === 'products' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-900'}"
			>
				Products
			</button>
			<button
				on:click={() => switchTab('stock')}
				class="px-4 py-2 font-medium {activeTab === 'stock' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-900'}"
			>
				Stock Management
			</button>
			<button
				on:click={() => switchTab('warehouses')}
				class="px-4 py-2 font-medium {activeTab === 'warehouses' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-900'}"
			>
				Warehouses
			</button>
			<button
				on:click={() => switchTab('shipping-rules')}
				class="px-4 py-2 font-medium {activeTab === 'shipping-rules' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-900'}"
			>
				Shipping Rules
			</button>
		</div>
	</div>

	{#if activeTab === 'products'}
		<!-- Products Tab -->
		<div class="mb-4">
			<button
				on:click={startAddProduct}
				class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
			>
				+ Add New Product
			</button>
		</div>

		{#if showAddProductForm}
			<!-- Add/Edit Product Form -->
			<div class="bg-white rounded-lg shadow-lg p-6 mb-6">
				<h2 class="text-xl font-bold mb-4">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
				
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
						<input
							type="text"
							bind:value={productForm.name}
							class="w-full px-4 py-2 border rounded-lg"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Category *</label>
						<input
							type="text"
							bind:value={productForm.category}
							placeholder="e.g., smartphones, laptops, accessories"
							class="w-full px-4 py-2 border rounded-lg"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Brand</label>
						<input
							type="text"
							bind:value={productForm.brand}
							class="w-full px-4 py-2 border rounded-lg"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">SKU</label>
						<input
							type="text"
							bind:value={productForm.sku}
							class="w-full px-4 py-2 border rounded-lg"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Price (INR) *</label>
						<input
							type="number"
							step="0.01"
							min="0"
							bind:value={productForm.price}
							class="w-full px-4 py-2 border rounded-lg"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Initial Stock *</label>
						<input
							type="number"
							min="0"
							bind:value={productForm.stock}
							class="w-full px-4 py-2 border rounded-lg"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Rating</label>
						<input
							type="number"
							step="0.1"
							min="0"
							max="5"
							bind:value={productForm.rating}
							class="w-full px-4 py-2 border rounded-lg"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Reviews</label>
						<input
							type="number"
							min="0"
							bind:value={productForm.reviews}
							class="w-full px-4 py-2 border rounded-lg"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Discount %</label>
						<input
							type="number"
							min="0"
							max="100"
							bind:value={productForm.discountPercentage}
							class="w-full px-4 py-2 border rounded-lg"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
						<input
							type="text"
							bind:value={productForm.tags}
							placeholder="tag1, tag2, tag3"
							class="w-full px-4 py-2 border rounded-lg"
						/>
					</div>
				</div>
				
				<div class="mb-4">
					<label class="block text-sm font-medium text-gray-700 mb-1">Description *</label>
					<textarea
						bind:value={productForm.description}
						rows="4"
						class="w-full px-4 py-2 border rounded-lg"
						required
					></textarea>
				</div>

				<!-- Image Upload -->
				<div class="mb-4">
					<label class="block text-sm font-medium text-gray-700 mb-2">Product Images</label>
					<input
						type="file"
						accept="image/*"
						multiple
						bind:this={imageInput}
						on:change={handleImageSelect}
						class="text-sm text-gray-600 mb-2"
					/>
					<div class="flex flex-wrap gap-4 mt-2">
						{#if imagePreviews.length === 0}
							<p class="text-sm text-gray-500">No images uploaded yet. Select images above to upload.</p>
						{:else}
							{#each imagePreviews as image, index}
								<div class="relative">
									<img src={image} alt="Preview {index + 1}" class="w-24 h-24 object-cover rounded border" />
								<button
									on:click={async () => {
										// If it's an R2 URL, try to delete from R2
										if (image.startsWith('http') && image.includes('/images/products/')) {
											try {
												await adminApi.deleteImage(image);
											} catch (err) {
												console.error('Error deleting image from R2:', err);
												// Continue to remove from preview even if R2 delete fails
											}
										}
										removeImage(index);
									}}
									class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
								>
									×
								</button>
							</div>
							{/each}
						{/if}
					</div>
				</div>

				<!-- Custom Fields -->
				<div class="mb-4 p-4 bg-gray-50 rounded-lg">
					<h3 class="font-semibold mb-3">Custom Fields (Markdown/JSON supported)</h3>
					
					{#each customFields as field, index}
						<div class="mb-2 p-2 bg-white rounded border">
							<div class="flex justify-between items-start mb-1">
								<span class="font-medium">{field.name}</span>
								<button
									on:click={() => removeCustomField(index)}
									class="text-red-600 hover:text-red-800 text-sm"
								>
									Remove
								</button>
							</div>
							<pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">{field.value}</pre>
						</div>
					{/each}
					
					<div class="mt-3">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
							<input
								type="text"
								bind:value={customFieldName}
								placeholder="Field name"
								class="px-3 py-2 border rounded text-sm"
							/>
							<button
								on:click={addCustomField}
								class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm"
							>
								Add Field
							</button>
						</div>
						<textarea
							bind:value={customFieldValue}
							placeholder="Field value (supports Markdown/JSON formatting)"
							rows="4"
							class="w-full px-3 py-2 border rounded text-sm font-mono"
						></textarea>
						<p class="text-xs text-gray-500 mt-1">Supports Markdown formatting and JSON objects/arrays</p>
					</div>
				</div>

				<div class="flex gap-2">
					<button
						on:click={saveProduct}
						disabled={loading}
						class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
					>
						{loading ? 'Saving...' : (editingProduct ? 'Update Product' : 'Create Product')}
					</button>
					<button
						on:click={cancelEdit}
						class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<!-- Products List -->
		{#if loading && products.length === 0}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
				<p class="text-gray-600 mt-4">Loading products...</p>
			</div>
		{:else if products.length === 0}
			<div class="text-center py-12">
				<p class="text-gray-600">No products found.</p>
			</div>
		{:else}
			<div class="bg-white rounded-lg shadow-lg overflow-hidden">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each products as product}
							<tr>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if product.productImage || product.images?.[0]}
											<img src={product.productImage || product.images[0]} alt={product.name} class="w-12 h-12 object-cover rounded mr-3" />
										{/if}
										<div>
											<div class="text-sm font-medium text-gray-900">{product.name}</div>
											<div class="text-sm text-gray-500">{product.brand || 'No brand'}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.category}</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.stock || 0}</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if product.deletedAt}
										<span class="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Deleted</span>
									{:else}
										<span class="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Active</span>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
									<div class="flex gap-2">
										<button
											on:click={() => startEditProduct(product)}
											class="text-blue-600 hover:text-blue-900"
										>
											Edit
										</button>
										{#if product.deletedAt}
											<button
												on:click={async () => { await adminApi.restoreProduct(product.productId); await loadProducts(); }}
												class="text-green-600 hover:text-green-900"
											>
												Restore
											</button>
										{:else}
											<button
												on:click={() => deleteProduct(product.productId)}
												class="text-red-600 hover:text-red-900"
											>
												Delete
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			
			<!-- Pagination -->
			<Pagination {pagination} baseUrl="/admin" preserveParams={false} />
		{/if}
	{:else if activeTab === 'stock'}
		<!-- Stock Management Tab -->
		{#if loading && stocks.length === 0}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
				<p class="text-gray-600 mt-4">Loading stocks...</p>
			</div>
		{:else if stocks.length === 0}
			<div class="text-center py-12">
				<p class="text-gray-600">No stock entries found.</p>
			</div>
		{:else}
			<div class="bg-white rounded-lg shadow-lg overflow-hidden">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product ID</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reserved</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each stocks as stock}
							{@const stockKey = `${stock.productId}_${stock.warehouseId}`}
							<tr>
								<td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900" title={stock.productId}>{stock.productId.substring(0, 20)}...</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" title={stock.warehouseId}>{stock.warehouseId}</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{#if editingStock[stockKey] !== undefined}
										<input
											type="number"
											min="0"
											bind:value={editingStock[stockKey]}
											class="w-24 px-2 py-1 border rounded text-sm"
										/>
									{:else}
										{stock.quantity}
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stock.reservedQuantity}</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stock.available}</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
									{#if editingStock[stockKey] !== undefined}
										<div class="flex gap-2">
											<button
												on:click={() => updateStock(stock.productId, editingStock[stockKey], stock.warehouseId)}
												class="text-green-600 hover:text-green-900"
											>
												Save
											</button>
											<button
												on:click={() => { editingStock = {...editingStock}; delete editingStock[stockKey]; }}
												class="text-gray-600 hover:text-gray-900"
											>
												Cancel
											</button>
										</div>
									{:else}
										<button
											on:click={() => { editingStock = {...editingStock, [stockKey]: stock.quantity}; }}
											class="text-blue-600 hover:text-blue-900"
										>
											Edit
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			
			<!-- Pagination -->
			<Pagination pagination={stockPagination} baseUrl="/admin" preserveParams={true} pageParam="page" />
		{/if}
	{:else if activeTab === 'warehouses'}
		<!-- Warehouses Tab -->
		{#if loading && warehouses.length === 0}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
				<p class="text-gray-600 mt-4">Loading warehouses...</p>
			</div>
		{:else if warehouses.length === 0}
			<div class="text-center py-12">
				<p class="text-gray-600">No warehouses found.</p>
			</div>
		{:else}
			<div class="bg-white rounded-lg shadow-lg overflow-hidden">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse ID</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pincode</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each warehouses as warehouse}
							<tr>
								<td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{warehouse.warehouseId}</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{warehouse.name}</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{warehouse.city}, {warehouse.state}</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{warehouse.pincode}</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if warehouse.isActive}
										<span class="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Active</span>
									{:else}
										<span class="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Inactive</span>
									{/if}
								</td>
								<td class="px-6 py-4 text-sm text-gray-500">{warehouse.address || 'N/A'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else if activeTab === 'shipping-rules'}
		<!-- Shipping Rules Tab -->
		<div class="mb-4">
			<div class="bg-gray-50 rounded-lg p-4 mb-4">
				<h3 class="font-semibold mb-3">Filters</h3>
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Warehouse ID</label>
						<input
							type="text"
							bind:value={shippingRuleFilters.warehouseId}
							placeholder="e.g., WH-MUM-001"
							class="w-full px-3 py-2 border rounded-lg text-sm"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
						<input
							type="text"
							bind:value={shippingRuleFilters.category}
							placeholder="e.g., smartphones, laptops"
							class="w-full px-3 py-2 border rounded-lg text-sm"
						/>
					</div>
					<div class="flex items-end gap-2">
						<button
							on:click={loadShippingRules}
							class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
						>
							Apply Filters
						</button>
						<button
							on:click={() => { shippingRuleFilters.warehouseId = ''; shippingRuleFilters.category = ''; loadShippingRules(); }}
							class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm"
						>
							Clear
						</button>
					</div>
				</div>
			</div>
		</div>

		{#if loading && shippingRules.length === 0}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
				<p class="text-gray-600 mt-4">Loading shipping rules...</p>
			</div>
		{:else if shippingRules.length === 0}
			<div class="text-center py-12">
				<p class="text-gray-600">No shipping rules found.</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each shippingRules as rule}
					<div class="bg-white rounded-lg shadow-lg p-6">
						<div class="flex justify-between items-start mb-4">
							<div>
								<h3 class="text-lg font-semibold text-gray-900">Warehouse: {rule.warehouseId}</h3>
								<p class="text-sm text-gray-600">Category: {rule.category}</p>
							</div>
							<div class="text-xs text-gray-500">
								Updated: {new Date(rule.updatedAt).toLocaleDateString('en-GB')}
							</div>
						</div>
						
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							{#if rule.rules.standard}
								<div class="border rounded-lg p-4 bg-blue-50">
									<h4 class="font-semibold text-blue-900 mb-2">Standard Shipping</h4>
									<div class="text-sm space-y-1">
										<p><span class="font-medium">Available:</span> {rule.rules.standard.available ? 'Yes' : 'No'}</p>
										{#if rule.rules.standard.baseCost !== undefined}
											<p><span class="font-medium">Base Cost:</span> ₹{rule.rules.standard.baseCost}</p>
										{/if}
										{#if rule.rules.standard.costPerUnit !== undefined}
											<p><span class="font-medium">Cost Per Unit:</span> ₹{rule.rules.standard.costPerUnit}</p>
										{/if}
										{#if rule.rules.standard.estimatedDays !== undefined}
											<p><span class="font-medium">Estimated Days:</span> {rule.rules.standard.estimatedDays}</p>
										{/if}
										{#if rule.rules.standard.minCost !== undefined}
											<p><span class="font-medium">Min Cost:</span> ₹{rule.rules.standard.minCost}</p>
										{/if}
										{#if rule.rules.standard.maxCost !== undefined}
											<p><span class="font-medium">Max Cost:</span> ₹{rule.rules.standard.maxCost}</p>
										{/if}
										{#if rule.rules.standard.zoneMultiplier}
											<p><span class="font-medium">Zone Multipliers:</span></p>
											<ul class="list-disc list-inside ml-2 text-xs">
												{#if rule.rules.standard.zoneMultiplier[1] !== undefined}
													<li>Zone 1: {rule.rules.standard.zoneMultiplier[1]}x</li>
												{/if}
												{#if rule.rules.standard.zoneMultiplier[2] !== undefined}
													<li>Zone 2: {rule.rules.standard.zoneMultiplier[2]}x</li>
												{/if}
												{#if rule.rules.standard.zoneMultiplier[3] !== undefined}
													<li>Zone 3: {rule.rules.standard.zoneMultiplier[3]}x</li>
												{/if}
											</ul>
										{/if}
									</div>
								</div>
							{/if}
							
							{#if rule.rules.express}
								<div class="border rounded-lg p-4 bg-green-50">
									<h4 class="font-semibold text-green-900 mb-2">Express Shipping</h4>
									<div class="text-sm space-y-1">
										<p><span class="font-medium">Available:</span> {rule.rules.express.available ? 'Yes' : 'No'}</p>
										{#if rule.rules.express.baseCost !== undefined}
											<p><span class="font-medium">Base Cost:</span> ₹{rule.rules.express.baseCost}</p>
										{/if}
										{#if rule.rules.express.costPerUnit !== undefined}
											<p><span class="font-medium">Cost Per Unit:</span> ₹{rule.rules.express.costPerUnit}</p>
										{/if}
										{#if rule.rules.express.estimatedDays !== undefined}
											<p><span class="font-medium">Estimated Days:</span> {rule.rules.express.estimatedDays}</p>
										{/if}
										{#if rule.rules.express.minCost !== undefined}
											<p><span class="font-medium">Min Cost:</span> ₹{rule.rules.express.minCost}</p>
										{/if}
										{#if rule.rules.express.maxCost !== undefined}
											<p><span class="font-medium">Max Cost:</span> ₹{rule.rules.express.maxCost}</p>
										{/if}
										{#if rule.rules.express.zoneMultiplier}
											<p><span class="font-medium">Zone Multipliers:</span></p>
											<ul class="list-disc list-inside ml-2 text-xs">
												{#if rule.rules.express.zoneMultiplier[1] !== undefined}
													<li>Zone 1: {rule.rules.express.zoneMultiplier[1]}x</li>
												{/if}
												{#if rule.rules.express.zoneMultiplier[2] !== undefined}
													<li>Zone 2: {rule.rules.express.zoneMultiplier[2]}x</li>
												{/if}
												{#if rule.rules.express.zoneMultiplier[3] !== undefined}
													<li>Zone 3: {rule.rules.express.zoneMultiplier[3]}x</li>
												{/if}
											</ul>
										{/if}
									</div>
								</div>
							{/if}
						</div>
						
						{#if !rule.rules.standard && !rule.rules.express}
							<p class="text-sm text-gray-500 mt-2">No shipping rules configured for this combination.</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

