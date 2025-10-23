# Deployment Guide

This repository contains both backend Lambda functions and a Next.js frontend application with independent CI/CD pipelines.

## Repository Structure

```
rift-rewind-hackathon/
├── backend/              # Serverless Lambda functions
│   ├── src/
│   ├── dist/
│   ├── serverless.yml
│   ├── package.json      # Backend dependencies (npm)
│   └── tsconfig.json
├── frontend/             # Next.js application
│   ├── app/
│   ├── package.json      # Frontend dependencies (bun)
│   ├── bun.lock
│   ├── amplify.yml       # AWS Amplify build config
│   └── next.config.ts
└── .github/workflows/
    ├── deploy-backend.yml   # Lambda deployment
    └── deploy-frontend.yml  # Next.js deployment
```

## CI/CD Pipelines

### Backend Pipeline (deploy-backend.yml)

**Triggers:**
- Push to `main` branch (changes in `backend/**`) → Deploys to PROD
- Pull requests (changes in `backend/**`) → Deploys to DEV
- Manual workflow dispatch → Choose stage (dev/prod)

**Process:**
1. Build: Compile TypeScript to JavaScript
2. Test: Run Jest tests
3. Deploy: Use Serverless Framework to deploy Lambda functions

**Key Features:**
- Uses npm for package management
- Caches node_modules for faster builds
- Deploys to API Gateway + Lambda
- Posts deployment info to PR comments

### Frontend Pipeline (deploy-frontend.yml)

**Triggers:**
- Push to `main` branch (changes in `frontend/**`) → Builds for production
- Pull requests (changes in `frontend/**`) → Validates build

**Process:**
1. Build: Compile Next.js application using bun
2. Test: Run tests (when configured)
3. Validate: Ensure build succeeds

**Key Features:**
- Uses bun for faster package installation
- Caches bun dependencies
- Validates build before merge
- AWS Amplify handles actual deployment (see below)

## Package Managers

- **Backend**: npm (standard for serverless)
- **Frontend**: bun (faster installs, compatible with Amplify)

Both have independent `package.json` files to keep dependencies isolated.

## Deploying Backend Locally

```bash
cd backend
npm install
npm run build
npm test

# Deploy to dev
npx serverless deploy --stage dev

# Deploy to prod
npx serverless deploy --stage prod
```

## Running Frontend Locally

```bash
cd frontend
bun install
bun run dev  # Starts on http://localhost:3000
```

## AWS Amplify Setup (Frontend)

### Initial Setup

1. **Connect Repository to Amplify:**
   ```bash
   # Via AWS Console
   - Go to AWS Amplify Console
   - Click "New app" → "Host web app"
   - Connect your GitHub repository
   - Select "frontend" as the app root directory
   - Amplify will detect bun.lock and use bun automatically
   ```

2. **Configure Build Settings:**
   Amplify will auto-detect `frontend/amplify.yml` which contains:
   - Uses bun for installation
   - Runs `bun run build`
   - Caches node_modules and .next/cache

3. **Set Environment Variables in Amplify Console:**
   ```
   NEXT_PUBLIC_USER_POOL_ID=your-cognito-pool-id
   NEXT_PUBLIC_USER_POOL_CLIENT_ID=your-cognito-client-id
   NEXT_PUBLIC_API_ENDPOINT=https://your-api-gateway-url
   NEXT_PUBLIC_REGION=us-west-1
   ```

4. **Configure Branch Settings:**
   - `main` branch → Production deployment
   - PR branches → Automatic preview environments

### Deployment Flow

1. Push to branch → GitHub Actions validates build
2. Amplify detects git push → Automatically deploys
3. Preview URL available for PRs
4. Production URL updates on merge to main

### Bun with Amplify

AWS Amplify **fully supports bun**. It detects `bun.lock` and automatically:
- Installs bun in the build environment
- Uses `bun install` instead of `npm install`
- Runs build commands with bun

## Environment Variables

### Backend (stored in GitHub Secrets)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### Frontend (stored in Amplify Console)
- `NEXT_PUBLIC_USER_POOL_ID` - Cognito User Pool ID
- `NEXT_PUBLIC_USER_POOL_CLIENT_ID` - Cognito App Client ID
- `NEXT_PUBLIC_API_ENDPOINT` - API Gateway base URL
- `NEXT_PUBLIC_REGION` - AWS region (us-west-1)

## Path-Based Deployment Triggers

The workflows use path filters to only deploy when relevant code changes:

- Changes to `backend/**` → Triggers backend deployment only
- Changes to `frontend/**` → Triggers frontend deployment only
- Changes to both → Triggers both deployments independently

This keeps deployments fast and prevents unnecessary builds.

## Workflow Dispatch (Manual Deployment)

### Backend
```bash
# Via GitHub UI
Actions → Deploy Backend (Lambdas) → Run workflow
Select stage: dev or prod
```

### Frontend
```bash
# Via GitHub UI
Actions → Deploy Frontend (Next.js) → Run workflow
# Amplify handles actual deployment
```

## Testing Deployments

### Backend
After PR deployment, check the PR comment for:
- Deployment stage (dev/prod)
- API Gateway base URL
- Available endpoints

### Frontend
After Amplify deployment:
- Check Amplify Console for build status
- Access preview URL from Amplify
- Verify Cognito integration works

## Troubleshooting

### Backend build fails
```bash
cd backend
npm ci
npm run build
npm test
```

### Frontend build fails
```bash
cd frontend
bun install
bun run build
```

### Amplify deployment issues
- Check environment variables are set in Amplify Console
- Verify `frontend/amplify.yml` is correct
- Check build logs in Amplify Console

### Package manager issues
- Backend: Delete `backend/node_modules` and `backend/package-lock.json`, run `npm install`
- Frontend: Delete `frontend/node_modules`, run `bun install`

## Cost Optimization

- Backend deploys are incremental (only changed functions)
- Frontend uses Amplify's CDN caching
- Dev deployments are short-lived
- Path filters prevent unnecessary builds
