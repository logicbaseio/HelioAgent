#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = __dirname;
const TOOL_HTML = path.join(__dirname, "helio_carousel_tool.html");
const BRAND_MD = path.join(__dirname, "helio_brand_toolkit.md");
const GRAPH_BASE = process.env.META_GRAPH_BASE || "https://graph.facebook.com/v20.0";
const PORT = Number(process.env.CAROUSEL_STUDIO_PORT || 4317);

loadDotEnv(path.join(ROOT, ".env"));
loadDotEnv(path.join(__dirname, ".env"));

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(body);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function extractJsonArray(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON array found in Claude response");
  return JSON.parse(text.slice(start, end + 1));
}

function brandContext() {
  if (!fs.existsSync(BRAND_MD)) return "";
  return fs.readFileSync(BRAND_MD, "utf8").slice(0, 9000);
}

async function generateSlides(payload) {
  const provider = payload.provider || process.env.AI_PROVIDER || "anthropic";
  const prompt = provider === "anthropic" ? [
    payload.prompt,
    "",
    "BRAND TOOLKIT EXCERPT:",
    brandContext(),
    "",
    "CONTENT PLAN DAY:",
    JSON.stringify(payload.day, null, 2),
  ].join("\n") : compactGenerationPrompt(payload);

  const apiKey = normalizeApiKey(payload.apiKey || providerApiKey(provider));
  if (!apiKey) throw new Error(`Missing API key for provider: ${provider}`);

  const slides = provider === "anthropic"
    ? await generateWithAnthropic({ apiKey, prompt, model: payload.model })
    : await generateWithOpenAiCompatible({
      provider,
      apiKey,
      prompt,
      model: payload.model,
      baseUrl: payload.baseUrl,
    });
  return normalizeSlides(slides, payload);
}

function compactGenerationPrompt(payload) {
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

Brand rules:
- Terminal, precise, confident. No fluff.
- HELIO always uppercase.
- Colors are handled by renderer: dark=#080808, lime=#C8FF00.
- Use short punchy text. Avoid long paragraphs.
- Headline line breaks use \\n. Max 4 words per line.
- Slide themes exactly: ${themes.map((theme, i) => `S${i + 1}:${theme}`).join(", ")}
- Slide blueprint exactly: ${blueprint.map((type, i) => `S${i + 1}:${type}`).join(", ")}
- Every string field must be non-empty. No empty strings, empty arrays, null, undefined, or placeholder text.
- tableRows must contain 3-4 rows with signal, old, new.
- pills must contain 3 rows with num and label.
- list items must be plain strings, 3-5 items.
- urgency items must contain label and numeric value from 35 to 95.
- split slides must include splitLeft and splitRight with label, headline, body.
- CTA slide must include ctaText and ctaSubtext.

Return ONLY valid JSON, no markdown:
The "slides" array must contain exactly ${count} objects using the blueprint types.
{"slides":[
  {"slideNum":1,"theme":"${themes[0]}","type":"cover","eyebrow":"GROWTH PROBLEM // MANUAL SEO","headline":"YOUR SEO\\nROUTINE IS\\nKILLING\\nGROWTH","subline":"short supporting line","body":"one short sentence","ghostWord":"MANUAL","tagline":"TIME DRAIN ANALYSIS // HELIO"},
  {"slideNum":2,"theme":"${themes[1] || "dark"}","type":"stats","eyebrow":"MISSION ANALYSIS","headline":"THE REAL\\nCOST","body":"one short sentence","pills":[{"num":"10h","label":"research"},{"num":"6h","label":"metadata"},{"num":"4h","label":"reporting"}]},
  {"slideNum":3,"theme":"${themes[2] || "light"}","type":"list","eyebrow":"PROTOCOL AUDIT","headline":"BIGGEST SEO\\nTIME DRAINS","items":["plain string","plain string","plain string","plain string"]},
  {"slideNum":4,"theme":"${themes[3] || "dark"}","type":"comparison","eyebrow":"EXECUTION ANALYSIS","headline":"MANUAL VS\\nAGENT LOOP","body":"one short sentence","tableRows":[{"signal":"Keyword research","old":"Hours","new":"Minutes"},{"signal":"Meta fixes","old":"Manual","new":"Automated"},{"signal":"Reports","old":"Weekly","new":"Live"}]},
  {"slideNum":5,"theme":"${themes[4] || "light"}","type":"urgency","eyebrow":"COMPOUND DEBT","headline":"WAITING GETS\\nEXPENSIVE","body":"one short sentence","items":[{"label":"Crawl debt","value":72},{"label":"Content decay","value":64},{"label":"Missed fixes","value":82}]},
  {"slideNum":${count},"theme":"${themes[count - 1]}","type":"cta","eyebrow":"MISSION CONTROL // HELIO","headline":"DEPLOY THE\\nSEO AGENT","body":"Join the HELIO waitlist for early access.","ctaText":"→ Join the HELIO Waitlist","ctaSubtext":"helio.bot · Early access now open"}
]}`;
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
  if (type === "definition") base.chips = cleanStringArray(base.chips, definitionChips(topic), 3);
  if (type === "stats") base.pills = cleanObjectArray(base.pills, defaultPills(day), 3, ["num", "label"]);
  if (type === "list") base.items = cleanStringArray(base.items, defaultListItems(day), 4);
  if (type === "comparison") base.tableRows = cleanObjectArray(base.tableRows, defaultTableRows(day), 3, ["signal", "old", "new"]);
  if (type === "urgency") base.items = cleanUrgencyItems(base.items, defaultUrgencyItems(day));
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

function definitionChips(topic) {
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

function providerApiKey(provider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY;
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (provider === "synterolink") return process.env.SYNTEROLINK_API_KEY;
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY;
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
}

async function generateWithAnthropic({ apiKey, prompt, model }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 4096),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    const message = data?.error?.message || data?.raw || `Claude API returned HTTP ${response.status}`;
    throw new Error(message);
  }

  const text = data.content?.find((block) => block.type === "text")?.text || "";
  const slides = extractJsonArray(text);
  if (!Array.isArray(slides) || slides.length === 0) throw new Error("Claude returned an empty slide array");
  return slides;
}

async function generateWithOpenAiCompatible({ provider, apiKey, prompt, model, baseUrl }) {
  const resolvedBaseUrl = resolveOpenAiBaseUrl(provider, baseUrl);
  const modelsToTry = provider === "synterolink"
    ? [...new Set([model, ...fallbackModels(provider)].filter(Boolean))]
    : model ? [model] : fallbackModels(provider);
  const attempts = [];

  for (const resolvedModel of modelsToTry) {
    try {
      console.log(`[carousel] ${provider}: trying model ${resolvedModel}`);
      return await generateWithOpenAiModel({ provider, apiKey, prompt, baseUrl: resolvedBaseUrl, model: resolvedModel });
    } catch (error) {
      attempts.push({ model: resolvedModel, error: error.message });
      if (!shouldTryNextModel(provider, error.message)) throw error;
      console.warn(`[${new Date().toISOString()}] ${provider} model ${resolvedModel} failed, trying fallback: ${error.message}`);
    }
  }

  if (attempts.length) {
    throw new Error(`${provider} failed for all configured models: ${attempts.map((a) => `${a.model}: ${a.error}`).join(" | ")}`);
  }
  throw new Error(`${provider} generation failed`);
}

async function generateWithOpenAiModel({ provider, apiKey, prompt, baseUrl, model }) {
  const data = await postOpenAiCompletion({
    provider,
    apiKey,
    prompt,
    baseUrl,
    model,
    useResponseFormat: provider !== "synterolink",
  });

  const text = extractOpenAiText(data);
  try {
    return parseSlidesFromText(text, provider);
  } catch (error) {
    if (provider !== "synterolink") throw error;
    console.warn(`[${new Date().toISOString()}] ${provider} model ${model} returned invalid JSON, retrying with stricter prompt: ${error.message}`);
    const retryData = await postOpenAiCompletion({
      provider,
      apiKey,
      prompt: `${prompt}\n\nCRITICAL: Output valid minified JSON only. Start with {"slides":[ and end with ]}. Do not include markdown, commentary, or partial JSON.`,
      baseUrl,
      model,
      useResponseFormat: false,
      temperature: 0.2,
      maxTokens: Number(process.env.AI_RETRY_MAX_TOKENS || 7000),
    });
    return parseSlidesFromText(extractOpenAiText(retryData), provider);
  }
}

async function postOpenAiCompletion({ provider, apiKey, prompt, baseUrl, model, useResponseFormat, temperature = 0.7, maxTokens }) {
  const body = {
    model,
    temperature,
    max_tokens: maxTokens || Number(process.env.AI_MAX_TOKENS || 7000),
    messages: [
      {
        role: "system",
        content: "Return only JSON with this shape: {\"slides\":[...]}. No markdown. No prose.",
      },
      { role: "user", content: `${prompt}\n\nReturn JSON object: {"slides":[...the requested slide array...]}` },
    ],
  };
  if (useResponseFormat) body.response_format = { type: "json_object" };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? {
        "http-referer": "http://localhost:4317",
        "x-title": "HELIO Carousel Studio",
      } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    const message = data?.error?.message || data?.raw || `${provider} returned HTTP ${response.status}`;
    throw new Error(message);
  }
  if (provider === "synterolink") {
    console.log(`[${new Date().toISOString()}] synterolink response shape: ${JSON.stringify(summarizeCompletion(data))}`);
  }
  return data;
}

function summarizeCompletion(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const content = message.content;
  return {
    id: data?.id,
    model: data?.model,
    choices: Array.isArray(data?.choices) ? data.choices.length : 0,
    finish_reason: choice.finish_reason,
    message_keys: Object.keys(message),
    content_type: Array.isArray(content) ? "array" : typeof content,
    content_length: typeof content === "string" ? content.length : Array.isArray(content) ? content.length : 0,
    has_reasoning_content: Boolean(message.reasoning_content),
    usage: data?.usage,
  };
}

function extractOpenAiText(data) {
  const message = data.choices?.[0]?.message || {};
  const content = message.content
    ?? message.reasoning_content
    ?? data.output_text
    ?? data.raw
    ?? "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : part.text || part.content || "")
      .join("");
  }
  return String(content || "");
}

function parseSlidesFromText(text, provider) {
  const clean = String(text || "").replace(/```json|```/gi, "").trim();
  if (!clean) throw new Error(`${provider} returned empty content`);
  const parsed = JSON.parse(extractJsonObject(clean));
  const slides = Array.isArray(parsed) ? parsed : parsed.slides;
  if (!Array.isArray(slides) || slides.length === 0) throw new Error(`${provider} returned an empty slide array`);
  return slides;
}

function extractJsonObject(text) {
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) return text.slice(objectStart, objectEnd + 1);
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1);
  return text;
}

function resolveOpenAiBaseUrl(provider, baseUrl) {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "deepseek") return "https://api.deepseek.com/v1";
  if (provider === "synterolink") return "https://api.synterolink.com/v1";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  if (!baseUrl) throw new Error("Custom OpenAI-compatible provider requires API Base URL");
  return baseUrl;
}

function defaultOpenAiModel(provider) {
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4.1";
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (provider === "synterolink") return process.env.SYNTEROLINK_MODEL || process.env.AI_MODEL || "claude-sonnet-4-6";
  if (provider === "openrouter") return process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
  return process.env.AI_MODEL || "gpt-4.1";
}

function fallbackModels(provider) {
  if (provider === "synterolink") {
    const configured = process.env.SYNTEROLINK_FALLBACK_MODELS;
    const models = configured
      ? configured.split(",").map((m) => m.trim()).filter(Boolean)
      : [
        "claude-sonnet-4-6",
        "claude-opus-4-6",
        "claude-opus-4-7",
        "gpt-5.5",
        "gpt-5.3-codex",
      ];
    return [...new Set(models)];
  }
  return [defaultOpenAiModel(provider)];
}

function shouldTryNextModel(provider, message) {
  return provider === "synterolink" && /no available accounts|model|not found|unavailable/i.test(message);
}

function normalizeApiKey(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");
}

function safeSlug(input) {
  return String(input || "carousel")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "carousel";
}

function stageHtml(slideHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 480px; height: 600px; overflow: hidden; background: #080808; }
    .stage { width: 480px; height: 600px; overflow: hidden; position: relative; }
    @keyframes tck { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes pulse2 { 0%,100% { opacity: 1; box-shadow: 0 0 6px #C8FF00; } 50% { opacity: .4; box-shadow: 0 0 14px #C8FF00; } }
  </style>
</head>
<body><div class="stage">${slideHtml}</div></body>
</html>`;
}

async function renderSlides(slides, outDir, baseName) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 480, height: 600 }, deviceScaleFactor: 2.25 });
  const jpgs = [];

  try {
    for (let i = 0; i < slides.length; i += 1) {
      await page.setContent(stageHtml(slides[i]), { waitUntil: "networkidle" });
      await page.addStyleTag({ content: "* { animation-play-state: paused !important; transition: none !important; }" });
      const name = `${baseName}_Slide_${String(i + 1).padStart(2, "0")}`;
      const png = path.join(outDir, `${name}.png`);
      const jpg = path.join(outDir, `${name}.jpg`);
      await page.locator(".stage").screenshot({ path: png, type: "png" });
      await page.locator(".stage").screenshot({ path: jpg, type: "jpeg", quality: 95 });
      jpgs.push(jpg);
    }
  } finally {
    await browser.close();
  }

  return jpgs;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function graphPost(endpoint, payload, token) {
  const body = new URLSearchParams({ ...payload, access_token: token });
  const res = await fetch(`${GRAPH_BASE}${endpoint}`, { method: "POST", body });
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = new Error(data?.error?.message || JSON.stringify(data));
    err.graphData = data;
    err.endpoint = endpoint;
    throw err;
  }
  console.log(`[${new Date().toISOString()}] Graph POST ${endpoint} -> ${data.id || "ok"}`);
  return data;
}

async function graphGet(endpoint, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH_BASE}${endpoint}?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = new Error(data?.error?.message || JSON.stringify(data));
    err.graphData = data;
    err.endpoint = endpoint;
    throw err;
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContainerReady(containerId, token, label, opts = {}) {
  const attempts = opts.attempts || 18;
  const intervalMs = opts.intervalMs || 5000;

  for (let i = 1; i <= attempts; i += 1) {
    const status = await graphGet(`/${containerId}`, { fields: "status_code,status" }, token);
    console.log(`[${new Date().toISOString()}] ${label} ${containerId} status ${i}/${attempts}: ${status.status_code || "UNKNOWN"} ${status.status || ""}`);

    if (!status.status_code || status.status_code === "FINISHED") return status;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`${label} container ${containerId} failed: ${status.status || status.status_code}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`${label} container ${containerId} was not ready after ${Math.round((attempts * intervalMs) / 1000)}s`);
}

async function publishWhenReady(igUserId, creationId, token) {
  await waitForContainerReady(creationId, token, "Carousel", { attempts: 24, intervalMs: 5000 });
  try {
    return await graphPost(`/${igUserId}/media_publish`, { creation_id: creationId }, token);
  } catch (error) {
    if (!/Media ID is not available/i.test(error.message)) throw error;
    console.warn(`[${new Date().toISOString()}] media_publish raced container readiness, waiting and retrying once`);
    await sleep(15000);
    await waitForContainerReady(creationId, token, "Carousel retry", { attempts: 6, intervalMs: 5000 });
    return graphPost(`/${igUserId}/media_publish`, { creation_id: creationId }, token);
  }
}

function contentTypeFor(filePath) {
  return /\.png$/i.test(filePath) ? "image/png" : "image/jpeg";
}

async function uploadToSupabase(localFile, objectPrefix) {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
  const bucket = requiredEnv("SUPABASE_BUCKET");
  const localRoot = path.resolve(process.env.LOCAL_ASSET_ROOT || CONTENT_ROOT);
  const rel = path.relative(localRoot, path.resolve(localFile));
  if (rel.startsWith("..")) throw new Error(`Rendered file is outside LOCAL_ASSET_ROOT: ${localFile}`);

  const objectPath = `${objectPrefix}/${rel.split(path.sep).join("/")}`.replace(/^\/+/, "");
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      "content-type": contentTypeFor(localFile),
      "x-upsert": "true",
    },
    body: fs.readFileSync(localFile),
  });
  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) throw new Error(uploadData?.message || uploadData?.error || `Supabase upload failed: ${objectPath}`);

  const isPublic = String(process.env.SUPABASE_BUCKET_PUBLIC ?? "true").toLowerCase() !== "false";
  if (isPublic) return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;

  const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expiresIn: Number(process.env.SUPABASE_SIGNED_URL_EXPIRES_IN || 3600) }),
  });
  const signData = await signRes.json();
  if (!signRes.ok || !signData?.signedURL) throw new Error(signData?.message || "Supabase signed URL creation failed");
  return `${supabaseUrl}/storage/v1${signData.signedURL}`;
}

async function publish(payload) {
  const day = payload.day || {};
  const date = new Date().toISOString().slice(0, 10);
  const slug = `${date}-day${String(day.day || "x").padStart(2, "0")}-${safeSlug(day.topic)}`;
  const outDir = path.join(CONTENT_ROOT, "daily_carousels", slug);
  const baseName = `HELIO_Day${String(day.day || "x").padStart(2, "0")}_${date}`;
  const slides = payload.slides || [];
  if (slides.length < 2 || slides.length > 10) throw new Error("Instagram carousel requires 2-10 slides");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "caption.txt"), payload.caption || "", "utf8");
  const jpgs = await renderSlides(slides, outDir, baseName);

  const token = payload.accessToken || process.env.META_LONG_LIVED_ACCESS_TOKEN;
  const igUserId = payload.igUserId || process.env.IG_USER_ID;
  if (!token) throw new Error("Missing Meta access token. Add it in the UI or set META_LONG_LIVED_ACCESS_TOKEN in .env");
  if (!igUserId) throw new Error("Missing Instagram user id. Add it in the UI or set IG_USER_ID in .env");

  const objectPrefix = process.env.SUPABASE_OBJECT_PREFIX || `ig-carousels/${slug}`;
  const imageUrls = [];
  const mediaContainerIds = [];

  for (const jpg of jpgs) {
    const imageUrl = await uploadToSupabase(jpg, objectPrefix);
    imageUrls.push(imageUrl);
    const media = await graphPost(`/${igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true",
    }, token);
    mediaContainerIds.push(media.id);
    await waitForContainerReady(media.id, token, `Slide ${mediaContainerIds.length}`, { attempts: 12, intervalMs: 3000 });
  }

  const carousel = await graphPost(`/${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: mediaContainerIds.join(","),
    caption: payload.caption || "",
  }, token);

  const published = await publishWhenReady(igUserId, carousel.id, token);

  const result = {
    ok: true,
    outDir,
    imageCount: jpgs.length,
    imageUrls,
    creationId: carousel.id,
    mediaId: published.id,
  };
  fs.writeFileSync(path.join(outDir, "publish-result.json"), JSON.stringify(result, null, 2), "utf8");
  return result;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return sendText(res, 204, "");
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/tool")) {
      return sendText(res, 200, fs.readFileSync(TOOL_HTML, "utf8"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        instagram: Boolean(process.env.IG_USER_ID && process.env.META_LONG_LIVED_ACCESS_TOKEN),
        supabase: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY) && process.env.SUPABASE_BUCKET),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      console.log(`[${new Date().toISOString()}] POST /api/generate`);
      const slides = await generateSlides(await readJson(req));
      console.log(`[${new Date().toISOString()}] generated ${slides.length} slides`);
      return sendJson(res, 200, { ok: true, slides });
    }

    if (req.method === "POST" && url.pathname === "/api/publish") {
      console.log(`[${new Date().toISOString()}] POST /api/publish`);
      const result = await publish(await readJson(req));
      console.log(`[${new Date().toISOString()}] published ${result.mediaId}`);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} failed:`, error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`HELIO Carousel Studio live at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
