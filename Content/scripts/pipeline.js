// ============================================================
// HELIO — Main Pipeline Script
// scripts/pipeline.js
// ============================================================

import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  ANTHROPIC_API_KEY,
  IG_USER_ID,
  IG_ACCESS_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  STORAGE_BUCKET = "helio-carousels",
  CUSTOM_TOPIC = "",
  CHROME_PATH = "/usr/bin/google-chrome-stable",
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TOPICS = [
  "What is AEO and why your brand needs it in 2025",
  "The compounding content strategy most founders ignore",
  "What an autonomous SEO agent actually does in 24 hours",
  "How Google AI Overviews are killing click-through rates",
  "5 schema markup types that get you cited by AI today",
  "Myth: SEO is dead. Reality: You are doing it wrong",
  "7 stats that prove AI search is not the future it is now",
  "GEO explained: How to appear in AI-generated summaries",
  "Why your SEO plateaus at 10K visits and how to break through",
  "HELIO live technical audit: what it catches that you miss",
  "The rise of zero-click search: What it means for your traffic",
  "How to structure any blog post for AI citation in 3 steps",
  "Myth: More content equals more traffic. The truth is different",
  "The ROI comparison: Paid ads vs Organic SEO vs AI Search",
  "Entity SEO: The foundation of every AEO strategy",
  "The 80/20 of SEO: The 20% that drives 80% of your traffic",
  "How HELIO Content Engine works: From gap to published",
  "Why Perplexity is the search engine your brand should worry about",
  "The fastest way to audit your site AEO readiness for free",
  "Myth: Backlinks are all that matter for ranking",
  "How long does SEO take? The real timeline with data",
  "What is Keyword Intel in the age of AI search",
  "How to build a content moat your competitors cannot copy",
  "HELIO Autonomy Loop: What happens between midnight and 6am",
  "How AI is changing the buyer journey and what to do about it",
  "3 free tools to check if AI is citing your brand right now",
  "Myth: AI-generated content hurts your SEO",
  "The search engine market share breakdown in 2025",
  "Traditional SEO vs AEO and GEO: The full comparison",
  "How to write content that ranks on Google AND gets cited by AI",
];

const SYSTEM_PROMPT = `You are HELIO's content strategist. HELIO is an autonomous SEO/AEO/GEO agent at helio.bot.

BRAND VOICE: Terminal, precise, confident. No fluff. Value-first. Never lead with the product.

Return ONLY valid JSON. No preamble. No markdown fences. No extra text.

RULES:
- 8 slides, alternating dark/light (slide 1 dark, 2 light, 3 dark...)
- Headlines: max 6 words per line, max 3 lines, use \\n for line breaks
- Body: max 2 short lines only
- Lists: max 5 items, each under 10 words
- Slide 8 CTA must end with helio.bot
- NEVER use: powerful, seamless, game-changing, revolutionary

JSON structure:
{
  "topic": "string",
  "caption": "string",
  "hashtags": ["string"],
  "slides": [
    {
      "slide_number": 1,
      "theme": "dark",
      "eyebrow": "string",
      "headline": "line1\\nline2\\nline3",
      "body": "string",
      "list": ["item1","item2"],
      "terminal_line": "helio command"
    }
  ]
}`;

// ── STEP 1: GET TODAY'S TOPIC ─────────────────────────────
async function getTodaysTopic() {
  if (CUSTOM_TOPIC) {
    console.log("📋 Custom topic:", CUSTOM_TOPIC);
    return { topic: CUSTOM_TOPIC, topicIndex: -1 };
  }
  const { data } = await supabase
    .from("helio_posts")
    .select("topic_index")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);

  const lastIndex = data?.[0]?.topic_index ?? -1;
  const nextIndex = (lastIndex + 1) % TOPICS.length;
  console.log(`📋 Topic [Day ${nextIndex + 1}/30]: ${TOPICS[nextIndex]}`);
  return { topic: TOPICS[nextIndex], topicIndex: nextIndex };
}

// ── STEP 2: GENERATE CAROUSEL ─────────────────────────────
async function generateCarousel(topic) {
  console.log("🤖 Calling Claude API...");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Generate a carousel on: "${topic}"\n\nSlide themes:\n1.Cover hook\n2.Problem/context\n3.Core concept\n4.Data/proof\n5.Framework\n6.Mistake/myth\n7.Key insight\n8.Soft CTA helio.bot\n\nReturn ONLY the JSON.`
      }]
    })
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  const data  = await res.json();
  const raw   = data.content?.[0]?.text || "";
  const clean = raw.replace(/```json|```/g, "").trim();
  const carousel = JSON.parse(clean);
  console.log(`✅ Generated ${carousel.slides.length} slides`);
  return carousel;
}

// ── STEP 3: BUILD SLIDE HTML ──────────────────────────────
// NOTE: No external font imports — uses system monospace only
// This prevents navigation timeout on GitHub Actions runners
function buildSlideHTML(slide, total, idx) {
  const isDark  = slide.theme === "dark";
  const bg      = isDark ? "#080808" : "#C8FF00";
  const fg      = isDark ? "#FFFFFF" : "#080808";
  const accent  = isDark ? "#C8FF00" : "#080808";
  const sub     = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.62)";
  const eyeC    = isDark ? "rgba(200,255,0,0.58)"   : "rgba(0,0,0,0.50)";
  const gridC   = isDark ? "rgba(200,255,0,0.05)"   : "rgba(0,0,0,0.08)";
  const urlC    = isDark ? "rgba(200,255,0,0.30)"   : "rgba(0,0,0,0.34)";
  const bordC   = isDark ? "rgba(200,255,0,0.14)"   : "rgba(0,0,0,0.16)";
  const listBC  = isDark ? "rgba(200,255,0,0.10)"   : "rgba(0,0,0,0.10)";
  const ruleBg  = isDark ? "rgba(200,255,0,0.16)"   : "rgba(0,0,0,0.16)";
  const bnumC   = isDark ? "rgba(200,255,0,0.045)"  : "rgba(0,0,0,0.055)";
  const termBg  = isDark ? "rgba(200,255,0,0.06)"   : "transparent";
  const termBr  = isDark ? "rgba(200,255,0,0.18)"   : "transparent";
  const termFg  = isDark ? "rgba(200,255,0,0.68)"   : "transparent";

  const isFirst = slide.slide_number === 1;
  const hasLBar = isDark && !isFirst;
  const hasTBar = !isDark;
  const lines   = (slide.headline || "").split("\\n");
  const hlPx    = isFirst ? 86 : 66;
  const lhPx    = Math.round(hlPx * 1.14);

  // Progress dots
  const dots = Array.from({ length: total }).map((_, i) => {
    const on  = i === idx;
    const w   = on ? 36 : 14;
    const bgD = on ? accent : (isDark ? "rgba(200,255,0,0.22)" : "rgba(0,0,0,0.22)");
    return `<div style="height:12px;width:${w}px;border-radius:${on ? 6 : 7}px;background:${bgD};flex-shrink:0;"></div>`;
  }).join("");

  // List rows
  const listRows = (slide.list || []).slice(0, 5).map((item, i) => `
    <div style="display:flex;align-items:flex-start;gap:28px;padding:20px 0;
      border-bottom:1px solid ${listBC};">
      <span style="font-size:22px;font-weight:700;color:${accent};
        flex-shrink:0;letter-spacing:0.06em;padding-top:3px;">
        ${String(i + 1).padStart(2, "0")}
      </span>
      <span style="font-size:28px;line-height:1.5;color:${sub};font-weight:400;">
        ${item}
      </span>
    </div>`).join("");

  // Body block
  const bodyBlock = slide.body
    ? `<p style="font-size:28px;line-height:1.78;color:${sub};
        margin:0 0 40px;font-weight:400;">${slide.body}</p>`
    : "";

  // Terminal line — pinned above bottom bar
  const termBlock = (slide.terminal_line && isDark)
    ? `<div style="position:absolute;
        bottom:104px;
        left:${hasLBar ? 58 : 48}px;
        right:48px;
        display:flex;align-items:center;gap:20px;
        background:${termBg};border:1px solid ${termBr};
        border-radius:4px;padding:22px 30px;z-index:15;">
        <span style="font-size:22px;color:rgba(200,255,0,0.42);font-weight:400;">$</span>
        <span style="font-size:22px;color:${termFg};font-weight:400;
          letter-spacing:0.04em;">${slide.terminal_line}</span>
      </div>`
    : "";

  // CTA button — slide 8
  const ctaBlock = slide.slide_number === 8
    ? `<div style="display:inline-block;margin-top:44px;
        padding:30px 56px;background:${fg};color:${bg};
        font-size:24px;font-weight:800;letter-spacing:0.16em;
        text-transform:uppercase;border-radius:4px;">
        JOIN WAITLIST → HELIO.BOT
      </div>`
    : "";

  // Content positioning
  const contentLeft  = hasLBar ? 58 : 48;
  const contentTop   = hasTBar ? 120 : 100;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    width:1080px; height:1350px; overflow:hidden;
    background:${bg};
    /* System monospace stack — no external requests, renders instantly */
    font-family: 'Courier New', Courier, monospace;
    position:relative;
  }

  /* Grid background */
  .grid {
    position:absolute; inset:0; z-index:0; pointer-events:none;
    background-image:
      linear-gradient(${gridC} 1px, transparent 1px),
      linear-gradient(90deg, ${gridC} 1px, transparent 1px);
    background-size:54px 54px;
  }

  /* Subtle scanline */
  .scan {
    position:absolute; inset:0; z-index:1; pointer-events:none;
    background:repeating-linear-gradient(
      to bottom,
      transparent 0px, transparent 4px,
      rgba(0,0,0,0.022) 4px, rgba(0,0,0,0.022) 5px
    );
  }

  /* Ghost slide number */
  .bnum {
    position:absolute; right:-8px; bottom:-50px;
    font-size:500px; font-weight:700; line-height:1;
    color:${bnumC}; letter-spacing:-0.05em;
    z-index:2; pointer-events:none; user-select:none;
  }

  /* Accent bars */
  .lbar { position:absolute; top:92px; bottom:92px; left:0; width:10px; background:#C8FF00; z-index:6; }
  .tbar { position:absolute; top:92px; left:0; right:0; height:10px; background:#080808; z-index:6; }

  /* Top bar */
  .topbar {
    position:absolute; top:0; left:0; right:0; height:92px;
    display:flex; align-items:center; justify-content:space-between;
    padding:0 48px; z-index:20; background:${bg};
    border-bottom:1px solid ${bordC};
  }

  /* Bottom bar */
  .botbar {
    position:absolute; bottom:0; left:0; right:0; height:92px;
    display:flex; align-items:center; justify-content:space-between;
    padding:0 48px; z-index:20; background:${bg};
    border-top:1px solid ${bordC};
  }

  /* Main content wrapper */
  .content {
    position:absolute;
    left:${contentLeft}px; right:48px;
    z-index:10;
    display:flex; flex-direction:column;
    ${isFirst
      ? `bottom:104px; justify-content:flex-end;`
      : `top:${contentTop}px;`
    }
  }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="scan"></div>
  <div class="bnum">${String(slide.slide_number).padStart(2, "0")}</div>

  ${hasLBar ? '<div class="lbar"></div>' : ""}
  ${hasTBar ? '<div class="tbar"></div>' : ""}

  <!-- TOP BAR -->
  <div class="topbar">
    <span style="font-size:34px;font-weight:700;letter-spacing:0.16em;color:${accent};">
      HELIO
    </span>
    <span style="font-size:18px;font-weight:500;letter-spacing:0.18em;color:${eyeC};">
      ${isFirst
        ? "AGENT ONLINE"
        : `SLIDE ${String(slide.slide_number).padStart(2,"0")} OF ${String(total).padStart(2,"0")}`
      }
    </span>
  </div>

  <!-- CONTENT -->
  <div class="content">

    ${slide.eyebrow ? `
      <div style="font-size:20px;font-weight:600;letter-spacing:0.24em;
        text-transform:uppercase;color:${eyeC};margin-bottom:26px;">
        ${slide.eyebrow.toUpperCase()}
      </div>` : ""}

    <div style="font-size:${hlPx}px;font-weight:700;
      line-height:${lhPx}px;letter-spacing:-0.022em;
      color:${fg};margin-bottom:${isFirst ? 38 : 30}px;">
      ${lines.map(l => `<div>${l}</div>`).join("")}
    </div>

    ${isFirst ? `<div style="height:1px;background:${ruleBg};margin-bottom:38px;"></div>` : ""}

    ${bodyBlock}

    ${listRows ? `<div style="display:flex;flex-direction:column;margin-bottom:40px;">${listRows}</div>` : ""}

    ${ctaBlock}

  </div>

  <!-- TERMINAL LINE (dark slides) -->
  ${termBlock}

  <!-- BOTTOM BAR -->
  <div class="botbar">
    <span style="font-size:18px;letter-spacing:0.18em;color:${urlC};">helio.bot</span>
    <div style="display:flex;gap:10px;align-items:center;">${dots}</div>
  </div>

</body>
</html>`;
}

// ── STEP 4: RENDER VIA PUPPETEER ──────────────────────────
async function renderSlides(carousel) {
  console.log("🎨 Launching Puppeteer...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
    ],
  });

  const outputDir = path.join(__dirname, "..", "output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });

  // Block all external network requests to prevent timeouts
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    // Block fonts, analytics, external scripts — allow only data/local
    if (
      url.startsWith("https://fonts.googleapis.com") ||
      url.startsWith("https://fonts.gstatic.com") ||
      req.resourceType() === "font"
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  const filePaths = [];

  for (let i = 0; i < carousel.slides.length; i++) {
    const html = buildSlideHTML(carousel.slides[i], carousel.slides.length, i);

    await page.setContent(html, { waitUntil: "domcontentloaded" });
    // Brief wait for CSS paint only — no network dependency
    await new Promise(r => setTimeout(r, 300));

    const fp = path.join(outputDir, `slide-${i + 1}.jpg`);
    await page.screenshot({
      path: fp,
      type: "jpeg",
      quality: 96,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    });

    filePaths.push(fp);
    console.log(`  ✅ Slide ${i + 1}/${carousel.slides.length} rendered`);
  }

  await browser.close();
  console.log("✅ All slides rendered");
  return filePaths;
}

// ── STEP 5: UPLOAD TO SUPABASE ────────────────────────────
async function uploadSlides(filePaths, timestamp) {
  console.log("☁️  Uploading to Supabase...");
  const urls = [];

  for (let i = 0; i < filePaths.length; i++) {
    const file     = fs.readFileSync(filePaths[i]);
    const fileName = `carousel-${timestamp}/slide-${i + 1}.jpg`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file, { contentType: "image/jpeg", upsert: true });

    if (error) throw new Error(`Upload slide ${i + 1}: ${error.message}`);

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    urls.push(data.publicUrl);
    console.log(`  ✅ Slide ${i + 1} uploaded`);
  }

  console.log("✅ All uploaded");
  return urls;
}

// ── STEP 6: POST TO INSTAGRAM ─────────────────────────────
async function postToInstagram(imageUrls, caption) {
  console.log("📸 Posting to Instagram...");
  const base = `https://graph.facebook.com/v19.0/${IG_USER_ID}`;
  const ids  = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const p   = new URLSearchParams({
      image_url:        imageUrls[i],
      is_carousel_item: "true",
      access_token:     IG_ACCESS_TOKEN,
    });
    const res = await fetch(`${base}/media`, { method: "POST", body: p });
    const d   = await res.json();
    if (!d.id) throw new Error(`Container ${i + 1}: ${JSON.stringify(d)}`);
    ids.push(d.id);
    console.log(`  Container ${i + 1}: ${d.id}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  const cp  = new URLSearchParams({
    media_type:   "CAROUSEL",
    children:     ids.join(","),
    caption,
    access_token: IG_ACCESS_TOKEN,
  });
  const cr  = await fetch(`${base}/media`, { method: "POST", body: cp });
  const cd  = await cr.json();
  if (!cd.id) throw new Error(`Carousel container: ${JSON.stringify(cd)}`);
  console.log(`  Carousel container: ${cd.id}`);

  await new Promise(r => setTimeout(r, 6000));

  const pp  = new URLSearchParams({ creation_id: cd.id, access_token: IG_ACCESS_TOKEN });
  const pr  = await fetch(`${base}/media_publish`, { method: "POST", body: pp });
  const pd  = await pr.json();
  if (!pd.id) throw new Error(`Publish: ${JSON.stringify(pd)}`);
  console.log(`✅ Published! Post ID: ${pd.id}`);
  return pd.id;
}

// ── STEP 7: LOG ───────────────────────────────────────────
async function log(payload) {
  const { error } = await supabase.from("helio_posts").insert(payload);
  if (error) console.error("Log error:", error.message);
}

// ── MAIN ──────────────────────────────────────────────────
async function main() {
  console.log("\n══════════════════════════════════════");
  console.log("  HELIO PIPELINE —", new Date().toISOString());
  console.log("══════════════════════════════════════\n");

  const timestamp = Date.now();
  let topicData   = { topic: "", topicIndex: -1 };

  try {
    topicData       = await getTodaysTopic();
    const carousel  = await generateCarousel(topicData.topic);
    const filePaths = await renderSlides(carousel);
    const imageUrls = await uploadSlides(filePaths, timestamp);
    const caption   = `${carousel.caption}\n\n${(carousel.hashtags || []).map(h => `#${h.replace(/^#/, "")}`).join(" ")}`;
    const postId    = await postToInstagram(imageUrls, caption);

    await log({
      topic:       topicData.topic,
      topic_index: topicData.topicIndex,
      post_id:     postId,
      image_urls:  imageUrls,
      caption,
      status:      "success",
    });

    console.log("\n══════════════════════════════════════");
    console.log("  ✅ MISSION COMPLETE — Post ID:", postId);
    console.log("══════════════════════════════════════\n");

  } catch (err) {
    console.error("\n❌ PIPELINE FAILED:", err.message);
    await log({
      topic:       topicData.topic || "unknown",
      topic_index: topicData.topicIndex,
      post_id:     "",
      image_urls:  [],
      caption:     "",
      status:      "error",
      error:       err.message,
    });
    process.exit(1);
  }
}

main();
