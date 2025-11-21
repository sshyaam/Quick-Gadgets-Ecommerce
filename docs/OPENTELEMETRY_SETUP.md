# OpenTelemetry Setup with Honeycomb

This document explains how OpenTelemetry tracing is implemented in the project and how to configure it.

## Overview

The project uses `@microlabs/otel-cf-workers` and `@opentelemetry/api` to send distributed traces to Honeycomb. Every API request is automatically traced with:

- **Trace IDs**: Generated automatically for each request
- **Span IDs**: Generated for each operation (DB, KV, payment, external calls)
- **CF Ray IDs**: Extracted from Cloudflare headers for correlation
- **Structured Logs**: All logs include trace IDs and CF Ray IDs

## Installation

The required packages are already installed:
- `@microlabs/otel-cf-workers`
- `@opentelemetry/api`

## Configuration

### 1. Set Honeycomb API Key

For each worker, set the Honeycomb API key as a secret:

```bash
# For auth-worker
wrangler secret put HONEYCOMB_API_KEY --config wrangler.authworker.toml

# For payment-worker
wrangler secret put HONEYCOMB_API_KEY --config wrangler.paymentworker.toml

# For other workers (add as needed)
```

### 2. Optional Configuration

You can optionally set these environment variables in `wrangler.*.toml`:

```toml
[vars]
HONEYCOMB_ENDPOINT = "https://api.honeycomb.io/v1/traces"  # Default
HONEYCOMB_DATASET = "worker-name"  # Default: service name
SERVICE_VERSION = "1.0.0"  # Default: 1.0.0
```

Or use secrets:

```bash
wrangler secret put HONEYCOMB_ENDPOINT --config wrangler.authworker.toml
wrangler secret put HONEYCOMB_DATASET --config wrangler.authworker.toml
wrangler secret put SERVICE_VERSION --config wrangler.authworker.toml
```

## Architecture

### Shared Utilities

1. **`shared/utils/otel.js`**: Core OpenTelemetry utilities
   - `getTracer(serviceName)`: Get a tracer instance
   - `getActiveSpan()`: Get the current active span
   - `getTraceContext()`: Get trace ID, span ID, etc.
   - `getCfRayId(request)`: Extract CF Ray ID from request
   - `traceDbOperation()`: Create spans for DB operations
   - `traceKvOperation()`: Create spans for KV operations
   - `traceExternalCall()`: Create spans for external HTTP calls
   - `tracePaymentOperation()`: Create spans for payment operations
   - `injectTraceContext()`: Propagate trace context to other workers
   - `extractTraceContext()`: Extract trace context from incoming requests
   - `createStructuredLog()`: Create structured logs with trace IDs

2. **`shared/utils/tracing.js`**: Worker instrumentation
   - `createOtelConfig()`: Create Honeycomb configuration
   - `instrumentHandler()`: Wrap worker handlers with OpenTelemetry
   - `initRequestTrace()`: Initialize tracing for each request
   - `addTraceHeaders()`: Add trace headers to responses

3. **`shared/utils/logger.js`**: Enhanced logger
   - Automatically includes trace IDs and CF Ray IDs in all logs
   - Accepts optional `request` parameter for CF Ray ID extraction

4. **`shared/utils/database.js`**: Enhanced DB utilities
   - `executeTransaction()`: Automatically creates spans for DB transactions

## Instrumented Workers

### Auth Worker (`authworker/index.js`)

- ✅ Instrumented with OpenTelemetry
- ✅ Structured JSON logging with trace IDs and CF Ray IDs
- ✅ Trace headers added to responses

### Payment Worker (`paymentworker/index.js`)

- ✅ Instrumented with OpenTelemetry
- ✅ PayPal API calls wrapped with spans
  - `paypal.get_access_token`: Token retrieval
  - `paypal.create_order`: Order creation
  - `paypal.check_order_status`: Order status check
  - `paypal.capture_order`: Payment capture

## How to Instrument Additional Workers

### Step 1: Update `index.js`

```javascript
import { instrumentHandler, initRequestTrace, addTraceHeaders } from '../shared/utils/tracing.js';
import { getTraceContext, getCfRayId } from '../shared/utils/otel.js';

const handler = {
  async fetch(request, env, ctx) {
    // Initialize request tracing
    initRequestTrace(request, 'worker-name');
    
    // Log structured JSON with trace IDs
    const traceContext = getTraceContext();
    const cfRayId = getCfRayId(request);
    console.log(JSON.stringify({
      message: `[worker-name] ${request.method} ${new URL(request.url).pathname}`,
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      cfRayId: cfRayId,
      service: 'worker-name',
    }));
    
    try {
      // Your existing router logic
      const response = await router.handle(request, env, ctx);
      
      // Add trace headers
      return addTraceHeaders(response, request);
    } catch (error) {
      const errorResponse = errorHandler(error, request);
      return addTraceHeaders(errorResponse, request);
    }
  },
};

// OpenTelemetry configuration
const otelConfig = (env) => ({
  exporter: {
    url: env.HONEYCOMB_ENDPOINT || 'https://api.honeycomb.io/v1/traces',
    headers: {
      'x-honeycomb-team': env.HONEYCOMB_API_KEY || '',
      'x-honeycomb-dataset': env.HONEYCOMB_DATASET || 'worker-name',
    },
  },
  service: {
    name: 'worker-name',
    version: env.SERVICE_VERSION || '1.0.0',
  },
  fetchInstrumentation: {
    enabled: true,
    propagateTraceContext: true,
  },
});

export default instrumentHandler(handler, otelConfig);
```

### Step 2: Add Honeycomb Secret to `wrangler.*.toml`

```toml
[secrets]
# Honeycomb API key - set via: wrangler secret put HONEYCOMB_API_KEY --config wrangler.workername.toml
# HONEYCOMB_API_KEY
```

Then set the secret:

```bash
wrangler secret put HONEYCOMB_API_KEY --config wrangler.workername.toml
```

### Step 3: Add Spans to Operations

#### DB Operations

```javascript
import { traceDbOperation } from '../shared/utils/otel.js';

// Wrap DB operations
const result = await traceDbOperation(
  'db.query',
  async () => {
    return await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  },
  {
    table: 'users',
    operation: 'select',
    userId: userId,
  }
);
```

#### KV Operations

```javascript
import { traceKvOperation } from '../shared/utils/otel.js';

// Wrap KV operations
const value = await traceKvOperation(
  'kv.get',
  async () => {
    return await kv.get(key);
  },
  {
    key: key,
    namespace: 'cache',
  }
);
```

#### External HTTP Calls

```javascript
import { traceExternalCall } from '../shared/utils/otel.js';

// Wrap external API calls
const response = await traceExternalCall(
  'external.fetch',
  async () => {
    return await fetch(url, options);
  },
  {
    url: url,
    method: 'GET',
    system: 'external-api',
  }
);
```

#### Payment Operations

```javascript
import { tracePaymentOperation } from '../shared/utils/otel.js';

// Wrap payment operations
const result = await tracePaymentOperation(
  'paypal.create_order',
  async () => {
    return await fetch(paypalUrl, options);
  },
  {
    system: 'paypal',
    url: paypalUrl,
    method: 'POST',
    amount: amount,
  }
);
```

### Step 4: Update Logger Calls (Optional)

If you have logger calls, you can optionally pass the `request` object to include CF Ray ID:

```javascript
import { sendLog } from '../shared/utils/logger.js';

await sendLog(
  logWorkerBindingOrUrl,
  'event',
  'Operation completed',
  { userId: userId },
  apiKey,
  ctx,
  request  // Optional: for CF Ray ID extraction
);
```

## Viewing Traces in Honeycomb

1. Log in to [Honeycomb](https://ui.honeycomb.io/)
2. Select your dataset (e.g., `auth-worker`, `payment-worker`)
3. Explore traces:
   - Filter by `cf.ray_id` to find a specific request
   - Filter by `traceId` to see the full distributed trace
   - View spans for DB, KV, payment, and external operations
   - See structured logs with trace IDs

## Trace Propagation

Trace context is automatically propagated:
- **Between workers**: Via service bindings (if configured)
- **To external APIs**: Via HTTP headers (W3C Trace Context format)
- **In responses**: Via `X-Trace-ID`, `X-Span-ID`, and `X-CF-Ray-ID` headers

## Benefits

1. **Distributed Tracing**: See the full request flow across all workers
2. **Performance Monitoring**: Identify slow operations (DB, KV, external calls)
3. **Error Tracking**: See exactly where errors occur in the trace
4. **Correlation**: Link logs, traces, and CF Ray IDs for debugging
5. **Observability**: Understand system behavior in production

## Next Steps

1. ✅ Instrument `auth-worker` and `payment-worker` (done)
2. ⏳ Instrument remaining workers:
   - `orders-worker`
   - `cart-worker`
   - `catalog-worker`
   - `fulfillment-worker`
   - `pricing-worker`
   - `rating-worker`
   - `log-worker`
3. ⏳ Add KV operation tracing where applicable
4. ⏳ Add more detailed spans to existing operations

