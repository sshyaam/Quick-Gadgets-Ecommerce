/**
 * Cookie utility functions
 * Handles getting, setting, and deleting cookies for authentication
 */

const COOKIE_OPTIONS = {
	accessToken: { name: 'accessToken', maxAge: 15 * 60 }, // 15 minutes
	refreshToken: { name: 'refreshToken', maxAge: 7 * 24 * 60 * 60 }, // 7 days
	sessionId: { name: 'sessionId', maxAge: 7 * 24 * 60 * 60 } // 7 days
};

/**
 * Get a cookie value by name
 * @param {string} name - Cookie name
 * @returns {string|null} - Cookie value or null if not found
 */
export function getCookie(name) {
	if (typeof document === 'undefined') return null;
	
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) {
		return parts.pop().split(';').shift();
	}
	return null;
}

/**
 * Set a cookie
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} maxAge - Max age in seconds
 * @param {object} options - Additional options (path, domain, secure, sameSite)
 */
export function setCookie(name, value, maxAge = null, options = {}) {
	if (typeof document === 'undefined') return;
	
	const defaults = {
		path: '/',
		secure: window.location.protocol === 'https:',
		sameSite: 'Lax',
		...options
	};
	
	let cookieString = `${name}=${encodeURIComponent(value)}`;
	
	if (maxAge !== null) {
		cookieString += `; max-age=${maxAge}`;
	}
	
	if (defaults.path) {
		cookieString += `; path=${defaults.path}`;
	}
	
	if (defaults.domain) {
		cookieString += `; domain=${defaults.domain}`;
	}
	
	if (defaults.secure) {
		cookieString += `; secure`;
	}
	
	if (defaults.sameSite) {
		cookieString += `; samesite=${defaults.sameSite}`;
	}
	
	document.cookie = cookieString;
}

/**
 * Delete a cookie
 * @param {string} name - Cookie name
 * @param {object} options - Cookie options (path, domain)
 */
export function deleteCookie(name, options = {}) {
	if (typeof document === 'undefined') return;
	
	const defaults = {
		path: '/',
		...options
	};
	
	// Set cookie with expiration in the past
	setCookie(name, '', -1, defaults);
}

/**
 * Get access token from cookie
 * @returns {string|null}
 */
export function getAccessToken() {
	return getCookie(COOKIE_OPTIONS.accessToken.name);
}

/**
 * Set access token in cookie
 * @param {string} token - Access token
 */
export function setAccessToken(token) {
	setCookie(
		COOKIE_OPTIONS.accessToken.name,
		token,
		COOKIE_OPTIONS.accessToken.maxAge
	);
}

/**
 * Get refresh token from cookie
 * @returns {string|null}
 */
export function getRefreshToken() {
	return getCookie(COOKIE_OPTIONS.refreshToken.name);
}

/**
 * Set refresh token in cookie
 * @param {string} token - Refresh token
 */
export function setRefreshToken(token) {
	setCookie(
		COOKIE_OPTIONS.refreshToken.name,
		token,
		COOKIE_OPTIONS.refreshToken.maxAge
	);
}

/**
 * Get session ID from cookie
 * @returns {string|null}
 */
export function getSessionId() {
	return getCookie(COOKIE_OPTIONS.sessionId.name);
}

/**
 * Set session ID in cookie
 * @param {string} sessionId - Session ID
 */
export function setSessionId(sessionId) {
	setCookie(
		COOKIE_OPTIONS.sessionId.name,
		sessionId,
		COOKIE_OPTIONS.sessionId.maxAge
	);
}

/**
 * Clear all authentication cookies
 */
export function clearAuthCookies() {
	deleteCookie(COOKIE_OPTIONS.accessToken.name);
	deleteCookie(COOKIE_OPTIONS.refreshToken.name);
	deleteCookie(COOKIE_OPTIONS.sessionId.name);
}

/**
 * Set all authentication tokens from a result object
 * @param {object} result - Object with accessToken, refreshToken, sessionId
 */
export function setAuthTokens(result) {
	if (result.accessToken) {
		setAccessToken(result.accessToken);
	}
	if (result.refreshToken) {
		setRefreshToken(result.refreshToken);
	}
	if (result.sessionId) {
		setSessionId(result.sessionId);
	}
}

