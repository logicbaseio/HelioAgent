import fs from "node:fs";
import path from "node:path";
import { chromium as playwrightChromium } from "playwright-core";
import chromium from "@sparticuz/chromium";

const GRAPH_BASE = process.env.META_GRAPH_BASE || "https://graph.facebook.com/v20.0";
const CONTENT_ROOT = path.resolve(process.cwd(), "Content");
const CONFIG_BUCKET = process.env.CAROUSEL_CONFIG_BUCKET || "helio-automation-config";
const CONFIG_OBJECT = "automation/config.json";

export async function generateSlides(payload) {
  const provider = payload.provider || process.env.AI_PROVIDER || "anthropic";
  const prompt = provider === "anthropic" ? fullPrompt(payload) : compactPrompt(payload);
  const apiKey = normalizeApiKey(payload.apiKey || providerApiKey(provider));
  if (!apiKey) throw new Error(`Missing API key for provider: ${provider}`);

  let slides;
  try {
    if (provider === "anthropic") {
      slides = await generateAnthropic({ apiKey, prompt, model: payload.model });
    } else {
      slides = await generateOpenAiCompatible({
        provider,
        apiKey,
        prompt,
        model: payload.model,
        baseUrl: payload.baseUrl,
      });
    }
  } catch (error) {
    if (provider !== "synterolink" || !shouldUseDeterministicFallback(error.message)) {
      throw error;
    }
    console.warn(`[carousel] synterolink unavailable, using deterministic fallback: ${error.message}`);
    slides = deterministicFallbackSlides(payload, error.message);
  }
  return normalizeSlides(slides, payload);
}

function fullPrompt(payload) {
  if (!payload.prompt) return compactPrompt(payload);
  return [
    payload.prompt,
    "",
    "CONTENT PLAN DAY:",
    JSON.stringify(payload.day || {}, null, 2),
  ].join("\n");
}

export async function getAutomationConfig() {
  try {
    const config = await downloadConfigObject();
    return config || defaultAutomationConfig();
  } catch {
    return defaultAutomationConfig();
  }
}

export async function saveAutomationConfig(input) {
  await ensureConfigBucket();
  const existing = await getAutomationConfig();
  const next = {
    ...existing,
    ...input,
    settings: { ...(existing.settings || {}), ...(input.settings || {}) },
    updatedAt: new Date().toISOString(),
  };
  await uploadConfigObject(next);
  return redactConfig(next);
}

export function redactConfig(config) {
  const copy = { ...config };
  if (copy.apiKey) copy.apiKeySaved = true;
  if (copy.accessToken) copy.accessTokenSaved = true;
  delete copy.apiKey;
  delete copy.accessToken;
  return copy;
}

function defaultAutomationConfig() {
  return {
    aiProvider: "synterolink",
    aiModel: "claude-sonnet-4-6",
    apiBaseUrl: "",
    coverTheme: "alternate",
    caption: "#SEO #AEO #GEO #HELIO #heliobot",
    postTime: "09:00",
    timezone: "Asia/Karachi",
    settings: { autoGen: false, autoPost: false, saveHtml: true },
    coverCounter: 0,
    lastRunDate: "",
    lastDay: 0,
    dayStatus: {},
  };
}

export async function getDayStatus(dayNumber) {
  const config = await getAutomationConfig();
  return config.dayStatus?.[String(dayNumber)] || null;
}

export async function markDayGenerated(day, meta = {}) {
  return updateDayStatus(day, { generatedAt: new Date().toISOString(), ...meta });
}

export async function markDayPosted(day, meta = {}) {
  return updateDayStatus(day, { postedAt: new Date().toISOString(), ...meta });
}

async function updateDayStatus(day, patch) {
  const dayNumber = Number(day?.day || day);
  if (!dayNumber) return null;
  const config = await getAutomationConfig();
  const key = String(dayNumber);
  const next = {
    ...config,
    dayStatus: {
      ...(config.dayStatus || {}),
      [key]: {
        ...(config.dayStatus?.[key] || {}),
        day: dayNumber,
        topic: day?.topic || config.dayStatus?.[key]?.topic || "",
        ...patch,
      },
    },
    updatedAt: new Date().toISOString(),
  };
  await uploadConfigObject(next);
  return next.dayStatus[key];
}

async function ensureConfigBucket() {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ id: CONFIG_BUCKET, name: CONFIG_BUCKET, public: false }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  const msg = `${data?.message || data?.error || ""}`;
  if (/already exists|duplicate/i.test(msg)) return;
  throw new Error(`Config bucket setup failed: ${msg || res.status}`);
}

async function downloadConfigObject() {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${CONFIG_BUCKET}/${CONFIG_OBJECT}`, {
    headers: { authorization: `Bearer ${key}`, apikey: key },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Config read failed: ${res.status}`);
  return res.json();
}

async function uploadConfigObject(config) {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${CONFIG_BUCKET}/${CONFIG_OBJECT}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      "content-type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify(config, null, 2),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || data?.error || `Config save failed: ${res.status}`);
  }
}

function compactPrompt(payload) {
  const day = payload.day || {};
  const count = Number(payload.slideCount || 6);
  const coverTheme = payload.coverTheme || "dark";
  const themes = Array.from({ length: count }, (_, i) => {
    if (coverTheme === "dark") return i % 2 === 0 ? "dark" : "light";
    return i % 2 === 0 ? "light" : "dark";
  });

  const blueprint = slideBlueprint(count);

  return `Generate exactly ${count} Instagram carousel slides for HELIO, an autonomous SEO/AEO/GEO agent.
Topic: ${day.topic}
Pillar: ${day.pillar}
Concept: ${day.concept}
Voice: terminal, precise, confident, no fluff.
Themes: ${themes.map((theme, i) => `S${i + 1}:${theme}`).join(", ")}
Slide blueprint: ${blueprint.map((type, i) => `S${i + 1}:${type}`).join(", ")}

Rules:
- Return ONLY valid JSON: {"slides":[...]}.
- The slides array must contain exactly ${count} objects.
- Use the exact slideNum, theme, and type from the blueprint.
- Every string field must be non-empty. No empty strings, empty arrays, nulls, undefined, or placeholder text.
- Headline line breaks use \\n. Keep each headline line under 5 words.
- Body copy must be one useful sentence, not a label.
- List items must be plain strings, 3-5 items.
- tableRows must contain 3-4 objects with non-empty signal, old, and new fields.
- pills must contain 3 objects with non-empty num and label fields.
- urgency items must contain 3 objects with non-empty label and numeric value from 35 to 95.
- split slides must include splitLeft and splitRight objects, each with label, headline, and body.
- CTA slide must include ctaText and ctaSubtext.

Required object fields by type:
- cover: slideNum, theme, type, eyebrow, headline, subline, body, ghostWord, tagline
- definition: slideNum, theme, type, eyebrow, headline, body, chips
- stats: slideNum, theme, type, eyebrow, headline, body, pills
- list: slideNum, theme, type, eyebrow, headline, body, items
- comparison: slideNum, theme, type, eyebrow, headline, body, tableRows
- urgency: slideNum, theme, type, eyebrow, headline, body, items
- split: slideNum, theme, type, eyebrow, headline, body, splitLeft, splitRight
- cta: slideNum, theme, type, eyebrow, headline, body, ctaText, ctaSubtext`;
}

function slideBlueprint(count) {
  const blueprints = {
    6: ["cover", "definition", "stats", "comparison", "list", "cta"],
    7: ["cover", "definition", "stats", "comparison", "split", "list", "cta"],
    8: ["cover", "definition", "stats", "comparison", "list", "split", "urgency", "cta"],
    9: ["cover", "definition", "stats", "comparison", "list", "split", "stats", "urgency", "cta"],
    10: ["cover", "definition", "comparison", "list", "stats", "split", "definition", "urgency", "list", "cta"],
  };
  if (blueprints[count]) return blueprints[count];
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return "cover";
    if (i === count - 1) return "cta";
    return ["definition", "stats", "comparison", "list", "split", "urgency"][(i - 1) % 6];
  });
}

function normalizeSlides(inputSlides, payload) {
  const day = payload.day || {};
  const count = Number(payload.slideCount || inputSlides?.length || 6);
  const coverTheme = payload.coverTheme || "dark";
  const blueprint = slideBlueprint(count);
  const slides = Array.isArray(inputSlides) ? inputSlides : [];

  return blueprint.map((type, index) => {
    const source = slides[index] && typeof slides[index] === "object" ? slides[index] : {};
    const theme = themeFor(index, coverTheme);
    return normalizeSlide({ ...source, type, theme, slideNum: index + 1 }, day, count);
  });
}

function deterministicFallbackSlides(payload, reason = "") {
  const day = payload.day || {};
  const count = Number(payload.slideCount || 6);
  const coverTheme = payload.coverTheme || "dark";
  const blueprint = slideBlueprint(count);
  const topic = cleanText(day.topic, "Why Manual SEO Stops Compounding");
  const concept = cleanText(day.concept, "Manual SEO systems decay when monitoring, refreshes, and technical fixes do not run continuously.");
  const keyword = keywordFor(topic);
  const main = titleCore(topic);
  const decayWindow = /6 months/i.test(topic) ? "6 months" : "one crawl cycle";

  return blueprint.map((type, index) => {
    const theme = themeFor(index, coverTheme);
    const base = { slideNum: index + 1, theme, type };
    if (type === "cover") {
      return {
        ...base,
        eyebrow: `RANKING DECAY // ${keyword}`,
        headline: breakHeadline(main || topic, 4),
        subline: "Ranking decay is not random. It is an operations problem.",
        body: concept,
        ghostWord: keyword === "MANUAL" ? "DECAY" : keyword,
        tagline: "CONTENT DECAY ANALYSIS // HELIO",
        fallbackReason: reason,
      };
    }
    if (type === "definition") {
      return {
        ...base,
        eyebrow: `FIELD DEFINITION // ${keyword}`,
        headline: "RANKINGS\nDECAY WHEN\nSIGNALS STALE",
        body: `After ${decayWindow}, competitors refresh answers, links shift, search intent moves, and old content stops matching the live SERP.`,
        chips: ["Intent drift", "Stale answers", "Weaker freshness"],
      };
    }
    if (type === "stats") {
      return {
        ...base,
        eyebrow: "DECAY SIGNALS // CONTENT OPS",
        headline: "WHAT BREAKS\nAFTER THE\nPUBLISH DATE",
        body: "The article may still exist, but its ranking signals start losing alignment.",
        pills: [
          { num: "30d", label: "SERP movement" },
          { num: "90d", label: "intent drift" },
          { num: "180d", label: "content decay" },
        ],
      };
    }
    if (type === "comparison") {
      return {
        ...base,
        eyebrow: "EXECUTION ANALYSIS // BEFORE AFTER",
        headline: "MANUAL BLOG\nVS AGENT\nREFRESH LOOP",
        body: "The difference is not more content. It is continuous maintenance.",
        tableRows: [
          { signal: "Intent check", old: "When traffic drops", new: "Always watching" },
          { signal: "Content refresh", old: "Quarterly task", new: "Triggered by drift" },
          { signal: "Internal links", old: "Manual audit", new: "Live opportunities" },
          { signal: "Schema updates", old: "Forgotten", new: "Kept current" },
        ],
      };
    }
    if (type === "list") {
      return {
        ...base,
        eyebrow: "PROTOCOL AUDIT // LOST RANKINGS",
        headline: "WHY BLOG\nPOSTS STOP\nRANKING",
        body: "Most ranking drops come from neglected maintenance, not bad writing.",
        items: [
          "Search intent changes after the post goes live",
          "Competitors update examples, stats, and structure",
          "Internal links stop supporting the page",
          "Schema, FAQs, and answer blocks fall behind",
        ],
      };
    }
    if (type === "urgency") {
      return {
        ...base,
        eyebrow: "COMPOUND DEBT // CONTENT DECAY",
        headline: "WAITING\nMAKES THE\nDROP STEEPER",
        body: "Small gaps become a ranking slide when nobody monitors them daily.",
        items: [
          { label: "Intent drift", value: 76 },
          { label: "Freshness gap", value: 84 },
          { label: "Link decay", value: 68 },
        ],
      };
    }
    if (type === "split") {
      return {
        ...base,
        eyebrow: "SYSTEM COMPARISON // HUMAN VS AGENT",
        headline: "STATIC POST\nVS LIVE\nSEO LOOP",
        body: "Publishing is the start of the ranking cycle, not the end.",
        splitLeft: { label: "MANUAL", headline: "Publish\nand wait", body: "Teams notice decay after traffic has already dropped." },
        splitRight: { label: "HELIO", headline: "Detect\nand refresh", body: "HELIO watches drift and turns changes into action." },
      };
    }
    return {
      ...base,
      eyebrow: "MISSION CONTROL // HELIO",
      headline: "STOP LOSING\nRANKINGS\nIN SILENCE",
      body: "HELIO keeps SEO, AEO, and GEO pages monitored, refreshed, and aligned with live search demand.",
      ctaText: "Join the HELIO Waitlist",
      ctaSubtext: "helio.bot · Early access",
    };
  });
}

function shouldUseDeterministicFallback(message) {
  return /failed for all configured models|HTTP 403|forbidden|no available accounts|quota|rate limit|HTTP 429/i.test(message);
}

function titleCore(topic) {
  return String(topic || "")
    .replace(/^why\s+/i, "")
    .replace(/\?+$/g, "")
    .trim();
}

function breakHeadline(input, maxLines = 4) {
  const words = String(input || "SEO RANKINGS DECAY").toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 14 && line && lines.length < maxLines - 1) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).join("\n");
}

function normalizeSlide(slide, day, count) {
  const topic = cleanText(day.topic, "SEO growth bottleneck");
  const concept = cleanText(day.concept, "Manual SEO work creates compounding execution debt.");
  const type = cleanText(slide.type, "definition");
  const base = {
    ...slide,
    eyebrow: cleanText(slide.eyebrow, eyebrowFor(type, day)),
    headline: cleanHeadline(slide.headline, headlineFor(type, day)),
    body: cleanText(slide.body, bodyFor(type, day)),
  };

  if (type === "cover") {
    base.subline = cleanText(base.subline, "Manual workflows turn ranking opportunities into delays.");
    base.ghostWord = cleanText(base.ghostWord, keywordFor(topic));
    base.tagline = cleanText(base.tagline, "GROWTH SYSTEM ANALYSIS // HELIO");
  }
  if (type === "definition") {
    base.chips = cleanStringArray(base.chips, definitionChips(topic, concept), 3);
  }
  if (type === "stats") {
    base.pills = cleanObjectArray(base.pills, defaultPills(day), 3, ["num", "label"]);
  }
  if (type === "list") {
    base.items = cleanStringArray(base.items, defaultListItems(day), 4);
  }
  if (type === "comparison") {
    base.tableRows = cleanObjectArray(base.tableRows, defaultTableRows(day), 3, ["signal", "old", "new"]);
  }
  if (type === "urgency") {
    base.items = cleanUrgencyItems(base.items, defaultUrgencyItems(day));
  }
  if (type === "split") {
    base.splitLeft = cleanPanel(base.splitLeft, { label: "MANUAL", headline: "Slow queue", body: "Every fix waits for another audit, brief, and handoff." });
    base.splitRight = cleanPanel(base.splitRight, { label: "HELIO", headline: "Agent loop", body: "Detection, prioritization, and deployment move without waiting." });
  }
  if (type === "cta") {
    base.ctaText = cleanText(base.ctaText, "Join the HELIO Waitlist");
    base.ctaSubtext = cleanText(base.ctaSubtext, "helio.bot · Early access");
    base.body = cleanText(base.body, `Deploy an autonomous SEO/AEO/GEO agent before ${keywordFor(topic).toLowerCase()} becomes another backlog.`);
  }

  base.slideNum = Number(base.slideNum || 1);
  base.theme = base.theme === "light" ? "light" : "dark";
  base.progress = `${String(base.slideNum).padStart(2, "0")}/${String(count).padStart(2, "0")}`;
  return base;
}

function themeFor(index, coverTheme) {
  if (coverTheme === "light") return index % 2 === 0 ? "light" : "dark";
  return index % 2 === 0 ? "dark" : "light";
}

function cleanText(value, fallback) {
  const text = stringify(value).replace(/\s+/g, " ").trim();
  if (!text || /\[object object\]|undefined|null/i.test(text)) return fallback;
  return text;
}

function cleanHeadline(value, fallback) {
  const text = stringify(value).replace(/\r/g, "").trim();
  if (!text || /\[object object\]|undefined|null/i.test(text)) return fallback;
  return text.split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}

function stringify(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function cleanStringArray(value, fallback, min) {
  const fromInput = Array.isArray(value)
    ? value.map((item) => cleanText(typeof item === "object" ? item.label || item.title || item.text : item, "")).filter(Boolean)
    : [];
  return [...fromInput, ...fallback].filter(Boolean).slice(0, Math.max(min, fromInput.length || min));
}

function cleanObjectArray(value, fallback, min, keys) {
  const rows = Array.isArray(value) ? value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = {};
    for (const key of keys) row[key] = cleanText(item[key], "");
    return keys.every((key) => row[key]) ? row : null;
  }).filter(Boolean) : [];
  return [...rows, ...fallback].slice(0, Math.max(min, rows.length || min));
}

function cleanUrgencyItems(value, fallback) {
  const rows = Array.isArray(value) ? value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const label = cleanText(item.label || item.title, "");
    const valueNum = Math.max(35, Math.min(95, Number(item.value || item.score || 65)));
    return label ? { label, value: valueNum } : null;
  }).filter(Boolean) : [];
  return [...rows, ...fallback].slice(0, 3);
}

function cleanPanel(value, fallback) {
  const input = value && typeof value === "object" ? value : {};
  return {
    label: cleanText(input.label, fallback.label),
    headline: cleanText(input.headline, fallback.headline),
    body: cleanText(input.body, fallback.body),
  };
}

function keywordFor(topic) {
  if (/aeo/i.test(topic)) return "AEO";
  if (/geo/i.test(topic)) return "GEO";
  if (/schema/i.test(topic)) return "SCHEMA";
  if (/content/i.test(topic)) return "CONTENT";
  return "MANUAL";
}

function eyebrowFor(type, day) {
  const keyword = keywordFor(day.topic || "");
  const labels = {
    cover: `GROWTH PROBLEM // ${keyword}`,
    definition: `FIELD DEFINITION // ${keyword}`,
    stats: "SIGNAL COST // MANUAL WORK",
    list: "PROTOCOL AUDIT // BOTTLENECKS",
    comparison: "EXECUTION ANALYSIS // BEFORE AFTER",
    urgency: "COMPOUND DEBT // DELAY COST",
    split: "SYSTEM COMPARISON // HUMAN VS AGENT",
    cta: "MISSION CONTROL // HELIO",
  };
  return labels[type] || "MISSION ANALYSIS // HELIO";
}

function headlineFor(type, day) {
  const topic = cleanText(day.topic, "SEO Growth System");
  const keyword = keywordFor(topic);
  const labels = {
    cover: topic.toUpperCase().replace(/\s+/g, "\n"),
    definition: `${keyword} IS\nTHE NEW\nDISCOVERY LAYER`,
    stats: "THE HIDDEN\nCOST OF\nMANUAL SEO",
    list: "WHAT YOUR\nTEAM KEEPS\nREPEATING",
    comparison: "MANUAL LOOP\nVS AGENT\nLOOP",
    urgency: "WAITING\nMAKES THE\nBACKLOG COMPOUND",
    split: "HUMAN QUEUE\nVS HELIO\nEXECUTION",
    cta: "DEPLOY THE\nSEO AGENT",
  };
  return labels[type] || topic.toUpperCase();
}

function bodyFor(type, day) {
  const concept = cleanText(day.concept, "Manual SEO work creates compounding execution debt.");
  const labels = {
    cover: concept,
    definition: "Answer engines reward structured, current, machine-readable authority signals.",
    stats: "Manual workflows spend the most time moving information between tools instead of improving rankings.",
    list: "These repeated tasks look small alone, then quietly consume the week.",
    comparison: "The work does not disappear; the execution loop gets compressed.",
    urgency: "Every delayed fix gives competitors another crawl cycle to pull ahead.",
    split: "Manual processes wait for people; agent processes keep monitoring and acting.",
    cta: "HELIO turns SEO, AEO, and GEO operations into an autonomous execution loop.",
  };
  return labels[type] || concept;
}

function definitionChips(topic, concept) {
  if (/aeo/i.test(topic)) return ["Answer extraction", "Entity clarity", "Citation readiness"];
  if (/geo/i.test(topic)) return ["Generative visibility", "Source authority", "Mention quality"];
  return ["Crawl signals", "Content updates", "Ranking intent"];
}

function defaultPills(day) {
  const keyword = keywordFor(day.topic || "");
  return [
    { num: "12h", label: `${keyword} audits` },
    { num: "6h", label: "metadata fixes" },
    { num: "24/7", label: "missed monitoring" },
  ];
}

function defaultListItems(day) {
  if (/aeo/i.test(day.topic || "")) {
    return ["Rewrite pages for answer extraction", "Map entities across service pages", "Keep schema current", "Track AI answer visibility"];
  }
  return ["Find technical issues", "Rewrite stale metadata", "Patch internal links", "Report the same gaps again"];
}

function defaultTableRows(day) {
  const keyword = keywordFor(day.topic || "");
  return [
    { signal: `${keyword} audit`, old: "Manual review", new: "Continuous scan" },
    { signal: "Priority fixes", old: "Spreadsheet queue", new: "Ranked actions" },
    { signal: "Deployment", old: "Waiting cycle", new: "Agent loop" },
  ];
}

function defaultUrgencyItems(day) {
  const keyword = keywordFor(day.topic || "");
  return [
    { label: `${keyword} visibility gap`, value: 82 },
    { label: "Competitor crawl cycles", value: 74 },
    { label: "Backlog pressure", value: 88 },
  ];
}

async function generateAnthropic({ apiKey, prompt, model }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 7000),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) throw new Error(data?.error?.message || data?.raw || `Anthropic HTTP ${response.status}`);
  return parseSlides(data.content?.find((block) => block.type === "text")?.text || "", "anthropic");
}

async function generateOpenAiCompatible({ provider, apiKey, prompt, model, baseUrl }) {
  const base = resolveBaseUrl(provider, baseUrl);
  const models = provider === "synterolink"
    ? [...new Set([model, ...fallbackModels(provider)].filter(Boolean))]
    : model ? [model] : fallbackModels(provider);
  const attempts = [];

  for (const selectedModel of models) {
    try {
      console.log(`[carousel] ${provider}: trying model ${selectedModel}`);
      return await generateOpenAiModel({ provider, apiKey, prompt, baseUrl: base, model: selectedModel });
    } catch (error) {
      attempts.push({ model: selectedModel, error: error.message });
      console.warn(`[carousel] ${provider}: model ${selectedModel} failed: ${error.message}`);
      if (!(provider === "synterolink" && shouldTryNextSynteroLinkModel(error.message))) {
        throw error;
      }
    }
  }

  if (attempts.length) {
    throw new Error(`${provider} failed for all configured models: ${attempts.map((a) => `${a.model}: ${a.error}`).join(" | ")}`);
  }
  throw new Error(`${provider} generation failed`);
}

function shouldTryNextSynteroLinkModel(message) {
  return /no available accounts|model|not found|unavailable|empty content|json|HTTP 403|forbidden|not allowed|account is forbidden/i.test(message);
}

async function generateOpenAiModel({ provider, apiKey, prompt, baseUrl, model }) {
  const data = await postChatCompletion({ provider, apiKey, prompt, baseUrl, model, useResponseFormat: provider !== "synterolink" });
  const text = extractText(data);
  try {
    return parseSlides(text, provider);
  } catch (error) {
    if (provider !== "synterolink") throw error;
    const retry = await postChatCompletion({
      provider,
      apiKey,
      prompt: `${prompt}\n\nOutput minified JSON only. Start with {"slides":[ and end with ]}.`,
      baseUrl,
      model,
      useResponseFormat: false,
      temperature: 0.2,
    });
    return parseSlides(extractText(retry), provider);
  }
}

async function postChatCompletion({ provider, apiKey, prompt, baseUrl, model, useResponseFormat, temperature = 0.7 }) {
  const body = {
    model,
    temperature,
    max_tokens: Number(process.env.AI_MAX_TOKENS || 7000),
    messages: [
      { role: "system", content: "Return only valid JSON. No markdown. No prose." },
      { role: "user", content: prompt },
    ],
  };
  if (useResponseFormat) body.response_format = { type: "json_object" };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? {
        "http-referer": "https://helio.bot",
        "x-title": "HELIO Carousel Studio",
      } : {}),
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { raw: responseText };
  }
  if (!response.ok) {
    throw new Error(providerHttpError(provider, response.status, data));
  }
  return data;
}

function providerHttpError(provider, status, data) {
  const detail = data?.error?.message
    || data?.error
    || data?.message
    || data?.raw
    || "";
  const cleanDetail = typeof detail === "string" ? detail.trim() : JSON.stringify(detail);
  if (status === 401) return `${provider} HTTP 401: invalid or expired API key`;
  if (status === 403) {
    return `${provider} HTTP 403: API key is valid but this account is forbidden from using the requested endpoint/model${cleanDetail ? ` (${cleanDetail})` : ""}`;
  }
  if (status === 429) return `${provider} HTTP 429: rate limit or quota exceeded${cleanDetail ? ` (${cleanDetail})` : ""}`;
  return `${provider} HTTP ${status}${cleanDetail ? `: ${cleanDetail}` : ""}`;
}

function parseSlides(text, provider) {
  const clean = String(text || "").replace(/```json|```/gi, "").trim();
  if (!clean) throw new Error(`${provider} returned empty content`);
  const parsed = JSON.parse(extractJson(clean));
  const slides = Array.isArray(parsed) ? parsed : parsed.slides;
  if (!Array.isArray(slides) || slides.length === 0) throw new Error(`${provider} returned an empty slide array`);
  return slides;
}

function extractJson(text) {
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) return text.slice(objectStart, objectEnd + 1);
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1);
  return text;
}

function extractText(data) {
  const message = data.choices?.[0]?.message || {};
  const content = message.content ?? message.reasoning_content ?? data.output_text ?? data.raw ?? "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : part.text || part.content || "").join("");
  return String(content || "");
}

function resolveBaseUrl(provider, baseUrl) {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "deepseek") return "https://api.deepseek.com/v1";
  if (provider === "synterolink") return "https://api.synterolink.com/v1";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  if (!baseUrl) throw new Error("Custom OpenAI-compatible provider requires API Base URL");
  return baseUrl;
}

function fallbackModels(provider) {
  if (provider === "synterolink") return ["claude-sonnet-4-6", "claude-opus-4-6", "claude-opus-4-7", "gpt-5.5", "gpt-5.3-codex"];
  if (provider === "openai") return [process.env.OPENAI_MODEL || "gpt-4.1"];
  if (provider === "deepseek") return [process.env.DEEPSEEK_MODEL || "deepseek-chat"];
  if (provider === "openrouter") return [process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet"];
  return [process.env.AI_MODEL || "gpt-4.1"];
}

function providerApiKey(provider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY;
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (provider === "synterolink") return process.env.SYNTEROLINK_API_KEY;
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY;
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
}

export async function publishCarousel(payload) {
  const day = payload.day || {};
  const date = new Date().toISOString().slice(0, 10);
  const slug = `${date}-day${String(day.day || "x").padStart(2, "0")}-${safeSlug(day.topic)}`;
  const outDir = process.env.VERCEL ? path.join("/tmp", slug) : path.join(CONTENT_ROOT, "daily_carousels", slug);
  const baseName = `HELIO_Day${String(day.day || "x").padStart(2, "0")}_${date}`;
  const slides = payload.slides || [];
  const images = Array.isArray(payload.images) ? payload.images : [];
  if (images.length) {
    if (images.length < 2 || images.length > 10) throw new Error("Instagram carousel requires 2-10 images");
  } else if (slides.length < 2 || slides.length > 10) {
    throw new Error("Instagram carousel requires 2-10 slides");
  }

  fs.mkdirSync(outDir, { recursive: true });
  const jpgs = images.length
    ? writeClientRenderedImages(images, outDir, baseName)
    : await renderSlides(slides, outDir, baseName);

  const token = payload.accessToken || process.env.META_LONG_LIVED_ACCESS_TOKEN;
  const igUserId = payload.igUserId || process.env.IG_USER_ID;
  if (!token) throw new Error("Missing Meta access token");
  if (!igUserId) throw new Error("Missing Instagram user id");

  const objectPrefix = process.env.SUPABASE_OBJECT_PREFIX || `ig-carousels/${slug}`;
  const imageUrls = [];
  const mediaContainerIds = [];

  for (const jpg of jpgs) {
    const imageUrl = await uploadToSupabase(jpg, objectPrefix);
    imageUrls.push(imageUrl);
    const media = await graphPost(`/${igUserId}/media`, { image_url: imageUrl, is_carousel_item: "true" }, token);
    mediaContainerIds.push(media.id);
    await waitForContainerReady(media.id, token, `Slide ${mediaContainerIds.length}`, { attempts: 12, intervalMs: 3000 });
  }

  const carousel = await graphPost(`/${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: mediaContainerIds.join(","),
    caption: payload.caption || "",
  }, token);
  const published = await publishWhenReady(igUserId, carousel.id, token);

  return { ok: true, outDir, imageCount: jpgs.length, imageUrls, creationId: carousel.id, mediaId: published.id };
}

function writeClientRenderedImages(images, outDir, baseName) {
  return images.map((image, index) => {
    const raw = String(image || "");
    const match = raw.match(/^data:image\/(?:jpeg|jpg);base64,([a-z0-9+/=]+)$/i);
    if (!match) throw new Error(`Invalid client-rendered image at slide ${index + 1}`);
    const jpg = path.join(outDir, `${baseName}_Slide_${String(index + 1).padStart(2, "0")}.jpg`);
    fs.writeFileSync(jpg, Buffer.from(match[1], "base64"));
    return jpg;
  });
}

export async function runDailyAutomation(now = new Date()) {
  const config = await getAutomationConfig();
  if (!config.settings?.autoGen) return { ok: true, skipped: true, reason: "autoGen disabled" };

  const local = localDateParts(now, config.timezone || "UTC");
  if (config.lastRunDate === local.date) return { ok: true, skipped: true, reason: "already ran today", date: local.date };
  if (!isTimeDue(local.time, config.postTime || "09:00")) {
    return { ok: true, skipped: true, reason: "not due yet", now: local.time, due: config.postTime, timezone: config.timezone };
  }

  const nextDay = nextUnpostedDay(config);
  if (!nextDay) return { ok: true, skipped: true, reason: "all 30 days posted" };
  const day = getContentDay(nextDay);
  const coverTheme = nextCoverTheme(config);
  const slideData = await generateSlides({
    provider: config.aiProvider,
    apiKey: config.apiKey,
    model: config.aiModel,
    baseUrl: config.apiBaseUrl,
    day,
    coverTheme,
    slideCount: getSlideCount(day),
  });
  const slides = await renderSlideDataToHtml(slideData);

  let publishResult = null;
  if (config.settings?.autoPost) {
    publishResult = await publishCarousel({
      day,
      slides,
      caption: buildAutomationCaption(day, config.caption),
      accessToken: config.accessToken,
      igUserId: config.igUserId,
    });
  }

  const nextConfig = {
    ...config,
    lastRunDate: local.date,
    lastDay: nextDay,
    coverCounter: Number(config.coverCounter || 0) + 1,
    lastRunAt: now.toISOString(),
    dayStatus: {
      ...(config.dayStatus || {}),
      [String(nextDay)]: {
        ...(config.dayStatus?.[String(nextDay)] || {}),
        day: nextDay,
        topic: day.topic,
        generatedAt: now.toISOString(),
        ...(publishResult ? { postedAt: now.toISOString(), mediaId: publishResult.mediaId, creationId: publishResult.creationId } : {}),
      },
    },
    lastResult: publishResult ? { mediaId: publishResult.mediaId, creationId: publishResult.creationId } : { generated: true },
  };
  await uploadConfigObject(nextConfig);

  return { ok: true, day: nextDay, topic: day.topic, published: Boolean(publishResult), publishResult };
}

function nextUnpostedDay(config) {
  const start = Number(config.lastDay || 0);
  const status = config.dayStatus || {};
  for (let offset = 1; offset <= 30; offset += 1) {
    const day = ((start + offset - 1) % 30) + 1;
    if (!status[String(day)]?.postedAt) return day;
  }
  return null;
}

function localDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function isTimeDue(current, due) {
  return minutes(current) >= minutes(due);
}

function minutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function nextCoverTheme(config) {
  if (config.coverTheme === "dark" || config.coverTheme === "light") return config.coverTheme;
  return Number(config.coverCounter || 0) % 2 === 0 ? "dark" : "light";
}

function buildAutomationCaption(day, tags = "") {
  return [day.topic, "", day.concept, "", "CTA: Join Waitlist -> helio.bot", "", tags].join("\n");
}

function getSlideCount(day) {
  const t = String(day.topic || "").toLowerCase();
  const complex = ["compound debt", "aeo", "geo", "core web vitals", "schema", "link building", "anatomy", "crawlability", "indexing"];
  const medium = ["keyword", "mobile", "structured data", "page speed", "compound", "algorithm", "stack"];
  if (complex.some((k) => t.includes(k))) return 10;
  if (medium.some((k) => t.includes(k))) return 8;
  return 6;
}

function getContentDay(dayNumber) {
  const htmlPaths = [
    path.join(process.cwd(), "public", "carousel-studio.html"),
    path.join(process.cwd(), "Content", "helio_carousel_tool.html"),
  ];
  for (const htmlPath of htmlPaths) {
    if (!fs.existsSync(htmlPath)) continue;
    const html = fs.readFileSync(htmlPath, "utf8");
    const match = html.match(/const DAYS = (\[[\s\S]*?\]);/);
    if (!match) continue;
    const days = Function(`"use strict"; return (${match[1]});`)();
    return days.find((d) => d.day === dayNumber) || days[0];
  }
  throw new Error("Content calendar not found");
}

async function renderSlideDataToHtml(slideData) {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 480, height: 600 }, deviceScaleFactor: 1 });
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:4317";
    await page.goto(`${baseUrl}/carousel-studio.html`, { waitUntil: "domcontentloaded" });
    return page.evaluate((slides) => slides.map((slide, i) => window.renderSlideHTML(slide, i, slides.length)), slideData);
  } finally {
    await browser.close();
  }
}

async function renderSlides(slides, outDir, baseName) {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 480, height: 600 }, deviceScaleFactor: 2.25 });
  const jpgs = [];
  try {
    for (let i = 0; i < slides.length; i += 1) {
      await page.setContent(stageHtml(slides[i]), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts?.ready);
      await page.addStyleTag({ content: "* { animation-play-state: paused !important; transition: none !important; }" });
      const jpg = path.join(outDir, `${baseName}_Slide_${String(i + 1).padStart(2, "0")}.jpg`);
      await page.locator(".stage").screenshot({ path: jpg, type: "jpeg", quality: 95 });
      jpgs.push(jpg);
    }
  } finally {
    await browser.close();
  }
  return jpgs;
}

async function launchBrowser() {
  const executablePath = await resolveChromiumExecutablePath();
  return playwrightChromium.launch({
    args: process.env.VERCEL ? [...chromium.args, "--disable-gpu"] : [],
    executablePath,
    headless: true,
  });
}

async function resolveChromiumExecutablePath() {
  if (!process.env.VERCEL) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const explicitPack = process.env.CHROMIUM_PACK_URL || process.env.SPARTICUZ_CHROMIUM_PACK_URL;
  const binPath = path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");
  const executablePath = explicitPack
    ? await chromium.executablePath(explicitPack)
    : fs.existsSync(binPath)
      ? await chromium.executablePath(binPath)
      : await chromium.executablePath();
  try {
    const stat = fs.statSync(executablePath);
    if (!stat.isFile() || stat.size < 1024 * 1024) throw new Error(`invalid chromium binary size: ${stat.size}`);
    fs.chmodSync(executablePath, 0o700);
  } catch (error) {
    throw new Error(`Chromium setup failed at ${executablePath}: ${error.message}`);
  }
  return executablePath;
}

function stageHtml(slideHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:480px; height:600px; overflow:hidden; background:#080808; font-family:'JetBrains Mono', monospace; }
    .stage { width:480px; height:600px; overflow:hidden; position:relative; font-family:'JetBrains Mono', monospace; }
    @keyframes tck { from{transform:translateX(0)} to{transform:translateX(-50%)} }
    @keyframes pulse2 { 0%,100%{opacity:1;box-shadow:0 0 6px #C8FF00} 50%{opacity:.4;box-shadow:0 0 14px #C8FF00} }
  </style>
</head>
<body><div class="stage">${slideHtml}</div></body>
</html>`;
}

async function uploadToSupabase(localFile, objectPrefix) {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
  const bucket = requiredEnv("SUPABASE_BUCKET");
  const objectPath = `${objectPrefix}/${path.basename(localFile)}`.replace(/^\/+/, "");
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "image/jpeg", "x-upsert": "true" },
    body: fs.readFileSync(localFile),
  });
  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) throw new Error(uploadData?.message || uploadData?.error || `Supabase upload failed: ${objectPath}`);
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}

async function graphPost(endpoint, payload, token) {
  const body = new URLSearchParams({ ...payload, access_token: token });
  const res = await fetch(`${GRAPH_BASE}${endpoint}`, { method: "POST", body });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function graphGet(endpoint, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH_BASE}${endpoint}?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function waitForContainerReady(containerId, token, label, opts = {}) {
  const attempts = opts.attempts || 18;
  const intervalMs = opts.intervalMs || 5000;
  for (let i = 1; i <= attempts; i += 1) {
    const status = await graphGet(`/${containerId}`, { fields: "status_code,status" }, token);
    if (!status.status_code || status.status_code === "FINISHED") return status;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") throw new Error(`${label} container failed: ${status.status || status.status_code}`);
    await sleep(intervalMs);
  }
  throw new Error(`${label} container ${containerId} was not ready`);
}

async function publishWhenReady(igUserId, creationId, token) {
  await waitForContainerReady(creationId, token, "Carousel", { attempts: 24, intervalMs: 5000 });
  try {
    return await graphPost(`/${igUserId}/media_publish`, { creation_id: creationId }, token);
  } catch (error) {
    if (!/Media ID is not available/i.test(error.message)) throw error;
    await sleep(15000);
    return graphPost(`/${igUserId}/media_publish`, { creation_id: creationId }, token);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeApiKey(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function safeSlug(input) {
  return String(input || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "carousel";
}
