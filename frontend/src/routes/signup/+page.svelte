<script>
	import { goto } from '$app/navigation';
	import { authApi } from '$lib/api';
	import { user } from '$lib/stores';
	import { setAuthTokens } from '$lib/cookies.js';

	let name = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let contactNumber = '';
	
	// Address fields
	let addressName = '';
	let addressContactNumber = '';
	let doorNumber = '';
	let street = '';
	let area = '';
	let pincode = '';
	let city = '';
	let state = '';
	
	let loading = false;
	let error = '';

	async function handleSignup() {
		if (!name || !email || !password || !contactNumber) {
			error = 'Please fill in all required fields';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		// Validate contact number (Indian format)
		if (!/^[6-9]\d{9}$/.test(contactNumber)) {
			error = 'Contact number must be a valid 10-digit Indian mobile number';
			return;
		}

		// Validate address fields (area is optional)
		if (!addressName || !addressContactNumber || !doorNumber || !street || !pincode || !city || !state) {
			error = 'Please fill in all required address fields';
			return;
		}

		// Validate pincode (Indian format)
		if (!/^[1-9][0-9]{5}$/.test(pincode)) {
			error = 'Pincode must be a valid 6-digit Indian pincode';
			return;
		}

		// Validate address contact number
		if (!/^[6-9]\d{9}$/.test(addressContactNumber)) {
			error = 'Address contact number must be a valid 10-digit Indian mobile number';
			return;
		}

		loading = true;
		error = '';
		try {
			const result = await authApi.signup({
				name,
				email,
				password,
				contactNumber,
				address: {
					name: addressName,
					contactNumber: addressContactNumber,
					doorNumber,
					street,
					area: area || undefined,
					pincode,
					city,
					state
				}
			});
			
			// Store tokens in cookies
			setAuthTokens(result);
			
			// Wait a moment for cookies to be set, then fetch profile
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Try to get user profile to set in store
			try {
				const profile = await authApi.getProfile();
				if (profile) {
					user.set(profile);
				} else {
					// Fallback to basic user info
					user.set({ userId: result.userId, name, email });
				}
			} catch (profileErr) {
				// If profile fetch fails, still allow signup (tokens are stored)
				user.set({ userId: result.userId, name, email });
			}
			
			// Reload the page to ensure state is properly set
			window.location.href = '/';
		} catch (err) {
			console.error('Signup error:', err);
			error = err.message || 'Signup failed. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign Up - Quick Gadgets</title>
</svelte:head>

<div class="max-w-2xl mx-auto mt-12">
	<div class="bg-white rounded-lg shadow-lg p-8">
		<h1 class="text-2xl font-bold mb-6 text-center">Sign Up</h1>

		{#if error}
			<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
				{error}
			</div>
		{/if}

		<form on:submit|preventDefault={handleSignup}>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
				<div>
					<label for="name" class="block text-gray-700 font-semibold mb-2">
						Full Name *
					</label>
					<input
						type="text"
						id="name"
						bind:value={name}
						required
						class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label for="email" class="block text-gray-700 font-semibold mb-2">
						Email *
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						required
						class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
				<div>
					<label for="contactNumber" class="block text-gray-700 font-semibold mb-2">
						Contact Number *
					</label>
					<input
						type="tel"
						id="contactNumber"
						bind:value={contactNumber}
						placeholder="10-digit mobile number"
						maxlength="10"
						required
						class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<p class="text-xs text-gray-500 mt-1">e.g., 9876543210</p>
				</div>

				<div>
					<label for="password" class="block text-gray-700 font-semibold mb-2">
						Password *
					</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						required
						minlength="8"
						class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
				<div>
					<label for="confirmPassword" class="block text-gray-700 font-semibold mb-2">
						Confirm Password *
					</label>
					<input
						type="password"
						id="confirmPassword"
						bind:value={confirmPassword}
						required
						minlength="8"
						class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</div>

			<div class="border-t pt-6 mb-6">
				<h2 class="text-xl font-semibold mb-4">Delivery Address</h2>
				
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					<div>
						<label for="addressName" class="block text-gray-700 font-semibold mb-2">
							Recipient Name *
						</label>
						<input
							type="text"
							id="addressName"
							bind:value={addressName}
							required
							class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="addressContactNumber" class="block text-gray-700 font-semibold mb-2">
							Contact Number *
						</label>
						<input
							type="tel"
							id="addressContactNumber"
							bind:value={addressContactNumber}
							placeholder="10-digit mobile number"
							maxlength="10"
							required
							class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					<div>
						<label for="doorNumber" class="block text-gray-700 font-semibold mb-2">
							Door/Flat Number *
						</label>
						<input
							type="text"
							id="doorNumber"
							bind:value={doorNumber}
							required
							class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="street" class="block text-gray-700 font-semibold mb-2">
							Street/Area *
						</label>
						<input
							type="text"
							id="street"
							bind:value={street}
							required
							class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div class="mb-4">
					<label for="area" class="block text-gray-700 font-semibold mb-2">
						Area/Locality (Optional)
					</label>
					<input
						type="text"
						id="area"
						bind:value={area}
						class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
					<div>
						<label for="pincode" class="block text-gray-700 font-semibold mb-2">
							Pincode *
						</label>
						<input
							type="text"
							id="pincode"
							bind:value={pincode}
							placeholder="6-digit pincode"
							maxlength="6"
							required
							class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="city" class="block text-gray-700 font-semibold mb-2">
							City *
						</label>
						<input
							type="text"
							id="city"
							bind:value={city}
							required
							class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="state" class="block text-gray-700 font-semibold mb-2">
							State *
						</label>
						<input
							type="text"
							id="state"
							bind:value={state}
							required
							class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 rounded-lg font-semibold"
			>
				{loading ? 'Signing up...' : 'Sign Up'}
			</button>
		</form>

		<p class="mt-4 text-center text-gray-600">
			Already have an account? 
			<a href="/login" class="text-blue-500 hover:text-blue-700">Login</a>
		</p>
	</div>
</div>
