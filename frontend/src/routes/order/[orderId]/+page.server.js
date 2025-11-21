export async function load({ params, cookies, fetch, request }) {
	// Check if user is authenticated (has access token cookie OR Authorization header)
	const accessToken = cookies.get('accessToken');
	const authHeader = request.headers.get('authorization');
	
	// If no cookie and no auth header, let client-side handle it (localStorage)
	if (!accessToken && !authHeader) {
		return {
			order: null,
			requiresAuth: false, // Let client-side handle auth check (will check localStorage)
			clientSideAuth: true, // Flag to indicate client-side should check auth
			orderId: params.orderId
		};
	}
	
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

	try {
		const response = await fetch(`https://orders-worker.shyaamdps.workers.dev/order/${params.orderId}`, {
			headers,
			credentials: 'include'
		});
		
		if (!response.ok) {
			if (response.status === 401) {
				return {
					order: null,
					requiresAuth: true,
					orderId: params.orderId
				};
			}
			if (response.status === 404) {
				return {
					order: null,
					notFound: true,
					orderId: params.orderId
				};
			}
			throw new Error(`HTTP ${response.status}`);
		}
		
		const order = await response.json();
		
		// Transform order to match frontend expectations
		const transformedOrder = {
			orderId: order.orderId,
			status: order.status,
			totalAmount: order.totalAmount,
			createdAt: order.createdAt,
			updatedAt: order.updatedAt,
			// Map productData.items to items
			items: order.productData?.items || [],
			// Map shippingData to shippingInfo
			shippingInfo: order.shippingData ? {
				mode: order.shippingData.mode || 'standard',
				cost: order.shippingData.cost || 0,
				estimatedDelivery: order.shippingData.estimatedDelivery || 5,
			} : null,
			// Keep other fields for compatibility
			addressData: order.addressData,
			userData: order.userData,
			productData: order.productData,
			shippingData: order.shippingData,
		};
		
		// Calculate delivery date
		if (transformedOrder.shippingInfo && transformedOrder.createdAt) {
			const deliveryDate = new Date(transformedOrder.createdAt);
			deliveryDate.setDate(deliveryDate.getDate() + (transformedOrder.shippingInfo.estimatedDelivery || 5));
			transformedOrder.deliveryDate = deliveryDate.toISOString().split('T')[0];
		}
		
		return {
			order: transformedOrder,
			requiresAuth: false,
			orderId: params.orderId
		};
	} catch (error) {
		console.error('Error loading order:', error);
		return {
			order: null,
			requiresAuth: false,
			clientSideAuth: true, // Let client-side try
			error: error.message,
			orderId: params.orderId
		};
	}
}

