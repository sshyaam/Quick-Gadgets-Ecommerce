<script>
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores';
	import { cartApi, ordersApi, fulfillmentApi, authApi, catalogApi } from '$lib/api';
	import { onMount, onDestroy } from 'svelte';

	let cartData = null;
	let userProfile = null;
	// Per-group shipping modes: { groupId: 'standard' | 'express' }
	let groupShippingModes = {}; // Will be initialized when groups are created
	let loading = false;
	let loadingShipping = false;
	let error = '';
	let message = '';
	let saveNewAddress = false;
	
	// PayPal payment flow state
	let showPayPalLoading = false;
	let paypalWindow = null;
	let paypalCheckInterval = null;
	let paypalTimerInterval = null;
	let paypalTimeoutTimer = null;
	let timeRemaining = 15 * 60; // 15 minutes in seconds
	let currentOrderId = null;
	
	// Address management
	let savedAddresses = [];
	let selectedAddressId = null;
	let selectedAddress = null;
	let useSavedAddress = false;
	let showNewAddressForm = false;
	let newAddress = {
		name: '',
		contactNumber: '',
		doorNumber: '',
		street: '',
		area: '',
		pincode: '',
		city: '',
		state: ''
	};
	let addressErrors = {};
	
	// Shipping options per item (keyed by productId)
	let itemShippingOptions = {}; // { productId: { standard: {...}, express: {...} } }
	
	// Reactive: Calculate total shipping cost from group shipping modes
	$: currentShippingCost = (() => {
		if (!groupedItems || groupedItems.length === 0) return 0;
		let total = 0;
		for (const group of groupedItems) {
			const groupMode = groupShippingModes[group.id] || 'standard';
			// Sum shipping costs for each item in the group
			// Each item's shipping cost is already calculated for its quantity
			for (const item of group.items) {
				const itemOptions = itemShippingOptions[item.productId];
				if (itemOptions && itemOptions[groupMode]) {
					const itemShipping = itemOptions[groupMode];
					if (itemShipping && itemShipping.available && typeof itemShipping.cost === 'number') {
						// Cost is already for the item's quantity, so just add it
						total += itemShipping.cost || 0;
					}
				}
			}
		}
		return Math.round(total * 100) / 100; // Round to 2 decimal places
	})();

	onMount(async () => {
		try {
			// Load cart
			cartData = await cartApi.getCart();
			
			// Load user profile for saved addresses
			try {
				userProfile = await authApi.getProfile();
				if (userProfile && userProfile.savedAddresses && userProfile.savedAddresses.length > 0) {
					savedAddresses = userProfile.savedAddresses;
					// Select first address by default
					selectedAddressId = savedAddresses[0].addressId;
					selectedAddress = savedAddresses[0];
					useSavedAddress = true;
					
					// Calculate shipping if address is available (with state)
					if (selectedAddress && selectedAddress.pincode && selectedAddress.pincode.length === 6 && selectedAddress.state) {
						console.log('[checkout] Calculating shipping on mount with saved address');
						await calculateShipping();
					}
				} else {
					// No saved addresses - show new address form
					savedAddresses = [];
					useSavedAddress = false;
					showNewAddressForm = true;
				}
			} catch (err) {
				console.error('Failed to load profile:', err);
				savedAddresses = [];
				useSavedAddress = false;
				showNewAddressForm = true;
			}
		} catch (err) {
			error = 'Failed to load cart. Please try again.';
		}
		
		// Listen for payment completion message from PayPal return page
		const handleMessage = (event) => {
			// Only accept messages from same origin
			if (event.origin !== window.location.origin) return;
			
			if (event.data && event.data.type === 'PAYPAL_PAYMENT_COMPLETE') {
				// Payment completed successfully
				closePayPalLoading();
				message = 'Payment successful! Redirecting to orders...';
				setTimeout(() => {
					goto('/orders');
				}, 1500);
			} else if (event.data && event.data.type === 'PAYPAL_PAYMENT_ERROR') {
				// Payment failed
				closePayPalLoading();
				error = event.data.message || 'Payment processing failed. Please try again.';
			} else if (event.data && event.data.type === 'PAYPAL_WINDOW_CLOSED') {
				// PayPal window was closed prematurely
				closePayPalLoading();
				error = 'Payment window was closed. If you completed the payment, please check your orders page.';
			}
		};
		
		window.addEventListener('message', handleMessage);
		
		// Cleanup function
		return () => {
			window.removeEventListener('message', handleMessage);
			if (paypalCheckInterval) {
				clearInterval(paypalCheckInterval);
			}
			if (paypalTimerInterval) {
				clearInterval(paypalTimerInterval);
			}
			if (paypalTimeoutTimer) {
				clearTimeout(paypalTimeoutTimer);
			}
			if (paypalWindow && !paypalWindow.closed) {
				paypalWindow.close();
			}
		};
	});
	
	onDestroy(() => {
		// Cleanup intervals and windows
		if (paypalCheckInterval) {
			clearInterval(paypalCheckInterval);
			paypalCheckInterval = null;
		}
		if (paypalTimerInterval) {
			clearInterval(paypalTimerInterval);
			paypalTimerInterval = null;
		}
		if (paypalTimeoutTimer) {
			clearTimeout(paypalTimeoutTimer);
			paypalTimeoutTimer = null;
		}
		if (paypalWindow && !paypalWindow.closed) {
			paypalWindow.close();
		}
	});

	// Reactive subtotal calculation
	$: subtotal = (() => {
		if (!cartData || !cartData.items) return 0;
		return cartData.items.reduce((sum, item) => {
			return sum + ((item.price || item.lockedPrice || 0) * item.quantity);
		}, 0);
	})();
	
	function calculateSubtotal() {
		return subtotal;
	}

	async function calculateShipping() {
		if (!cartData || !cartData.items || cartData.items.length === 0) {
			console.warn('[checkout] Cannot calculate shipping - cart is empty');
			return;
		}
		
		const address = useSavedAddress && selectedAddress ? selectedAddress : newAddress;
		
		console.log('[checkout] Calculating shipping with address:', {
			useSavedAddress,
			hasSelectedAddress: !!selectedAddress,
			hasNewAddress: !!newAddress,
			address: {
				pincode: address?.pincode,
				state: address?.state,
				city: address?.city
			}
		});
		
		// Use pincode from the full address for shipping calculation
		if (!address || !address.pincode || address.pincode.length !== 6 || !address.state) {
			console.warn('[checkout] Cannot calculate shipping - invalid address:', {
				hasAddress: !!address,
				pincode: address?.pincode,
				pincodeLength: address?.pincode?.length,
				state: address?.state
			});
			// Clear all item shipping options
			itemShippingOptions = {};
			return;
		}
		
		loadingShipping = true;
		error = '';
		
		try {
			// Get product details for all items to get categories
			const productDetailsPromises = cartData.items.map(async (item) => {
				try {
					const product = await catalogApi.getProduct(item.productId);
					return {
						productId: item.productId,
						category: product.category || 'accessories',
						quantity: item.quantity
					};
				} catch (err) {
					console.error(`Failed to get product ${item.productId}:`, err);
					return {
						productId: item.productId,
						category: 'accessories', // fallback
						quantity: item.quantity
					};
				}
			});
			
			const productDetails = await Promise.all(productDetailsPromises);
			
			// Use batch shipping calculation - single API call for all products
			console.log('[checkout] Calculating batch shipping for', productDetails.length, 'products');
			const batchShippingResults = await fulfillmentApi.calculateBatchShipping(
				productDetails,
				{
					pincode: address.pincode,
					city: address.city || '',
					state: address.state
				}
			);
			
			// batchShippingResults is { productId: { standard: {...}, express: {...} } }
			// Update shipping options - create new object to trigger reactivity
			itemShippingOptions = { ...batchShippingResults };
			
			console.log('[checkout] Batch shipping options set:', itemShippingOptions);
		} catch (err) {
			console.error('Failed to calculate shipping:', err);
			error = 'Failed to calculate shipping costs. Please try again.';
		} finally {
			loadingShipping = false;
		}
	}

	function getShippingCost() {
		// Use the reactive variable instead
		return currentShippingCost;
	}
	
	// Get shipping options for a specific item
	function getItemShippingOptions(productId) {
		return itemShippingOptions[productId] || {
			standard: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false },
			express: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false }
		};
	}
	
	// Create a key for grouping items based on shipping costs and timelines
	function getShippingKey(itemOptions) {
		if (!itemOptions) {
			// Return a default key for items without shipping options
			return JSON.stringify({
				standardCost: 0,
				standardRange: null,
				standardAvailable: false,
				expressCost: 0,
				expressRange: null,
				expressAvailable: false
			});
		}
		const standard = itemOptions.standard || {};
		const express = itemOptions.express || {};
		// Key includes both standard and express costs and timelines
		return JSON.stringify({
			standardCost: standard.cost || 0,
			standardRange: standard.estimatedDaysRange || null,
			standardAvailable: standard.available || false,
			expressCost: express.cost || 0,
			expressRange: express.estimatedDaysRange || null,
			expressAvailable: express.available || false
		});
	}
	
	// Group items by shipping costs and timelines
	$: groupedItems = (() => {
		if (!cartData || !cartData.items) return [];
		
		// Create groups based on shipping key
		const groups = new Map();
		
		for (const item of cartData.items) {
			const itemOptions = itemShippingOptions[item.productId];
			const shippingKey = getShippingKey(itemOptions); // Always returns a string now
			
			if (!groups.has(shippingKey)) {
				// Create stable group ID based on shipping key (same key = same group ID)
				// Use a hash of the key for shorter, stable IDs
				const groupId = `group-${shippingKey.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`;
				
				groups.set(shippingKey, {
					id: groupId,
					items: [],
					shipping: itemOptions || {
						standard: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false },
						express: { cost: 0, estimatedDays: null, estimatedDaysRange: null, available: false }
					}
				});
				
				// Initialize shipping mode for this group if not set
				if (!groupShippingModes[groupId]) {
					// Default to standard if available, otherwise express
					const defaultMode = itemOptions?.standard?.available ? 'standard' : 
					                   (itemOptions?.express?.available ? 'express' : 'standard');
					groupShippingModes[groupId] = defaultMode;
				}
			}
			
			groups.get(shippingKey).items.push(item);
		}
		
		// Convert map to array
		return Array.from(groups.values());
	})();
	
	// Check if all groups have available shipping for their selected modes
	$: hasAvailableShipping = (() => {
		if (!groupedItems || groupedItems.length === 0) return false;
		for (const group of groupedItems) {
			const groupMode = groupShippingModes[group.id] || 'standard';
			const groupShipping = group.shipping[groupMode];
			if (!groupShipping || !groupShipping.available) {
				return false;
			}
		}
		return true;
	})();
	
	// Get shipping mode for a group
	function getGroupShippingMode(groupId) {
		return groupShippingModes[groupId] || 'standard';
	}
	
	// Set shipping mode for a group
	function setGroupShippingMode(groupId, mode) {
		groupShippingModes[groupId] = mode;
		// Force reactivity
		groupShippingModes = { ...groupShippingModes };
	}


	// Reactive total calculation
	$: totalCost = (() => {
		const shipping = currentShippingCost || 0;
		const total = subtotal + shipping;
		return Math.round(total * 100) / 100; // Round to 2 decimal places
	})();
	
	function calculateTotal() {
		return totalCost;
	}
	
	function closePayPalLoading() {
		showPayPalLoading = false;
		timeRemaining = 15 * 60; // Reset timer
		
		// Clear all intervals and timers
		if (paypalCheckInterval) {
			clearInterval(paypalCheckInterval);
			paypalCheckInterval = null;
		}
		if (paypalTimerInterval) {
			clearInterval(paypalTimerInterval);
			paypalTimerInterval = null;
		}
		if (paypalTimeoutTimer) {
			clearTimeout(paypalTimeoutTimer);
			paypalTimeoutTimer = null;
		}
		
		// Close PayPal window if still open
		if (paypalWindow && !paypalWindow.closed) {
			try {
				paypalWindow.close();
			} catch (e) {
				console.warn('Could not close PayPal window:', e);
			}
		}
		paypalWindow = null;
		loading = false;
	}
	
	function cancelPayPalPayment() {
		closePayPalLoading();
		error = 'Payment cancelled. You can try again when ready.';
		// Clear stored order data
		if (currentOrderId) {
			localStorage.removeItem('pendingOrderId');
			localStorage.removeItem('pendingPaypalOrderId');
			currentOrderId = null;
		}
	}
	
	// Format time remaining as MM:SS
	function formatTime(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	function selectSavedAddress(addressId) {
		selectedAddressId = addressId;
		selectedAddress = savedAddresses.find(addr => addr.addressId === addressId);
		useSavedAddress = true;
		showNewAddressForm = false;
		calculateShipping();
	}
	
	function showNewAddress() {
		useSavedAddress = false;
		showNewAddressForm = true;
		selectedAddressId = null;
		selectedAddress = null;
		resetNewAddressForm();
	}
	
	function resetNewAddressForm() {
		newAddress = {
			name: '',
			contactNumber: '',
			doorNumber: '',
			street: '',
			area: '',
			pincode: '',
			city: '',
			state: ''
		};
		addressErrors = {};
	}
	
	// Removed handleAddressChange - shipping is calculated only when selecting/saving addresses
	
	async function saveNewAddressFromCheckout() {
		addressErrors = {};
		error = '';
		
		try {
			// Validate address
			if (!newAddress.name || !newAddress.contactNumber || !newAddress.doorNumber || 
			    !newAddress.street || !newAddress.pincode || !newAddress.city || !newAddress.state) {
				error = 'Please fill in all required address fields';
				return;
			}
			
			// Save address
			const updatedProfile = await authApi.addSavedAddress(newAddress);
			savedAddresses = updatedProfile.savedAddresses || [];
			
			// Select the newly saved address
			if (savedAddresses.length > 0) {
				const newAddressId = savedAddresses[savedAddresses.length - 1].addressId;
				selectSavedAddress(newAddressId);
				message = 'Address saved successfully!';
				setTimeout(() => message = '', 3000);
			}
		} catch (err) {
			console.error('Error saving address:', err);
			
			// Check if it's an authentication error
			if (err.message.includes('AUTHENTICATION_ERROR') || err.message.includes('Invalid or expired access token') || err.message.includes('401')) {
				error = 'Your session has expired. Please refresh the page and try again.';
				// Optionally redirect to login
				setTimeout(() => {
					if (typeof window !== 'undefined') {
						window.location.reload();
					}
				}, 2000);
				return;
			}
			
			// Parse validation errors
			try {
				let errorData;
				try {
					errorData = JSON.parse(err.message);
				} catch (e) {
					errorData = err.message || {};
				}
				
				if (errorData.details && Array.isArray(errorData.details)) {
					errorData.details.forEach(detail => {
						const path = detail.path || [];
						const field = Array.isArray(path) ? path[0] : path;
						if (field) {
							addressErrors[field] = detail.message || detail.message;
						}
					});
				}
				error = errorData.message || errorData.error?.message || 'Failed to save address. Please check the form for errors.';
			} catch (parseErr) {
				error = err.message || 'Failed to save address';
			}
		}
	}

	async function handleCheckout() {
		if (!cartData || !cartData.items || cartData.items.length === 0) {
			error = 'Your cart is empty';
			return;
		}

		// Validate address
		const address = useSavedAddress && selectedAddress ? selectedAddress : newAddress;
		
		if (!address) {
			error = 'Please select or enter a delivery address';
			return;
		}
		
		if (!address.pincode || address.pincode.length !== 6) {
			error = 'Please enter a valid 6-digit pincode';
			return;
		}
		if (!address.name || !address.contactNumber || !address.doorNumber || !address.street || !address.city || !address.state) {
			error = 'Please fill in all required address fields';
			return;
		}

		loading = true;
		error = '';
		message = '';

		try {
			// Get the address to use
			const address = useSavedAddress && selectedAddress ? selectedAddress : newAddress;
			
			// Map address to order API format (zipCode instead of pincode, add country)
			const orderAddress = {
				street: address.doorNumber + ', ' + address.street + (address.area ? ', ' + address.area : ''),
				city: address.city,
				state: address.state,
				zipCode: address.pincode,
				country: 'India'
			};
			
			// Create order - send address and per-item shipping modes
			// Build mapping of productId to shipping mode from groups
			const itemShippingModes = {};
			for (const group of groupedItems) {
				const groupMode = groupShippingModes[group.id] || 'standard';
				for (const item of group.items) {
					itemShippingModes[item.productId] = groupMode;
				}
			}
			
			const orderData = {
				address: orderAddress,
				itemShippingModes: itemShippingModes // Per-item shipping modes
			};

			const order = await ordersApi.createOrder(orderData);
			
			// Order creation returns PayPal approval URL
			let approvalUrl = null;
			
			if (order && order.approvalUrl) {
				approvalUrl = order.approvalUrl;
			} else if (order && order.payment && order.payment.links) {
				// Fallback: find approval link in payment object
				const approveLink = order.payment.links.find(link => link.rel === 'approve');
				if (approveLink) {
					approvalUrl = approveLink.href;
				}
			}
			
			if (approvalUrl && order.orderId && order.paypalOrderId) {
				// Store order details for PayPal return page
				localStorage.setItem('pendingOrderId', order.orderId);
				localStorage.setItem('pendingPaypalOrderId', order.paypalOrderId);
				currentOrderId = order.orderId;
				
				// Open PayPal in a new window
				paypalWindow = window.open(
					approvalUrl,
					'paypal_payment',
					'width=800,height=600,scrollbars=yes,resizable=yes'
				);
				
				if (!paypalWindow) {
					// Popup blocked - fallback to redirect
					error = 'Popup blocked. Please allow popups for this site and try again, or we will redirect you to PayPal.';
					setTimeout(() => {
						window.location.href = approvalUrl;
					}, 2000);
					loading = false;
					return;
				}
				
				// Show loading overlay
				showPayPalLoading = true;
				loading = false; // Don't show button loading, show overlay instead
				timeRemaining = 15 * 60; // Reset timer to 15 minutes
				
				// Start countdown timer
				paypalTimerInterval = setInterval(() => {
					if (timeRemaining > 0) {
						timeRemaining--;
					} else {
						// Timer expired - close PayPal window
						clearInterval(paypalTimerInterval);
						paypalTimerInterval = null;
						closePayPalLoading();
						error = 'Payment session expired (15 minutes). Please try again.';
						// Clear stored data
						setTimeout(() => {
							localStorage.removeItem('pendingOrderId');
							localStorage.removeItem('pendingPaypalOrderId');
							currentOrderId = null;
						}, 5000);
					}
				}, 1000); // Update every second
				
				// Set timeout to close PayPal window after 15 minutes
				paypalTimeoutTimer = setTimeout(() => {
					if (paypalWindow && !paypalWindow.closed) {
						try {
							paypalWindow.close();
						} catch (e) {
							console.warn('Could not close PayPal window:', e);
						}
					}
				}, 15 * 60 * 1000); // 15 minutes
				
				// Check if PayPal window is closed manually
				paypalCheckInterval = setInterval(() => {
					if (paypalWindow && paypalWindow.closed) {
						// Window was closed manually
						clearInterval(paypalCheckInterval);
						paypalCheckInterval = null;
						closePayPalLoading();
						error = 'Payment window was closed. If you completed the payment, please check your orders page.';
						// Clear stored data after a delay
						setTimeout(() => {
							localStorage.removeItem('pendingOrderId');
							localStorage.removeItem('pendingPaypalOrderId');
							currentOrderId = null;
						}, 5000);
					}
				}, 500); // Check every 500ms
			} else {
				error = 'PayPal approval URL not found. Please try again.';
				console.error('Invalid order response:', order);
				loading = false;
			}
		} catch (err) {
			error = err.message || 'Checkout failed. Please try again.';
			loading = false;
			showPayPalLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Checkout - Quick Gadgets</title>
</svelte:head>

<div class="max-w-4xl mx-auto">
	<h1 class="text-3xl font-bold mb-6">Checkout</h1>

	{#if error}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			{error}
		</div>
	{/if}
	
	{#if message}
		<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
			{message}
		</div>
	{/if}

	{#if !cartData || !cartData.items || cartData.items.length === 0}
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
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- Order Summary and Address -->
			<div class="md:col-span-2 space-y-6">
				<!-- Address Section -->
				<div class="bg-white rounded-lg shadow-lg p-6">
					<h2 class="text-xl font-bold mb-4">Delivery Address</h2>
					
					{#if savedAddresses && savedAddresses.length > 0}
						<!-- Saved Addresses Selection -->
						<div class="mb-4">
							<label class="block text-sm font-medium text-gray-700 mb-2">Select Saved Address</label>
							<div class="space-y-2 mb-4">
								{#each savedAddresses as address (address.addressId)}
									<label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 {selectedAddressId === address.addressId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}">
										<input
											type="radio"
											name="savedAddress"
											value={address.addressId}
											checked={selectedAddressId === address.addressId}
											on:change={() => selectSavedAddress(address.addressId)}
											class="mt-1 mr-3"
										/>
										<div class="flex-1">
											<p class="font-semibold">{address.name}</p>
											<p class="text-sm text-gray-600">{address.contactNumber}</p>
											<p class="text-sm text-gray-600">
												{address.doorNumber}, {address.street}
												{#if address.area}, {address.area}{/if}
											</p>
											<p class="text-sm text-gray-600">
												{address.city}, {address.state} - {address.pincode}
											</p>
										</div>
									</label>
								{/each}
							</div>
							
							<button
								on:click={showNewAddress}
								class="text-blue-600 hover:text-blue-800 text-sm font-medium"
							>
								+ Add New Address
							</button>
						</div>
					{/if}
					
					{#if showNewAddressForm || (savedAddresses.length === 0 && !useSavedAddress)}
						<div class="space-y-4">
							{#if savedAddresses.length > 0}
								<button
									on:click={() => { showNewAddressForm = false; useSavedAddress = true; if (savedAddresses.length > 0) selectSavedAddress(savedAddresses[0].addressId); }}
									class="text-blue-600 hover:text-blue-800 text-sm font-medium mb-2"
								>
									← Back to Saved Addresses
								</button>
							{/if}
							
							<h3 class="font-semibold text-lg">New Address</h3>
							
							{#if error && Object.keys(addressErrors).length === 0}
								<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
									{error}
								</div>
							{/if}
							
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Recipient Name *</label>
									<input
										type="text"
										bind:value={newAddress.name}
										placeholder="Full Name"
										class="w-full px-4 py-2 border rounded-lg {addressErrors.name ? 'border-red-500' : ''}"
									/>
									{#if addressErrors.name}
										<p class="text-red-600 text-xs mt-1">{addressErrors.name}</p>
									{/if}
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
									<input
										type="text"
										bind:value={newAddress.contactNumber}
										placeholder="10-digit mobile number (starts with 6-9)"
										maxlength="10"
										class="w-full px-4 py-2 border rounded-lg {addressErrors.contactNumber ? 'border-red-500' : ''}"
									/>
									{#if addressErrors.contactNumber}
										<p class="text-red-600 text-xs mt-1">{addressErrors.contactNumber}</p>
									{/if}
								</div>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Door/Flat Number *</label>
								<input
									type="text"
									bind:value={newAddress.doorNumber}
									placeholder="Door/Flat Number"
									class="w-full px-4 py-2 border rounded-lg {addressErrors.doorNumber ? 'border-red-500' : ''}"
								/>
								{#if addressErrors.doorNumber}
									<p class="text-red-600 text-xs mt-1">{addressErrors.doorNumber}</p>
								{/if}
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Street *</label>
								<input
									type="text"
									bind:value={newAddress.street}
									placeholder="Street Address"
									class="w-full px-4 py-2 border rounded-lg {addressErrors.street ? 'border-red-500' : ''}"
								/>
								{#if addressErrors.street}
									<p class="text-red-600 text-xs mt-1">{addressErrors.street}</p>
								{/if}
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Area (Optional)</label>
								<input
									type="text"
									bind:value={newAddress.area}
									placeholder="Area/Locality"
									class="w-full px-4 py-2 border rounded-lg"
								/>
							</div>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Pincode *</label>
									<input
										type="text"
										bind:value={newAddress.pincode}
										placeholder="6-digit pincode"
										maxlength="6"
										class="w-full px-4 py-2 border rounded-lg {addressErrors.pincode ? 'border-red-500' : ''}"
									/>
									{#if addressErrors.pincode}
										<p class="text-red-600 text-xs mt-1">{addressErrors.pincode}</p>
									{/if}
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">City *</label>
									<input
										type="text"
										bind:value={newAddress.city}
										placeholder="City"
										class="w-full px-4 py-2 border rounded-lg {addressErrors.city ? 'border-red-500' : ''}"
									/>
									{#if addressErrors.city}
										<p class="text-red-600 text-xs mt-1">{addressErrors.city}</p>
									{/if}
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">State *</label>
									<input
										type="text"
										bind:value={newAddress.state}
										placeholder="State"
										class="w-full px-4 py-2 border rounded-lg {addressErrors.state ? 'border-red-500' : ''}"
									/>
									{#if addressErrors.state}
										<p class="text-red-600 text-xs mt-1">{addressErrors.state}</p>
									{/if}
								</div>
							</div>
							
							<div class="flex gap-2 mt-4">
								<button
									on:click={saveNewAddressFromCheckout}
									class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
								>
									Save Address
								</button>
								{#if savedAddresses.length > 0}
									<button
										on:click={() => { showNewAddressForm = false; useSavedAddress = true; if (savedAddresses.length > 0) selectSavedAddress(savedAddresses[0].addressId); }}
										class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
									>
										Cancel
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Order Items -->
				<div class="bg-white rounded-lg shadow-lg p-6">
					<h2 class="text-xl font-bold mb-4">Order Summary</h2>
					<div class="space-y-6">
						{#each groupedItems as group}
							<div class="border-b pb-6 last:border-b-0 last:pb-0">
								<!-- Items in this group -->
								<div class="space-y-4 mb-4">
									{#each group.items as item}
										<div class="flex justify-between">
											<a 
												href="/product/{item.productId}" 
												class="flex items-center space-x-3 hover:opacity-80 transition-opacity flex-1"
											>
												{#if item.productImage}
													<img 
														src={item.productImage} 
														alt={item.productName || 'Product'} 
														class="w-16 h-16 object-cover rounded"
														on:error={(e) => { e.target.style.display = 'none'; }}
													/>
												{:else}
													<div class="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
														<span class="text-gray-400 text-xs">No Image</span>
													</div>
												{/if}
												<div>
													<h3 class="font-semibold text-blue-600 hover:text-blue-800">{item.productName || 'Product'}</h3>
													<p class="text-sm text-gray-600">Quantity: {item.quantity}</p>
												</div>
											</a>
											<p class="font-semibold">
												₹{((item.price || item.lockedPrice || 0) * item.quantity).toFixed(2)}
											</p>
										</div>
									{/each}
								</div>
								
								<!-- Per-group shipping mode selection -->
								<div class="ml-20 bg-gray-50 p-3 rounded-lg space-y-3">
									{#if loadingShipping}
										<p class="text-sm text-gray-400">Calculating shipping...</p>
									{:else}
										{@const groupMode = getGroupShippingMode(group.id)}
										<div class="text-sm font-medium text-gray-700 mb-2">
											Shipping{group.items.length > 1 ? ` for ${group.items.length} items` : ''}:
										</div>
										<div class="flex gap-2">
											<!-- Standard Shipping Button -->
											<label class="flex-1 flex items-center justify-center p-2 border rounded-lg cursor-pointer hover:bg-white transition-colors {groupMode === 'standard' && group.shipping.standard?.available ? 'border-blue-500 bg-blue-50' : group.shipping.standard?.available ? 'border-gray-300' : 'border-gray-200 opacity-50'}">
												<input
													type="radio"
													name="shipping-{group.id}"
													value="standard"
													checked={groupMode === 'standard'}
													on:change={() => setGroupShippingMode(group.id, 'standard')}
													class="sr-only"
													disabled={!group.shipping.standard?.available}
												/>
												<div class="text-center">
													<div class="font-semibold text-xs">Standard</div>
													{#if group.shipping.standard?.available}
														<div class="text-xs text-gray-600">
															₹{group.shipping.standard.cost.toFixed(2)}
															{#if group.shipping.standard.estimatedDaysRange}
																<div class="text-gray-500">{group.shipping.standard.estimatedDaysRange}</div>
															{/if}
														</div>
													{:else}
														<div class="text-xs text-red-600">Not available</div>
													{/if}
												</div>
											</label>
											
											<!-- Express Shipping Button -->
											<label class="flex-1 flex items-center justify-center p-2 border rounded-lg cursor-pointer hover:bg-white transition-colors {groupMode === 'express' && group.shipping.express?.available ? 'border-blue-500 bg-blue-50' : group.shipping.express?.available ? 'border-gray-300' : 'border-gray-200 opacity-50'}">
												<input
													type="radio"
													name="shipping-{group.id}"
													value="express"
													checked={groupMode === 'express'}
													on:change={() => setGroupShippingMode(group.id, 'express')}
													class="sr-only"
													disabled={!group.shipping.express?.available}
												/>
												<div class="text-center">
													<div class="font-semibold text-xs">Express</div>
													{#if group.shipping.express?.available}
														<div class="text-xs text-gray-600">
															₹{group.shipping.express.cost.toFixed(2)}
															{#if group.shipping.express.estimatedDaysRange}
																<div class="text-gray-500">{group.shipping.express.estimatedDaysRange}</div>
															{/if}
														</div>
													{:else}
														<div class="text-xs text-red-600">Not available</div>
													{/if}
												</div>
											</label>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

			</div>

			<!-- Payment Summary -->
			<div class="bg-white rounded-lg shadow-lg p-6">
				<h2 class="text-xl font-bold mb-4">Payment Summary</h2>
				<div class="space-y-2 mb-4">
					<div class="flex justify-between">
						<span>Subtotal:</span>
						<span>₹{subtotal.toFixed(2)}</span>
					</div>
					<div class="flex justify-between">
						<span>Shipping:</span>
						<span>
							{#if loadingShipping}
								Calculating...
							{:else if currentShippingCost > 0}
								₹{currentShippingCost.toFixed(2)}
							{:else}
								₹0.00
							{/if}
						</span>
					</div>
					<div class="border-t pt-2 flex justify-between font-bold text-lg">
						<span>Total:</span>
						<span class="text-blue-600">₹{totalCost.toFixed(2)}</span>
					</div>
				</div>

				<button
					on:click={handleCheckout}
					disabled={loading || loadingShipping || !hasAvailableShipping || showPayPalLoading}
					class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-3 rounded-lg font-semibold"
				>
					{loading ? 'Processing...' : showPayPalLoading ? 'Payment in Progress...' : 'Checkout with Paypal'}
				</button>

			</div>
		</div>
	{/if}
	
	<!-- PayPal Loading Overlay -->
	{#if showPayPalLoading}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
				<div class="flex justify-between items-start mb-4">
					<h3 class="text-xl font-bold text-gray-800">Processing Payment</h3>
					<button
						on:click={cancelPayPalPayment}
						class="text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
						title="Cancel payment"
					>
						×
					</button>
				</div>
				<div class="text-center">
					<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
					<p class="text-gray-700 mb-2">Please complete your payment in the PayPal window.</p>
					<p class="text-sm text-gray-500 mb-3">Do not close this page until payment is complete.</p>
					<div class="mt-4 pt-4 border-t border-gray-200">
						<p class="text-xs text-gray-500 mb-1">Session will expire in:</p>
						<p class="text-2xl font-bold {timeRemaining < 60 ? 'text-red-600' : 'text-gray-800'}">
							{formatTime(timeRemaining)}
						</p>
						{#if timeRemaining < 60}
							<p class="text-xs text-red-600 mt-1">Session expiring soon!</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
