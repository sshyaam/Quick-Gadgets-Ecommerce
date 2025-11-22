#!/bin/bash

# Test Git Hooks Script
# This script tests if the Git hooks are working correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Testing Git Hooks${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if hooks are installed
if [ ! -f ".git/hooks/commit-msg" ]; then
  echo -e "${RED}❌ Error: Git hooks not installed${NC}"
  echo "Run: ./scripts/setup-git-hooks.sh"
  exit 1
fi

echo -e "${GREEN}✅ Hooks are installed${NC}"
echo ""

# Test invalid commit message
echo -e "${YELLOW}Testing invalid commit message...${NC}"
if echo "invalid message" | .git/hooks/commit-msg /dev/stdin 2>&1 >/dev/null; then
  echo -e "${RED}❌ FAILED: Hook should reject invalid message${NC}"
  exit 1
else
  echo -e "${GREEN}✅ PASSED: Hook correctly rejects invalid message${NC}"
fi
echo ""

# Test valid commit message
echo -e "${YELLOW}Testing valid commit message...${NC}"
if echo "feat: add new feature" | .git/hooks/commit-msg /dev/stdin 2>&1 >/dev/null; then
  echo -e "${GREEN}✅ PASSED: Hook correctly accepts valid message${NC}"
else
  echo -e "${RED}❌ FAILED: Hook should accept valid message${NC}"
  exit 1
fi
echo ""

# Test valid commit message with scope
echo -e "${YELLOW}Testing valid commit message with scope...${NC}"
if echo "fix(api): resolve timeout issue" | .git/hooks/commit-msg /dev/stdin 2>&1 >/dev/null; then
  echo -e "${GREEN}✅ PASSED: Hook correctly accepts valid message with scope${NC}"
else
  echo -e "${RED}❌ FAILED: Hook should accept valid message with scope${NC}"
  exit 1
fi
echo ""

echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo -e "${BLUE}To test manually, try:${NC}"
echo "  git commit -m \"invalid message\"  # Should fail"
echo "  git commit -m \"feat: valid message\"  # Should succeed"

