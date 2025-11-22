/**
 * Authentication utilities
 */
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

/**
 * Check if an error is an authentication error
 * @param {Error} error - The error object
 * @returns {boolean} True if it's an authentication error
 */
export function isAuthenticationError(error) {
	if (!error) return false;
	
	// Check status code
	if (error.status === 401) return true;
	
	// Check error code
	if (error.code === 'AUTHENTICATION_ERROR') return true;
	
	// Check error message
	const message = error.message || '';
	if (message.includes('401') || 
	    message.includes('Access token required') || 
	    message.includes('Unauthorized') || 
	    message.includes('AUTHENTICATION_ERROR') ||
	    message.includes('Please log in')) {
		return true;
	}
	
	return false;
}

/**
 * Redirect to login page with return URL
 * @param {string} returnTo - Optional: URL to return to after login (defaults to current page)
 */
export function redirectToLogin(returnTo = null) {
	if (!browser) return;
	
	// Use provided returnTo, or get current page URL from window.location
	const returnUrl = returnTo || (typeof window !== 'undefined' 
		? window.location.pathname + window.location.search 
		: '/');
	
	// Encode the return URL as a query parameter
	const loginUrl = `/login?returnTo=${encodeURIComponent(returnUrl)}`;
	
	goto(loginUrl);
}

