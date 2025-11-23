#!/usr/bin/env node

/**
 * Detect which workers have changed based on git diff
 * Returns array of worker names that have been modified
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const WORKERS = [
  'authworker',
  'cartworker',
  'catalogworker',
  'fulfillmentworker',
  'healthcheckworker',
  'logworker',
  'ordersworker',
  'paymentworker',
  'pricingworker',
  'ratingworker',
  'realtimeworker',
];

/**
 * Get base branch for comparison
 */
function getBaseBranch() {
  try {
    // Check if we're in a PR context
    const prBase = process.env.GITHUB_BASE_REF || process.env.PR_BASE_REF;
    if (prBase) {
      return prBase;
    }
    
    // Default to main
    return 'main';
  } catch (error) {
    return 'main';
  }
}

/**
 * Get changed files between current branch and base branch
 */
function getChangedFiles(baseBranch = 'main') {
  try {
    // Try to get diff from base branch
    const command = `git diff --name-only origin/${baseBranch}...HEAD 2>/dev/null || git diff --name-only ${baseBranch}...HEAD 2>/dev/null || git diff --name-only HEAD~1 HEAD 2>/dev/null || echo ''`;
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Fallback: check staged files
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf-8', stdio: 'pipe' });
      return output.trim().split('\n').filter(Boolean);
    } catch (e) {
      return [];
    }
  }
}

/**
 * Detect which workers have changed
 */
function detectChangedWorkers() {
  const baseBranch = getBaseBranch();
  const changedFiles = getChangedFiles(baseBranch);
  const changedWorkers = new Set();

  // Check each worker directory
  for (const worker of WORKERS) {
    const workerDir = `${worker}/`;
    const wranglerFile = `wrangler.${worker}.toml`;
    
    // Check if any file in worker directory changed
    const workerChanged = changedFiles.some(file => 
      file.startsWith(workerDir) || 
      file === wranglerFile ||
      file.includes(`/${worker}/`)
    );
    
    // Also check shared directory (affects all workers)
    const sharedChanged = changedFiles.some(file => 
      file.startsWith('shared/')
    );
    
    if (workerChanged) {
      changedWorkers.add(worker);
    }
    
    // If shared changed, mark all workers as changed
    if (sharedChanged) {
      WORKERS.forEach(w => changedWorkers.add(w));
    }
  }

  return Array.from(changedWorkers).sort();
}

/**
 * Main execution
 */
function main() {
  try {
    const changedWorkers = detectChangedWorkers();
    
    if (changedWorkers.length === 0) {
      console.log('[]');
      process.exit(0);
    }
    
    // Output as JSON array
    console.log(JSON.stringify(changedWorkers));
  } catch (error) {
    console.error('Error detecting changed workers:', error.message);
    process.exit(1);
  }
}

main();

