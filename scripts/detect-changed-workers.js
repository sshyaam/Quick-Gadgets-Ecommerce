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
 * For production pushes, uses GitHub event data (before/after commits)
 */
function getChangedFiles(baseBranch = 'main') {
  try {
    // For production pushes, GitHub provides before and after commit SHAs
    const beforeSha = process.env.GITHUB_EVENT_BEFORE;
    const afterSha = process.env.GITHUB_EVENT_AFTER || process.env.GITHUB_SHA;
    
    // If we have before/after SHAs (production push), use them directly
    if (beforeSha && afterSha && beforeSha !== '0000000000000000000000000000000000000000') {
      try {
        const command = `git diff --name-only ${beforeSha} ${afterSha} 2>/dev/null || echo ''`;
        const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
        const files = output.trim().split('\n').filter(Boolean);
        if (files.length > 0) {
          console.log(`[detect-changed-workers] Using GitHub event SHAs: ${beforeSha}..${afterSha}`);
          return files;
        }
      } catch (error) {
        console.warn(`[detect-changed-workers] Failed to use GitHub event SHAs: ${error.message}`);
      }
    }
    
    // For PRs or if event SHAs don't work, try comparing against base branch
    try {
      const command = `git diff --name-only origin/${baseBranch}...HEAD 2>/dev/null || git diff --name-only ${baseBranch}...HEAD 2>/dev/null || echo ''`;
      const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
      const files = output.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        console.log(`[detect-changed-workers] Using branch comparison: origin/${baseBranch}...HEAD`);
        return files;
      }
    } catch (error) {
      console.warn(`[detect-changed-workers] Branch comparison failed: ${error.message}`);
    }
    
    // Fallback: compare against previous commit (for production pushes)
    try {
      const command = `git diff --name-only HEAD~1 HEAD 2>/dev/null || echo ''`;
      const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
      const files = output.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        console.log(`[detect-changed-workers] Using previous commit comparison: HEAD~1..HEAD`);
        return files;
      }
    } catch (error) {
      console.warn(`[detect-changed-workers] Previous commit comparison failed: ${error.message}`);
    }
    
    // Last fallback: check staged files
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf-8', stdio: 'pipe' });
      const files = output.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        console.log(`[detect-changed-workers] Using staged files`);
        return files;
      }
    } catch (e) {
      console.warn(`[detect-changed-workers] Staged files check failed: ${e.message}`);
    }
    
    return [];
  } catch (error) {
    console.error(`[detect-changed-workers] Error getting changed files: ${error.message}`);
    return [];
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

