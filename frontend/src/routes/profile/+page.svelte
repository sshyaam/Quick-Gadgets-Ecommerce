<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores';
	import { authApi } from '$lib/api';

	let profile = null;
	let loading = true;
	let error = null;
	let message = null;
	let editingField = null;
	let editingAddress = null;
	
	// Form state for adding/editing address
	let showAddressForm = false;
	let addressForm = {
		name: '',
		contactNumber: '',
		doorNumber: '',
		street: '',
		area: '',
		pincode: '',
		city: '',
		state: ''
	};
	
	// Address form validation errors
	let addressErrors = {};
	
	// Image upload
	let imageInput = null;
	let imagePreview = null;
	let uploadingImage = false;

	onMount(async () => {
		await loadProfile();
	});

	async function loadProfile() {
		loading = true;
		error = null;
		try {
			profile = await authApi.getProfile();
			if (!profile) {
				goto('/login');
				return;
			}
			// Initialize savedAddresses if it doesn't exist
			if (!profile.savedAddresses) {
				profile.savedAddresses = [];
			}
			// Update user store
			user.set(profile);
		} catch (err) {
			console.error('Error loading profile:', err);
			error = err.message || 'Failed to load profile';
		} finally {
			loading = false;
		}
	}

	async function updateProfile(updates) {
		try {
			profile = await authApi.updateProfile(updates);
			user.set(profile);
			editingField = null;
			error = null;
			message = null;
		} catch (err) {
			console.error('Error updating profile:', err);
			error = err.message || 'Failed to update profile';
			message = null;
		}
	}

	function startEdit(field) {
		editingField = field;
	}

	function cancelEdit() {
		editingField = null;
		editingAddress = null;
		showAddressForm = false;
		resetAddressForm();
	}

	function resetAddressForm() {
		addressForm = {
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

	function startAddAddress() {
		editingAddress = null;
		resetAddressForm();
		showAddressForm = true;
		error = null;
	}

	function startEditAddress(address) {
		editingAddress = address;
		addressForm = {
			name: address.name || '',
			contactNumber: address.contactNumber || '',
			doorNumber: address.doorNumber || '',
			street: address.street || '',
			area: address.area || '',
			pincode: address.pincode || '',
			city: address.city || '',
			state: address.state || ''
		};
		addressErrors = {};
		showAddressForm = true;
		error = null;
	}

	async function saveAddress() {
		// Clear previous errors
		addressErrors = {};
		error = null;
		
		try {
			if (editingAddress) {
				// Update existing address
				profile = await authApi.updateSavedAddress(editingAddress.addressId, addressForm);
			} else {
				// Add new address
				profile = await authApi.addSavedAddress(addressForm);
			}
			user.set(profile);
			showAddressForm = false;
			editingAddress = null;
			resetAddressForm();
		} catch (err) {
			console.error('Error saving address:', err);
			
			// Parse validation errors from response
			try {
				// Try to parse error message as JSON (if it's a JSON string)
				let errorData;
				try {
					errorData = JSON.parse(err.message);
				} catch (e) {
					// If not JSON, try to extract from error object directly
					errorData = err.message || {};
				}
				
				// Check if error has details array (from backend ValidationError)
				if (errorData.details && Array.isArray(errorData.details)) {
					// Map validation errors to field-specific errors
					errorData.details.forEach(detail => {
						const path = detail.path || [];
						const field = Array.isArray(path) ? path[0] : path;
						if (field) {
							addressErrors[field] = detail.message || detail.message;
						}
					});
				}
				// Also set general error message
				error = errorData.message || errorData.error?.message || 'Failed to save address. Please check the form for errors.';
			} catch (parseErr) {
				console.error('Error parsing validation errors:', parseErr);
				// If error message is not JSON, use it directly
				if (err.message.includes('VALIDATION_ERROR') || err.message.includes('validation')) {
					error = 'Validation failed. Please check all required fields are filled correctly.';
				} else {
					error = err.message || 'Failed to save address';
				}
			}
		}
	}
	
	function handleImageSelect(event) {
		const file = event.target.files?.[0];
		if (!file) return;
		
		// Validate file type
		if (!file.type.startsWith('image/')) {
			error = 'Please select a valid image file';
			return;
		}
		
		// Validate file size (max 2MB)
		if (file.size > 2 * 1024 * 1024) {
			error = 'Image size must be less than 2MB';
			return;
		}
		
		// Read file as data URL
		const reader = new FileReader();
		reader.onload = (e) => {
			imagePreview = e.target.result;
		};
		reader.readAsDataURL(file);
	}
	
	async function uploadImage() {
		if (!imagePreview) return;
		
		uploadingImage = true;
		error = null;
		message = null;
		try {
			profile = await authApi.updateProfile({ profileImage: imagePreview });
			user.set(profile);
			error = null;
			message = 'Profile image uploaded successfully!';
			setTimeout(() => message = null, 3000);
			// Reset image input and preview
			if (imageInput) {
				imageInput.value = '';
			}
			imagePreview = null;
		} catch (err) {
			console.error('Error uploading image:', err);
			error = err.message || 'Failed to upload image';
			message = null;
		} finally {
			uploadingImage = false;
		}
	}
	
	function removeImage() {
		imagePreview = null;
		if (imageInput) {
			imageInput.value = '';
		}
	}
	
	async function deleteProfileImage() {
		if (!confirm('Are you sure you want to remove your profile image?')) {
			return;
		}
		
		uploadingImage = true;
		error = null;
		try {
			profile = await authApi.updateProfile({ profileImage: '' });
			user.set(profile);
			imagePreview = null;
			if (imageInput) {
				imageInput.value = '';
			}
			error = null;
			message = 'Profile image removed successfully';
			setTimeout(() => message = '', 3000);
		} catch (err) {
			console.error('Error removing image:', err);
			error = err.message || 'Failed to remove image';
		} finally {
			uploadingImage = false;
		}
	}

	async function deleteAddress(addressId) {
		if (!confirm('Are you sure you want to delete this address?')) {
			return;
		}
		try {
			profile = await authApi.deleteSavedAddress(addressId);
			user.set(profile);
			error = null;
		} catch (err) {
			console.error('Error deleting address:', err);
			error = err.message || 'Failed to delete address';
		}
	}
</script>

<svelte:head>
	<title>My Profile - Quick Gadgets</title>
</svelte:head>

<div class="max-w-4xl mx-auto">
	<h1 class="text-3xl font-bold mb-6">My Profile</h1>

	{#if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			<p class="text-gray-600 mt-4">Loading profile...</p>
		</div>
	{:else if error && !message}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			<p class="font-bold">Error</p>
			<p>{error}</p>
		</div>
	{/if}

	{#if message && !loading}
		<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
			<p class="font-bold">Success</p>
			<p>{message}</p>
		</div>
	{/if}

	{#if !loading && profile}
		<!-- Profile Information -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-xl font-semibold mb-4">Profile Information</h2>
			
			<div class="space-y-4">
				<!-- Profile Image -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-2">Profile Image</label>
					<div class="flex items-center gap-4">
						<div class="relative">
							{#if profile.profileImage || imagePreview}
								<img
									src={imagePreview || profile.profileImage}
									alt="Profile"
									class="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
								/>
							{:else}
								<div class="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300">
									<span class="text-gray-400 text-2xl">👤</span>
								</div>
							{/if}
						</div>
						<div class="flex flex-col gap-2">
							<input
								type="file"
								accept="image/*"
								bind:this={imageInput}
								on:change={handleImageSelect}
								class="text-sm text-gray-600"
								disabled={uploadingImage}
							/>
							<div class="flex gap-2 flex-wrap">
								{#if imagePreview}
									<button
										on:click={uploadImage}
										disabled={uploadingImage}
										class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm disabled:opacity-50"
									>
										{uploadingImage ? 'Uploading...' : 'Save Image'}
									</button>
									<button
										on:click={removeImage}
										disabled={uploadingImage}
										class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm disabled:opacity-50"
									>
										Cancel
									</button>
								{:else if profile.profileImage}
									<button
										on:click={deleteProfileImage}
										disabled={uploadingImage}
										class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-sm disabled:opacity-50"
									>
										{uploadingImage ? 'Removing...' : 'Delete Image'}
									</button>
								{/if}
							</div>
						</div>
					</div>
				</div>
				
				<!-- Email (read-only) -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
					<p class="text-gray-900">{profile.email}</p>
					<p class="text-xs text-gray-500 mt-1">Email cannot be changed</p>
				</div>

				<!-- Name -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
					{#if editingField === 'name'}
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={profile.name}
								class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								on:keydown={(e) => e.key === 'Enter' && updateProfile({ name: profile.name })}
							/>
							<button
								on:click={() => updateProfile({ name: profile.name })}
								class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
							>
								Save
							</button>
							<button
								on:click={cancelEdit}
								class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
							>
								Cancel
							</button>
						</div>
					{:else}
						<div class="flex items-center justify-between">
							<p class="text-gray-900">{profile.name || 'Not set'}</p>
							<button
								on:click={() => startEdit('name')}
								class="text-blue-600 hover:text-blue-800 text-sm"
							>
								Edit
							</button>
						</div>
					{/if}
				</div>

				<!-- Contact Number -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
					{#if editingField === 'contactNumber'}
						<div class="flex gap-2">
							<input
								type="tel"
								bind:value={profile.contactNumber}
								placeholder="10-digit mobile number"
								class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								on:keydown={(e) => e.key === 'Enter' && updateProfile({ contactNumber: profile.contactNumber })}
							/>
							<button
								on:click={() => updateProfile({ contactNumber: profile.contactNumber })}
								class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
							>
								Save
							</button>
							<button
								on:click={cancelEdit}
								class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
							>
								Cancel
							</button>
						</div>
					{:else}
						<div class="flex items-center justify-between">
							<p class="text-gray-900">{profile.contactNumber || 'Not set'}</p>
							<button
								on:click={() => startEdit('contactNumber')}
								class="text-blue-600 hover:text-blue-800 text-sm"
							>
								Edit
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Saved Addresses -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-6">
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-semibold">Saved Addresses</h2>
				<button
					on:click={startAddAddress}
					class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
				>
					+ Add Address
				</button>
			</div>

			{#if showAddressForm}
				<!-- Address Form -->
				<div class="bg-gray-50 rounded-lg p-4 mb-4">
					<h3 class="font-semibold mb-4">
						{editingAddress ? 'Edit Address' : 'Add New Address'}
					</h3>
					{#if error && !Object.keys(addressErrors).length}
						<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
							<p class="font-bold">Error</p>
							<p>{error}</p>
						</div>
					{/if}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								Recipient Name *
							</label>
							<input
								type="text"
								bind:value={addressForm.name}
								class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 {addressErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}"
								required
							/>
							{#if addressErrors.name}
								<p class="text-red-600 text-xs mt-1">{addressErrors.name}</p>
							{/if}
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								Contact Number *
							</label>
							<input
								type="tel"
								bind:value={addressForm.contactNumber}
								placeholder="10-digit mobile number (starts with 6-9)"
								pattern="[6-9]\d{9}"
								maxlength="10"
								class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 {addressErrors.contactNumber ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}"
								required
							/>
							{#if addressErrors.contactNumber}
								<p class="text-red-600 text-xs mt-1">{addressErrors.contactNumber}</p>
							{:else}
								<p class="text-gray-500 text-xs mt-1">Must start with 6, 7, 8, or 9</p>
							{/if}
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								Door/Flat Number *
							</label>
							<input
								type="text"
								bind:value={addressForm.doorNumber}
								class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 {addressErrors.doorNumber ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}"
								required
							/>
							{#if addressErrors.doorNumber}
								<p class="text-red-600 text-xs mt-1">{addressErrors.doorNumber}</p>
							{/if}
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								Street *
							</label>
							<input
								type="text"
								bind:value={addressForm.street}
								class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 {addressErrors.street ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}"
								required
							/>
							{#if addressErrors.street}
								<p class="text-red-600 text-xs mt-1">{addressErrors.street}</p>
							{/if}
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								Area
							</label>
							<input
								type="text"
								bind:value={addressForm.area}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								Pincode *
							</label>
							<input
								type="text"
								bind:value={addressForm.pincode}
								placeholder="6-digit pincode"
								pattern="[1-9][0-9]{5}"
								maxlength="6"
								class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 {addressErrors.pincode ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}"
								required
							/>
							{#if addressErrors.pincode}
								<p class="text-red-600 text-xs mt-1">{addressErrors.pincode}</p>
							{:else}
								<p class="text-gray-500 text-xs mt-1">6-digit Indian pincode</p>
							{/if}
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								City *
							</label>
							<input
								type="text"
								bind:value={addressForm.city}
								class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 {addressErrors.city ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}"
								required
							/>
							{#if addressErrors.city}
								<p class="text-red-600 text-xs mt-1">{addressErrors.city}</p>
							{/if}
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">
								State *
							</label>
							<input
								type="text"
								bind:value={addressForm.state}
								class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 {addressErrors.state ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}"
								required
							/>
							{#if addressErrors.state}
								<p class="text-red-600 text-xs mt-1">{addressErrors.state}</p>
							{/if}
						</div>
					</div>
					<div class="flex gap-2 mt-4">
						<button
							on:click={saveAddress}
							class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
						>
							{editingAddress ? 'Update Address' : 'Add Address'}
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

			<!-- Address List -->
			{#if profile.savedAddresses && profile.savedAddresses.length > 0}
				<div class="space-y-4">
					{#each profile.savedAddresses as address (address.addressId)}
						<div class="border border-gray-200 rounded-lg p-4">
							<div class="flex justify-between items-start">
								<div class="flex-1">
									<h4 class="font-semibold mb-2">{address.name}</h4>
									<p class="text-sm text-gray-600 mb-1">
										{address.doorNumber}, {address.street}
										{#if address.area}, {address.area}{/if}
									</p>
									<p class="text-sm text-gray-600 mb-1">
										{address.city}, {address.state} - {address.pincode}
									</p>
									<p class="text-sm text-gray-600">Contact: {address.contactNumber}</p>
								</div>
								<div class="flex gap-2">
									<button
										on:click={() => startEditAddress(address)}
										class="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
									>
										Edit
									</button>
									<button
										on:click={() => deleteAddress(address.addressId)}
										class="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded"
									>
										Delete
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else if !showAddressForm}
				<p class="text-gray-600 text-center py-8">No saved addresses. Click "Add Address" to add one.</p>
			{/if}
		</div>
	{/if}
</div>

