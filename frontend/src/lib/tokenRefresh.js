/**
 * Token refresh utility
 * Automatically refreshes access tokens before they expire
 */

import { authApi } from './api.js';

const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // Refresh at 14 minutes (1 minute before 15-minute expiry)
let refreshTimer = null;
let isRefreshing = false;
let refreshPromise = null; // Promise that tracks ongoing refresh

/**
 * Decode JWT token to get expiration time
 * Note: This is a simple base64 decode - doesn't verify signature
 */
function getTokenExpiration(token) {
	if (!token) return null;
	
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		
		const payload = JSON.parse(atob(parts[1]));
		return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
	} catch (e) {
		console.error('Error decoding token:', e);
		return null;
	}
}

/**
 * Check if token is expired or will expire soon
 */
function shouldRefreshToken(token) {
	if (!token) return false;
	
	const expiration = getTokenExpiration(token);
	if (!expiration) return true; // If we can't parse, assume it needs refresh
	
	const now = Date.now();
	const timeUntilExpiry = expiration - now;
	
	// Refresh if token expires in less than 2 minutes (120000ms)
	return timeUntilExpiry < 2 * 60 * 1000;
}

/**
 * Refresh the access token
 * Returns a promise that resolves when refresh completes (success or failure)
 * If a refresh is already in progress, returns the existing promise
 */
async function refreshToken() {
	// If refresh is already in progress, return the existing promise
	if (refreshPromise) {
		console.log('[tokenRefresh] Refresh already in progress, waiting...');
		return refreshPromise;
	}
	
	const refreshTokenValue = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
	if (!refreshTokenValue) {
		console.log('[tokenRefresh] No refresh token available');
		const error = new Error('No refresh token available');
		return Promise.reject(error);
	}
	
	isRefreshing = true;
	
	// Create a promise for the refresh operation
	refreshPromise = (async () => {
		try {
			console.log('[tokenRefresh] Refreshing access token...');
			
			const response = await fetch('https://auth-worker.shyaamdps.workers.dev/refresh', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include'
			});
			
			if (response.ok) {
				const data = await response.json();
				
				if (data.accessToken) {
					localStorage.setItem('accessToken', data.accessToken);
					if (data.refreshToken) {
						localStorage.setItem('refreshToken', data.refreshToken);
					}
					console.log('[tokenRefresh] Token refreshed successfully');
					
					// Schedule next refresh
					scheduleRefresh();
					return true;
				} else {
					console.error('[tokenRefresh] No access token in refresh response');
					throw new Error('No access token in refresh response');
				}
			} else {
				const errorText = await response.text().catch(() => '');
				let errorMessage = `Token refresh failed: ${response.status}`;
				try {
					const errorData = JSON.parse(errorText);
					if (errorData.error?.message) {
						errorMessage = errorData.error.message;
					}
				} catch (e) {
					// Ignore JSON parse errors
				}
				console.error('[tokenRefresh]', errorMessage);
				
				// Refresh failed - clear tokens
				if (typeof window !== 'undefined') {
					localStorage.removeItem('accessToken');
					localStorage.removeItem('refreshToken');
					localStorage.removeItem('sessionId');
				}
				throw new Error(errorMessage);
			}
		} catch (error) {
			console.error('[tokenRefresh] Error refreshing token:', error);
			// On error, clear tokens
			if (typeof window !== 'undefined') {
				localStorage.removeItem('accessToken');
				localStorage.removeItem('refreshToken');
				localStorage.removeItem('sessionId');
			}
			throw error;
		} finally {
			isRefreshing = false;
			refreshPromise = null; // Clear the promise when done
		}
	})();
	
	return refreshPromise;
}

/**
 * Check token and refresh if needed
 * Returns a promise that resolves when refresh completes (if needed)
 */
export async function checkAndRefreshToken() {
	if (typeof window === 'undefined') return;
	
	const accessToken = localStorage.getItem('accessToken');
	
	if (!accessToken) {
		return; // No token to refresh
	}
	
	if (shouldRefreshToken(accessToken)) {
		try {
			await refreshToken();
		} catch (error) {
			// Error already logged and tokens cleared in refreshToken()
			// Don't throw here - let the calling code handle 401 errors
			console.warn('[tokenRefresh] Token refresh failed, will need to re-authenticate:', error.message);
		}
	}
}

/**
 * Schedule automatic token refresh
 */
export function scheduleRefresh() {
	// Clear existing timer
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = null;
	}
	
	if (typeof window === 'undefined') return;
	
	const accessToken = localStorage.getItem('accessToken');
	if (!accessToken) {
		return; // No token to schedule refresh for
	}
	
	// Check token expiration and calculate when to refresh
	const expiration = getTokenExpiration(accessToken);
	if (!expiration) {
		// If we can't parse expiration, use default interval
		refreshTimer = setInterval(checkAndRefreshToken, REFRESH_INTERVAL_MS);
		return;
	}
	
	const now = Date.now();
	const timeUntilExpiry = expiration - now;
	
	// Refresh 2 minutes before expiry
	const refreshIn = Math.max(timeUntilExpiry - 2 * 60 * 1000, 0);
	
	console.log(`[tokenRefresh] Scheduling refresh in ${Math.round(refreshIn / 1000 / 60)} minutes`);
	
	// Set timeout for first refresh
	setTimeout(async () => {
		await checkAndRefreshToken();
		// Then set up interval for subsequent refreshes
		refreshTimer = setInterval(checkAndRefreshToken, REFRESH_INTERVAL_MS);
	}, refreshIn);
}

/**
 * Stop automatic token refresh
 */
export function stopRefresh() {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = null;
	}
}

/**
 * Initialize token refresh mechanism
 */
export function initTokenRefresh() {
	if (typeof window === 'undefined') return;
	
	// Check on initialization
	checkAndRefreshToken();
	
	// Schedule periodic refresh
	scheduleRefresh();
	
	// Also check before each API request (via interceptor)
	// This is handled in api.js
}

