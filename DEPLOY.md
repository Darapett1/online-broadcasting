# Deploying The Lightbearer

This guide explains how to host the app outside Replit using:

- **GitHub Pages** — serves the React frontend (free, always up)
- **Google Cloud Run** — runs the Express API and WebSocket relay (free tier, no "server down" problem)
- **Supabase** — free PostgreSQL database (replaces Replit's database)
- **Google Cloud Storage** — stores recordings (already used by the app)

---

## What you need before you start

1. A **Google account** (for Google Cloud)
2. A **GitHub account**
3. The code pushed to a GitHub repository

---

## Step 1 — Set up a free database (Supabase)

1. Go to **https://supabase.com** and create a free account
2. Click **New project** — give it any name, pick a region near you, set a password
3. Wait for it to set up (about 1 minute)
4. Go to **Project Settings → Database**
5. Copy the **Connection string (URI)** — it looks like:
   ```
   postgresql://postgres:YOUR_PASSWORD@db.xxxx.supabase.co:5432/postgres
   ```
6. Save this — you will need it as `DATABASE_URL` in the next steps

Then push the database schema to Supabase:

```bash
# In your Replit terminal, run:
DATABASE_URL="your-supabase-connection-string" pnpm --filter @workspace/db run push
```

---

## Step 2 — Deploy the backend to Google Cloud Run

### 2a — Set up Google Cloud

1. Go to **https://console.cloud.google.com**
2. Create a new project (or use an existing one)
3. Enable the following APIs (search for each in the console):
   - **Cloud Run API**
   - **Artifact Registry API**
   - **Cloud Build API**

### 2b — Install Google Cloud CLI (gcloud)

Download from: **https://cloud.google.com/sdk/docs/install**

Then in your terminal:
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2c — Build and deploy

From the root of this repo, run:

```bash
# Replace YOUR_PROJECT_ID with your Google Cloud project ID
gcloud run deploy lightbearer-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars NODE_ENV=production \
  --set-env-vars DATABASE_URL="your-supabase-connection-string" \
  --set-env-vars SESSION_SECRET="pick-a-long-random-string-here" \
  --set-env-vars GROQ_API_KEY="your-groq-api-key" \
  --set-env-vars DEFAULT_OBJECT_STORAGE_BUCKET_ID="your-gcs-bucket-name" \
  --set-env-vars PRIVATE_OBJECT_DIR="private" \
  --set-env-vars PUBLIC_OBJECT_SEARCH_PATHS="public" \
  --set-env-vars FRONTEND_URL="https://YOUR_GITHUB_USERNAME.github.io"
```

> **FRONTEND_URL** is the base URL of your GitHub Pages site (no trailing slash, no path).
> If you have a custom domain, use that instead.

After deployment, Cloud Run will give you a URL like:
```
https://lightbearer-api-abc123-uc.a.run.app
```

Save this — you need it for Step 3.

### 2d — Grant Cloud Run access to Google Cloud Storage

In the Google Cloud Console:
1. Go to **IAM & Admin → Service Accounts**
2. Find the service account used by Cloud Run (it ends in `@developer.gserviceaccount.com`)
3. Give it the **Storage Object Admin** role

---

## Step 3 — Deploy the frontend to GitHub Pages

### 3a — Push the code to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### 3b — Add secrets to your GitHub repository

Go to your repo on GitHub → **Settings → Secrets and variables → Actions**

Add these **Secrets** (click "New repository secret"):

| Secret name | Value |
|---|---|
| `VITE_API_BASE_URL` | Your Cloud Run URL from Step 2, e.g. `https://lightbearer-api-abc123-uc.a.run.app` |

Add these **Variables** (click the "Variables" tab, then "New repository variable"):

| Variable name | Value |
|---|---|
| `BASE_PATH` | `/` if you have a custom domain, or `/YOUR_REPO_NAME/` for a project page |

Example: if your repo is `github.com/johndoe/lightbearer`, use `BASE_PATH = /lightbearer/`

### 3c — Enable GitHub Pages

Go to your repo → **Settings → Pages**

- Source: **GitHub Actions**
- Click Save

### 3d — Trigger the first deployment

Go to **Actions** tab in your repo → find the **"Deploy Frontend to GitHub Pages"** workflow → click **Run workflow**

Your site will be live at:
- Project page: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`
- Custom domain: `https://your-domain.com/` (configure in Pages settings)

---

## Step 4 — Test everything

1. Open your GitHub Pages URL
2. Try logging in with one of the test accounts:
   - **grace@lightbearer.app** / password123
   - **deborah@lightbearer.app** / password123
3. Start a broadcast — microphone should work and you should go live
4. Open the listener URL on another device and confirm you can hear the audio

---

## Ongoing updates

After making changes, simply push to the `main` branch:

```bash
git add .
git commit -m "your change"
git push
```

GitHub Actions will automatically rebuild and redeploy the frontend.

For backend changes, re-run the `gcloud run deploy` command from Step 2c.

---

## Environment variable reference

### Cloud Run (backend)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase/PostgreSQL connection string |
| `SESSION_SECRET` | Long random string for session signing |
| `GROQ_API_KEY` | Groq API key for AI transcription |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | GCS bucket name for recordings |
| `PRIVATE_OBJECT_DIR` | Folder inside bucket for private files |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Folder inside bucket for public files |
| `FRONTEND_URL` | Your GitHub Pages origin (for CORS) |
| `PORT` | Set automatically by Cloud Run (8080) |
| `NODE_ENV` | Set to `production` |

### GitHub Actions (frontend build)

| Secret/Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full Cloud Run URL — API calls go here |
| `BASE_PATH` | Vite base path — `/` or `/repo-name/` |
