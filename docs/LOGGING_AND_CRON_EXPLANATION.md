# Logging System and Cron Triggers Explanation

## Current Logging Architecture

### How Logs Are Stored

1. **Log Reception**: When a worker (e.g., auth-worker) calls `sendLog()`, it sends a POST request to the log-worker's `/log` endpoint
2. **KV Storage**: Each log is stored individually in KV with a unique key: `log:{timestamp}:{randomSuffix}`
3. **Index Maintenance**: An index (`log_keys:index`) maintains a list of all log keys for efficient retrieval
4. **Daily Push**: A cron trigger runs daily at midnight UTC to push all logs from KV to R2
5. **KV Cleanup**: After successful R2 push, all log keys are deleted from KV

### Why Logs Might Not Appear in KV

1. **Service Binding Not Configured**: Check if `log_worker` service binding is configured in your worker's `wrangler.toml`
2. **Fire-and-Forget**: Logs are sent asynchronously using `ctx.waitUntil()`, so they might not complete immediately
3. **KV Namespace Not Bound**: Ensure `log_state` KV namespace is properly bound in `wrangler.logworker.toml`
4. **Errors Silently Swallowed**: Check the worker logs for any errors during log storage

### Debugging Steps

1. **Check Log Worker Logs**: Look at the log-worker's console output to see if logs are being received
2. **Use Debug Endpoint**: Call `GET /debug/kv-logs` on the log-worker (requires API key) to see stored logs
3. **Verify Service Binding**: Ensure `log_worker` is listed in your worker's service bindings
4. **Check KV Namespace**: Verify the KV namespace ID matches in `wrangler.logworker.toml`

## Cron Triggers in Cloudflare Workers

### How Cron Triggers Work

Cron triggers in Cloudflare Workers are **automatically executed by Cloudflare's infrastructure** when your worker is deployed. They do NOT work in local development (`wrangler dev`) - they only run in production.

### Configuration

In `wrangler.logworker.toml`:
```toml
[triggers]
crons = ["0 0 * * *"]  # Runs daily at midnight UTC
```

### Cron Schedule Format

The format is: `minute hour day month weekday`

- `0 0 * * *` - Every day at midnight UTC
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 1` - Every Monday at midnight
- `*/15 * * * *` - Every 15 minutes

### Testing Cron Triggers

Since cron triggers don't work locally, you have two options:

1. **Manual Trigger via Endpoint**: Call the `/flush` endpoint manually to test the push functionality
2. **Deploy and Wait**: Deploy the worker and wait for the cron to trigger (or use Cloudflare's dashboard to trigger it manually)

### Manual Testing

You can manually trigger the daily push by calling:
```bash
curl -X POST https://log-worker.shyaamdps.workers.dev/flush \
  -H "X-API-Key: ECOMSECRET" \
  -H "X-Worker-Request: true"
```

### Cloudflare Dashboard

You can also trigger cron events manually from the Cloudflare Dashboard:
1. Go to Workers & Pages → Your Worker
2. Click on "Triggers" tab
3. You can manually trigger scheduled events

## Troubleshooting

### Logs Not Appearing in KV

1. **Check Service Binding**: Ensure your worker has `log_worker` in its service bindings
2. **Check Log Worker Logs**: Look for errors in the log-worker's execution logs
3. **Verify KV Namespace**: Ensure the KV namespace ID is correct
4. **Test with Debug Endpoint**: Use `GET /debug/kv-logs` to see what's stored

### Cron Not Running

1. **Deploy First**: Cron triggers only work in deployed workers, not in `wrangler dev`
2. **Check Schedule**: Verify the cron expression is correct
3. **Check Dashboard**: Look at the Workers dashboard to see if cron events are being triggered
4. **Manual Test**: Use the `/flush` endpoint to test the functionality

### Common Issues

1. **Error 1042**: This happens when trying to access bindings that don't exist. Ensure all bindings are properly configured.
2. **KV Write Limits**: KV has rate limits. If you're writing too many logs too quickly, some might fail.
3. **Index Size**: The index can grow large. The daily push should clear it, but if it fails, the index might need manual cleanup.

## Best Practices

1. **Monitor Log Worker**: Set up alerts for log worker failures
2. **Test Flush Endpoint**: Regularly test the `/flush` endpoint to ensure it works
3. **Check R2 Storage**: Verify logs are actually being written to R2 after the daily push
4. **Handle Failures**: The system should gracefully handle KV write failures without breaking the main application

