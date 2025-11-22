<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { ordersApi, ratingApi } from '$lib/api';
	import { redirectToLogin } from '$lib/auth.js';

	export let data;

	let order = data.order;
	let loading = false;
	let error = null;
	let requiresAuth = data.requiresAuth || false;
	
	// Rating state
	let existingRatings = {}; // Map of productId -> rating
	let ratingForms = {}; // Map of productId -> { rating: 0, title: '', comment: '' }
	let submittingRating = {}; // Map of productId -> boolean
	let loadingRatings = false;

	// Load order on client-side if not loaded server-side (for localStorage auth)
	onMount(async () => {
		// Check if we have a token in localStorage
		const accessToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
		
		// If server-side didn't load order (clientSideAuth flag) or we have a token but no order
		if ((data.clientSideAuth || (accessToken && !order)) && !data.requiresAuth && !data.notFound) {
			if (accessToken) {
				try {
					loading = true;
					// Get orderId from URL params or data
					const orderId = data.orderId || $page.params.orderId || window.location.pathname.split('/').pop();
					const loadedOrder = await ordersApi.getOrder(orderId);
					
					// Transform order to match frontend expectations
					order = {
						orderId: loadedOrder.orderId,
						status: loadedOrder.status,
						totalAmount: loadedOrder.totalAmount,
						createdAt: loadedOrder.createdAt,
						updatedAt: loadedOrder.updatedAt,
						items: loadedOrder.productData?.items || [],
						shippingInfo: loadedOrder.shippingData ? {
							mode: loadedOrder.shippingData.mode || 'standard',
							cost: loadedOrder.shippingData.cost || 0,
							estimatedDelivery: loadedOrder.shippingData.estimatedDelivery || 5,
						} : null,
						addressData: loadedOrder.addressData,
						userData: loadedOrder.userData,
						productData: loadedOrder.productData,
						shippingData: loadedOrder.shippingData,
					};
					
					// Calculate delivery date only for confirmed orders (processing, completed)
					// Don't show delivery dates for pending, failed, or cancelled orders
					if (order.shippingInfo && order.createdAt && 
					    (order.status === 'processing' || order.status === 'completed')) {
						const deliveryDate = new Date(order.createdAt);
						deliveryDate.setDate(deliveryDate.getDate() + (order.shippingInfo.estimatedDelivery || 5));
						order.deliveryDate = deliveryDate.toISOString().split('T')[0];
					}
					requiresAuth = false;
				} catch (err) {
					console.error('Error loading order:', err);
					error = err.message || 'Failed to load order';
					if (err.message.includes('401') || err.message.includes('Unauthorized')) {
						requiresAuth = true;
						// Clear tokens
						if (typeof window !== 'undefined') {
							localStorage.removeItem('accessToken');
							localStorage.removeItem('refreshToken');
							localStorage.removeItem('sessionId');
						}
						// Don't redirect immediately, let user see the login prompt
					}
				} finally {
					loading = false;
				}
			} else if (!accessToken && !order) {
				// No token and no order - definitely requires auth
				requiresAuth = true;
			}
		} else if (!accessToken && !order && !data.clientSideAuth) {
			// No token, no order, and server didn't indicate client-side auth check
			requiresAuth = data.requiresAuth || false;
		}
		
		// Load existing ratings if order is loaded and completed (only once, at the end)
		if (order && order.status === 'completed' && order.orderId) {
			await loadExistingRatings(order.orderId);
		}
	});
	
	// Load existing ratings for this order
	async function loadExistingRatings(orderId) {
		if (!orderId) return;
		
		loadingRatings = true;
		try {
			const result = await ratingApi.getOrderRatings(orderId);
			existingRatings = result.ratings || {};
		} catch (err) {
			console.error('Error loading ratings:', err);
			// Don't show error - ratings are optional
		} finally {
			loadingRatings = false;
		}
	}
	
	// Initialize rating form for a product
	function initRatingForm(productId) {
		const existing = existingRatings[productId];
		if (existing) {
			ratingForms[productId] = {
				rating: existing.rating,
				title: existing.title || '',
				comment: existing.comment || ''
			};
		} else {
			ratingForms[productId] = {
				rating: 0,
				title: '',
				comment: ''
			};
		}
		// Force reactivity
		ratingForms = {...ratingForms};
	}
	
	// Submit rating for a product
	async function submitRating(productId) {
		if (!order || order.status !== 'completed') {
			error = 'Can only rate products from completed orders';
			setTimeout(() => error = null, 5000);
			return;
		}
		
		const form = ratingForms[productId];
		if (!form || !form.rating || form.rating < 1 || form.rating > 5) {
			error = 'Please select a rating (1-5 stars)';
			setTimeout(() => error = null, 5000);
			return;
		}
		
		submittingRating[productId] = true;
		error = null;
		
		try {
			const result = await ratingApi.submitRating(
				order.orderId,
				productId,
				form.rating,
				form.title.trim() || null,
				form.comment.trim() || null
			);
			
			// Update existing ratings
			existingRatings[productId] = {
				ratingId: result.ratingId,
				rating: form.rating,
				title: form.title.trim() || null,
				comment: form.comment.trim() || null,
			};
			// Force reactivity
			existingRatings = {...existingRatings};
			
			// Clear form
			delete ratingForms[productId];
			ratingForms = {...ratingForms};
		} catch (err) {
			console.error('Error submitting rating:', err);
			error = err.message || 'Failed to submit rating';
			setTimeout(() => error = null, 5000);
		} finally {
			submittingRating[productId] = false;
			submittingRating = {...submittingRating};
		}
	}
	
	// Format date to dd/mm/yyyy
	function formatDate(dateString) {
		if (!dateString) return '';
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return dateString;
		
		const day = String(date.getDate()).padStart(2, '0');
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const year = date.getFullYear();
		
		return `${day}/${month}/${year}`;
	}
	
	// Calculate delivery date for an item
	// Only show delivery dates for confirmed orders (processing, completed)
	// Don't show for pending, failed, or cancelled orders
	function getItemDeliveryDate(item, orderCreatedAt, orderStatus) {
		// Only show delivery dates for confirmed orders
		if (orderStatus !== 'processing' && orderStatus !== 'completed') {
			return null;
		}
		
		if (item.shipping?.deliveryDate) {
			return item.shipping.deliveryDate;
		}
		if (item.shipping?.estimatedDays) {
			const createdAt = new Date(orderCreatedAt);
			const deliveryDate = new Date(createdAt);
			deliveryDate.setDate(deliveryDate.getDate() + item.shipping.estimatedDays);
			return deliveryDate.toISOString().split('T')[0];
		}
		return null;
	}
</script>

<svelte:head>
	<title>Order Details - Quick Gadgets</title>
</svelte:head>

<div class="max-w-4xl mx-auto">
	{#if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			<p class="text-gray-600 mt-4">Loading order details...</p>
		</div>
	{:else if requiresAuth}
		<div class="text-center py-12">
			<p class="text-gray-600 text-lg mb-4">Please log in to view order details.</p>
			<button
				on:click={() => redirectToLogin()}
				class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
			>
				Login
			</button>
		</div>
	{:else if data.notFound}
		<div class="text-center py-12">
			<p class="text-gray-600 text-lg mb-4">Order not found.</p>
			<button
				on:click={() => goto('/orders')}
				class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
			>
				Back to Orders
			</button>
		</div>
	{:else if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			<p class="text-gray-600 mt-4">Loading order details...</p>
		</div>
	{:else if error}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			<p class="font-bold">Error</p>
			<p>{error}</p>
		</div>
	{:else if order}
		<div class="mb-6">
			<button
				on:click={() => goto('/orders')}
				class="text-blue-600 hover:text-blue-800 mb-4"
			>
				← Back to Orders
			</button>
			<h1 class="text-3xl font-bold mb-6">Order #{order.orderId}</h1>
		</div>

		<div class="bg-white rounded-lg shadow-md p-6 mb-6">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
				<div>
					<h3 class="font-semibold text-gray-700 mb-2">Order Information</h3>
					<p class="text-sm text-gray-600">
						<strong>Order ID:</strong> {order.orderId}
					</p>
					<p class="text-sm text-gray-600">
						<strong>Status:</strong> <span class="font-semibold capitalize">{order.status}</span>
					</p>
					<p class="text-sm text-gray-600">
						<strong>Placed on:</strong> {formatDate(order.createdAt)}
					</p>
					{#if order.deliveryDate && order.status !== 'failed' && order.status !== 'cancelled' && order.status !== 'pending'}
						<p class="text-sm text-gray-600">
							<strong>Estimated Delivery:</strong> {formatDate(order.deliveryDate)}
						</p>
					{/if}
				</div>
				<div>
					<h3 class="font-semibold text-gray-700 mb-2">Shipping Address</h3>
					{#if order.addressData}
						<p class="text-sm text-gray-600">
							{order.addressData.street || ''}
						</p>
						<p class="text-sm text-gray-600">
							{order.addressData.city || ''}, {order.addressData.state || ''}
						</p>
						<p class="text-sm text-gray-600">
							{order.addressData.zipCode || order.addressData.pincode || ''}
						</p>
						<p class="text-sm text-gray-600">
							{order.addressData.country || 'India'}
						</p>
					{:else}
						<p class="text-sm text-gray-500">No address information available</p>
					{/if}
				</div>
			</div>

			<div class="border-t pt-6">
				<h3 class="font-semibold text-gray-700 mb-4">Order Items</h3>
				{#if order.items && order.items.length > 0}
					{@const itemsByDeliveryDate = (() => {
						const grouped = {};
						order.items.forEach(item => {
							const itemDeliveryDate = getItemDeliveryDate(item, order.createdAt, order.status);
							const dateKey = itemDeliveryDate || 'unknown';
							if (!grouped[dateKey]) {
								grouped[dateKey] = [];
							}
							grouped[dateKey].push(item);
						});
						return grouped;
					})()}
					
					<div class="space-y-6">
						{#each Object.entries(itemsByDeliveryDate) as [deliveryDate, items]}
							<div class="border-b pb-6 last:border-0">
								{#if deliveryDate !== 'unknown'}
									<h4 class="text-lg font-semibold text-blue-600 mb-4">
										📦 Estimated Delivery: {formatDate(deliveryDate)}
									</h4>
								{/if}
								
								<div class="space-y-6">
									{#each items as item}
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-4 flex-1">
												{#if item.productImage || item.image}
													<img 
														src={item.productImage || item.image} 
														alt={item.productName || 'Product'} 
														class="w-20 h-20 object-cover rounded border"
														on:error={(e) => { e.target.style.display = 'none'; }}
													/>
												{:else}
													<div class="w-20 h-20 bg-gray-200 rounded border flex items-center justify-center">
														<span class="text-gray-400 text-xs">No Image</span>
													</div>
												{/if}
												<div class="flex-1">
													<p class="font-semibold">{item.productName || 'Product'}</p>
													<p class="text-sm text-gray-600">
														Quantity: {item.quantity} × ₹{item.price?.toFixed(2) || '0.00'}
													</p>
												</div>
											</div>
											<div class="text-right">
												<p class="font-semibold">
													₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
												</p>
											</div>
										</div>
										
										{#if order.status === 'completed'}
											<!-- Rating Section -->
											<div class="mt-4 pt-4 border-t">
												{#if existingRatings[item.productId]}
													<!-- Show existing rating -->
													<div class="bg-green-50 border border-green-200 rounded p-4">
														<div class="flex items-start justify-between">
													<div class="flex-1">
														<div class="flex items-center gap-2 mb-2">
															<span class="font-semibold text-gray-700">Your Rating:</span>
															<div class="flex items-center">
																{#each Array(5) as _, i}
																	<span class="text-yellow-400 text-xl">
																		{#if i < existingRatings[item.productId].rating}★{/if}
																		{#if i >= existingRatings[item.productId].rating}☆{/if}
																	</span>
																{/each}
																<span class="ml-2 text-gray-600">({existingRatings[item.productId].rating}/5)</span>
															</div>
														</div>
														{#if existingRatings[item.productId].title}
															<p class="font-semibold text-gray-800 mb-1">{existingRatings[item.productId].title}</p>
														{/if}
														{#if existingRatings[item.productId].comment}
															<p class="text-gray-600 text-sm">{existingRatings[item.productId].comment}</p>
														{/if}
													</div>
													<button
														on:click={() => initRatingForm(item.productId)}
														class="text-blue-600 hover:text-blue-800 text-sm"
													>
														Edit
														</button>
													</div>
													</div>
												{:else}
													<!-- Rating form -->
													{#if !ratingForms[item.productId]}
														<button
															on:click={() => initRatingForm(item.productId)}
															class="text-blue-600 hover:text-blue-800 text-sm font-medium"
														>
															Rate this product
														</button>
													{:else}
														<div class="bg-gray-50 border rounded p-4 space-y-4">
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-2">
																	Rating (1-5 stars) *
																</label>
																<div class="flex items-center gap-2">
																	{#each Array(5) as _, i}
																		<button
																			type="button"
																			on:click={() => ratingForms[item.productId].rating = i + 1}
																			class="text-2xl focus:outline-none transition-transform hover:scale-110"
																		>
																			{#if i < ratingForms[item.productId].rating}
																				<span class="text-yellow-400">★</span>
																			{:else}
																				<span class="text-gray-300">☆</span>
																			{/if}
																		</button>
																	{/each}
																	{#if ratingForms[item.productId].rating > 0}
																		<span class="ml-2 text-gray-600">({ratingForms[item.productId].rating}/5)</span>
																	{/if}
																</div>
															</div>
															
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-2">
																	Title (optional)
																</label>
																<input
																	type="text"
																	bind:value={ratingForms[item.productId].title}
																	placeholder="e.g., Great product!"
																	maxlength="200"
																	class="w-full px-3 py-2 border rounded-lg"
																/>
															</div>
															
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-2">
																	Comment (optional)
																</label>
																<textarea
																	bind:value={ratingForms[item.productId].comment}
																	placeholder="Share your experience with this product..."
																	maxlength="2000"
																	rows="3"
																	class="w-full px-3 py-2 border rounded-lg"
																></textarea>
															</div>
															
															<div class="flex gap-2">
																<button
																	on:click={() => submitRating(item.productId)}
																	disabled={submittingRating[item.productId] || !ratingForms[item.productId].rating}
																	class="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded disabled:cursor-not-allowed"
																>
																	{submittingRating[item.productId] ? 'Submitting...' : 'Submit Rating'}
																</button>
																<button
																	on:click={() => { delete ratingForms[item.productId]; ratingForms = {...ratingForms}; }}
																	class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded"
																>
																	Cancel
																</button>
															</div>
														</div>
													{/if}
												{/if}
											</div>
										{/if}
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-gray-500">No items found</p>
				{/if}
			</div>

			<div class="border-t pt-6 mt-6">
				<div class="flex justify-between items-center mb-2">
					<span class="text-gray-700">Subtotal:</span>
					<span class="text-gray-700">
						₹{((order.totalAmount || 0) - (order.shippingInfo?.cost || 0)).toFixed(2)}
					</span>
				</div>
				{#if order.shippingInfo}
					<div class="flex justify-between items-center mb-2">
						<span class="text-gray-700">Shipping ({order.shippingInfo.mode || 'Standard'}):</span>
						<span class="text-gray-700">₹{order.shippingInfo.cost?.toFixed(2) || '0.00'}</span>
					</div>
				{/if}
				<div class="flex justify-between items-center pt-4 border-t">
					<span class="text-xl font-bold">Total:</span>
					<span class="text-xl font-bold text-blue-600">
						₹{order.totalAmount?.toFixed(2) || '0.00'}
					</span>
				</div>
			</div>
		</div>
	{/if}
</div>

