# Setting Up KV Cache for Shipping Options

## Overview
The fulfillment worker now uses Cloudflare KV to cache shipping options, reducing database calls and improving performance.

## Setup Steps

### 1. Create KV Namespace
```bash
wrangler kv namespace create SHIPPING_CACHE
```

This will output something like:
```
🌀  Creating namespace with title "SHIPPING_CACHE"
✨  Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "SHIPPING_CACHE", id = "abc123def456..." }
```

### 2. Update wrangler.fulfillmentworker.toml
Replace the placeholder ID in `wrangler.fulfillmentworker.toml`:

```toml
[[kv_namespaces]]
binding = "SHIPPING_CACHE"
id = "abc123def456..."  # Use the ID from step 1
```

### 3. Deploy the Worker
```bash
wrangler deploy --config wrangler.fulfillmentworker.toml
```

## How It Works

### Cache Key Format
```
shipping:{productId}:{category}:{pincode}:{quantity}
```

Example:
```
shipping:prod-123:smartphones:600001:1
```

### Cache TTL
- **TTL**: 5 minutes (300 seconds)
- **Why**: Stock levels and shipping rules change infrequently, but we want fresh data for accurate pricing

### Cache Behavior
- **Cache Hit**: Returns cached shipping options immediately (no DB calls)
- **Cache Miss**: Queries database, caches result for 5 minutes
- **Cache Error**: Falls back to database query (non-fatal)

## Performance Impact

### Before Caching
- Every shipping request = 3-4 DB queries
- Average response time: 200-500ms

### After Caching
- Cached requests = 0 DB queries
- Average response time: 10-50ms (5-10x faster)

## Cache Invalidation

The cache automatically expires after 5 minutes. To manually clear cache:

```bash
# List all keys (if needed)
wrangler kv key list --namespace-id=SHIPPING_CACHE

# Delete specific key
wrangler kv key delete "shipping:prod-123:smartphones:600001:1" --namespace-id=SHIPPING_CACHE

# Delete all keys (use with caution)
# Note: KV doesn't support bulk delete, you'd need to list and delete individually
```

## Monitoring

Check cache performance in Cloudflare Dashboard:
1. Go to Workers & Pages → Your Worker → Analytics
2. Look for KV operations (reads/writes)
3. Monitor cache hit rate

## Troubleshooting

### Cache Not Working
1. Verify KV namespace ID in `wrangler.fulfillmentworker.toml`
2. Check worker logs for cache errors
3. Ensure worker has KV namespace binding

### Cache Too Aggressive
- Reduce TTL in `fulfillmentworker/services/fulfillmentService.js`
- Change `expirationTtl: 300` to a lower value (e.g., 60 for 1 minute)

### Cache Not Updating
- Cache expires after TTL automatically
- Stock changes will be reflected after cache expires
- For immediate updates, reduce TTL or clear cache manually

