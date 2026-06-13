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

// ── ENV ───────────────────────────────────────────────────
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

// ── TOPICS ────────────────────────────────────────────────
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
- Body: max 2 short lines
- Lists: max 5 items, each under 12 words
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
      "headline": "line1\\nline2",
      "body": "string",
      "list": ["item"],
      "terminal_line": "helio command"
    }
  ]
}`;

// ── STEP 1: GET TODAY'S TOPIC ─────────────────────────────
async function getTodaysTopic() {
  if (CUSTOM_TOPIC) {
    console.log("📋 Using custom topic:", CUSTOM_TOPIC);
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
  const topic = TOPICS[nextIndex];

  console.log(`📋 Topic [Day ${nextIndex + 1}/30]: ${topic}`);
  return { topic, topicIndex: nextIndex };
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
        content: `Generate a carousel on: "${topic}"\n\nSlide themes:\n1. Cover hook\n2. Problem/context\n3. Core concept\n4. Data/proof\n5. Framework/how-to\n6. Mistake/myth\n7. Key insight\n8. Soft CTA mentioning helio.bot\n\nReturn ONLY the JSON.`
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
function buildSlideHTML(slide, total, idx) {
  const isDark = slide.theme === "dark";
  const bg     = isDark ? "#080808" : "#C8FF00";
  const fg     = isDark ? "#ffffff" : "#080808";
  const accent = isDark ? "#C8FF00" : "#080808";
  const sub    = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.58)";
  const eyeC   = isDark ? "rgba(200,255,0,0.52)" : "rgba(0,0,0,0.46)";
  const gridC  = isDark ? "rgba(200,255,0,0.04)" : "rgba(0,0,0,0.07)";
  const urlC   = isDark ? "rgba(200,255,0,0.26)" : "rgba(0,0,0,0.3)";
  const bordC  = isDark ? "rgba(200,255,0,0.1)"  : "rgba(0,0,0,0.12)";
  const listB  = isDark ? "rgba(200,255,0,0.08)" : "rgba(0,0,0,0.08)";
  const termBg = isDark ? "rgba(200,255,0,0.05)" : "transparent";
  const termBr = isDark ? "rgba(200,255,0,0.13)" : "transparent";
  const termFg = isDark ? "rgba(200,255,0,0.6)"  : "transparent";

  const isFirst = slide.slide_number === 1;
  const hasLBar = isDark && !isFirst;
  const hasTBar = !isDark;
  const lines   = (slide.headline || "").split("\\n");
  const hlSize  = isFirst ? 48 : 38;

  const dotsHTML = Array.from({ length: total }).map((_, i) => {
    const active = i === idx;
    const w   = active ? "18px" : "7px";
    const bg2 = active ? accent : (isDark ? "rgba(200,255,0,0.18)" : "rgba(0,0,0,0.18)");
    return `<div style="height:7px;width:${w};border-radius:${active ? "3px" : "50%"};background:${bg2};"></div>`;
  }).join("");

  const listHTML = (slide.list || []).slice(0, 5).map((item, i) => `
    <div style="display:flex;align-items:baseline;gap:14px;font-size:14px;padding:10px 0;
      border-bottom:1px solid ${listB};color:${sub};">
      <span style="font-size:10px;font-weight:700;color:${accent};flex-shrink:0;">${String(i + 1).padStart(2, "0")}</span>
      <span>${item}</span>
    </div>`).join("");

  const bodyHTML = slide.body
    ? `<div style="font-size:14px;line-height:1.75;color:${sub};margin-bottom:14px;">${slide.body}</div>`
    : "";

  const termHTML = (slide.terminal_line && isDark)
    ? `<div style="display:flex;align-items:center;gap:10px;background:${termBg};
        border:1px solid ${termBr};border-radius:2px;padding:12px 16px;
        font-size:12px;color:${termFg};margin-top:auto;">
        <span style="opacity:0.4;">$</span><span>${slide.terminal_line}</span>
      </div>`
    : "";

  const ctaHTML = slide.slide_number === 8
    ? `<div style="margin-top:18px;display:inline-block;padding:15px 28px;
        background:${fg};color:${bg};font-size:13px;font-weight:800;
        letter-spacing:0.14em;text-transform:uppercase;border-radius:2px;">
        JOIN WAITLIST → HELIO.BOT
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1080px; height:1350px; overflow:hidden;
    background:${bg}; font-family:'Courier New',monospace; position:relative;
  }
  .grid {
    position:absolute; inset:0;
    background-image:
      linear-gradient(${gridC} 1px,transparent 1px),
      linear-gradient(90deg,${gridC} 1px,transparent 1px);
    background-size:60px 60px;
  }
  .bnum {
    position:absolute; right:-20px; bottom:-80px;
    font-size:420px; font-weight:800; line-height:1;
    color:${isDark ? "rgba(200,255,0,0.04)" : "rgba(0,0,0,0.05)"};
    letter-spacing:-0.05em; z-index:1;
  }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="bnum">${String(slide.slide_number).padStart(2, "0")}</div>

  ${hasLBar ? `<div style="position:absolute;top:92px;bottom:80px;left:0;width:8px;background:#C8FF00;z-index:5;"></div>` : ""}
  ${hasTBar ? `<div style="position:absolute;top:92px;left:0;right:0;height:8px;background:#080808;z-index:5;"></div>` : ""}

  <div style="position:absolute;top:0;left:0;right:0;height:92px;z-index:20;
    display:flex;justify-content:space-between;align-items:center;
    padding:0 48px;border-bottom:1px solid ${bordC};background:${bg};">
    <span style="font-size:28px;font-weight:800;letter-spacing:0.18em;color:${accent};">HELIO</span>
    <span style="font-size:15px;letter-spacing:0.18em;color:${eyeC};">
      ${isFirst ? "AGENT ONLINE" : `SLIDE ${String(slide.slide_number).padStart(2, "0")} OF ${String(total).padStart(2, "0")}`}
    </span>
  </div>

  <div style="position:absolute;
    top:${hasTBar ? "110px" : "92px"};bottom:80px;
    left:${hasLBar ? "60px" : "48px"};right:48px;
    z-index:10;display:flex;flex-direction:column;
    justify-content:${isFirst ? "flex-end" : "flex-start"};
    padding:${isFirst ? "0 0 48px" : "36px 0 0"};">

    ${slide.eyebrow ? `<div style="font-size:15px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${eyeC};margin-bottom:20px;">${slide.eyebrow}</div>` : ""}

    <div style="font-size:${hlSize}px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:${fg};margin-bottom:${isFirst ? "24px" : "20px"};">
      ${lines.map(l => `<div>${l}</div>`).join("")}
    </div>

    ${isFirst ? `<div style="height:1px;background:${isDark ? "rgba(200,255,0,0.14)" : "rgba(0,0,0,0.14)"};margin-bottom:24px;"></div>` : ""}
    ${bodyHTML}
    ${listHTML ? `<div style="margin-bottom:14px;">${listHTML}</div>` : ""}
    ${termHTML}
    ${ctaHTML}
  </div>

  <div style="position:absolute;bottom:0;left:0;right:0;height:80px;z-index:20;
    display:flex;justify-content:space-between;align-items:center;
    padding:0 48px;border-top:1px solid ${bordC};background:${bg};">
    <span style="font-size:15px;letter-spacing:0.18em;color:${urlC};">helio.bot</span>
    <div style="display:flex;gap:8px;align-items:center;">${dotsHTML}</div>
  </div>
</body>
</html>`;
}

// ── STEP 4: RENDER SLIDES TO JPG ─────────────────────────
async function renderSlides(carousel) {
  console.log("🎨 Launching Puppeteer with system Chrome...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1080,1350",
    ],
  });

  const outputDir = path.join(__dirname, "..", "output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const filePaths = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  for (let i = 0; i < carousel.slides.length; i++) {
    const slide = carousel.slides[i];
    const html  = buildSlideHTML(slide, carousel.slides.length, i);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 500));

    const filePath = path.join(outputDir, `slide-${i + 1}.jpg`);
    await page.screenshot({
      path: filePath,
      type: "jpeg",
      quality: 95,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    });

    filePaths.push(filePath);
    console.log(`  ✅ Slide ${i + 1}/${carousel.slides.length} rendered`);
  }

  await browser.close();
  console.log("✅ All slides rendered");
  return filePaths;
}

// ── STEP 5: UPLOAD TO SUPABASE ────────────────────────────
async function uploadSlides(filePaths, timestamp) {
  console.log("☁️  Uploading to Supabase Storage...");
  const publicUrls = [];

  for (let i = 0; i < filePaths.length; i++) {
    const file     = fs.readFileSync(filePaths[i]);
    const fileName = `carousel-${timestamp}/slide-${i + 1}.jpg`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file, { contentType: "image/jpeg", upsert: true });

    if (error) throw new Error(`Upload failed slide ${i + 1}: ${error.message}`);

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    publicUrls.push(data.publicUrl);
    console.log(`  ✅ Slide ${i + 1} uploaded`);
  }

  console.log("✅ All slides uploaded");
  return publicUrls;
}

// ── STEP 6: POST TO INSTAGRAM ─────────────────────────────
async function postToInstagram(imageUrls, caption) {
  console.log("📸 Posting to Instagram...");
  const base = `https://graph.facebook.com/v19.0/${IG_USER_ID}`;

  const containerIds = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const params = new URLSearchParams({
      image_url:        imageUrls[i],
      is_carousel_item: "true",
      access_token:     IG_ACCESS_TOKEN,
    });
    const res  = await fetch(`${base}/media`, { method: "POST", body: params });
    const data = await res.json();
    if (!data.id) throw new Error(`Container ${i + 1} failed: ${JSON.stringify(data)}`);
    containerIds.push(data.id);
    console.log(`  Container ${i + 1}: ${data.id}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  const carouselParams = new URLSearchParams({
    media_type:   "CAROUSEL",
    children:     containerIds.join(","),
    caption,
    access_token: IG_ACCESS_TOKEN,
  });
  const carRes  = await fetch(`${base}/media`, { method: "POST", body: carouselParams });
  const carData = await carRes.json();
  if (!carData.id) throw new Error(`Carousel container failed: ${JSON.stringify(carData)}`);
  console.log(`  Carousel container: ${carData.id}`);

  await new Promise(r => setTimeout(r, 5000));

  const pubParams = new URLSearchParams({
    creation_id:  carData.id,
    access_token: IG_ACCESS_TOKEN,
  });
  const pubRes  = await fetch(`${base}/media_publish`, { method: "POST", body: pubParams });
  const pubData = await pubRes.json();
  if (!pubData.id) throw new Error(`Publish failed: ${JSON.stringify(pubData)}`);

  console.log(`✅ Published! Post ID: ${pubData.id}`);
  return pubData.id;
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

    const hashtags = (carousel.hashtags || [])
      .map(h => `#${h.replace(/^#/, "")}`)
      .join(" ");
    const caption = `${carousel.caption}\n\n${hashtags}`;

    const postId = await postToInstagram(imageUrls, caption);

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
