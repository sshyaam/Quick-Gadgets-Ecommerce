/**
 * API client for communicating with backend workers
 */

import { checkAndRefreshToken, scheduleRefresh } from './tokenRefresh.js';

const WORKER_URLS = {
	auth: 'https://auth-worker.shyaamdps.workers.dev',
	catalog: 'https://catalog-worker.shyaamdps.workers.dev',
	cart: 'https://cart-worker.shyaamdps.workers.dev',
	orders: 'https://orders-worker.shyaamdps.workers.dev',
	payment: 'https://payment-worker.shyaamdps.workers.dev',
	rating: 'https://rating-worker.shyaamdps.workers.dev',
	fulfillment: 'https://fulfillment-worker.shyaamdps.workers.dev'
};

/**
 * Make an API request with authentication
 * Works in both browser and server contexts
 */
export async function apiRequest(url, options = {}, cookies = null) {
	const headers = {
		'Content-Type': 'application/json',
		...options.headers
	};

	// In server context, manually include cookies
	if (cookies) {
		const cookieHeader = cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ');
		if (cookieHeader) {
			headers['Cookie'] = cookieHeader;
		}
	}

	// In browser context, try to get token from localStorage as fallback
	if (typeof window !== 'undefined') {
		// Check and refresh token proactively before making request
		await checkAndRefreshToken();
		
		const accessToken = localStorage.getItem('accessToken');
		// Always add Authorization header if token exists (as fallback to cookies)
		if (accessToken && !headers['Authorization']) {
			headers['Authorization'] = `Bearer ${accessToken}`;
		}
	}

	const fetchOptions = {
		...options,
		headers,
		// Always include credentials to send cookies
		credentials: 'include'
	};

		try {
			let response = await fetch(url, fetchOptions);

			// Check if response is 401 - try to refresh token
			if (response.status === 401 && typeof window !== 'undefined') {
				// Check if we have a refresh token (either in cookies or localStorage)
				const refreshToken = localStorage.getItem('refreshToken');
				
				if (refreshToken) {
					try {
						// Use centralized refresh function which handles queuing
						// This ensures only one refresh happens at a time
						await checkAndRefreshToken();
						
						// Check if we got a new token after refresh
						const newAccessToken = localStorage.getItem('accessToken');
						if (newAccessToken) {
							// Retry original request with new token
							headers['Authorization'] = `Bearer ${newAccessToken}`;
							fetchOptions.headers = headers;
							response = await fetch(url, fetchOptions);
							
							// If still 401 after refresh, the refresh token is invalid
							if (response.status === 401) {
								console.warn('[apiRequest] Still 401 after refresh, clearing tokens');
								localStorage.removeItem('accessToken');
								localStorage.removeItem('refreshToken');
								localStorage.removeItem('sessionId');
							}
						} else {
							// No new token after refresh attempt - tokens were cleared
							console.warn('[apiRequest] No token after refresh attempt');
						}
					} catch (refreshError) {
						console.error('[apiRequest] Token refresh failed:', refreshError);
						// Tokens already cleared in refreshToken(), just let 401 error propagate
					}
				}
			}

			// Check if response is ok
			if (!response.ok) {
				let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
				let errorCode = null;
				try {
					const errorData = await response.json();
					// If error has details, include them in the message
					if (errorData.error) {
						// Extract error code if present
						errorCode = errorData.error.code || null;
						if (errorData.error.details && Array.isArray(errorData.error.details)) {
							errorMessage = JSON.stringify(errorData.error);
						} else {
							errorMessage = errorData.error.message || errorData.error || errorMessage;
						}
					} else {
						errorMessage = errorData.message || errorMessage;
						errorCode = errorData.code || null;
					}
				} catch (e) {
					// If response is not JSON, use status text
					const text = await response.text().catch(() => '');
					if (text) errorMessage = text;
				}
				const error = new Error(errorMessage);
				// Attach error code and status for better error handling
				if (errorCode) error.code = errorCode;
				error.status = response.status;
				throw error;
			}

		// Handle response body
		const contentType = response.headers.get('content-type');
		if (contentType && contentType.includes('application/json')) {
			const data = await response.json();
			return data;
		}
		
		// If no content-type or not JSON, try to parse as text
		const text = await response.text();
		if (text) {
			try {
				return JSON.parse(text);
			} catch (e) {
				return { message: text };
			}
		}
		
		// Empty response
		return {};
	} catch (error) {
		// Re-throw with better error message
		if (error instanceof TypeError && error.message.includes('fetch')) {
			throw new Error('Network error: Unable to reach server. Please check your connection.');
		}
		throw error;
	}
}

/**
 * Auth API
 */
export const authApi = {
	async signup(data) {
		return apiRequest(`${WORKER_URLS.auth}/signup`, {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	async login(email, password) {
		return apiRequest(`${WORKER_URLS.auth}/login`, {
			method: 'POST',
			body: JSON.stringify({ email, password })
		});
	},

	async logout() {
		return apiRequest(`${WORKER_URLS.auth}/logout`, {
			method: 'POST'
		});
	},

	async refresh() {
		return apiRequest(`${WORKER_URLS.auth}/refresh`, {
			method: 'POST'
		});
	},

	async getProfile() {
		try {
			return await apiRequest(`${WORKER_URLS.auth}/profile`);
		} catch (error) {
			// If 401, user is not authenticated - return null instead of throwing
			if (error.message.includes('401') || 
			    error.message.includes('Unauthorized') || 
			    error.message.includes('Access token required')) {
				return null;
			}
			throw error;
		}
	},

	async updateProfile(data) {
		return apiRequest(`${WORKER_URLS.auth}/profile`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	},

	async addSavedAddress(address) {
		return apiRequest(`${WORKER_URLS.auth}/profile/addresses`, {
			method: 'POST',
			body: JSON.stringify(address)
		});
	},

	async updateSavedAddress(addressId, address) {
		return apiRequest(`${WORKER_URLS.auth}/profile/addresses/${addressId}`, {
			method: 'PUT',
			body: JSON.stringify(address)
		});
	},

	async deleteSavedAddress(addressId) {
		return apiRequest(`${WORKER_URLS.auth}/profile/addresses/${addressId}`, {
			method: 'DELETE'
		});
	}
};

/**
 * Admin API
 */
export const adminApi = {
	// Product management
	async getAllProducts(page = 1, limit = 50, category = null) {
		const params = new URLSearchParams({ page: String(page), limit: String(limit) });
		if (category) params.append('category', category);
		return apiRequest(`${WORKER_URLS.catalog}/admin/products?${params.toString()}`);
	},

	async createProduct(productData) {
		return apiRequest(`${WORKER_URLS.catalog}/admin/products`, {
			method: 'POST',
			body: JSON.stringify(productData)
		});
	},

	async updateProduct(productId, productData) {
		return apiRequest(`${WORKER_URLS.catalog}/admin/products/${productId}`, {
			method: 'PUT',
			body: JSON.stringify(productData)
		});
	},

	async deleteProduct(productId) {
		return apiRequest(`${WORKER_URLS.catalog}/admin/products/${productId}`, {
			method: 'DELETE'
		});
	},

	async restoreProduct(productId) {
		return apiRequest(`${WORKER_URLS.catalog}/admin/products/${productId}/restore`, {
			method: 'POST'
		});
	},

	// Stock management
	async getAllStocks(page = 1, limit = 50) {
		const params = new URLSearchParams({ page: String(page), limit: String(limit) });
		return apiRequest(`${WORKER_URLS.fulfillment}/admin/stocks?${params.toString()}`);
	},

	async updateStock(productId, quantity, warehouseId = 'WH-MUM-001') {
		return apiRequest(`${WORKER_URLS.fulfillment}/admin/stock/${productId}`, {
			method: 'PUT',
			body: JSON.stringify({ quantity, warehouseId })
		});
	},

	async getAllWarehouses() {
		return apiRequest(`${WORKER_URLS.fulfillment}/admin/warehouses`);
	},

	async getAllShippingRules(warehouseId = null, category = null) {
		const params = new URLSearchParams();
		if (warehouseId) params.append('warehouseId', warehouseId);
		if (category) params.append('category', category);
		const queryString = params.toString();
		return apiRequest(`${WORKER_URLS.fulfillment}/admin/shipping-rules${queryString ? '?' + queryString : ''}`);
	},

	// Image management
	async uploadImage(file) {
		const formData = new FormData();
		formData.append('image', file);
		
		// Don't use apiRequest for FormData - it will stringify it
		if (typeof window === 'undefined') {
			throw new Error('Image upload is only available in browser context');
		}

		// Check and refresh token proactively
		await checkAndRefreshToken();
		const accessToken = localStorage.getItem('accessToken');
		
		const headers = {};
		if (accessToken) {
			headers['Authorization'] = `Bearer ${accessToken}`;
		}

		const response = await fetch(`${WORKER_URLS.catalog}/admin/images/upload`, {
			method: 'POST',
			headers,
			body: formData,
		});

		if (!response.ok) {
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
			try {
				const errorData = await response.json();
				errorMessage = errorData.error?.message || errorData.message || errorMessage;
			} catch (e) {
				const text = await response.text().catch(() => '');
				if (text) errorMessage = text;
			}
			throw new Error(errorMessage);
		}

		return await response.json();
	},

	async deleteImage(objectKey) {
		// Extract just the object key part (products/uuid.jpg)
		const keyMatch = objectKey.match(/products\/.+$/);
		if (!keyMatch) {
			throw new Error('Invalid image object key');
		}
		return apiRequest(`${WORKER_URLS.catalog}/admin/images/${keyMatch[0]}`, {
			method: 'DELETE'
		});
	}
};

/**
 * Catalog API
 */
export const catalogApi = {
	async getProducts(page = 1, limit = 20, category = null, search = null) {
		const params = new URLSearchParams({ page: String(page), limit: String(limit) });
		if (category) params.append('category', category);
		if (search) params.append('search', search);
		
		return apiRequest(`${WORKER_URLS.catalog}/products?${params}`);
	},

	async getProduct(productId) {
		return apiRequest(`${WORKER_URLS.catalog}/product/${productId}`);
	}
};

/**
 * Cart API
 */
export const cartApi = {
	async getCart() {
		return apiRequest(`${WORKER_URLS.cart}/cart`);
	},

	async addItem(productId, quantity) {
		return apiRequest(`${WORKER_URLS.cart}/cart/item`, {
			method: 'POST',
			body: JSON.stringify({
				productId,
				quantity
			})
		});
	},

	async updateItem(itemId, quantity) {
		return apiRequest(`${WORKER_URLS.cart}/cart/item/${itemId}`, {
			method: 'PUT',
			body: JSON.stringify({ quantity })
		});
	},

	async removeItem(itemId) {
		return apiRequest(`${WORKER_URLS.cart}/cart/item/${itemId}`, {
			method: 'DELETE'
		});
	},

	async clearCart() {
		return apiRequest(`${WORKER_URLS.cart}/cart`, {
			method: 'DELETE'
		});
	}
};

/**
 * Orders API
 */
export const ordersApi = {
	async getOrders(filters = {}) {
		// Build query string from filters
		const params = new URLSearchParams();
		if (filters.status) params.append('status', filters.status);
		if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
		if (filters.dateTo) params.append('dateTo', filters.dateTo);
		if (filters.page) params.append('page', String(filters.page));
		if (filters.limit) params.append('limit', String(filters.limit));
		
		const queryString = params.toString();
		const url = queryString ? `${WORKER_URLS.orders}/orders?${queryString}` : `${WORKER_URLS.orders}/orders`;
		return apiRequest(url);
	},

	async getOrder(orderId) {
		return apiRequest(`${WORKER_URLS.orders}/order/${orderId}`);
	},

	async createOrder(orderData) {
		return apiRequest(`${WORKER_URLS.orders}/order`, {
			method: 'POST',
			body: JSON.stringify(orderData)
		});
	},

	async capturePayment(orderId, paypalOrderId) {
		return apiRequest(`${WORKER_URLS.orders}/orders/capture`, {
			method: 'POST',
			body: JSON.stringify({
				orderId,
				paypalOrderId
			})
		});
	},

	async rateProduct(orderId, productId, rating, comment) {
		return apiRequest(`${WORKER_URLS.orders}/order/${orderId}/rate`, {
			method: 'POST',
			body: JSON.stringify({ productId, rating, comment })
		});
	}
};

/**
 * Payment API
 */
export const paymentApi = {
	async createPayPalOrder(amount, currency = 'INR') {
		return apiRequest(`${WORKER_URLS.payment}/paypal/create`, {
			method: 'POST',
			body: JSON.stringify({ amount, currency })
		});
	},

	async capturePayPalOrder(orderId) {
		return apiRequest(`${WORKER_URLS.payment}/paypal/capture`, {
			method: 'POST',
			body: JSON.stringify({ orderId })
		});
	}
};

/**
 * Rating API
 */
export const ratingApi = {
	async getRatings(productId) {
		return apiRequest(`${WORKER_URLS.rating}/ratings/${productId}`);
	},

	async getOrderRatings(orderId) {
		return apiRequest(`${WORKER_URLS.rating}/order/${orderId}/ratings`);
	},

	async submitRating(orderId, productId, rating, title, comment) {
		return apiRequest(`${WORKER_URLS.rating}/order/${orderId}/rate`, {
			method: 'POST',
			body: JSON.stringify({ productId, rating, title, comment })
		});
	}
};

/**
 * Fulfillment API
 */
export const fulfillmentApi = {
	async getShippingOptions(productId, category, pincode, city, state) {
		const params = new URLSearchParams({ category });
		if (pincode) params.append('pincode', pincode);
		if (city) params.append('city', city);
		if (state) params.append('state', state);
		
		return apiRequest(`${WORKER_URLS.fulfillment}/shipping/${productId}?${params}`);
	},

	async calculateShipping(category, shippingMode, quantity, address, productId = null) {
		const body = {
			category,
			shippingMode,
			quantity,
			address
		};
		if (productId) {
			body.productId = productId;
		}
		return apiRequest(`${WORKER_URLS.fulfillment}/shipping/calculate`, {
			method: 'POST',
			body: JSON.stringify(body)
		});
	},

	async calculateBatchShipping(items, address) {
		// items should be array of {productId, category, quantity}
		const body = {
			items,
			address
		};
		return apiRequest(`${WORKER_URLS.fulfillment}/shipping/calculate-batch`, {
			method: 'POST',
			body: JSON.stringify(body)
		});
	}
};

