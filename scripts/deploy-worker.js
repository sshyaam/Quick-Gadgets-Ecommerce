#!/usr/bin/env node

/**
 * Deploy a worker to Cloudflare
 * Supports preview and production deployments
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const WORKER_NAME = process.argv[2];
const ENVIRONMENT = process.argv[3] || 'production'; // 'preview' or 'production'
const WRANGLER_FILE = `wrangler.${WORKER_NAME}.toml`;

if (!WORKER_NAME) {
  console.error('❌ Worker name is required');
  console.error('Usage: node scripts/deploy-worker.js <worker-name> [preview|production]');
  process.exit(1);
}

if (!existsSync(WRANGLER_FILE)) {
  console.error(`❌ Wrangler config file not found: ${WRANGLER_FILE}`);
  process.exit(1);
}

try {
  console.log(`🚀 Deploying ${WORKER_NAME} to ${ENVIRONMENT}...`);
  
  if (ENVIRONMENT === 'preview') {
    // Preview deployment - use preview name suffix
    // Check if preview environment exists in wrangler config, otherwise use name-preview
    const output = execSync(
      `npx wrangler deploy --config ${WRANGLER_FILE} --name ${WORKER_NAME}-preview`,
      { encoding: 'utf-8', stdio: 'inherit' }
    );
    console.log(`✅ ${WORKER_NAME} deployed to preview`);
  } else {
    // Production deployment
    const output = execSync(
      `npx wrangler deploy --config ${WRANGLER_FILE}`,
      { encoding: 'utf-8', stdio: 'inherit' }
    );
    console.log(`✅ ${WORKER_NAME} deployed to production`);
  }
  
  process.exit(0);
} catch (error) {
  console.error(`❌ Failed to deploy ${WORKER_NAME}:`, error.message);
  process.exit(1);
}

