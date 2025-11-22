#!/bin/bash

# Setup Git Hooks Script
# This script installs the commit message validation hooks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Setting up Git Hooks${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo -e "${RED}❌ Error: Not in a git repository${NC}"
  echo "Please run this script from the root of your git repository"
  exit 1
fi

# Create .git/hooks directory if it doesn't exist
if [ ! -d ".git/hooks" ]; then
  mkdir -p .git/hooks
fi

# Install commit-msg hook
if [ -f "hooks/commit-msg" ]; then
  cp hooks/commit-msg .git/hooks/commit-msg
  chmod +x .git/hooks/commit-msg
  echo -e "${GREEN}✅ Installed commit-msg hook${NC}"
else
  echo -e "${RED}❌ Error: hooks/commit-msg not found${NC}"
  exit 1
fi

# Install pre-push hook
if [ -f "hooks/pre-push" ]; then
  cp hooks/pre-push .git/hooks/pre-push
  chmod +x .git/hooks/pre-push
  echo -e "${GREEN}✅ Installed pre-push hook${NC}"
else
  echo -e "${YELLOW}⚠️  Warning: hooks/pre-push not found (optional)${NC}"
fi

echo ""
echo -e "${GREEN}✅ Git hooks installed successfully!${NC}"
echo ""
echo -e "${BLUE}Hooks installed:${NC}"
echo "  • commit-msg: Validates commit message format before commit"
echo "  • pre-push: Additional validation before push (backup check)"
echo ""
echo -e "${YELLOW}Note:${NC} Commit messages must follow conventional commit format:"
echo "  Format: type: description"
echo "  Example: feat: add user authentication"
echo "  Allowed types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert"

