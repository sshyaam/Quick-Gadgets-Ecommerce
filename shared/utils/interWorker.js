/**
 * Inter-worker communication utilities
 * Uses Service Bindings for Cloudflare Workers (required for worker-to-worker calls)
 * Enhanced with OpenTelemetry trace context propagation
 */

import { injectTraceContext } from './otel.js';

/**
 * Make a request to another worker using Service Binding
 * Automatically propagates trace context for distributed tracing
 * @param {Fetcher} serviceBinding - Service binding from env (e.g., env.pricing_worker)
 * @param {string} path - Path to call (e.g., '/products')
 * @param {Object} options - Request options
 * @param {string} apiKey - API key for authentication
 * @returns {Promise<Response>} Response from the worker
 */
export async function callWorkerBinding(serviceBinding, path, options = {}, apiKey) {
  if (!serviceBinding) {
    throw new Error('Service binding is required for inter-worker communication');
  }

  // For service bindings, we can use any URL - the path is what matters
  // The URL host doesn't matter when using service bindings
  const url = `https://workers.dev${path.startsWith('/') ? path : '/' + path}`;
  
  // Build headers
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-Worker-Request': 'true',
    'Accept': 'application/json',
    ...(options.headers || {}),
  });

  // Inject trace context for distributed tracing
  // This ensures the entire transaction shows as one trace in Honeycomb
  injectTraceContext(headers);

  // Build request
  const request = new Request(url, {
    method: options.method || 'GET',
    headers,
    ...(options.body && { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }),
  });

  // Use service binding to call the worker directly
  const response = await serviceBinding.fetch(request);
  
  return response;
}

/**
 * Make a GET request using Service Binding
 * @param {Fetcher} serviceBinding - Service binding
 * @param {string} path - Path to call
 * @param {Object} queryParams - Query parameters
 * @param {string} apiKey - API key
 * @returns {Promise<Response>} Response
 */
export async function getWorkerBinding(serviceBinding, path, queryParams = {}, apiKey) {
  const url = new URL(path, 'https://workers.dev');
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  });
  
  return callWorkerBinding(serviceBinding, url.pathname + url.search, { method: 'GET' }, apiKey);
}

/**
 * Make a POST request using Service Binding
 * @param {Fetcher} serviceBinding - Service binding
 * @param {string} path - Path to call
 * @param {Object} body - Request body
 * @param {string} apiKey - API key
 * @returns {Promise<Response>} Response
 */
export async function postWorkerBinding(serviceBinding, path, body, apiKey) {
  return callWorkerBinding(
    serviceBinding,
    path,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    apiKey
  );
}

/**
 * Validate API key from request headers
 * @param {Request} request - Incoming request
 * @param {string} expectedApiKey - Expected API key from secrets
 * @returns {boolean} True if valid
 */
export function validateApiKey(request, expectedApiKey) {
  const apiKey = request.headers.get('X-API-Key');
  const workerRequest = request.headers.get('X-Worker-Request');
  return apiKey === expectedApiKey && workerRequest === 'true';
}

/**
 * Make a request to another worker using HTTP fetch (for backwards compatibility)
 * @deprecated Use Service Bindings instead (getWorkerBinding, postWorkerBinding)
 * @param {string} workerUrl - URL of the target worker
 * @param {Object} options - Request options
 * @param {string} apiKey - API key for authentication
 * @returns {Promise<Response>} Response from the worker
 */
export async function callWorker(workerUrl, options = {}, apiKey) {
  if (!apiKey) {
    throw new Error('API key is required for inter-worker communication');
  }

  const url = new URL(workerUrl);
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-Worker-Request': 'true',
    'Accept': 'application/json',
    ...(options.headers || {}),
  });

  // Inject trace context for distributed tracing
  injectTraceContext(headers);

  const requestOptions = {
    method: options.method || 'GET',
    headers,
    ...(options.body && { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }),
  };

  const response = await fetch(url.toString(), requestOptions);
  return response;
}
