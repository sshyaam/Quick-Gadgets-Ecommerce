export async function load({ cookies, fetch, request }) {
	// Check if user is authenticated (has access token cookie OR Authorization header)
	const accessToken = cookies.get('accessToken');
	const authHeader = request.headers.get('authorization');
	
	// If no cookie and no auth header, let client-side handle it (localStorage)
	if (!accessToken && !authHeader) {
		return {
			cart: null,
			requiresAuth: false // Let client-side handle auth check
		};
	}

	try {
		// Build headers for server-side fetch
		const headers = {};
		
		// Add cookie header if available
		if (accessToken) {
			const cookieHeader = cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ');
			if (cookieHeader) {
				headers['Cookie'] = cookieHeader;
			}
		}
		
		// Add Authorization header if available
		if (authHeader) {
			headers['Authorization'] = authHeader;
		}
		
		const response = await fetch('https://cart-worker.shyaamdps.workers.dev/cart', {
			headers,
			credentials: 'include'
		});
		
		if (!response.ok) {
			if (response.status === 401) {
				return {
					cart: null,
					requiresAuth: true
				};
			}
			throw new Error(`HTTP ${response.status}`);
		}
		
		const cart = await response.json();
		
		return {
			cart,
			requiresAuth: false
		};
	} catch (error) {
		console.error('Error loading cart:', error);
		return {
			cart: null,
			requiresAuth: false, // Let client-side handle it
			error: error.message
		};
	}
}

