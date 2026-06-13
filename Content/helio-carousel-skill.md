# Skill: HELIO Carousel Generator

## Metadata
- **Skill Name:** HELIO Carousel Generator
- **Version:** 1.0
- **Author:** Hamzaa
- **Brand:** HELIO (helio.bot) — Autonomous SEO/AEO/GEO Agent
- **Purpose:** Generate on-brand Instagram carousels (8 slides, 4:5 portrait) for HELIO with full design system, alternating dark/light themes, value-first content, and export-ready JPGs.

---

## Brand Identity

### Logo & Mark
- Orbital system icon — concentric broken rings with 3 planet dots orbiting a glowing core
- Two modes: flat (light bg) and neon glow (dark bg)
- Represents HELIO's "live autonomy loop"

### Name Usage
- Always ALL CAPS: `HELIO`
- Tagline pairings:
  - `MISSION CONTROL / SEO AGENT v1.0`
  - `ORBITAL SEO ENGINE / LIVE AUTONOMY LOOP`
  - `EARLY ACCESS // COMMAND PROTOCOL`
  - `AGENT ONLINE`

---

## Color System

| Token | Hex | Usage |
|-------|-----|-------|
| Acid Green | `#C8FF00` | Primary brand, CTAs, accents, logo on dark |
| Deep Black | `#080808` | Primary dark background |
| White | `#FFFFFF` | Body text on dark |
| Off-White | `rgba(255,255,255,0.42)` | Secondary text on dark |
| Green Muted | `rgba(200,255,0,0.52)` | Eyebrows, tags on dark |
| Green Faint | `rgba(200,255,0,0.04–0.14)` | Grid lines, borders on dark |
| Black Muted | `rgba(0,0,0,0.58)` | Body text on light |
| Black Faint | `rgba(0,0,0,0.07–0.14)` | Grid lines, borders on light |

### Theme Modes
- **Dark:** `#080808` bg + `#C8FF00` accents + white text
- **Light:** `#C8FF00` bg + `#080808` accents + dark text

---

## Typography

### Primary Font
**JetBrains Mono** (Google Fonts) — fallback: `'Courier New', monospace`

```css
font-family: 'JetBrains Mono', 'Courier New', monospace;
```

### Type Scale (at 1080px canvas width)

| Role | Size | Weight | Letter-spacing |
|------|------|--------|----------------|
| Hero headline (slide 1) | 86–88px | 800 | -0.025em |
| Section headline | 66–68px | 700–800 | -0.022em |
| Eyebrow / tag | 20px | 600 | 0.22–0.24em |
| Body text | 28px | 400 | normal |
| List items | 28px | 400 | normal |
| List numbers | 22px | 700 | 0.06–0.08em |
| Terminal command | 22px | 400 | 0.04em |
| Brand logo (HELIO) | 34px | 700–800 | 0.16em |
| Slide tag / URL | 18px | 500 | 0.18em |

### Accent Treatment
- **On dark slides:** headline accent words = `color: #C8FF00`
- **On light slides:** accent = underline or bold black

---

## Layout System

### Slide Format
- **Canvas:** 1080 × 1350px (Instagram 4:5 portrait)
- **Render:** `deviceScaleFactor: 2` → 2160 × 2700px → saved as JPG 96% quality

### Structural Zones
```
┌─────────────────────────────────────┐
│  TOP BAR          92px              │  HELIO logo + slide tag/status
├─────────────────────────────────────┤
│  ACCENT BAR       10px (optional)   │  Left bar (dark, non-cover) OR Top bar (light)
├─────────────────────────────────────┤
│                                     │
│  CONTENT ZONE     ~1166px           │  Eyebrow + Headline + Body/List + Terminal/CTA
│                                     │
│  TERMINAL         pinned above bot  │  Dark slides only
├─────────────────────────────────────┤
│  BOTTOM BAR       92px              │  helio.bot URL + progress dots
└─────────────────────────────────────┘
```

### Grid Background
```css
/* Dark */
background-image:
  linear-gradient(rgba(200,255,0,0.05) 1px, transparent 1px),
  linear-gradient(90deg, rgba(200,255,0,0.05) 1px, transparent 1px);
background-size: 54px 54px;

/* Light */
background-image:
  linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px);
background-size: 54px 54px;
```

### Scanline Texture
```css
background: repeating-linear-gradient(
  to bottom, transparent 0px, transparent 4px,
  rgba(0,0,0,0.022) 4px, rgba(0,0,0,0.022) 5px
);
```

---

## Carousel Structure (8 Slides)

### Theme Alternation
```
Slide 1 → DARK   (cover)
Slide 2 → LIGHT
Slide 3 → DARK
Slide 4 → LIGHT
Slide 5 → DARK
Slide 6 → LIGHT
Slide 7 → DARK
Slide 8 → LIGHT  (CTA)
```

### Slide Design Rules Per Type

| Slide | Theme | Special Element | Content Anchor |
|-------|-------|-----------------|----------------|
| 1 — Cover | Dark | Diagonal polygon + orbital SVG deco | Bottom |
| 2 — Shift/Stats | Light | Top accent stripe (10px black bar) | Top |
| 3 — Definition | Dark | Left accent bar (10px green, full height) | Top |
| 4 — Stakes | Light | Split dark/light halves within slide | Top |
| 5 — How-To | Dark | Ghost bg number (500px, opacity 0.045) | Top |
| 6 — Comparison | Light | Right accent bar OR ticker strip | Top |
| 7 — Urgency | Dark | Scrolling ticker strip (green bg, black text) | Top |
| 8 — CTA | Light | Orbital SVG deco bottom-right | Top + CTA button |

### Accent Bar Rules
- **Left vertical bar:** dark slides (not slide 1) → `left:0, width:10px, bg:#C8FF00`
- **Top horizontal bar:** all light slides → `top:92px, height:10px, bg:#080808`
- Content left padding shifts to `60px` when left bar is present (vs 48px default)

### Ghost Background Number
```css
position: absolute;
right: -8px; bottom: -50px;
font-size: 500px; font-weight: 700;
color: rgba(200,255,0,0.045); /* dark */
color: rgba(0,0,0,0.055);     /* light */
letter-spacing: -0.05em;
z-index: 2;
```

---

## UI Components

### Top Bar
```css
height: 92px;
border-bottom: 1px solid rgba(200,255,0,0.14); /* dark */
border-bottom: 1px solid rgba(0,0,0,0.16);     /* light */
padding: 0 48px;
display: flex; justify-content: space-between; align-items: center;
```
- Left: `HELIO` in accent color, 34px, weight 700, tracking 0.16em
- Right: `AGENT ONLINE` (slide 1) or `SLIDE 01 OF 08` (others), 18px, tracking 0.18em

### Bottom Bar
```css
height: 92px;
border-top: 1px solid rgba(200,255,0,0.14); /* dark */
padding: 0 48px;
```
- Left: `helio.bot`, 18px, tracking 0.18em, muted color
- Right: progress dots

### Progress Dots
```css
/* Inactive */
width: 14px; height: 12px; border-radius: 7px;
background: rgba(200,255,0,0.22); /* dark */
background: rgba(0,0,0,0.22);    /* light */

/* Active */
width: 36px; height: 12px; border-radius: 6px;
background: #C8FF00; /* dark */
background: #080808; /* light */
```

### Terminal Line (dark slides only)
```css
position: absolute;
bottom: 104px; /* pinned above bottom bar */
left: 58px (with lbar) / 48px; right: 48px;
background: rgba(200,255,0,0.06);
border: 1px solid rgba(200,255,0,0.18);
border-radius: 4px; padding: 22px 30px;
font-size: 22px; color: rgba(200,255,0,0.68);
```
Format: `$ helio [module] --[flag] [value]`

### List Rows
```css
display: flex; align-items: flex-start; gap: 28px;
padding: 20px 0;
border-bottom: 1px solid rgba(200,255,0,0.10); /* dark */

/* Number */
font-size: 22px; font-weight: 700; color: accent;

/* Text */
font-size: 28px; line-height: 1.5; color: sub;
```

### CTA Button (slide 8 only)
```css
display: inline-block;
padding: 30px 56px;
background: fg-color; color: bg-color;
font-size: 24px; font-weight: 800;
letter-spacing: 0.16em; text-transform: uppercase;
border-radius: 4px;
```
Text: `JOIN WAITLIST → HELIO.BOT`

### Rule Line (slide 1 only, after headline)
```css
height: 1px;
background: rgba(200,255,0,0.16); /* dark */
background: rgba(0,0,0,0.16);    /* light */
margin-bottom: 38px;
```

---

## Voice & Copy System

### Brand Voice Principles
- Terminal, not corporate
- Precise, not fluffy — every word earns its place
- Confident, not arrogant — state facts
- Value-first — never lead with the product
- Autonomous — write like a machine, not a human

### Copy Rules
- Headlines: max 6 words per line, max 3 lines, use `\n` for breaks
- Body text: max 2 short lines
- Lists: max 5 items, each under 10 words
- Eyebrows: ALL CAPS, short, category label
- Slide 8 CTA: always end with `helio.bot`
- NEVER use: powerful, seamless, game-changing, revolutionary, leverage, synergy

### Headline Formula
```
[What you're losing] + [Why] + [What changes]
"SEO that runs while you don't."
"Your brand is invisible to AI. Here's why."
"Every day late is a day your rival owns AI."
```

### Eyebrow Formula
```
[TOPIC] // [CONTEXT]
"Early Access // Command Protocol"
"AEO Series // 03 of 08"
"The Stakes"
"How It Works"
```

### Terminal Command Patterns
```
$ helio agent run --goal outrank
$ helio aeo --scan brand_visibility
$ helio aeo --mode define --output strategy
$ helio aeo --priority critical --deploy now
$ helio --compare seo aeo geo --output strategy
```

### Status Indicators
```
AGENT ONLINE
ORBITAL SEO ENGINE / LIVE AUTONOMY LOOP
MISSION CONTROL v1.0
● ONLINE
```

### Vocabulary to Use
`autonomous`, `mission`, `deploy`, `detect`, `orbit`, `compound`,
`loop`, `agent`, `command`, `protocol`, `execute`, `24/7`, `live`,
`continuous`, `crawl`, `cite`, `entity`, `schema`, `authority`

---

## Claude API System Prompt

```
You are HELIO's content strategist. HELIO is an autonomous SEO/AEO/GEO agent at helio.bot.

BRAND VOICE: Terminal, precise, confident. No fluff. Value-first. Never lead with the product.

Return ONLY valid JSON. No preamble. No markdown fences. No extra text.

RULES:
- 8 slides, alternating dark/light (slide 1 dark, 2 light, 3 dark...)
- Headlines: max 6 words per line, max 3 lines, use \n for line breaks
- Body: max 2 short lines only
- Lists: max 5 items, each under 10 words
- Slide 8 CTA must end with helio.bot
- NEVER use: powerful, seamless, game-changing, revolutionary

JSON structure:
{
  "topic": "string",
  "caption": "string (hook first line, value body, ends with helio.bot)",
  "hashtags": ["string"],
  "slides": [
    {
      "slide_number": 1,
      "theme": "dark",
      "eyebrow": "string",
      "headline": "line1\nline2\nline3",
      "body": "string",
      "list": ["item1", "item2"],
      "terminal_line": "helio command"
    }
  ]
}
```

---

## Slide Content Template (Per Slide)

| Slide | Eyebrow | Content Type | Terminal? | CTA? |
|-------|---------|--------------|-----------|------|
| 1 Cover | Topic category | Big headline + body | ✅ | ❌ |
| 2 Context | "The Shift" / "The Problem" | Headline + stats OR body | ❌ | ❌ |
| 3 Definition | "Definition" / "What Is X" | Headline + body + list | ✅ | ❌ |
| 4 Stakes | "The Stakes" | Headline + list | ❌ | ❌ |
| 5 How-To | "How It Works" | Headline + numbered list | ✅ | ❌ |
| 6 Comparison | "SEO vs AEO" / "The Difference" | Headline + list | ❌ | ❌ |
| 7 Urgency | "The Cost of Waiting" | Headline + body + stats | ✅ | ❌ |
| 8 CTA | "Mission Control // HELIO" | Headline + short list | ❌ | ✅ |

---

## Rendering Pipeline

### Environment
- **Runtime:** Node.js 22, GitHub Actions (ubuntu-latest)
- **Renderer:** `puppeteer-core` + system Chrome (`/usr/bin/google-chrome-stable`)
- **Canvas:** 1080 × 1350px, `deviceScaleFactor: 2`
- **Output:** JPEG, quality 96

### Critical Rendering Rules
1. **No external font imports** — Google Fonts causes navigation timeout on GitHub runners
2. Use system font stack: `'Courier New', Courier, monospace`
3. Use `waitUntil: "domcontentloaded"` + 300ms paint delay (NOT `networkidle0`)
4. Block all external requests via `page.setRequestInterception(true)`
5. Abort: `fonts.googleapis.com`, `fonts.gstatic.com`, `resourceType === 'font'`

### Font Fallback Stack
```css
font-family: 'Courier New', Courier, monospace;
```
JetBrains Mono can be used in browser previews (artifacts) but must be removed for server-side rendering.

---

## 30-Day Content Calendar

### Weekly Theme Rotation
```
Mon — SEO/AEO/GEO Education      (pure value, no product)
Tue — Business Growth Insight     (strategy, frameworks)
Wed — HELIO Feature Spotlight     (soft product, value-led)
Thu — Industry Trend / AI Search  (thought leadership)
Fri — Quick Win / Actionable Tip  (save-worthy)
Sat — Myth Busting                (pattern interrupt)
Sun — Stat / Data Carousel        (credibility)
```

### All 30 Topics
1. What is AEO and why your brand needs it in 2025
2. The compounding content strategy most founders ignore
3. What an autonomous SEO agent actually does in 24 hours
4. How Google AI Overviews are killing click-through rates
5. 5 schema markup types that get you cited by AI today
6. Myth: SEO is dead. Reality: You are doing it wrong
7. 7 stats that prove AI search is not the future it is now
8. GEO explained: How to appear in AI-generated summaries
9. Why your SEO plateaus at 10K visits and how to break through
10. HELIO live technical audit: what it catches that you miss
11. The rise of zero-click search: What it means for your traffic
12. How to structure any blog post for AI citation in 3 steps
13. Myth: More content equals more traffic. The truth is different
14. The ROI comparison: Paid ads vs Organic SEO vs AI Search
15. Entity SEO: The foundation of every AEO strategy
16. The 80/20 of SEO: The 20% that drives 80% of your traffic
17. How HELIO Content Engine works: From gap to published
18. Why Perplexity is the search engine your brand should worry about
19. The fastest way to audit your site AEO readiness for free
20. Myth: Backlinks are all that matter for ranking
21. How long does SEO take? The real timeline with data
22. What is Keyword Intel in the age of AI search
23. How to build a content moat your competitors cannot copy
24. HELIO Autonomy Loop: What happens between midnight and 6am
25. How AI is changing the buyer journey and what to do about it
26. 3 free tools to check if AI is citing your brand right now
27. Myth: AI-generated content hurts your SEO
28. The search engine market share breakdown in 2025
29. Traditional SEO vs AEO and GEO: The full comparison
30. How to write content that ranks on Google AND gets cited by AI

---

## Caption System

### Caption Formula
```
[Pattern interrupt / bold statement — 1 line]
[Context / the problem — 1-2 lines]
[Value teaser — what they'll learn]
[Swipe prompt]
[URL]
[Hashtags]
```

### Hashtag Categories (10 per post)
- Core: `#SEO #AEO #GEO #AISearch`
- Product: `#HELIO #AutonomousSEO #SEOAgent`
- Audience: `#Founders #GrowthMarketing #DigitalMarketing`
- Trend: `#AIMarketing #ContentMarketing #OrganicGrowth`

---

## Automation Pipeline

### Full Stack
```
GitHub Actions Cron (daily 02:00 UTC / 07:00 PKT)
  → scripts/pipeline.js (Node.js)
    → Claude API (claude-sonnet-4-20250514) → carousel JSON
    → puppeteer-core + Chrome → 8 JPG slides
    → Supabase Storage (public bucket) → 8 public URLs
    → Instagram Graph API v19.0 → carousel post
    → Supabase DB (helio_posts table) → log
```

### Environment Variables Required
```
ANTHROPIC_API_KEY
IG_USER_ID
IG_ACCESS_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_KEY
STORAGE_BUCKET
CHROME_PATH=/usr/bin/google-chrome-stable
```

### Supabase DB Schema
```sql
CREATE TABLE helio_posts (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  topic         TEXT NOT NULL,
  topic_index   INT NOT NULL DEFAULT 0,
  post_id       TEXT,
  image_urls    TEXT[],
  caption       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  error         TEXT
);
```

---

## Known Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Navigation timeout 30000ms | Google Fonts request blocks | Remove font import, use system fonts |
| npm install timeout | Puppeteer downloads 400MB Chrome | Use `puppeteer-core` + apt-get Chrome |
| `npm ci` fails | No package-lock.json | Use `npm install` instead |
| Empty slides / small text | Font sizes too small for canvas | Use 66–88px headlines, 28px body |
| Content only in top quarter | Wrong CSS positioning | Use `bottom:104px` for cover, `top:contentTop` for others |
| Token expired | Meta tokens last 60 days | Refresh every 60 days in GitHub Secrets |
| Publish failed: media not ready | Instagram processing delay | Wait 6000ms before publish call |

---

*HELIO // MISSION CONTROL / SEO AGENT v1.0*
*helio.bot*
