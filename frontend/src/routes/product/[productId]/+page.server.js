export async function load({ params, fetch }) {
	try {
		const response = await fetch(`https://catalog-worker.shyaamdps.workers.dev/product/${params.productId}`, {
			credentials: 'include'
		});
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		
		const product = await response.json();
		
		return {
			product
		};
	} catch (error) {
		console.error('Error loading product:', error);
		return {
			product: null,
			error: error.message
		};
	}
}

