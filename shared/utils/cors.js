/**
 * CORS utility for Cloudflare Workers
 */

/**
 * Add CORS headers to response
 * @param {Response} response - Response object
 * @param {Request} request - Request object (for origin)
 * @returns {Response} Response with CORS headers
 */
export function addCorsHeaders(response, request) {
  const origin = request.headers.get('Origin');
  const headers = new Headers(response.headers);
  
  // Allow all origins for now - set exact origin if provided, otherwise allow all
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  
  // Always allow credentials
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Worker-Request, Accept, Origin');
  headers.set('Access-Control-Expose-Headers', 'Set-Cookie');
  headers.set('Access-Control-Max-Age', '86400');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle OPTIONS preflight request
 * @param {Request} request - Request object
 * @returns {Response} Preflight response
 */
export function handleOptions(request) {
  const origin = request.headers.get('Origin');
  const headers = new Headers();
  
  // Allow all origins for now
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Worker-Request, Accept, Origin');
  headers.set('Access-Control-Expose-Headers', 'Set-Cookie');
  headers.set('Access-Control-Max-Age', '86400');
  
  return new Response(null, { status: 204, headers });
}

