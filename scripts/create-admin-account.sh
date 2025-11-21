#!/bin/bash

# Script to create an admin account
# Usage: ./scripts/create-admin-account.sh

EMAIL="${1:-admin@admin.com}"
PASSWORD="${2:-Password}"

echo "Creating admin account..."
echo "  Email: $EMAIL"
echo "  Password: $PASSWORD"
echo ""

# Check if using remote or local
REMOTE_FLAG=""
if [ "$3" == "--remote" ]; then
  REMOTE_FLAG="--remote"
  echo "🌐 Creating account on REMOTE..."
else
  echo "💻 Creating account on LOCAL..."
fi

# Call the auth worker signup endpoint
RESPONSE=$(curl -s -X POST "https://auth-worker.shyaamdps.workers.dev/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"Admin User\",
    \"contactNumber\": \"9876543210\",
    \"address\": {
      \"name\": \"Admin User\",
      \"contactNumber\": \"9876543210\",
      \"doorNumber\": \"1\",
      \"street\": \"Admin Street\",
      \"area\": \"Admin Area\",
      \"pincode\": \"600001\",
      \"city\": \"Mumbai\",
      \"state\": \"Maharashtra\"
    },
    \"isAdmin\": true
  }")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://auth-worker.shyaamdps.workers.dev/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"Admin User\",
    \"contactNumber\": \"9876543210\",
    \"address\": {
      \"name\": \"Admin User\",
      \"contactNumber\": \"9876543210\",
      \"doorNumber\": \"1\",
      \"street\": \"Admin Street\",
      \"area\": \"Admin Area\",
      \"pincode\": \"600001\",
      \"city\": \"Mumbai\",
      \"state\": \"Maharashtra\"
    },
    \"isAdmin\": true
  }")

echo "Response: $RESPONSE"
echo "HTTP Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" == "200" ] || [ "$HTTP_STATUS" == "201" ]; then
  echo "✅ Admin account created successfully!"
  echo ""
  echo "You can now login with:"
  echo "  Email: $EMAIL"
  echo "  Password: $PASSWORD"
else
  echo "⚠️  Account might already exist or there was an error."
  echo "   Try logging in with the credentials above."
fi

