<script>
	import '../app.css';
	import { onMount, onDestroy } from 'svelte';
	import { user, cart } from '$lib/stores';
	import { authApi, cartApi } from '$lib/api';
	import { initTokenRefresh, stopRefresh } from '$lib/tokenRefresh.js';
	import Nav from '$lib/components/Nav.svelte';
	import { browser } from '$app/environment';

	let mounted = false;
	let checkingAuth = false;

	// Initialize user state synchronously from localStorage to prevent flash
	if (browser) {
		const accessToken = localStorage.getItem('accessToken');
		// If we have a token, we're checking authentication
		// This prevents showing login buttons while we verify the token
		if (accessToken) {
			checkingAuth = true;
			// Don't set user to null - keep it as is (might be from SSR or previous check)
			// We'll verify it asynchronously
		} else {
			// No token, definitely not authenticated
			user.set(null);
			cart.set(null);
			checkingAuth = false;
		}
	}

	onMount(async () => {
		mounted = true;
		
		// Initialize automatic token refresh
		initTokenRefresh();
		
		// Check if we have a token in localStorage
		const accessToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
		
		if (!accessToken) {
			// No token, user is not authenticated
			user.set(null);
			cart.set(null);
			checkingAuth = false;
			return;
		}
		
		// Try to load user profile
		try {
			const profile = await authApi.getProfile();
			if (profile) {
				user.set(profile);
				
				// Load cart only if user is authenticated
				try {
					const cartData = await cartApi.getCart();
					cart.set(cartData);
				} catch (err) {
					// Cart might not exist yet
					cart.set(null);
				}
			} else {
				// Profile fetch failed, but we have a token - might be expired
				// Clear localStorage and set user to null
				if (typeof window !== 'undefined') {
					localStorage.removeItem('accessToken');
					localStorage.removeItem('refreshToken');
					localStorage.removeItem('sessionId');
				}
				user.set(null);
				cart.set(null);
			}
		} catch (err) {
			// User not authenticated - clear tokens
			console.log('User not authenticated:', err.message);
			if (typeof window !== 'undefined') {
				localStorage.removeItem('accessToken');
				localStorage.removeItem('refreshToken');
				localStorage.removeItem('sessionId');
			}
			user.set(null);
			cart.set(null);
		} finally {
			checkingAuth = false;
		}
	});
	
	onDestroy(() => {
		// Clean up token refresh timer when component is destroyed
		stopRefresh();
	});
</script>

<div class="min-h-screen flex flex-col">
	{#if mounted}
		<Nav {checkingAuth} />
		<main class="flex-1 container mx-auto px-4 py-8">
			<slot />
		</main>
		<footer class="bg-gray-800 text-white py-4 mt-auto">
			<div class="container mx-auto px-4 text-center">
				<p>&copy; 2025 Quick Gadgets. All rights reserved.</p>
			</div>
		</footer>
	{:else}
		<div class="flex items-center justify-center min-h-screen">
			<div class="text-center">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
				<p class="mt-4 text-gray-600">Loading...</p>
			</div>
		</div>
	{/if}
</div>

