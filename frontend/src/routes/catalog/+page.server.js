export async function load({ url, fetch }) {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const category = url.searchParams.get('category') || null;
	const search = url.searchParams.get('search') || null;

	try {
		// Use the fetch function provided by SvelteKit for SSR
		const params = new URLSearchParams({ page: String(page), limit: String(limit) });
		if (category) params.append('category', category);
		if (search) params.append('search', search);
		
		const response = await fetch(`https://catalog-worker.shyaamdps.workers.dev/products?${params}`, {
			credentials: 'include'
		});
		
		if (!response.ok) {
			// Try to get error message from response
			let errorMessage = `HTTP ${response.status}`;
			try {
				const errorData = await response.json();
				errorMessage = errorData.error?.message || errorMessage;
			} catch (e) {
				// Ignore JSON parse errors
			}
			// Log error for debugging (can be removed in production)
			// Return empty results instead of throwing
			return {
				products: [],
				pagination: {
					page: page,
					limit: limit,
					total: 0,
					totalPages: 0,
					hasNext: false,
					hasPrev: false
				},
				category,
				search,
				error: errorMessage
			};
		}
		
		const data = await response.json();
		
		const currentPage = data.pagination?.page || data.page || page;
		const totalPages = data.pagination?.totalPages || data.totalPages || 1;
		
		return {
			products: data.products || [],
			pagination: {
				page: currentPage,
				limit: data.pagination?.limit || data.limit || limit,
				total: data.pagination?.total || data.total || 0,
				totalPages: totalPages,
				hasNext: data.pagination?.hasNext ?? (currentPage < totalPages),
				hasPrev: data.pagination?.hasPrev ?? (currentPage > 1)
			},
			category,
			search
		};
	} catch (error) {
		// Log error for debugging (can be removed in production)
		return {
			products: [],
			pagination: {
				page: page,
				limit: limit,
				total: 0,
				totalPages: 0,
				hasNext: false,
				hasPrev: false
			},
			category,
			search,
			error: error.message || 'Failed to load products'
		};
	}
}

