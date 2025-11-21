#!/bin/bash

# Test script to verify logging is working
# This script tests if logs are being sent from auth-worker to log-worker

echo "🔍 Testing Logging System"
echo "=========================="
echo ""

echo "1️⃣  Testing log-worker health endpoint..."
curl -s -X GET https://log-worker.shyaamdps.workers.dev/health | jq .
echo ""

echo "2️⃣  Sending a test log directly to log-worker..."
RESPONSE=$(curl -s -X POST https://log-worker.shyaamdps.workers.dev/log \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ECOMSECRET" \
  -H "X-Worker-Request: true" \
  -d '{
    "level": "event",
    "message": "Test log from script",
    "metadata": {"test": true, "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"},
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "worker": "test-script"
  }')
echo "$RESPONSE" | jq .
echo ""

echo "3️⃣  Testing login endpoint (this should trigger logging)..."
echo "   You need to provide valid credentials for this test"
echo "   Or manually test by:"
echo "   - Opening two terminals"
echo "   - Terminal 1: wrangler tail auth-worker --config wrangler.authworker.toml"
echo "   - Terminal 2: wrangler tail log-worker --config wrangler.logworker.toml"
echo "   - Then try logging in from your frontend"
echo ""

echo "4️⃣  To check KV for stored logs:"
echo "   wrangler kv:key get current_batch --namespace-id=1f34d7f68f1044678a6b97a88f4ccbbe"
echo ""

echo "✅ Test complete!"
echo ""
echo "📋 Next Steps:"
echo "   1. Deploy updated workers:"
echo "      npx wrangler deploy --config wrangler.authworker.toml"
echo "      npx wrangler deploy --config wrangler.logworker.toml"
echo "   2. Run tail commands in separate terminals:"
echo "      Terminal 1: wrangler tail auth-worker --config wrangler.authworker.toml"
echo "      Terminal 2: wrangler tail log-worker --config wrangler.logworker.toml"
echo "   3. Trigger a login from your frontend"
echo "   4. Watch both terminals for [logger] and [logController] messages"

