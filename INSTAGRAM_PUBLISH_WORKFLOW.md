# Instagram Carousel Publish Workflow

Use this guide in another chat or workspace to publish HELIO carousel posts the same way this workspace does: render carousel slides, upload the JPGs to Supabase Storage, then publish an Instagram carousel through the Meta Graph API.

## What This Workflow Does

1. Takes a local HTML carousel file, such as:
   `file:///Users/Hamzaa/Downloads/helio_day2_carousel.html`
2. Extracts each `.slide` inside the `.stage` element as JPG and PNG files.
3. Writes a caption file.
4. Uploads the JPG slides to Supabase Storage.
5. Creates Instagram carousel media containers.
6. Publishes the carousel.
7. Saves the publish response as `publish-result.json`.

## Required Project Setup

Run this from the HELIO project:

```bash
cd /Users/Hamzaa/Documents/Helio
```

The project needs:

```bash
npm install
```

The existing publisher script is:

```bash
/Users/Hamzaa/Documents/Helio/scripts/instagram-publish-carousel.mjs
```

The npm command is:

```bash
npm run instagram:publish
```

## Required `.env` Values

The project `.env` must contain these values:

```bash
IG_USER_ID=...
META_LONG_LIVED_ACCESS_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=...
LOCAL_ASSET_ROOT=/Users/Hamzaa/Documents/Helio/Content
SUPABASE_BUCKET_PUBLIC=true
```

Do not paste secrets into chat. Verify only that the keys exist.

`LOCAL_ASSET_ROOT` must be a parent of the slide folder being published. For this workflow, use:

```bash
LOCAL_ASSET_ROOT=/Users/Hamzaa/Documents/Helio/Content
```

## Output Folder Convention

Save extracted slides under:

```bash
/Users/Hamzaa/Documents/Helio/Content/daily_carousels/<YYYY-MM-DD>-<post-name>
```

Example:

```bash
/Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel
```

Use names like:

```bash
HELIO_Day2_2026-05-19_Slide_01.jpg
HELIO_Day2_2026-05-19_Slide_02.jpg
```

Instagram carousel publishing uses the JPG files. PNG files can be kept as local backups.

## Extract Slides From Local HTML

Use this Node script from the HELIO project root. Change `source`, `outDir`, `baseName`, and the caption text for each post.

```bash
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = '/Users/Hamzaa/Downloads/helio_day2_carousel.html';
const outDir = '/Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel';
const baseName = 'HELIO_Day2_2026-05-19';

fs.mkdirSync(outDir, { recursive: true });

const caption = [
  'AI search is changing what visibility means.',
  '',
  'Day 2 breaks down practical AEO and GEO signals: answer-ready structure, schema, citations, topical authority, and the quick wins that help your brand show up in AI-generated answers.',
  '',
  'Save this as a checklist for your next content sprint.',
  '',
  'CTA: Join Waitlist -> helio.bot',
  '',
  '#HELIO #AEO #GEO #SEO #AISearch #AnswerEngineOptimization #GrowthSystems'
].join('\n');

fs.writeFileSync(path.join(outDir, 'caption.txt'), caption, 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 900, height: 1000 },
    deviceScaleFactor: 2
  });

  await page.goto(`file://${source}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await page.addStyleTag({ content: `
    * { animation-play-state: paused !important; transition: none !important; }
    body { padding: 0 !important; background: #111 !important; }
    .studio-hdr, .studio-title, .studio-sub, .nav-row, .controls, .hint { display: none !important; }
    .stage { box-shadow: none !important; }
  ` });

  const total = await page.evaluate(() => document.querySelectorAll('.slide').length);

  for (let i = 0; i < total; i++) {
    await page.evaluate((idx) => {
      document.querySelectorAll('.slide').forEach((el, j) => {
        el.classList.toggle('active', j === idx);
        el.style.opacity = j === idx ? '1' : '0';
        el.style.pointerEvents = j === idx ? 'auto' : 'none';
      });

      const info = document.getElementById('ci') || document.getElementById('cinfo');
      if (info) {
        const totalSlides = document.querySelectorAll('.slide').length;
        info.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(totalSlides).padStart(2, '0');
      }
    }, i);

    await page.waitForTimeout(100);

    const slideBase = `${baseName}_Slide_${String(i + 1).padStart(2, '0')}`;
    const stage = page.locator('.stage');
    await stage.screenshot({ path: path.join(outDir, `${slideBase}.png`), type: 'png' });
    await stage.screenshot({ path: path.join(outDir, `${slideBase}.jpg`), type: 'jpeg', quality: 95 });
  }

  await browser.close();

  fs.writeFileSync(
    path.join(outDir, 'extraction-meta.json'),
    JSON.stringify({ source, outDir, total, extractedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );

  console.log(JSON.stringify({ outDir, total }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
```

## Verify Slides Before Publishing

List output files:

```bash
find /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel -maxdepth 1 -type f | sort
```

Check dimensions:

```bash
sips -g pixelWidth -g pixelHeight /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel/*.jpg
```

Expected result for the current HELIO carousel templates:

```text
pixelWidth: 960
pixelHeight: 1200
```

Check caption:

```bash
sed -n '1,120p' /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel/caption.txt
```

Confirm it includes:

```text
CTA: Join Waitlist -> helio.bot
```

## Publish To Supabase And Instagram

Set a unique Supabase object prefix for the post and publish:

```bash
bash -o pipefail -c 'SUPABASE_OBJECT_PREFIX=ig-carousels/2026-05-19-day2-carousel npm run instagram:publish -- --folder /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel --caption-file /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel/caption.txt 2>&1 | tee /Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel/publish-result.json'
```

The publisher:

1. Finds all `.jpg` files in the folder.
2. Sorts them by filename.
3. Uploads them to Supabase Storage.
4. Uses the public Supabase URLs as Instagram `image_url` values.
5. Creates carousel item containers.
6. Creates the Instagram carousel.
7. Publishes it.
8. Prints JSON with `mediaId`, `creationId`, `uploadedUrls`, and `permalink`.

## Clean `publish-result.json`

Because `npm run` prints a command banner before the JSON, clean the file afterward:

```bash
node - <<'NODE'
const fs = require('fs');
const file = '/Users/Hamzaa/Documents/Helio/Content/daily_carousels/2026-05-19-day2-carousel/publish-result.json';
const raw = fs.readFileSync(file, 'utf8');
const start = raw.indexOf('{');
const end = raw.lastIndexOf('}');
if (start === -1 || end === -1 || end < start) throw new Error('No JSON object found in publish result');
const parsed = JSON.parse(raw.slice(start, end + 1));
fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
NODE
```

## Success Criteria

The final `publish-result.json` should look like:

```json
{
  "ok": true,
  "igUserId": "17841479991872798",
  "bucket": "Helio-Carouse-Images",
  "objectPrefix": "ig-carousels/2026-05-19-day2-carousel",
  "imageCount": 8,
  "uploadedUrls": ["..."],
  "creationId": "...",
  "mediaId": "...",
  "permalink": "https://www.instagram.com/p/..."
}
```

The `permalink` is the published Instagram post URL.

## Common Failure Modes

### `File is outside LOCAL_ASSET_ROOT`

The slide folder is not inside the configured `LOCAL_ASSET_ROOT`.

Fix `.env`:

```bash
LOCAL_ASSET_ROOT=/Users/Hamzaa/Documents/Helio/Content
```

### `No JPG files found`

The extraction step failed or wrote only PNGs. Re-run the extraction and confirm `.jpg` files exist.

### Instagram or Graph API errors

Keep the generated assets. The publish response will show the exact error. Common causes:

- Expired `META_LONG_LIVED_ACCESS_TOKEN`
- Invalid `IG_USER_ID`
- Supabase public URLs not reachable
- More than 10 JPGs in the folder
- Fewer than 2 JPGs in the folder

## Short Version

1. Render `.slide` elements from the local HTML into:
   `/Users/Hamzaa/Documents/Helio/Content/daily_carousels/<post-folder>/`
2. Write:
   `/Users/Hamzaa/Documents/Helio/Content/daily_carousels/<post-folder>/caption.txt`
3. Publish:

```bash
SUPABASE_OBJECT_PREFIX=ig-carousels/<post-folder> npm run instagram:publish -- --folder /Users/Hamzaa/Documents/Helio/Content/daily_carousels/<post-folder> --caption-file /Users/Hamzaa/Documents/Helio/Content/daily_carousels/<post-folder>/caption.txt
```

4. Save and clean:
   `/Users/Hamzaa/Documents/Helio/Content/daily_carousels/<post-folder>/publish-result.json`

