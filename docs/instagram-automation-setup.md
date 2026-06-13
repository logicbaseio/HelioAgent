# Instagram Automation Setup (HELIO)

This project can auto-publish a rendered carousel to Instagram using Meta Graph API, with images uploaded to Supabase Storage first.

## Required Env Vars

Set these in the environment where the automation runs:

- `IG_USER_ID`: Instagram Business/Creator account ID
- `META_LONG_LIVED_ACCESS_TOKEN`: Long-lived user/page token with Instagram publish permissions
- `SUPABASE_URL`: Project URL (e.g. `https://xyzcompany.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (server-side only)
- `SUPABASE_BUCKET`: Storage bucket name for carousel uploads
- `LOCAL_ASSET_ROOT`: Local root path for generated assets (usually `/Users/Hamzaa/Documents/Helio/Content`)

Optional:

- `SUPABASE_BUCKET_PUBLIC`: `true` or `false` (default `true`)
- `SUPABASE_SIGNED_URL_EXPIRES_IN`: signed URL expiry in seconds when bucket is private (default `3600`)
- `SUPABASE_OBJECT_PREFIX`: object key prefix, default `ig-carousels/<YYYY-MM-DD>`

Example:

```bash
export IG_USER_ID="1784xxxxxxxxxxxx"
export META_LONG_LIVED_ACCESS_TOKEN="EAAG..."
export SUPABASE_URL="https://xyzcompany.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
export SUPABASE_BUCKET="ig-carousels"
export LOCAL_ASSET_ROOT="/Users/Hamzaa/Documents/Helio/Content"
```

## Publish Command

Use a folder of JPG slides (2-10 images):

```bash
npm run instagram:publish -- \
  --folder /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-17 \
  --caption-file /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-17/caption.txt
```

Or pass explicit images:

```bash
npm run instagram:publish -- \
  --images /abs/path/slide1.jpg,/abs/path/slide2.jpg \
  --caption "Value-first HELIO carousel"
```

## Notes

- Instagram carousel requires publicly reachable `image_url` values.
- This script uploads files to Supabase first, then uses public or signed Supabase URLs for Instagram `image_url`.
- The account must be a Business/Creator account connected to a Facebook Page.
- Token must include publishing permissions for Instagram Graph API.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never expose it in frontend code.

## Live Carousel Studio

The HTML tool can run as an active local studio through the Node server:

```bash
cd /Users/Hamzaa/Documents/Helio
npm run carousel:studio
```

Open:

```text
http://localhost:4317
```

The studio server provides:

- `POST /api/generate`: calls Claude with the HELIO brand toolkit and the selected content-plan day.
- `POST /api/publish`: renders the generated slide HTML to JPG, uploads the images to Supabase Storage, creates Instagram carousel containers, and publishes through Meta Graph API.
- `GET /api/health`: confirms whether Anthropic, Instagram, and Supabase credentials are available.

Recommended `.env` values:

```bash
ANTHROPIC_API_KEY=sk-ant-...
IG_USER_ID=1784...
META_LONG_LIVED_ACCESS_TOKEN=EAAG...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=ig-carousels
LOCAL_ASSET_ROOT=/Users/Hamzaa/Documents/Helio/Content
SUPABASE_BUCKET_PUBLIC=true
```

The UI still accepts an Anthropic key, Instagram user ID, and Meta token for local testing, but production use should keep these in `.env`.
