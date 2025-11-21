export async function load({ cookies, fetch, request, url }) {
	// Check if user is authenticated (has access token cookie OR Authorization header)
	const accessToken = cookies.get('accessToken');
	const authHeader = request.headers.get('authorization');
	
	// Get filter parameters from URL
	const status = url.searchParams.get('status');
	const dateFrom = url.searchParams.get('dateFrom');
	const dateTo = url.searchParams.get('dateTo');
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '10', 10);
	
	// Build query string for filters
	const filterParams = new URLSearchParams();
	if (status && status !== 'all') filterParams.append('status', status);
	if (dateFrom) filterParams.append('dateFrom', dateFrom);
	if (dateTo) filterParams.append('dateTo', dateTo);
	filterParams.append('page', String(page));
	filterParams.append('limit', String(limit));
	const queryString = filterParams.toString();
	const ordersUrl = `https://orders-worker.shyaamdps.workers.dev/orders?${queryString}`;
	
	// If no cookie and no auth header, let client-side handle it (localStorage)
	// Don't set requiresAuth to true here - let client-side check localStorage first
	if (!accessToken && !authHeader) {
		return {
			orders: null,
			requiresAuth: false, // Let client-side handle auth check (will check localStorage)
			clientSideAuth: true // Flag to indicate client-side should check auth
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
		
		const response = await fetch(ordersUrl, {
			headers,
			credentials: 'include'
		});
		
		if (!response.ok) {
			if (response.status === 401) {
				return {
					orders: null,
					requiresAuth: true
				};
			}
			throw new Error(`HTTP ${response.status}`);
		}
		
		const data = await response.json();
		
		// Backend returns grouped orders as an object, not an array
		return {
			orders: data.orders || {},
			pagination: data.pagination || { page, limit, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
			requiresAuth: false
		};
	} catch (error) {
		console.error('Error loading orders:', error);
		return {
			orders: null,
			requiresAuth: false, // Let client-side handle it
			error: error.message
		};
	}
}
