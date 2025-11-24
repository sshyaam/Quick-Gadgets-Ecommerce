<script>
	import { user, cart } from '$lib/stores';
	import { authApi } from '$lib/api';
	import { goto } from '$app/navigation';

	export let checkingAuth = false;

	let cartItemCount = 0;
	
	$: if ($cart && $cart.items) {
		cartItemCount = $cart.items.reduce((sum, item) => sum + item.quantity, 0);
	}

	async function handleLogout() {
		try {
			await authApi.logout();
			user.set(null);
			cart.set(null);
			goto('/');
		} catch (err) {
			console.error('Logout error:', err);
		}
	}
</script>

<nav class="bg-white shadow-md">
	<div class="container mx-auto px-4">
		<div class="flex items-center justify-between h-16">
			<div class="flex items-center space-x-8">
				<a href="/" data-sveltekit-preload-data="off" class="text-xl font-bold text-gray-800">Quick Gadgets</a>
				<a href="/catalog" data-sveltekit-preload-data="off" class="text-gray-600 hover:text-gray-900">Catalog</a>
				{#if $user}
					<a href="/cart" data-sveltekit-preload-data="off" class="text-gray-600 hover:text-gray-900 relative">
						Cart
						{#if cartItemCount > 0}
							<span class="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
								{cartItemCount}
							</span>
						{/if}
					</a>
					<a href="/orders" data-sveltekit-preload-data="off" class="text-gray-600 hover:text-gray-900">Orders</a>
					<a href="/profile" data-sveltekit-preload-data="off" class="text-gray-600 hover:text-gray-900">User</a>
					{#if $user.isAdmin}
						<a href="/admin" data-sveltekit-preload-data="off" class="text-gray-600 hover:text-gray-900 font-semibold">Admin</a>
					{/if}
				{/if}
			</div>
			<div class="flex items-center space-x-4">
				{#if !checkingAuth}
					{#if $user}
						<span class="text-gray-600">Hello, {$user.name || $user.email}</span>
						<button
							on:click={handleLogout}
							class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
						>
							Logout
						</button>
					{:else}
						<a href="/login" data-sveltekit-preload-data="off" class="text-gray-600 hover:text-gray-900">Login</a>
						<a href="/signup" data-sveltekit-preload-data="off" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
							Sign Up
						</a>
					{/if}
				{:else}
					<!-- Show user state if available, otherwise show nothing to prevent flash -->
					{#if $user}
						<span class="text-gray-600">Hello, {$user.name || $user.email}</span>
						<button
							on:click={handleLogout}
							class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
						>
							Logout
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</nav>

