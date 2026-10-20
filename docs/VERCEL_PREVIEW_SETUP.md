# Vercel Preview-First Deployment Setup

Use this setup so normal GitHub pushes deploy to a preview URL instead of `https://strivoai.net`.

## What this repo now includes

- `.github/workflows/vercel-preview.yml`
  - Auto-deploys **preview** on push to any branch except `main`/`master`
- `.github/workflows/vercel-production-manual.yml`
  - Deploys **production** only when manually triggered in GitHub Actions

## Required GitHub secrets

Add these in GitHub repo settings -> Secrets and variables -> Actions:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

You can get them from:
- `vercel login`
- `vercel link`
- `.vercel/project.json` (or Vercel project settings)

## Important: Avoid accidental production deploys from Vercel Git Integration

If Vercel Git Integration is still enabled with automatic production deploys on `main`, pushing to `main` can still deploy production outside of GitHub Actions.

To make this workflow fully safe, do one of these:

1. Recommended: Keep Vercel Git Integration enabled, but do not push directly to `main`
- Develop on feature branches
- Let preview deploys run automatically
- Merge only after preview verification
- Trigger production manually via the GitHub Action

2. Strictest: Disable Vercel automatic Git deployments
- Use only the GitHub Actions workflows in this repo for preview + production deploys

## Recommended branch safety

- Protect `main` in GitHub (require PRs)
- Do all work on feature branches
- Test on Vercel preview URLs
- Run production deploy manually from `Actions -> Vercel Production Deploy (Manual)`

