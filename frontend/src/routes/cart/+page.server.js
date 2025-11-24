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
		
		let cart = await response.json();
		
		// Validate cart on server-side (check for price changes)
		// Only validate if cart has items
		if (cart && cart.items && cart.items.length > 0) {
			try {
				const validateResponse = await fetch('https://cart-worker.shyaamdps.workers.dev/cart/validate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': 'ECOMSECRET',
						'X-Worker-Request': 'true',
						...(accessToken ? { 'Cookie': cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ') } : {}),
						...(authHeader ? { 'Authorization': authHeader } : {})
					},
					credentials: 'include',
					body: JSON.stringify({ cartId: cart.cartId })
				});
				
				if (validateResponse.ok) {
					const validation = await validateResponse.json();
					
					// If cart was updated with new prices, fetch the updated cart
					if (validation.cartUpdated) {
						const updatedCartResponse = await fetch('https://cart-worker.shyaamdps.workers.dev/cart', {
							headers,
							credentials: 'include'
						});
						
						if (updatedCartResponse.ok) {
							cart = await updatedCartResponse.json();
						}
					}
					
					return {
						cart,
						requiresAuth: false,
						priceWarnings: validation.warnings || [],
						validationErrors: validation.errors || []
					};
				}
			} catch (validationError) {
				console.error('Error validating cart:', validationError);
				// Continue with unvalidated cart if validation fails
			}
		}
		
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

