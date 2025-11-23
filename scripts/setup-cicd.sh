#!/bin/bash

# Setup script for CI/CD
# This script sets up pre-commit hooks and installs necessary dependencies

set -e

echo "🚀 Setting up CI/CD..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Setup husky
echo "🐕 Setting up Husky..."
npm run prepare || npx husky install

# Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x scripts/*.js
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg

echo "✅ CI/CD setup complete!"
echo ""
echo "Next steps:"
echo "1. Add GitHub secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID"
echo "2. Optionally add worker URL secrets for health checks"
echo "3. Test pre-commit hooks by making a commit"
echo ""
echo "For more information, see README-CICD.md"

