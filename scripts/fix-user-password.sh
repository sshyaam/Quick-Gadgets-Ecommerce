#!/bin/bash

# Script to set password for users without passwords
# Usage: ./scripts/fix-user-password.sh <email> <password>

EMAIL="${1:-shyaam@test.com}"
PASSWORD="${2:-Password}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: $0 <email> <password>"
  echo "Example: $0 shyaam@test.com Password"
  exit 1
fi

echo "Setting password for: $EMAIL"
echo ""

curl -X POST https://auth-worker.shyaamdps.workers.dev/set-password \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "If successful, you can now login with:"
echo "  Email: $EMAIL"
echo "  Password: $PASSWORD"

