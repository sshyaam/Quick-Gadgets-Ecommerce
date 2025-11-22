<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { user } from '$lib/stores';
	import { ordersApi } from '$lib/api';
	import Pagination from '$lib/components/Pagination.svelte';
	import { redirectToLogin } from '$lib/auth.js';
	import { clearAuthCookies, getAccessToken } from '$lib/cookies.js';

	export let data;

	// Backend returns already-grouped orders as an object: { "2025-01-20": [orders...], ... }
	let groupedOrders = data.orders || {};
	let pagination = data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false };
	let loading = false;
	let requiresAuth = data.requiresAuth || false;
	
	// Filter state - initialize from URL params on mount
	let statusFilter = 'all';
	let dateFromFilter = '';
	let dateToFilter = '';
	
	// Track if user is actively changing filters (to prevent reactive override)
	let isUserChanging = false;
	
	// Track if component is mounted and last applied filters to prevent duplicate calls
	let isMounted = false;
	let lastAppliedFilters = '';
	
	// Load orders function
	async function loadOrders(filters = {}) {
		// Create a key for the filters to prevent duplicate calls
		const filterKey = JSON.stringify(filters);
		if (filterKey === lastAppliedFilters && isMounted) {
			console.log('[orders] Skipping duplicate filter call:', filters);
			return; // Already applied these filters
		}
		lastAppliedFilters = filterKey;
		
		console.log('[orders] Loading orders with filters:', filters);
		
		loading = true;
		try {
			const loadedOrders = await ordersApi.getOrders(filters);
			console.log('[orders] Received orders:', loadedOrders);
			groupedOrders = loadedOrders.orders || {};
			pagination = loadedOrders.pagination || pagination;
			requiresAuth = false;
		} catch (err) {
			console.error('Error loading orders:', err);
			if (err.message.includes('401') || err.message.includes('Unauthorized')) {
				requiresAuth = true;
				if (typeof window !== 'undefined') {
					clearAuthCookies();
				}
			}
		} finally {
			loading = false;
		}
	}
	
	// Apply filters - update URL and reload orders
	async function applyFilters() {
		isUserChanging = true;
		
		// Read current values directly from DOM to ensure we have the latest
		const statusSelect = document.getElementById('statusFilter');
		const dateFromInput = document.getElementById('dateFromFilter');
		const dateToInput = document.getElementById('dateToFilter');
		
		const currentStatus = statusSelect?.value || 'all';
		const currentDateFrom = dateFromInput?.value || '';
		const currentDateTo = dateToInput?.value || '';
		
		// Update local state to match DOM
		statusFilter = currentStatus;
		dateFromFilter = currentDateFrom;
		dateToFilter = currentDateTo;
		
		// Build filters object
		const filters = {};
		if (currentStatus && currentStatus !== 'all') {
			filters.status = currentStatus;
		}
		if (currentDateFrom) {
			filters.dateFrom = currentDateFrom;
		}
		if (currentDateTo) {
			filters.dateTo = currentDateTo;
		}
		// Add pagination
		const currentPage = parseInt($page.url.searchParams.get('page') || '1', 10);
		filters.page = currentPage;
		filters.limit = 10;
		
		console.log('[orders] Applying filters:', filters);
		console.log('[orders] Current filter state:', { statusFilter: currentStatus, dateFromFilter: currentDateFrom, dateToFilter: currentDateTo });
		
		// Update URL using SvelteKit's goto to properly update page store
		const params = new URLSearchParams();
		if (currentStatus && currentStatus !== 'all') params.set('status', currentStatus);
		if (currentDateFrom) params.set('dateFrom', currentDateFrom);
		if (currentDateTo) params.set('dateTo', currentDateTo);
		
		const queryString = params.toString();
		const newUrl = queryString ? `/orders?${queryString}` : '/orders';
		
		// Track when we're changing filters to prevent reactive override
		if (typeof window !== 'undefined') {
			window.lastFilterChange = Date.now();
		}
		
		// Use goto to update URL (this will update $page store)
		goto(newUrl, { replaceState: true, noScroll: true, invalidateAll: false });
		
		// Reload orders with filters immediately
		await loadOrders(filters);
		
		// Allow reactive updates after a delay
		setTimeout(() => {
			isUserChanging = false;
		}, 500);
	}
	
	// Clear filters
	async function clearFilters() {
		isUserChanging = true;
		statusFilter = 'all';
		dateFromFilter = '';
		dateToFilter = '';
		goto('/orders', { replaceState: true, noScroll: true, invalidateAll: false });
		await loadOrders({});
		setTimeout(() => {
			isUserChanging = false;
		}, 100);
	}
	
	// Load orders on client-side if not loaded server-side (for localStorage auth)
	onMount(async () => {
		isMounted = true;
		
		// Initialize filter state from URL params
		statusFilter = $page.url.searchParams.get('status') || 'all';
		dateFromFilter = $page.url.searchParams.get('dateFrom') || '';
		dateToFilter = $page.url.searchParams.get('dateTo') || '';
		
		// Handle browser back/forward navigation via popstate event
		const handlePopState = () => {
			if (isUserChanging) return;
			
			const urlStatus = $page.url.searchParams.get('status') || 'all';
			const urlDateFrom = $page.url.searchParams.get('dateFrom') || '';
			const urlDateTo = $page.url.searchParams.get('dateTo') || '';
			
			// Sync state from URL
			statusFilter = urlStatus;
			dateFromFilter = urlDateFrom;
			dateToFilter = urlDateTo;
			
			const filters = {};
			if (urlStatus && urlStatus !== 'all') filters.status = urlStatus;
			if (urlDateFrom) filters.dateFrom = urlDateFrom;
			if (urlDateTo) filters.dateTo = urlDateTo;
			// Add pagination
			const currentPage = parseInt($page.url.searchParams.get('page') || '1', 10);
			filters.page = currentPage;
			filters.limit = 10;
			
			loadOrders(filters);
		};
		
		if (typeof window !== 'undefined') {
			window.addEventListener('popstate', handlePopState);
		}
		
		// Check if we have a token in cookies
		const accessToken = typeof window !== 'undefined' ? getAccessToken() : null;
		
		// Check if orders is empty object or null
		const hasOrders = groupedOrders && Object.keys(groupedOrders).length > 0;
		
		// Build filters from URL params
		const filters = {};
		if (statusFilter && statusFilter !== 'all') filters.status = statusFilter;
		if (dateFromFilter) filters.dateFrom = dateFromFilter;
		if (dateToFilter) filters.dateTo = dateToFilter;
		// Add pagination
		const currentPage = parseInt($page.url.searchParams.get('page') || '1', 10);
		filters.page = currentPage;
		filters.limit = 10;
		
		// If we have filters, always reload with filters (even if we have orders from server)
		if (Object.keys(filters).length > 0) {
			await loadOrders(filters);
		} else if ((data.clientSideAuth || (accessToken && !hasOrders)) && !data.requiresAuth) {
			// If no filters and no orders, load normally
			await loadOrders({});
		} else if (!accessToken && !hasOrders && !data.clientSideAuth) {
			// No token, no orders, and server didn't indicate client-side auth check
			requiresAuth = data.requiresAuth || false;
		}
		
		// Cleanup
		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('popstate', handlePopState);
			}
		};
	});
	let selectedOrder = null;

	function viewOrderDetails(orderId) {
		goto(`/order/${orderId}`);
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
	
	// Handle date filter changes with validation
	async function handleDateFromChange() {
		// If dateTo is set and is before dateFrom, clear it
		if (dateToFilter && dateFromFilter && dateToFilter < dateFromFilter) {
			dateToFilter = '';
		}
		await applyFilters();
	}
	
	async function handleDateToChange() {
		// Validate that dateTo is not before dateFrom
		if (dateFromFilter && dateToFilter && dateToFilter < dateFromFilter) {
			alert('To date cannot be before From date');
			dateToFilter = dateFromFilter;
		}
		await applyFilters();
	}
</script>

<svelte:head>
	<title>My Orders - Quick Gadgets</title>
</svelte:head>

<div class="max-w-6xl mx-auto">
	<h1 class="text-3xl font-bold mb-6">My Orders</h1>

	{#if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			<p class="text-gray-600 mt-4">Loading orders...</p>
		</div>
	{:else if requiresAuth}
		<div class="text-center py-12">
			<p class="text-gray-600 text-lg mb-4">Please log in to view your orders.</p>
			<button
				on:click={() => redirectToLogin()}
				class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
			>
				Login
			</button>
		</div>
	{:else}
		<!-- Filters - Always visible when not loading and authenticated -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-lg font-semibold mb-4">Filter Orders</h2>
			<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
				<!-- Status Filter -->
				<div>
					<label for="statusFilter" class="block text-sm font-medium text-gray-700 mb-2">
						Status
					</label>
					<select
						id="statusFilter"
						bind:value={statusFilter}
						on:change={applyFilters}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="all">All Status</option>
						<option value="pending">Pending</option>
						<option value="processing">Processing</option>
						<option value="completed">Completed</option>
						<option value="cancelled">Cancelled</option>
						<option value="failed">Failed</option>
					</select>
				</div>

				<!-- Date From Filter -->
				<div>
					<label for="dateFromFilter" class="block text-sm font-medium text-gray-700 mb-2">
						From Date
					</label>
					<input
						type="date"
						id="dateFromFilter"
						bind:value={dateFromFilter}
						on:change={handleDateFromChange}
						max={dateToFilter || undefined}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<!-- Date To Filter -->
				<div>
					<label for="dateToFilter" class="block text-sm font-medium text-gray-700 mb-2">
						To Date
					</label>
					<input
						type="date"
						id="dateToFilter"
						bind:value={dateToFilter}
						on:change={handleDateToChange}
						min={dateFromFilter || undefined}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<!-- Clear Filters Button -->
				<div class="flex items-end">
					<button
						on:click={clearFilters}
						class="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
					>
						Clear Filters
					</button>
				</div>
			</div>
		</div>

		<!-- Orders List or Empty State -->
		{#if !groupedOrders || Object.keys(groupedOrders).length === 0}
			<div class="text-center py-12 bg-white rounded-lg shadow-md p-6">
				<p class="text-gray-600 text-lg mb-4">
					{#if statusFilter !== 'all' || dateFromFilter || dateToFilter}
						No orders found matching your filters.
					{:else}
						You have no orders yet.
					{/if}
				</p>
				<div class="flex gap-4 justify-center">
					{#if statusFilter !== 'all' || dateFromFilter || dateToFilter}
						<button
							on:click={clearFilters}
							class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded"
						>
							Clear Filters
						</button>
					{/if}
					<button
						on:click={() => goto('/catalog')}
						class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
					>
						Browse Catalog
					</button>
				</div>
			</div>
		{:else}
			{@const ordersByPayment = (() => {
				// Flatten all orders from groupedOrders and group by orderId (payment)
				const orderMap = new Map();
				Object.values(groupedOrders).forEach(deliveryOrders => {
					deliveryOrders.forEach(order => {
						if (!orderMap.has(order.orderId)) {
							orderMap.set(order.orderId, {
								...order,
								itemsByDeliveryDate: {}
							});
						}
						const orderData = orderMap.get(order.orderId);
						// Group items by delivery date within this order
						order.items?.forEach(item => {
							const itemDeliveryDate = getItemDeliveryDate(item, order.createdAt, order.status);
							const dateKey = itemDeliveryDate || 'unknown';
							if (!orderData.itemsByDeliveryDate[dateKey]) {
								orderData.itemsByDeliveryDate[dateKey] = [];
							}
							orderData.itemsByDeliveryDate[dateKey].push(item);
						});
					});
				});
				return Array.from(orderMap.values());
			})()}
			
			<div class="space-y-6">
				{#each ordersByPayment as order}
					<div class="bg-white rounded-lg shadow-md p-6">
						<div class="flex justify-between items-start mb-4">
							<div>
								<h3 class="text-lg font-semibold">Order #{order.orderId}</h3>
								<p class="text-sm text-gray-600">
									Placed on: {formatDate(order.createdAt)}
								</p>
								<p class="text-sm text-gray-600">
									Status: <span class="font-semibold">{order.status}</span>
								</p>
							</div>
							<div class="text-right">
								<p class="text-xl font-bold text-blue-600">
									₹{order.totalAmount?.toFixed(2) || '0.00'}
								</p>
								{#if order.paymentInfo}
									<p class="text-sm text-gray-600">
										Payment: {order.paymentInfo.method || 'N/A'}
									</p>
								{/if}
							</div>
						</div>

						{#if order.itemsByDeliveryDate && Object.keys(order.itemsByDeliveryDate).length > 0}
							<div class="mb-4">
								<h4 class="font-semibold mb-3">Items:</h4>
								{#each Object.entries(order.itemsByDeliveryDate) as [deliveryDate, items]}
									<div class="mb-4 last:mb-0">
										{#if deliveryDate !== 'unknown'}
											<h5 class="text-sm font-semibold text-blue-600 mb-2">
												📦 Delivery: {formatDate(deliveryDate)}
											</h5>
										{/if}
										<div class="space-y-3 ml-4">
											{#each items as item}
												<div class="flex items-center gap-3 border-b pb-3 last:border-0">
													{#if item.productImage || item.image}
														<img 
															src={item.productImage || item.image} 
															alt={item.productName || 'Product'} 
															class="w-16 h-16 object-cover rounded border"
															on:error={(e) => { e.target.style.display = 'none'; }}
														/>
													{:else}
														<div class="w-16 h-16 bg-gray-200 rounded border flex items-center justify-center">
															<span class="text-gray-400 text-xs">No Image</span>
														</div>
													{/if}
													<div class="flex-1">
														<p class="font-semibold">{item.productName || 'Product'}</p>
														<p class="text-sm text-gray-600">
															Quantity: {item.quantity} × ₹{item.price?.toFixed(2) || '0.00'}
														</p>
													</div>
													<div class="text-right">
														<p class="font-semibold">
															₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
														</p>
													</div>
												</div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}

						{#if order.shippingInfo}
							<div class="mb-4">
								<h4 class="font-semibold mb-2">Shipping:</h4>
								<p class="text-sm text-gray-600">
									{order.shippingInfo.mode || 'Standard'} - 
									₹{order.shippingInfo.cost?.toFixed(2) || '0.00'}
								</p>
							</div>
						{/if}

						<button
							on:click={() => viewOrderDetails(order.orderId)}
							class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
						>
							View Details
						</button>
					</div>
				{/each}
			</div>
		{/if}
		
		<!-- Pagination -->
		<Pagination {pagination} baseUrl="/orders" preserveParams={true} />
	{/if}
</div>

