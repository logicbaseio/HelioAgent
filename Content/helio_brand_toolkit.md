# HELIO — Complete Brand & Design Toolkit
**Domain:** helio.bot | **Product:** Autonomous SEO / AEO / GEO Agent

---

## 01 — BRAND IDENTITY

### Logo Mark
- Orbital system icon — concentric broken rings with 3 planet dots orbiting a glowing core
- Two modes: flat (light bg) and neon glow (dark bg)
- The orbital represents HELIO's "live autonomy loop" — always running, always orbiting

### Brand Name Usage
- Always in **ALL CAPS**: `HELIO`
- Tagline pairings:
  - `MISSION CONTROL / SEO AGENT v1.0`
  - `ORBITAL SEO ENGINE / LIVE AUTONOMY LOOP`
  - `EARLY ACCESS // COMMAND PROTOCOL`
  - `AGENT ONLINE`

---

## 02 — COLOR SYSTEM

| Token | Hex | Usage |
|-------|-----|-------|
| Acid Green | `#C8FF00` | Primary brand color, CTAs, accents, logo on dark |
| Deep Black | `#080808` | Primary dark background |
| Pure Black | `#0A0A0A` | Alt dark background |
| White | `#FFFFFF` | Body text on dark |
| Off-White | `rgba(255,255,255,0.38)` | Secondary text on dark |
| Green Muted | `rgba(200,255,0,0.45)` | Eyebrows, tags on dark |
| Green Faint | `rgba(200,255,0,0.04–0.12)` | Grid lines, borders, overlays |
| Black Muted | `rgba(0,0,0,0.55)` | Body text on light |
| Black Faint | `rgba(0,0,0,0.07–0.12)` | Grid lines, borders on light |

### Theme Modes
**Dark Mode** → `#080808` bg + `#C8FF00` accents + white text
**Light Mode** → `#C8FF00` bg + `#080808` accents + dark text

---

## 03 — TYPOGRAPHY

### Primary Font
**JetBrains Mono** (Google Fonts)
```
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap');
font-family: 'JetBrains Mono', monospace;
```

### Type Scale
| Role | Size | Weight | Letter-spacing |
|------|------|--------|----------------|
| Hero headline | 44–48px | 800 | -0.03em |
| Large headline | 34–42px | 800 | -0.02em |
| Medium headline | 28–32px | 700 | -0.01em |
| Eyebrow / tag | 8–9px | 600 | 0.22em |
| Body | 11–12px | 400 | 0.02em |
| Terminal / UI | 9.5–10px | 400 | 0.05em |
| Brand logo | 14–18px | 800 | 0.14–0.18em |
| Slide tag | 7.5–8px | 500 | 0.15–0.18em |
| URL / meta | 8px | 500 | 0.16em |

### Accent Treatment
- **On dark slides:** `.accent { color: #C8FF00; }`
- **On light slides:** `.accent { text-decoration: underline; text-underline-offset: 4px; }`

---

## 04 — LAYOUT SYSTEM

### Slide Format
- **Instagram 4:5 Portrait:** 480 × 600px (screen) → exports at 2.25× = ~1080 × 1350px
- **Instagram 1:1 Square:** 480 × 480px
- **Story 9:16:** 480 × 853px (not yet built)

### Structural Zones (Portrait 4:5)
```
┌─────────────────────────────┐
│  TOP BAR       46px         │  Brand + Status/Tag
├─────────────────────────────┤
│                             │
│                             │
│  CONTENT ZONE  ~514px       │  Headline + Body + Elements
│                             │
│                             │
├─────────────────────────────┤
│  BOTTOM BAR    40px         │  URL + Progress dots
└─────────────────────────────┘
```

### Grid System
```css
/* Dark mode grid */
background-image:
  linear-gradient(rgba(200,255,0,0.035) 1px, transparent 1px),
  linear-gradient(90deg, rgba(200,255,0,0.035) 1px, transparent 1px);
background-size: 30px 30px;

/* Light mode grid */
background-image:
  linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px);
background-size: 30px 30px;
```

### Scanline Texture
```css
background: repeating-linear-gradient(
  to bottom,
  transparent 0px, transparent 3px,
  rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px
);
```

---

## 05 — UI COMPONENTS

### Top Bar
```css
height: 46px;
border-bottom: 1px solid rgba(200,255,0,0.10); /* dark */
border-bottom: 1px solid rgba(0,0,0,0.12);     /* light */
padding: 0 24px;
display: flex; justify-content: space-between; align-items: center;
```

### Status Indicator (AGENT ONLINE)
```css
/* Pulsing dot */
.sdot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #C8FF00;
  box-shadow: 0 0 6px #C8FF00;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%,100% { opacity:1; box-shadow: 0 0 6px #C8FF00; }
  50%      { opacity:0.4; box-shadow: 0 0 14px #C8FF00; }
}
```

### Terminal Line
```css
/* Dark */
background: rgba(200,255,0,0.05);
border: 1px solid rgba(200,255,0,0.12);
color: rgba(200,255,0,0.6);
border-radius: 2px;
padding: 10px 14px;
font-size: 10px;

/* Blinking cursor */
.cursor {
  display: inline-block;
  width: 6px; height: 11px;
  background: #C8FF00;
  animation: blink 1s step-end infinite;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
```
**Terminal copy patterns:**
```
$ helio agent run --goal outrank
$ helio aeo --scan brand_visibility
$ helio aeo --mode define --output strategy
$ helio aeo --priority critical --deploy now
$ helio agent run --goal outrank_competitors
```

### Stat Pills
```css
.pill {
  padding: 12px 16px; border-radius: 3px; flex: 1;
  background: rgba(200,255,0,0.06);     /* dark */
  border: 1px solid rgba(200,255,0,0.10);
}
.pill-num { font-size: 28px; font-weight: 800; color: #C8FF00; }
.pill-lbl { font-size: 8px; letter-spacing: 0.1em; color: rgba(255,255,255,0.28); }
```

### List Rows (with dividers)
```css
.li {
  display: flex; align-items: baseline; gap: 12px;
  font-size: 12px; padding: 9px 0;
  border-bottom: 1px solid rgba(200,255,0,0.07); /* dark */
  border-bottom: 1px solid rgba(0,0,0,0.08);     /* light */
  color: rgba(255,255,255,0.55);
}
.li-num { font-size: 9px; font-weight: 700; color: #C8FF00; }
```

### CTA Button
```css
/* Dark slide */
background: #C8FF00; color: #080808;
font-size: 11px; font-weight: 700;
letter-spacing: 0.14em; text-transform: uppercase;
padding: 13px 28px; border-radius: 2px; border: none;

/* Light slide */
background: #080808; color: #C8FF00;
```

### Progress Dots
```css
.dot { width:5px; height:5px; border-radius:50%; }
/* Active state */
.dot.on { width:14px; border-radius:3px; }
/* Dark */        background: rgba(200,255,0,0.15) / #C8FF00
/* Light */       background: rgba(0,0,0,0.15) / #080808
```

### Accent Bars
```css
/* Left vertical bar — dark slide */
position: absolute; top:46px; bottom:40px; left:0;
width: 4px; background: #C8FF00;

/* Top horizontal bar — light slide */
position: absolute; top:46px; left:0; right:0;
height: 4px; background: #080808;
```

### Ghost Background Number
```css
position: absolute;
font-size: 160–200px; font-weight: 800;
letter-spacing: -0.05em; pointer-events: none;
color: rgba(200,255,0,0.04); /* dark */
color: rgba(0,0,0,0.05);     /* light */
```

### Diagonal Accent Polygon
```html
<svg viewBox="0 0 480 514" preserveAspectRatio="none">
  <polygon points="0,514 0,340 480,120 480,514"
    fill="rgba(200,255,0,0.025)"/>
  <line x1="0" y1="340" x2="480" y2="120"
    stroke="rgba(200,255,0,0.12)" stroke-width="1"/>
</svg>
```

### Scrolling Ticker Strip
```css
height: 32px; background: #C8FF00;
font-size: 9px; font-weight: 700;
letter-spacing: 0.2em; color: #080808;
animation: ticker 12s linear infinite;
@keyframes ticker {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
```

### Orbital SVG Decoration
```html
<svg width="220" height="220" viewBox="0 0 220 220">
  <circle cx="110" cy="110" r="100" fill="none"
    stroke="#C8FF00" stroke-width="1" stroke-dasharray="6 6"/>
  <circle cx="110" cy="110" r="65" fill="none"
    stroke="#C8FF00" stroke-width="1" stroke-dasharray="4 8"/>
  <circle cx="110" cy="110" r="30" fill="none"
    stroke="#C8FF00" stroke-width="1"/>
  <circle cx="110" cy="10"  r="6" fill="#C8FF00"/>
  <circle cx="175" cy="155" r="5" fill="#C8FF00"/>
  <circle cx="50"  cy="162" r="4" fill="#C8FF00"/>
</svg>
```

---

## 06 — VOICE & COPY SYSTEM

### Brand Voice Principles
- **Terminal, not corporate** — write like a CLI, not a brochure
- **Precise, not fluffy** — every word earns its place
- **Confident, not arrogant** — state facts, don't oversell
- **Autonomous, not human** — HELIO is a machine. Write like one.

### Copy Formulas

**Headline formula:**
```
[What you're losing] + [Why] + [What HELIO does about it]
"SEO that runs while you don't."
"Your brand is invisible to AI. Here's why."
"Every day late is a day your rival owns AI."
```

**Eyebrow / section tag formula:**
```
[TOPIC AREA] // [CONTEXT]
"Early Access // Command Protocol"
"AEO Series // 03 of 08"
"Mission Control // HELIO"
```

**Terminal command copy:**
```
$ helio [module] --goal [outcome]
$ helio [module] --mode [action] --output [result]
$ helio [module] --priority [level] --deploy [timing]
```

**Status indicators:**
```
AGENT ONLINE
ORBITAL SEO ENGINE / LIVE AUTONOMY LOOP
7/9 CONNECTED
● ONLINE
```

### Vocabulary to use
`autonomous`, `mission`, `deploy`, `detect`, `orbit`, `compound`,
`loop`, `agent`, `command`, `protocol`, `execute`, `24/7`, `live`

### Vocabulary to avoid
`easy`, `simple`, `powerful`, `game-changing`, `revolutionary`,
`seamless`, `robust`, `leverage`, `synergy`, `utilize`

---

## 07 — CAROUSEL SLIDE DESIGN PATTERNS

Each carousel alternates Dark → Light → Dark → Light.

| Slide | Theme | Layout Special Element |
|-------|-------|----------------------|
| Cover | Dark | Orbital SVG deco + diagonal polygon + bottom-anchored text |
| Shift/Stats | Light | Top accent stripe + stat pills |
| Definition | Dark | Left vertical accent bar |
| Stakes | Light | Split dark/light halves within slide |
| List/How-to | Dark | Ghost bg number + numbered list rows |
| Comparison | Light | Right vertical accent bar |
| Urgency | Dark | Scrolling ticker strip |
| CTA | Light | Orbital deco + top accent + bottom-anchored CTA |

---

## 08 — CONTENT CALENDAR FRAMEWORK

### Phase 1 — Launch & Hype (Weeks 1–2)
- 5 Twitter/X launch posts (sequential)
- 3 LinkedIn launch posts
- 3 Instagram/Facebook posts
- Goal: Build waitlist, establish brand voice

### Phase 2 — Value Content (Weeks 3–5)
- 3 Instagram carousels (AEO importance, SEO tasks, compounding SEO)
- 3 LinkedIn value posts
- 2 Twitter threads
- Goal: Authority, saves, shares

### Content Angles
1. **Problem** — Manual SEO is broken
2. **Education** — What AEO/GEO is
3. **Urgency** — The cost of waiting
4. **Solution** — How HELIO solves it
5. **Social proof** — Stats and signals
6. **CTA** — Join waitlist

---

## 09 — ASSETS BUILT

| Asset | Format | Status |
|-------|--------|--------|
| Join Waitlist Creative | 4:5 Portrait, Dark Mode | ✅ Built |
| AEO Importance Carousel | 8 slides, 4:5 Portrait, Alt themes | ✅ Built |
| 360° Content Kit | Twitter, LinkedIn, Instagram copy | ✅ Built |
| Captions (3 variants) | AEO carousel | ✅ Built |
| Light Mode Waitlist | 4:5 Portrait | 🔲 Pending |
| Story 9:16 format | Any creative | 🔲 Pending |
| LinkedIn Header Banner | 1584 × 396px | 🔲 Pending |
| Twitter/X Banner | 1500 × 500px | 🔲 Pending |
| "5 SEO Tasks" Carousel | 8 slides | 🔲 Pending |
| "Compound SEO" Carousel | 8 slides | 🔲 Pending |
| Meta/LinkedIn Ad Creative | Various | 🔲 Pending |

---

*HELIO // MISSION CONTROL / SEO AGENT v1.0*
*helio.bot*
