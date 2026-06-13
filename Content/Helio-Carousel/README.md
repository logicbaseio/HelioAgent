# HELIO — Instagram Carousel Pipeline

Autonomous daily carousel generation and Instagram posting using Claude API, Puppeteer, Supabase Storage, and Instagram Graph API.

---

## FOLDER STRUCTURE

```
helio-pipeline/
├── .github/
│   └── workflows/
│       └── daily-carousel.yml   ← Copy from daily-carousel.yml
├── scripts/
│   └── pipeline.js              ← Main pipeline
├── output/                      ← Auto-created during run
├── supabase-setup.sql           ← Run once in Supabase SQL Editor
├── package.json
├── .gitignore
└── README.md
```

---

## SETUP (one-time, ~20 minutes)

### 1. Create GitHub Repo
- Go to github.com → New repository → Name: `helio-pipeline` → Private → Create

### 2. Push these files
```bash
git init
git add .
git commit -m "HELIO pipeline init"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/helio-pipeline.git
git push -u origin main
```

### 3. Create .github/workflows folder in repo
- In GitHub UI: Add file → Create new file
- Type: `.github/workflows/daily-carousel.yml`
- Paste the contents of `daily-carousel.yml`

### 4. Add GitHub Secrets
Go to: repo → Settings → Secrets and variables → Actions → New repository secret

| Secret | Value |
|--------|-------|
| ANTHROPIC_API_KEY | sk-ant-xxxx |
| IG_USER_ID | your Instagram user ID |
| IG_ACCESS_TOKEN | your Meta access token |
| SUPABASE_URL | https://xxx.supabase.co |
| SUPABASE_SERVICE_KEY | your service role key |
| STORAGE_BUCKET | helio-carousels |

### 5. Run SQL in Supabase
- Dashboard → SQL Editor → paste supabase-setup.sql → Run

### 6. Set Supabase bucket to public
- Dashboard → Storage → helio-carousels → Policies → Public read

### 7. Test manually
- GitHub → Actions → HELIO Daily Carousel → Run workflow

---

## SCHEDULE

Runs automatically every day at **07:00 AM PKT (02:00 UTC)**.

---

## MONITORING

Check Supabase → Table Editor → helio_posts for daily logs.
Check GitHub → Actions for run history and logs.

---

## META TOKEN REFRESH

Access tokens expire every 60 days.
Refresh at: developers.facebook.com → Graph API Explorer
Update in: GitHub → Settings → Secrets → IG_ACCESS_TOKEN
