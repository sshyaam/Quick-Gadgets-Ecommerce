# CI/CD Setup Guide

This project uses GitHub Actions for CI/CD with pre-commit hooks for local validation.

## Quick Setup

Run the setup script:
```bash
./scripts/setup-cicd.sh
```

Or manually:

1. Install dependencies:
```bash
npm install
```

2. Initialize husky (runs automatically via `npm prepare`):
```bash
npm run prepare
```

3. Make scripts executable:
```bash
chmod +x scripts/*.js .husky/pre-commit .husky/commit-msg
```

## Pre-commit Hooks

### What Runs Before Commit

1. **Commit Message Validation**: Ensures commit messages follow conventional commit format
   - Format: `type(scope): subject`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`
   - Examples:
     - `feat: add new feature`
     - `fix: resolve bug in payment`
     - `feat(orders): implement COD payment`

2. **Linting**: Runs ESLint on all JavaScript files
   - Command: `npm run lint`
   - Fix issues: `npm run lint:fix`

3. **Tests**: Runs all test cases
   - Command: `npm test`

## GitHub Actions Workflows

### 1. PR Preview Deployment (`.github/workflows/pr-preview.yml`)

**Triggers**: When a PR is opened, updated, or reopened

**Steps**:
1. Run lint and tests
2. Detect which workers have changed
3. Deploy changed workers to preview environment
4. Health check each deployed worker
5. Rollback if health check fails

### 2. Production Deployment (`.github/workflows/merge-production.yml`)

**Triggers**: When code is merged to `main` branch

**Steps**:
1. Run lint and tests
2. Detect which workers have changed
3. Deploy changed workers to production
4. Health check each deployed worker
5. Rollback if health check fails

## Required GitHub Secrets

Add these secrets to your GitHub repository:

### Required for all deployments:
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Optional (for health checks):
- `AUTH_WORKER_URL`: Production URL for auth-worker
- `AUTH_WORKER_PREVIEW_URL`: Preview URL for auth-worker
- `CART_WORKER_URL`: Production URL for cart-worker
- `CART_WORKER_PREVIEW_URL`: Preview URL for cart-worker
- ... (similar for all other workers)

If URLs are not set, the scripts will use default URLs based on worker names.

## Scripts

### Detect Changed Workers
```bash
npm run detect-changed-workers
```
Outputs JSON array of changed worker names.

### Deploy Worker
```bash
npm run deploy-worker <worker-name> [preview|production]
```
Example:
```bash
npm run deploy-worker ordersworker preview
```

### Health Check
```bash
npm run health-check <worker-name> [preview|production]
```
Example:
```bash
npm run health-check ordersworker production
```

### Rollback Worker
```bash
npm run rollback-worker <worker-name> [preview|production]
```
Example:
```bash
npm run rollback-worker ordersworker production
```

## Workflow

### Development Flow

1. **Before committing**:
   - Pre-commit hooks automatically run lint and tests
   - Commit message is validated

2. **Create PR**:
   - GitHub Actions runs lint and tests
   - Deploys changed workers to preview
   - Health checks preview deployments
   - Rolls back if health check fails

3. **Merge to main**:
   - GitHub Actions runs lint and tests
   - Deploys changed workers to production
   - Health checks production deployments
   - Rolls back if health check fails

## Troubleshooting

### Pre-commit hooks not running
```bash
npm run prepare
chmod +x .husky/pre-commit .husky/commit-msg
```

### Health check fails
- Check worker URLs in GitHub secrets
- Verify workers have `/health` endpoint
- Check Cloudflare deployment status

### Rollback fails
- Manually rollback via Cloudflare dashboard
- Check worker versions: `wrangler versions list --config wrangler.<worker>.toml`

## Notes

- Workers are detected by checking git diff for changes in worker directories
- Changes to `shared/` directory trigger deployment of all workers
- Preview deployments use `--env preview` flag in wrangler
- Production deployments use default wrangler config

