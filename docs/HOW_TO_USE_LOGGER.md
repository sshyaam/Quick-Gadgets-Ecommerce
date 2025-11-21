# How to Use the Logger Between Workers

## Quick Start

### 1. Import the logger utility

```javascript
import { sendLog } from '../../shared/utils/logger.js';
```

### 2. Get log worker binding/URL from environment

In your controller or service function, get the log worker from `env`:

```javascript
// Preferred: Use service binding (avoids error 1042)
const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;

// Get API key
const apiKey = env.INTER_WORKER_API_KEY;
```

### 3. Call sendLog

```javascript
await sendLog(
  logWorkerBindingOrUrl,  // Service binding or URL
  'event',                 // Log level: 'event', 'debug', or 'error'
  'User logged in',        // Log message
  {                        // Metadata (optional)
    userId: user.userId,
    worker: 'auth-worker',
    // Add any additional context here
  },
  apiKey,                  // API key for authentication
  ctx,                     // Execution context (for ctx.waitUntil) - optional
  request                  // HTTP request (for CF Ray ID) - optional
);
```

## Complete Examples

### Example 1: In a Controller (with request and ctx)

```javascript
// In your controller file (e.g., authworker/controllers/authController.js)
import { sendLog } from '../../shared/utils/logger.js';

export async function login(request, env, ctx) {
  try {
    const body = await request.json();
    
    // Get log worker binding
    const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
    const apiKey = env.INTER_WORKER_API_KEY;
    
    // ... your login logic ...
    const result = await authService.login(...);
    
    // Log successful login
    await sendLog(
      logWorkerBindingOrUrl,
      'event',
      'User logged in',
      {
        userId: result.userId,
        worker: 'auth-worker',
        email: body.email, // Optional: add context
      },
      apiKey,
      ctx,        // Pass ctx for async logging
      request     // Pass request for CF Ray ID
    );
    
    return response;
  } catch (error) {
    // Log errors
    const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
    const apiKey = env.INTER_WORKER_API_KEY;
    
    await sendLog(
      logWorkerBindingOrUrl,
      'error',
      'Login failed',
      {
        error: error.message,
        worker: 'auth-worker',
      },
      apiKey,
      ctx,
      request
    );
    
    throw error;
  }
}
```

### Example 2: In a Service Function

```javascript
// In your service file (e.g., authworker/services/authService.js)
import { sendLog } from '../../shared/utils/logger.js';

export async function login(email, password, db, encryptionKey, logWorkerBindingOrUrl, apiKey, ctx = null) {
  // ... authentication logic ...
  
  // Log successful login
  await sendLog(
    logWorkerBindingOrUrl,
    'event',
    'User logged in',
    {
      userId: user.user_id,
      worker: 'auth-worker',
    },
    apiKey,
    ctx  // Note: no request object in service layer
  );
  
  return {
    userId: user.user_id,
    accessToken,
    refreshToken,
  };
}
```

### Example 3: In Order Worker

```javascript
// In ordersworker/controllers/ordersController.js
import { sendLog } from '../../shared/utils/logger.js';

export async function createOrder(request, env, ctx) {
  try {
    const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
    const apiKey = env.INTER_WORKER_API_KEY;
    
    // ... order creation logic ...
    
    // Log order creation
    await sendLog(
      logWorkerBindingOrUrl,
      'event',
      'Order created',
      {
        orderId: order.orderId,
        userId: request.user.userId,
        totalAmount: order.totalAmount,
        worker: 'orders-worker',
      },
      apiKey,
      ctx,
      request
    );
    
    return response;
  } catch (error) {
    // Log error
    await sendLog(
      env.log_worker || env.LOG_WORKER_URL,
      'error',
      'Order creation failed',
      {
        error: error.message,
        userId: request.user?.userId,
        worker: 'orders-worker',
      },
      env.INTER_WORKER_API_KEY,
      ctx,
      request
    );
    
    throw error;
  }
}
```

### Example 4: Debug Logging

```javascript
// For debugging purposes
await sendLog(
  logWorkerBindingOrUrl,
  'debug',
  'Processing payment',
  {
    orderId: order.orderId,
    paymentMethod: 'paypal',
    amount: order.totalAmount,
    worker: 'payment-worker',
  },
  apiKey,
  ctx,
  request
);
```

## Log Levels

- **`'event'`**: Important business events (user login, order created, payment processed)
- **`'debug'`**: Debugging information (processing steps, intermediate states)
- **`'error'`**: Errors and exceptions

## Parameters Explained

1. **`logWorkerBindingOrUrl`**: 
   - Service binding: `env.log_worker` (preferred - avoids error 1042)
   - Fallback URL: `env.LOG_WORKER_URL` (string)
   - Pattern: `env.log_worker || env.LOG_WORKER_URL`

2. **`level`**: 
   - Must be one of: `'event'`, `'debug'`, or `'error'`

3. **`message`**: 
   - Human-readable log message (string)

4. **`metadata`**: 
   - Object with additional context
   - Always include `worker: 'your-worker-name'` for identification
   - Add relevant context (userId, orderId, etc.)

5. **`apiKey`**: 
   - From `env.INTER_WORKER_API_KEY`
   - Required for authentication

6. **`ctx`** (optional): 
   - Execution context from worker handler
   - Enables `ctx.waitUntil()` for async logging
   - Pass it when available: `async fetch(request, env, ctx)`

7. **`request`** (optional): 
   - HTTP request object
   - Used to extract CF Ray ID for correlation
   - Pass it when available in controllers

## Configuration Required

### 1. Add Service Binding to wrangler.toml

```toml
[[services]]
binding = "log_worker"
service = "log-worker"
```

### 2. Add Environment Variables

```toml
[vars]
LOG_WORKER_URL = "https://log-worker.shyaamdps.workers.dev"
INTER_WORKER_API_KEY = "ECOMSECRET"
```

## Best Practices

### ✅ DO:

1. **Always pass `ctx` when available** - Ensures logs complete even if main request finishes
2. **Include worker name in metadata** - Helps identify which worker generated the log
3. **Use appropriate log levels** - `event` for business events, `error` for errors, `debug` for debugging
4. **Add relevant context** - Include userId, orderId, etc. for better traceability
5. **Don't await in critical paths** - Logging is fire-and-forget, don't block main logic

### ❌ DON'T:

1. **Don't throw errors if logging fails** - Logging failures shouldn't break your app
2. **Don't log sensitive data** - Avoid passwords, tokens, full credit card numbers
3. **Don't log too frequently** - Be selective about what you log
4. **Don't forget to pass `ctx`** - Without it, logs might be cancelled if request finishes early

## Common Patterns

### Pattern 1: Logging in Controllers

```javascript
export async function myHandler(request, env, ctx) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    // ... your logic ...
    
    await sendLog(logWorkerBindingOrUrl, 'event', 'Action completed', {
      worker: 'my-worker',
      // ... context ...
    }, apiKey, ctx, request);
    
    return response;
  } catch (error) {
    await sendLog(logWorkerBindingOrUrl, 'error', 'Action failed', {
      worker: 'my-worker',
      error: error.message,
    }, apiKey, ctx, request);
    
    throw error;
  }
}
```

### Pattern 2: Logging in Services

```javascript
export async function myServiceFunction(data, db, logWorkerBindingOrUrl, apiKey, ctx = null) {
  // ... your logic ...
  
  await sendLog(logWorkerBindingOrUrl, 'event', 'Service action', {
    worker: 'my-worker',
    // ... context ...
  }, apiKey, ctx);
  
  return result;
}
```

### Pattern 3: Fire-and-Forget (No Await)

```javascript
// If you don't want to wait for logging
sendLog(logWorkerBindingOrUrl, 'event', 'Quick log', {
  worker: 'my-worker',
}, apiKey, ctx, request);
// Don't await - continues immediately
```

## Troubleshooting

### Logs Not Appearing

1. **Check service binding**: Ensure `log_worker` is in your `wrangler.toml`
2. **Check API key**: Verify `INTER_WORKER_API_KEY` is set
3. **Check log worker logs**: Look at log-worker's execution logs in Cloudflare dashboard
4. **Use debug endpoint**: `GET /debug/kv-logs` on log-worker to see stored logs

### Error 1042

- This happens when service bindings aren't configured
- Solution: Add `[[services]]` binding in `wrangler.toml`
- The logger automatically falls back to HTTP if binding isn't available

## Example: Adding Logging to a New Worker

1. **Add service binding to wrangler.toml**:
```toml
[[services]]
binding = "log_worker"
service = "log-worker"

[vars]
LOG_WORKER_URL = "https://log-worker.shyaamdps.workers.dev"
INTER_WORKER_API_KEY = "ECOMSECRET"
```

2. **Import in your file**:
```javascript
import { sendLog } from '../../shared/utils/logger.js';
```

3. **Use in your handler**:
```javascript
export async function myHandler(request, env, ctx) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  await sendLog(logWorkerBindingOrUrl, 'event', 'My event', {
    worker: 'my-worker',
  }, apiKey, ctx, request);
  
  // ... rest of your code ...
}
```

