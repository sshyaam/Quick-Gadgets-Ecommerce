<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authApi } from '$lib/api';
	import { user } from '$lib/stores';

	let email = '';
	let password = '';
	let loading = false;
	let error = '';

	// Get return URL from query parameters
	$: returnTo = $page.url.searchParams.get('returnTo') || '/';

	async function handleLogin() {
		if (!email || !password) {
			error = 'Please fill in all fields';
			return;
		}

		loading = true;
		error = '';
		try {
			const result = await authApi.login(email, password);
			
			// Store tokens in localStorage as fallback (if cookies don't work)
			if (result.accessToken) {
				localStorage.setItem('accessToken', result.accessToken);
				localStorage.setItem('refreshToken', result.refreshToken);
				localStorage.setItem('sessionId', result.sessionId);
			}
			
			// Cookies are set by the server response (if browser allows)
			// Wait a moment for cookies to be set, then fetch profile
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Try to get user profile to set in store
			try {
				const profile = await authApi.getProfile();
				if (profile) {
					user.set(profile);
				} else {
					// Fallback to basic user info
					user.set({ userId: result.userId, email });
				}
			} catch (profileErr) {
				// If profile fetch fails, still allow login (cookies are set)
				user.set({ userId: result.userId, email });
			}
			
			// Redirect to return URL (or home page if not specified)
			// Decode the return URL in case it was encoded
			const redirectUrl = decodeURIComponent(returnTo);
			window.location.href = redirectUrl;
		} catch (err) {
			console.error('Login error:', err);
			error = err.message || 'Login failed. Please check your credentials.';
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Login - Quick Gadgets</title>
</svelte:head>

<div class="max-w-md mx-auto mt-12">
	<div class="bg-white rounded-lg shadow-lg p-8">
		<h1 class="text-2xl font-bold mb-6 text-center">Login</h1>

		{#if error}
			<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
				{error}
			</div>
		{/if}

		<form on:submit|preventDefault={handleLogin}>
			<div class="mb-4">
				<label for="email" class="block text-gray-700 font-semibold mb-2">
					Email
				</label>
				<input
					type="email"
					id="email"
					bind:value={email}
					required
					class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			<div class="mb-6">
				<label for="password" class="block text-gray-700 font-semibold mb-2">
					Password
				</label>
				<input
					type="password"
					id="password"
					bind:value={password}
					required
					class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 rounded-lg font-semibold"
			>
				{loading ? 'Logging in...' : 'Login'}
			</button>
		</form>

		<p class="mt-4 text-center text-gray-600">
			Don't have an account? 
			<a href="/signup" class="text-blue-500 hover:text-blue-700">Sign up</a>
		</p>
	</div>
</div>

