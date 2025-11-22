#!/bin/bash

# Verify Git Hooks Script
# This script verifies that Git hooks are properly installed and will be called

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Verifying Git Hooks Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo -e "${RED}❌ Error: Not in a git repository${NC}"
  exit 1
fi

# Check if hooks are installed
if [ ! -f ".git/hooks/commit-msg" ]; then
  echo -e "${RED}❌ Error: commit-msg hook not found${NC}"
  echo "Run: ./scripts/setup-git-hooks.sh"
  exit 1
fi

echo -e "${GREEN}✅ commit-msg hook is installed${NC}"

# Check if hook is executable
if [ ! -x ".git/hooks/commit-msg" ]; then
  echo -e "${YELLOW}⚠️  Hook is not executable, fixing...${NC}"
  chmod +x .git/hooks/commit-msg
  echo -e "${GREEN}✅ Made hook executable${NC}"
else
  echo -e "${GREEN}✅ Hook is executable${NC}"
fi

# Check Git hooks path configuration
HOOKS_PATH=$(git config --get core.hooksPath 2>/dev/null || echo "")
if [ -n "$HOOKS_PATH" ]; then
  echo -e "${BLUE}ℹ️  Git hooks path: ${HOOKS_PATH}${NC}"
  if [ "$HOOKS_PATH" != ".git/hooks" ]; then
    echo -e "${YELLOW}⚠️  Warning: Hooks path is set to ${HOOKS_PATH}, but hooks are in .git/hooks${NC}"
  fi
else
  echo -e "${GREEN}✅ Using default hooks path (.git/hooks)${NC}"
fi

echo ""
echo -e "${BLUE}Testing hook functionality...${NC}"

# Test with temporary file (simulating Git's behavior)
TMPFILE=$(mktemp)
echo "invalid message" > "$TMPFILE"

if .git/hooks/commit-msg "$TMPFILE" 2>&1 >/dev/null; then
  echo -e "${RED}❌ FAILED: Hook should reject invalid message${NC}"
  rm "$TMPFILE"
  exit 1
else
  echo -e "${GREEN}✅ Hook correctly rejects invalid messages${NC}"
fi

rm "$TMPFILE"

# Test valid message
TMPFILE=$(mktemp)
echo "feat: test valid message" > "$TMPFILE"

if .git/hooks/commit-msg "$TMPFILE" 2>&1 >/dev/null; then
  echo -e "${GREEN}✅ Hook correctly accepts valid messages${NC}"
else
  echo -e "${RED}❌ FAILED: Hook should accept valid message${NC}"
  rm "$TMPFILE"
  exit 1
fi

rm "$TMPFILE"

echo ""
echo -e "${GREEN}✅ All checks passed!${NC}"
echo ""
echo -e "${BLUE}The hook is properly installed and will be called by Git.${NC}"
echo ""
echo -e "${YELLOW}Note:${NC} If you're using a Git GUI or IDE, it might bypass hooks."
echo -e "      Make sure your Git client is configured to use hooks."
echo ""
echo -e "${BLUE}To test manually:${NC}"
echo "  git commit -m \"invalid message\"     # Should fail ❌"
echo "  git commit -m \"feat: valid message\" # Should succeed ✅"

