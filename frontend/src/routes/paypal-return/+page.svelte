<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { ordersApi } from '$lib/api';

	let loading = true;
	let error = null;
	let message = 'Processing payment...';
	let paymentCompleted = false;

	onMount(async () => {
		// Use a non-reactive variable in closure to avoid timing issues with Svelte reactivity
		let paymentSuccessFlag = false;
		
		// Notify parent window if this tab is closed before payment completes
		const handleBeforeUnload = () => {
			if (!paymentSuccessFlag && window.opener && !window.opener.closed) {
				// Try to send a message before the window closes
				try {
					window.opener.postMessage({
						type: 'PAYPAL_WINDOW_CLOSED',
						message: 'PayPal window was closed before payment completion'
					}, window.location.origin);
				} catch (e) {
					console.warn('Could not notify parent window:', e);
				}
			}
		};
		
		window.addEventListener('beforeunload', handleBeforeUnload);
		
		// Also listen for visibility change (tab switching might trigger this)
		const handleVisibilityChange = () => {
			if (document.hidden && !paymentSuccessFlag && window.opener && !window.opener.closed) {
				// Tab was hidden - might be closing
				setTimeout(() => {
					if (document.hidden && !paymentSuccessFlag) {
						try {
							window.opener.postMessage({
								type: 'PAYPAL_WINDOW_CLOSED',
								message: 'PayPal window was closed before payment completion'
							}, window.location.origin);
						} catch (e) {
							console.warn('Could not notify parent window:', e);
						}
					}
				}, 1000);
			}
		};
		
		document.addEventListener('visibilitychange', handleVisibilityChange);
		
		try {
			// Extract PayPal token from URL
			const urlParams = new URLSearchParams(window.location.search);
			const token = urlParams.get('token');
			const payerId = urlParams.get('PayerID');

			if (!token) {
				throw new Error('PayPal token not found in URL');
			}

			// Get orderId and paypalOrderId from localStorage (stored before redirect)
			const storedOrderId = localStorage.getItem('pendingOrderId');
			const storedPaypalOrderId = localStorage.getItem('pendingPaypalOrderId');

			if (!storedOrderId || !storedPaypalOrderId) {
				// Try to extract from URL or use token as paypalOrderId
				const paypalOrderId = token; // PayPal token is the order ID
				const orderId = urlParams.get('orderId') || storedOrderId;

				if (!orderId) {
					throw new Error('Order ID not found. Please check your orders page.');
				}

				// Capture payment
				message = 'Capturing payment...';
				const result = await ordersApi.capturePayment(orderId, paypalOrderId);

				if (result && result.success) {
					// Set flag immediately (synchronous, no reactivity delay)
					paymentSuccessFlag = true;
					paymentCompleted = true;
					
					// Remove event listeners immediately to prevent them from firing
					window.removeEventListener('beforeunload', handleBeforeUnload);
					document.removeEventListener('visibilitychange', handleVisibilityChange);
					
					message = 'Payment successful! Redirecting to orders...';
					// Clear any stored data
					localStorage.removeItem('pendingOrderId');
					localStorage.removeItem('pendingPaypalOrderId');
					
					// Notify parent window (checkout page) if opened in popup
					if (window.opener) {
						window.opener.postMessage({
							type: 'PAYPAL_PAYMENT_COMPLETE',
							orderId: orderId
						}, window.location.origin);
					}
					
					setTimeout(() => {
						if (window.opener) {
							// Close this window if opened as popup
							window.close();
						} else {
							// Redirect if opened in same window
							goto('/orders');
						}
					}, 1500);
				} else {
					throw new Error('Payment capture failed');
				}
			} else {
				// Use stored values
				message = 'Capturing payment...';
				const result = await ordersApi.capturePayment(storedOrderId, storedPaypalOrderId);

				if (result && result.success) {
					// Set flag immediately (synchronous, no reactivity delay)
					paymentSuccessFlag = true;
					paymentCompleted = true;
					
					// Remove event listeners immediately to prevent them from firing
					window.removeEventListener('beforeunload', handleBeforeUnload);
					document.removeEventListener('visibilitychange', handleVisibilityChange);
					
					message = 'Payment successful! Redirecting to orders...';
					// Clear stored data
					localStorage.removeItem('pendingOrderId');
					localStorage.removeItem('pendingPaypalOrderId');
					
					// Notify parent window (checkout page) if opened in popup
					if (window.opener) {
						window.opener.postMessage({
							type: 'PAYPAL_PAYMENT_COMPLETE',
							orderId: storedOrderId
						}, window.location.origin);
					}
					
					setTimeout(() => {
						if (window.opener) {
							// Close this window if opened as popup
							window.close();
						} else {
							// Redirect if opened in same window
							goto('/orders');
						}
					}, 1500);
				} else {
					throw new Error('Payment capture failed');
				}
			}
		} catch (err) {
			console.error('PayPal return error:', err);
			error = err.message || 'Payment processing failed. Please check your orders page.';
			loading = false;
			
			// Remove event listeners on error too
			window.removeEventListener('beforeunload', handleBeforeUnload);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			
			// Clear stored data on error
			localStorage.removeItem('pendingOrderId');
			localStorage.removeItem('pendingPaypalOrderId');
			
			// Notify parent window (checkout page) if opened in popup
			if (window.opener) {
				window.opener.postMessage({
					type: 'PAYPAL_PAYMENT_ERROR',
					message: err.message || 'Payment processing failed. Please check your orders page.'
				}, window.location.origin);
			}
			
			setTimeout(() => {
				if (window.opener) {
					// Close this window if opened as popup
					window.close();
				} else {
					// Redirect if opened in same window
					goto('/orders');
				}
			}, 3000);
		}
		
		// Return cleanup function
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});
</script>

<svelte:head>
	<title>Processing Payment - E-Commerce</title>
</svelte:head>

<div class="max-w-2xl mx-auto mt-20 text-center">
	{#if loading}
		<div class="mb-4">
			<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
		<p class="text-lg">{message}</p>
	{:else if error}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			<p class="font-bold">Payment Error</p>
			<p>{error}</p>
		</div>
		<p class="text-gray-600">Redirecting to orders page...</p>
	{:else}
		<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
			<p class="font-bold">Payment Successful!</p>
			<p>{message}</p>
		</div>
	{/if}
</div>

