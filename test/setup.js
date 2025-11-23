/**
 * Test setup and mocks for Cloudflare Workers environment
 */

import { beforeEach, afterEach } from 'mocha';

// Mock Cloudflare Workers environment
export function createMockEnv(overrides = {}) {
  const defaultEnv = {
    // Database mocks
    auth_db: createMockD1(),
    catalog_db: createMockD1(),
    pricing_db: createMockD1(),
    fulfillment_db: createMockD1(),
    cart_db: createMockD1(),
    payment_db: createMockD1(),
    orders_db: createMockD1(),
    rating_db: createMockD1(),
    
    // KV mocks
    PRODUCT_CACHE: createMockKV(),
    
    // R2 mocks
    LOG_BUCKET: createMockR2(),
    IMAGE_BUCKET: createMockR2(),
    
    // Environment variables
    JWT_SECRET: 'test-secret-key',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-long!!',
    INTER_WORKER_API_KEY: 'test-api-key',
    LOG_WORKER_URL: 'https://log-worker.test',
    PAYPAL_CLIENT_ID: 'test-paypal-client-id',
    PAYPAL_CLIENT_SECRET: 'test-paypal-secret',
    PAYPAL_BASE_URL: 'https://api-m.sandbox.paypal.com',
    
    // Service bindings (mocked as fetch functions)
    auth_worker: createMockServiceBinding('auth-worker'),
    catalog_worker: createMockServiceBinding('catalog-worker'),
    pricing_worker: createMockServiceBinding('pricing-worker'),
    fulfillment_worker: createMockServiceBinding('fulfillment-worker'),
    cart_worker: createMockServiceBinding('cart-worker'),
    payment_worker: createMockServiceBinding('payment-worker'),
    orders_worker: createMockServiceBinding('orders-worker'),
    rating_worker: createMockServiceBinding('rating-worker'),
    
    // OpenTelemetry (optional)
    HONEYCOMB_API_KEY: 'test-honeycomb-key',
    HONEYCOMB_DATASET: 'test-dataset',
    HONEYCOMB_ENDPOINT: 'https://api.honeycomb.io/v1/traces',
    SERVICE_VERSION: '1.0.0',
    
    ...overrides,
  };
  
  return defaultEnv;
}

// Mock D1 Database
export function createMockD1() {
  const data = new Map();
  const queries = [];
  
  const mockDb = {
    prepare: (query) => {
      queries.push(query);
      return {
        bind: (...args) => ({
          first: async () => {
            // Simple mock - returns null for most queries
            // Tests can override this behavior
            return null;
          },
          run: async () => ({
            success: true,
            meta: {
              changes: 0,
              last_row_id: 0,
            },
          }),
          all: async () => ({
            results: [],
            success: true,
          }),
        }),
        first: async () => null,
        run: async () => ({
          success: true,
          meta: {
            changes: 0,
            last_row_id: 0,
          },
        }),
        all: async () => ({
          results: [],
          success: true,
        }),
      };
    },
    batch: async (operations) => {
      const results = [];
      for (const op of operations) {
        const result = await op.execute();
        results.push(result);
      }
      return results;
    },
    exec: async (sql) => ({
      success: true,
      meta: {
        changes: 0,
      },
    }),
    // Test helpers
    _setData: (key, value) => data.set(key, value),
    _getData: (key) => data.get(key),
    _clearData: () => data.clear(),
    _getQueries: () => [...queries],
    _clearQueries: () => queries.length = 0,
  };
  
  return mockDb;
}

// Mock KV
export function createMockKV() {
  const data = new Map();
  
  return {
    get: async (key, options = {}) => {
      const value = data.get(key);
      if (value === undefined) return null;
      
      if (options.type === 'json') {
        return JSON.parse(value);
      }
      if (options.type === 'arrayBuffer') {
        return new TextEncoder().encode(value).buffer;
      }
      if (options.type === 'stream') {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(value));
            controller.close();
          },
        });
      }
      return value;
    },
    put: async (key, value, options = {}) => {
      if (typeof value === 'object') {
        data.set(key, JSON.stringify(value));
      } else {
        data.set(key, value);
      }
    },
    delete: async (key) => {
      data.delete(key);
    },
    list: async (options = {}) => {
      const keys = Array.from(data.keys())
        .filter(key => {
          if (options.prefix && !key.startsWith(options.prefix)) return false;
          return true;
        })
        .slice(0, options.limit || 1000)
        .map(key => ({ name: key }));
      
      return {
        keys,
        list_complete: true,
        cursor: '',
      };
    },
    // Test helpers
    _setData: (key, value) => data.set(key, value),
    _getData: (key) => data.get(key),
    _clearData: () => data.clear(),
    _getAllData: () => Object.fromEntries(data),
    _setGetResponse: (key, value) => {
      if (value === null) {
        data.delete(key);
      } else {
        data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    },
  };
}

// Mock R2
export function createMockR2() {
  const data = new Map();
  
  return {
    get: async (key) => {
      const value = data.get(key);
      if (!value) return null;
      
      return {
        key,
        body: value.body,
        bodyUsed: false,
        arrayBuffer: async () => value.body,
        text: async () => {
          if (value.body instanceof ArrayBuffer) {
            return new TextDecoder().decode(value.body);
          }
          return value.body;
        },
        json: async () => {
          const text = await (value.body instanceof ArrayBuffer
            ? new TextDecoder().decode(value.body)
            : value.body);
          return JSON.parse(text);
        },
        headers: value.headers || {},
        httpMetadata: value.httpMetadata || {},
        customMetadata: value.customMetadata || {},
        size: value.size || 0,
        etag: value.etag || '',
        uploaded: value.uploaded || new Date(),
        checksums: value.checksums || {},
      };
    },
    put: async (key, value, options = {}) => {
      let body;
      if (value instanceof ReadableStream) {
        const chunks = [];
        const reader = value.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          chunks.push(chunk);
        }
        body = new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], [])).buffer;
      } else if (value instanceof ArrayBuffer) {
        body = value;
      } else if (typeof value === 'string') {
        body = new TextEncoder().encode(value).buffer;
      } else {
        body = new TextEncoder().encode(JSON.stringify(value)).buffer;
      }
      
      data.set(key, {
        body,
        headers: options.httpMetadata || {},
        customMetadata: options.customMetadata || {},
        size: body.byteLength,
        etag: options.etag || `"${crypto.randomUUID()}"`,
        uploaded: new Date(),
      });
      
      return {
        key,
        version: '1',
        etag: data.get(key).etag,
        httpMetadata: data.get(key).headers,
        customMetadata: data.get(key).customMetadata,
        size: data.get(key).size,
        uploaded: data.get(key).uploaded,
      };
    },
    delete: async (key) => {
      data.delete(key);
    },
    list: async (options = {}) => {
      const keys = Array.from(data.keys())
        .filter(key => {
          if (options.prefix && !key.startsWith(options.prefix)) return false;
          return true;
        })
        .slice(0, options.limit || 1000)
        .map(key => ({
          key,
          version: '1',
          size: data.get(key).size,
          etag: data.get(key).etag,
          uploaded: data.get(key).uploaded,
        }));
      
      return {
        objects: keys,
        truncated: false,
        cursor: '',
        delimitedPrefixes: [],
      };
    },
    // Test helpers
    _setData: (key, value) => data.set(key, value),
    _getData: (key) => data.get(key),
    _clearData: () => data.clear(),
    _getPutCalls: () => {
      // Return count of items in data map as proxy for put calls
      return Array.from(data.keys()).map(key => ({ key }));
    },
  };
}

// Mock Service Binding (inter-worker communication)
export function createMockServiceBinding(serviceName) {
  const responses = new Map();
  
  return {
    fetch: async (url, options = {}) => {
      const method = options.method || 'GET';
      let path;
      try {
        // url might be a Request object or a string
        const urlString = url instanceof Request ? url.url : url;
        const urlObj = new URL(urlString);
        path = urlObj.pathname;
      } catch {
        // If URL parsing fails, use the url as-is (might be a path)
        const urlString = url instanceof Request ? url.url : url;
        path = urlString.startsWith('/') ? urlString : `/${urlString}`;
      }
      const key = `${method}:${path}`;
      
      if (responses.has(key)) {
        const responseData = responses.get(key);
        const status = responseData.status || 200;
        let body;
        if (typeof responseData === 'string') {
          body = responseData;
        } else if (responseData.body !== undefined) {
          body = typeof responseData.body === 'string' 
            ? responseData.body 
            : JSON.stringify(responseData.body);
        } else {
          body = JSON.stringify(responseData);
        }
        
        return new Response(body, {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // Default response
      return new Response(
        JSON.stringify({ success: true, service: serviceName }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    },
    // Test helpers
    _setResponse: (method, url, body, options = {}) => {
      let path;
      try {
        const urlObj = new URL(url, 'http://localhost');
        path = urlObj.pathname;
      } catch {
        // If URL parsing fails, use the url as-is (might be a path)
        path = url.startsWith('/') ? url : `/${url}`;
      }
      const key = `${method}:${path}`;
      responses.set(key, { body, status: options.status || 200 });
    },
    _clearResponses: () => responses.clear(),
  };
}

// Mock Request
export function createMockRequest(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    query = {},
  } = options;
  
  const urlObj = new URL(url);
  Object.entries(query).forEach(([key, value]) => {
    urlObj.searchParams.set(key, value);
  });
  
  const requestHeaders = new Headers(headers);
  
  return new Request(urlObj.toString(), {
    method,
    headers: requestHeaders,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
  });
}

// Mock Response
export function createMockResponse(body, options = {}) {
  const {
    status = 200,
    statusText = 'OK',
    headers = {},
  } = options;
  
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    {
      status,
      statusText,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  );
}

// Helper to create a mock D1 with query results
export function createMockD1WithResults(results) {
  const mockDb = createMockD1();
  let resultIndex = 0;
  
  const originalPrepare = mockDb.prepare.bind(mockDb);
  mockDb.prepare = (query) => {
    const result = results[resultIndex] || null;
    resultIndex++;
    
    return {
      bind: (...args) => ({
        first: async () => result,
        run: async () => ({
          success: true,
          meta: {
            changes: result ? 1 : 0,
            last_row_id: 0,
          },
        }),
        all: async () => ({
          results: Array.isArray(result) ? result : (result ? [result] : []),
          success: true,
        }),
      }),
      first: async () => result,
      run: async () => ({
        success: true,
        meta: {
          changes: result ? 1 : 0,
          last_row_id: 0,
        },
      }),
      all: async () => ({
        results: Array.isArray(result) ? result : (result ? [result] : []),
        success: true,
      }),
    };
  };
  
  return mockDb;
}

// Helper to create a mock D1 with multiple query results
export function createMockD1WithSequence(sequence) {
  const mockDb = createMockD1();
  let sequenceIndex = 0;
  
  const originalPrepare = mockDb.prepare.bind(mockDb);
  mockDb.prepare = (query) => {
    const config = sequence[sequenceIndex] || { first: null, run: { success: true, meta: { changes: 0 } }, all: { results: [] } };
    sequenceIndex++;
    
    return {
      bind: (...args) => ({
        first: async () => config.first,
        run: async () => config.run || { success: true, meta: { changes: 0 } },
        all: async () => config.all || { results: [], success: true },
      }),
      first: async () => config.first,
      run: async () => config.run || { success: true, meta: { changes: 0 } },
      all: async () => config.all || { results: [], success: true },
    };
  };
  
  return mockDb;
}

// Global test setup
beforeEach(() => {
  // Reset any global state if needed
});

afterEach(() => {
  // Cleanup after each test
});

