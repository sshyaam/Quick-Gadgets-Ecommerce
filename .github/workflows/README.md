# GitHub Actions CI/CD Workflows

This directory contains GitHub Actions workflows for continuous integration and deployment of Cloudflare Workers.

## Git Hooks (Client-Side Validation)

Before pushing code, commit messages are validated locally using Git hooks. This prevents invalid commits from being created in the first place.

### Setup Git Hooks

Run the setup script to install the hooks:

```bash
./scripts/setup-git-hooks.sh
```

This will install:
- **commit-msg hook**: Validates commit message format before the commit is finalized
- **pre-push hook**: Additional validation before pushing (backup check)

### Commit Message Format

All commits must follow the **Conventional Commit** format (same as CI/CD validation):

```
type: description
```

or with scope:

```
type(scope): description
```

**Allowed Types:**
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes
- `revert`: Revert a previous commit

**Examples:**
- ✅ `feat: add user authentication`
- ✅ `fix(api): resolve timeout issue`
- ✅ `docs: update README`
- ❌ `Added new feature` (missing type)
- ❌ `fix bug` (missing colon)

### Bypassing Hooks (Not Recommended)

If you absolutely need to bypass the hook (not recommended):

```bash
git commit --no-verify -m "your message"
```

**Note:** This will still fail in CI/CD, so it's better to use the correct format.

## Required Secrets

Before using these workflows, you need to configure the following secrets in your GitHub repository:

1. **CLOUDFLARE_API_TOKEN**: Your Cloudflare API token with Workers permissions
   - Generate at: https://dash.cloudflare.com/profile/api-tokens
   - Required permissions: Account.Cloudflare Workers:Edit

2. **CLOUDFLARE_ACCOUNT_ID**: Your Cloudflare account ID
   - Find it in: https://dash.cloudflare.com/
   - Usually visible in the right sidebar

### Setting up Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add both secrets mentioned above

## Workflows

### 1. PR Preview Deployment (`pr-deploy.yml`)

**Triggers:**
- When a pull request is opened
- When a pull request is synchronized (new commits pushed)
- When a pull request is reopened

**Flow:**
1. **Detect Changed Workers**: Analyzes changed files and determines which workers need deployment
2. **Store Current Deployments**: Captures the current active deployment IDs for affected workers only
3. **Lint and Test**: Runs linter (if available) and all unit tests
4. **Deploy to Preview**: If tests pass, deploys only the changed workers to preview/staging
5. **Rollback on Failure**: If tests fail, automatically rolls back only the affected workers

**Note:** Commit message validation is handled locally via Git hooks, not in CI/CD.

**Features:**
- Stores deployment IDs in memory (GitHub Actions artifacts)
- Automatic rollback on test failure
- Preview deployments tagged with PR number

### 2. Production Deployment (`production-deploy.yml`)

**Triggers:**
- When code is pushed to the `main` branch

**Flow:**
1. **Detect Changed Workers**: Analyzes changed files and determines which workers need deployment
2. **Store Production Deployments**: Captures current production deployment IDs and SHAs for affected workers only
3. **Lint and Test**: Runs linter (if available) and all unit tests
4. **Deploy to Production**: If tests pass, deploys only the changed workers to production
5. **Rollback on Failure**: If tests or deployment fail, automatically rolls back only the affected workers

**Note:** Commit message validation is handled locally via Git hooks, not in CI/CD.

**Features:**
- Stores both deployment IDs and commit SHAs
- Production deployments tagged with commit SHA
- Automatic rollback on any failure
- Requires manual approval (if configured in GitHub environments)

## Selective Deployment

The workflows use **intelligent change detection** to only deploy workers that have been modified:

### How It Works

1. **File Change Detection**: Compares changed files between commits
2. **Worker Mapping**: Maps changed files to their respective workers
3. **Selective Deployment**: Only deploys workers with changes

### Change Detection Rules

- **Worker Directory Changes**: If files in `authworker/` change, only `authworker` is deployed
- **Shared Code Changes**: If files in `shared/` change, **all workers** are deployed (since shared code affects all)
- **Package Changes**: If `package.json` or `package-lock.json` change, **all workers** are deployed
- **Config Changes**: If `wrangler.*.toml` changes, the corresponding worker is deployed
- **No Changes**: If no relevant files change, the workflow skips deployment entirely

### Benefits

- ⚡ **Faster Deployments**: Only changed workers are deployed
- 🎯 **Reduced Risk**: Fewer deployments mean fewer opportunities for errors
- 💰 **Cost Efficient**: Less compute time and API calls
- 📊 **Clear Visibility**: Easy to see which workers were affected by changes

### Example Scenarios

**Scenario 1: Single Worker Change**
- Changed: `authworker/services/authService.js`
- Result: Only `authworker` is deployed

**Scenario 2: Shared Code Change**
- Changed: `shared/utils/encryption.js`
- Result: All 11 workers are deployed

**Scenario 3: Package Update**
- Changed: `package.json`
- Result: All 11 workers are deployed

**Scenario 4: Multiple Workers**
- Changed: `authworker/index.js` and `cartworker/index.js`
- Result: Only `authworker` and `cartworker` are deployed

## Worker Deployment Order

When multiple workers are deployed, they follow this order:
1. authworker
2. catalogworker
3. pricingworker
4. fulfillmentworker
5. cartworker
6. paymentworker
7. ordersworker
8. ratingworker
9. realtimeworker
10. logworker
11. healthcheckworker

## Rollback Mechanism

The workflows use Cloudflare's `wrangler rollback` command to revert to previous deployments. The rollback process:

1. Attempts to use stored deployment IDs from before the failed deployment
2. Falls back to automatic rollback (previous deployment) if stored IDs are unavailable
3. Reports success/failure for each worker
4. Exits with error if any worker fails to rollback (requires manual intervention)

## Commit Message Validation

All commits must follow the **Conventional Commit** format:

```
type: description
```

or with scope:

```
type(scope): description
```

### Allowed Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes
- `revert`: Revert a previous commit

### Examples:
✅ **Valid:**
- `feat: add user authentication`
- `fix(api): resolve timeout issue`
- `docs: update README`
- `test: add unit tests for cart service`
- `chore: update dependencies`

❌ **Invalid:**
- `Added new feature`
- `fix bug`
- `Update README`
- `changes`

### Validation:
- **PR Workflow**: Validates PR title and all commit messages in the PR
- **Production Workflow**: Validates the commit message of the push

If validation fails, the workflow will stop and no deployment will occur.

## Testing

The workflows run:
- Commit message validation
- Linter (if `npm run lint` exists in package.json)
- All unit tests via `npm test`

Test results are uploaded as artifacts for review.

## Environment Variables

The workflows use:
- `NODE_VERSION`: '20' (Node.js version)
- `WRANGLER_VERSION`: '3.78.0' (Wrangler CLI version)

## Troubleshooting

### Deployment Failures

If a deployment fails:
1. Check the workflow logs for specific error messages
2. Verify Cloudflare API token has correct permissions
3. Ensure all wrangler config files are valid
4. Check if any workers have dependency issues

### Rollback Failures

If rollback fails:
1. Check if previous deployments exist in Cloudflare dashboard
2. Verify deployment IDs were stored correctly
3. Manually rollback via Cloudflare dashboard if needed

### Test Failures

If tests fail:
1. Review test output in workflow logs
2. Check for flaky tests or environment issues
3. Verify all dependencies are installed correctly

## Manual Deployment

If you need to deploy manually:

```bash
# Install dependencies
npm ci

# Install Wrangler
npm install -g wrangler@3.78.0

# Authenticate
wrangler login

# Deploy all workers
./scripts/deploy-all-workers.sh
```

## Notes

- Preview deployments use the same worker names as production (Cloudflare Workers don't have built-in preview environments)
- Consider using different worker names or environments for preview deployments if needed
- Deployment IDs are stored in GitHub Actions artifacts for 1 day (PR) or 30 days (production)
- The workflows assume all workers are in the same Cloudflare account

