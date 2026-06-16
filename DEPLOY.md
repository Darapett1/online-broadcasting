# Deploying The Lightbearer

Host the full app for **free** using three services:

| Service | Role | Cost |
|---|---|---|
| **GitHub Pages** | Your website (frontend) | Free forever |
| **Koyeb** | Backend server (API + live audio relay) | Free forever (always on) |
| **Supabase** | Database | Free forever |
| **Cloudinary** | File storage (avatars, recordings) | Free (25 GB) |

---

## What you need before you start

1. A **GitHub account** — https://github.com
2. The code pushed to a GitHub repository

---

## Step 1 — Free database (Supabase)

1. Go to **https://supabase.com** → sign up free
2. Click **New project**, give it a name, set a password, pick a region
3. Wait ~1 minute for it to finish setting up
4. Go to **Project Settings → Database**
5. Under **Connection string**, copy the **URI** — looks like:
   ```
   postgresql://postgres:YOUR_PASSWORD@db.xxxx.supabase.co:5432/postgres
   ```
6. Save it — this is your `DATABASE_URL`

**Push the database tables to Supabase** (run this once in your terminal):
```bash
DATABASE_URL="paste-your-supabase-url-here" pnpm --filter @workspace/db run push
```

---

## Step 2 — Free file storage (Cloudinary)

1. Go to **https://cloudinary.com** → sign up free
2. After signing in, go to your **Dashboard**
3. You will see three values — copy all three:
   - **Cloud name**
   - **API key**
   - **API secret**

Save these — you need them in Step 3.

---

## Step 3 — Free backend server (Koyeb)

Koyeb runs your server 24/7 and **never sleeps**, even on the free plan.

1. Go to **https://koyeb.com** → sign up free with your GitHub account
2. Click **Create service**
3. Choose **GitHub** → select this repository
4. Koyeb will detect the `Dockerfile` automatically
5. Under **Environment variables**, add these one by one:

| Variable name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your Supabase connection string from Step 1 |
| `SESSION_SECRET` | Any long random text (e.g. `my-ministry-secret-abc123xyz`) |
| `GROQ_API_KEY` | Your Groq API key (get one free at https://console.groq.com) |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name from Step 2 |
| `CLOUDINARY_API_KEY` | Your Cloudinary API key from Step 2 |
| `CLOUDINARY_API_SECRET` | Your Cloudinary API secret from Step 2 |
| `FRONTEND_URL` | `https://YOUR_GITHUB_USERNAME.github.io` |

6. Under **Ports**, set port to **8080**
7. Click **Deploy**

After a few minutes Koyeb gives you a URL like:
```
https://lightbearer-api-yourname.koyeb.app
```
Save this — you need it in Step 4.

---

## Step 4 — Frontend on GitHub Pages

### 4a — Add secrets to your GitHub repo

Go to your repo on GitHub → **Settings → Secrets and variables → Actions**

**Secrets** tab → "New repository secret":

| Name | Value |
|---|---|
| `VITE_API_BASE_URL` | Your Koyeb URL from Step 3, e.g. `https://lightbearer-api-yourname.koyeb.app` |

**Variables** tab → "New repository variable":

| Name | Value |
|---|---|
| `BASE_PATH` | `/` if you have a custom domain, or `/your-repo-name/` for a normal GitHub Pages project |

Example: if your repo is `github.com/johndoe/lightbearer`, use `/lightbearer/`

### 4b — Enable GitHub Pages

Go to your repo → **Settings → Pages**
- Source: **GitHub Actions**
- Click Save

### 4c — Run the first deployment

Go to **Actions** tab → find **"Deploy Frontend to GitHub Pages"** → click **Run workflow**

Your site will be live at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

---

## Step 5 — Test it

1. Open your GitHub Pages URL
2. Log in with a test account:
   - **grace@lightbearer.app** / `password123`
3. Start a broadcast — audio should go live instantly
4. Open the listener page on another phone — you should hear the audio

---

## Updating the app later

After making changes, just push to GitHub:
```bash
git add .
git commit -m "your update"
git push
```

GitHub Actions rebuilds and republishes the frontend automatically.
For backend changes, Koyeb also auto-deploys when you push to main (enable this in Koyeb settings).

---

## All environment variables at a glance

### Koyeb (backend)
| Variable | What it is |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `SESSION_SECRET` | Any random string — keeps logins secure |
| `GROQ_API_KEY` | Groq API key for AI transcription |
| `CLOUDINARY_CLOUD_NAME` | From your Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From your Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From your Cloudinary dashboard |
| `FRONTEND_URL` | Your GitHub Pages origin (for CORS) |
| `NODE_ENV` | `production` |

### GitHub Actions (frontend build)
| Variable | What it is |
|---|---|
| `VITE_API_BASE_URL` | Your Koyeb backend URL |
| `BASE_PATH` | `/` or `/repo-name/` |
