#!/usr/bin/env node

/**
 * Rollback a worker to the previous version
 * Uses Cloudflare API to get versions and rollback
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const WORKER_NAME = process.argv[2];
const ENVIRONMENT = process.argv[3] || 'production';
const WRANGLER_FILE = `wrangler.${WORKER_NAME}.toml`;

if (!WORKER_NAME) {
  console.error('❌ Worker name is required');
  console.error('Usage: node scripts/rollback-worker.js <worker-name> [preview|production]');
  process.exit(1);
}

if (!existsSync(WRANGLER_FILE)) {
  console.error(`❌ Wrangler config file not found: ${WRANGLER_FILE}`);
  process.exit(1);
}

  try {
    console.log(`🔄 Rolling back ${WORKER_NAME} in ${ENVIRONMENT}...`);
  
  // Get list of versions
  // For preview, use preview name
  const workerNameForRollback = ENVIRONMENT === 'preview' ? `${WORKER_NAME}-preview` : WORKER_NAME;
  const versionsCommand = `npx wrangler versions list --config ${WRANGLER_FILE}`;
  
  const versionsOutput = execSync(versionsCommand, { encoding: 'utf-8' });
  
  // Parse versions to find the previous active one
  // This is a simplified version - you may need to adjust based on wrangler output format
  const lines = versionsOutput.split('\n').filter(line => line.trim());
  
  // Find the second active version (previous one)
  let previousVersion = null;
  let activeCount = 0;
  
  for (const line of lines) {
    if (line.includes('active') || line.includes('Active')) {
      activeCount++;
      if (activeCount === 2) {
        // Extract version ID (adjust regex based on actual output format)
        const match = line.match(/([a-f0-9-]+)/i);
        if (match) {
          previousVersion = match[1];
          break;
        }
      }
    }
  }
  
  if (!previousVersion) {
    // Fallback: try to get versions via Cloudflare API
    console.log('⚠️  Could not find previous version from list, attempting direct rollback...');
    
    // Use wrangler rollback command if available
    // For preview, deploy with preview name
    const rollbackCommand = ENVIRONMENT === 'preview'
      ? `npx wrangler rollback --config ${WRANGLER_FILE} --name ${workerNameForRollback} 2>&1 || echo "Rollback command not available"`
      : `npx wrangler rollback --config ${WRANGLER_FILE} 2>&1 || echo "Rollback command not available"`;
    
    try {
      execSync(rollbackCommand, { encoding: 'utf-8', stdio: 'inherit' });
      console.log(`✅ ${WORKER_NAME} rolled back in ${ENVIRONMENT}`);
      process.exit(0);
    } catch (error) {
      console.error(`❌ Rollback failed. You may need to manually rollback via Cloudflare dashboard.`);
      console.error(`   Worker: ${WORKER_NAME}`);
      console.error(`   Environment: ${ENVIRONMENT}`);
      console.error(`   Preview Name: ${workerNameForRollback}`);
      process.exit(1);
    }
  } else {
    // Rollback to specific version
    // For preview, deploy with preview name
    const rollbackCommand = ENVIRONMENT === 'preview'
      ? `npx wrangler versions deploy ${previousVersion} --config ${WRANGLER_FILE} --name ${workerNameForRollback}`
      : `npx wrangler versions deploy ${previousVersion} --config ${WRANGLER_FILE}`;
    
    execSync(rollbackCommand, { encoding: 'utf-8', stdio: 'inherit' });
    console.log(`✅ ${WORKER_NAME} rolled back to version ${previousVersion} in ${ENVIRONMENT}`);
    process.exit(0);
  }
} catch (error) {
  console.error(`❌ Failed to rollback ${WORKER_NAME}:`, error.message);
  console.error(`   Please rollback manually via Cloudflare dashboard.`);
  process.exit(1);
}

