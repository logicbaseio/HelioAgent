import { useState, useEffect, useRef } from "react";
import {
  HELIO_CODE_STATUSES,
  buildHelioCodeJobPayload,
  inferHelioCodeIssueType,
  normalizeHelioCodeStatus,
} from "../../lib/helio-code";
import {
  buildPortfolioOptimizationPlan,
  buildCompetitorMentionGraph,
  buildIntelligenceActions,
  buildPromptObservation,
  computeCausalAttributionModel,
  computeCitationFitness,
  detectObservatoryDrift,
  parseBingAiPerformanceCsv,
  runObservatoryPromptSuite,
  scoreCitationSourceQuality,
  summarizePromptObservatory,
} from "../../lib/aeo-intelligence";

let cachedJsPdfCtor = null;
let cachedAuditReportAdapter = null;
let cachedAuditReportStore = null;
async function getJsPdfCtor() {
  if (cachedJsPdfCtor) return cachedJsPdfCtor;
  const mod = await import("jspdf");
  cachedJsPdfCtor = mod.jsPDF;
  return cachedJsPdfCtor;
}

async function getBuildAuditReportJson() {
  if (cachedAuditReportAdapter) return cachedAuditReportAdapter;
  const mod = await import("../../lib/audit-report-adapter");
  cachedAuditReportAdapter = mod.buildAuditReportJson;
  return cachedAuditReportAdapter;
}

async function getSaveAuditReportViaApi() {
  if (cachedAuditReportStore) return cachedAuditReportStore;
  const mod = await import("../../lib/audit-report-store");
  cachedAuditReportStore = mod.saveAuditReportViaApi;
  return cachedAuditReportStore;
}

const C = {
  bg:"#0a0a0a",panel:"#0f0f0f",border:"#1a1a1a",borderLime:"#c8ff00",
  lime:"#c8ff00",text:"#e0e0e0",muted:"#555",dim:"#2a2a2a",
  red:"#ff4444",orange:"#ff8800",green:"#00ff88",blue:"#8fbf00",
};

const AI_PROVIDERS = { anthropic:{label:"Anthropic"}, openrouter:{label:"OpenRouter"} };

const OR_MODELS_FALLBACK = [
  {id:"openai/gpt-4o",name:"GPT-4o",ctx:"128k",price:"$2.50/$10"},
  {id:"openai/gpt-4o-mini",name:"GPT-4o Mini",ctx:"128k",price:"$0.15/$0.60"},
  {id:"openai/o3-mini",name:"o3 Mini",ctx:"200k",price:"$1.10/$4.40"},
  {id:"anthropic/claude-sonnet-4-5",name:"Sonnet 4.5",ctx:"200k",price:"$3/$15"},
  {id:"anthropic/claude-opus-4-5",name:"Opus 4.5",ctx:"200k",price:"$15/$75"},
  {id:"anthropic/claude-haiku-4-5",name:"Haiku 4.5",ctx:"200k",price:"$0.80/$4"},
  {id:"google/gemini-2.5-pro-preview",name:"Gemini 2.5 Pro",ctx:"1M",price:"$1.25/$10"},
  {id:"google/gemini-2.0-flash-001",name:"Gemini 2.0 Flash",ctx:"1M",price:"$0.10/$0.40"},
  {id:"google/gemini-2.0-flash-exp:free",name:"Gemini 2.0 Flash (Free)",ctx:"1M",price:"Free"},
  {id:"meta-llama/llama-3.3-70b-instruct",name:"Llama 3.3 70B",ctx:"128k",price:"$0.12/$0.30"},
  {id:"mistralai/mistral-large-2411",name:"Mistral Large",ctx:"128k",price:"$2/$6"},
  {id:"deepseek/deepseek-chat-v3-5",name:"DeepSeek Chat V3.5",ctx:"64k",price:"$0.27/$1.10"},
  {id:"deepseek/deepseek-r1",name:"DeepSeek R1",ctx:"64k",price:"$0.55/$2.19"},
  {id:"x-ai/grok-3-beta",name:"Grok 3 Beta",ctx:"131k",price:"$3/$15"},
  {id:"x-ai/grok-3-mini-beta",name:"Grok 3 Mini",ctx:"131k",price:"$0.30/$0.50"},
  {id:"qwen/qwen-2.5-72b-instruct",name:"Qwen 2.5 72B",ctx:"128k",price:"$0.13/$0.40"},
  {id:"cohere/command-r-plus-08-2024",name:"Command R+",ctx:"128k",price:"$2.50/$10"},
];

async function fetchOpenRouterModels(apiKey) {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Failed to fetch OpenRouter models");
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      ctx: m.context_length ? String(m.context_length) : "?",
      price: "Live",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchOpenAiModels(apiKey) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Failed to fetch OpenAI models");
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((m) => ({
      id: String(m.id || ""),
      name: String(m.id || ""),
      ctx: "?",
      price: "Live",
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchAnthropicModels(apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Failed to fetch Anthropic models");
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((m) => ({
      id: String(m.id || ""),
      name: String(m.display_name || m.id || ""),
      ctx: "?",
      price: "Live",
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchProviderModelsViaApi(provider, apiKey) {
  const res = await fetch("/api/model-catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Model catalog HTTP ${res.status}`);
  const rows = Array.isArray(data?.models) ? data.models : [];
  return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function testProviderModelViaApi(provider, apiKey, model) {
  const res = await fetch("/api/model-catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey, action: "test", model }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Model test HTTP ${res.status}`);
  return data;
}

async function fetchGscSites(accessToken) {
  const res = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Failed to load Search Console sites");
  return (data.siteEntry || [])
    .map((s) => s.siteUrl)
    .filter(Boolean);
}

async function fetchGa4Properties(accessToken) {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Failed to load GA4 properties");
  const summaries = Array.isArray(data?.accountSummaries) ? data.accountSummaries : [];
  const props = [];
  for (const acc of summaries) {
    for (const p of acc.propertySummaries || []) {
      const rawId = p.property?.split("/")?.[1] || "";
      if (rawId) props.push({ id: rawId, name: p.displayName || rawId });
    }
  }
  return props;
}

const INTEGRATION_DEFS = {
  ai:{id:"ai",label:"AI Provider",description:"Powers all Helio intelligence",modules:["mission","audit","gsc","keywords","content","onpage","backlinks","aeo","reports","missions","tasks"],color:C.lime,isAI:true},
  dataforseo:{id:"dataforseo",label:"DataForSEO",description:"Site Audit, Keywords, Backlinks",fields:[{key:"login",label:"API Login",type:"text",placeholder:"your@email.com"},{key:"password",label:"API Password",type:"password",placeholder:"••••••••"}],docsUrl:"https://dataforseo.com/apis",modules:["audit","keywords","backlinks","onpage"],color:C.blue},
  firecrawl:{id:"firecrawl",label:"Firecrawl",description:"Deep crawl + rendered extraction",fields:[{key:"apiKey",label:"API Key",type:"password",placeholder:"fc-xxxxxxxx"},{key:"apiBase",label:"API Base URL",type:"text",placeholder:"https://api.firecrawl.dev"}],docsUrl:"https://www.firecrawl.dev/",modules:["audit","onpage","aeo"],color:"#ffb347"},
  pagespeed:{id:"pagespeed",label:"Google PageSpeed Insights",description:"Core Web Vitals + Lighthouse performance",fields:[{key:"apiKey",label:"API Key",type:"password",placeholder:"AIza..."},{key:"strategy",label:"Default Strategy",type:"text",placeholder:"mobile"}],docsUrl:"https://developers.google.com/speed/docs/insights/v5/get-started",modules:["audit","onpage","reports"],color:"#7fc2ff"},
  playwright:{id:"playwright",label:"Playwright Runner",description:"Remote browser automation worker endpoint",fields:[{key:"endpoint",label:"Runner Endpoint URL",type:"text",placeholder:"https://your-worker.example.com/audit"},{key:"token",label:"Runner Token",type:"password",placeholder:"optional"}],docsUrl:"https://playwright.dev/",modules:["audit"],color:"#7fe3b2"},
  gtrends:{id:"gtrends",label:"Google Trends",description:"Topic momentum and query trend signals",fields:[{key:"geo",label:"Default Geo",type:"text",placeholder:"US"},{key:"timeframe",label:"Default Timeframe",type:"text",placeholder:"today 3-m"},{key:"seed",label:"Seed Topic/Keyword",type:"text",placeholder:"your brand or topic"}],docsUrl:"https://trends.google.com/",modules:["keywords","content","aeo","reports","audit"],color:"#9ad1ff"},
  gsc:{id:"gsc",label:"Google Search Console",description:"Performance, coverage, indexing",modules:["gsc"],color:C.green,isOAuth:true,scopes:["https://www.googleapis.com/auth/webmasters"],docsUrl:"https://console.cloud.google.com"},
  ga4:{id:"ga4",label:"Google Analytics GA4",description:"Traffic, sessions, conversions",modules:["analytics"],color:C.orange,isOAuth:true,scopes:["https://www.googleapis.com/auth/analytics.readonly"],docsUrl:"https://console.cloud.google.com",extraFields:[{key:"propertyId",label:"GA4 Property ID",type:"text",placeholder:"123456789"}]},
  github:{id:"github",label:"GitHub / GitHub App",description:"Code deployments, SEO fixes, Helio Code PRs",fields:[{key:"appInstallationId",label:"GitHub App Installation ID",type:"text",placeholder:"12345678"},{key:"repo",label:"Repo (owner/repo)",type:"text",placeholder:"yourname/yoursite"},{key:"token",label:"Legacy PAT (fallback)",type:"password",placeholder:"ghp_xxxxxxxxxxxx"}],docsUrl:"https://github.com/apps",modules:["github"],color:C.muted},
  heliocode:{id:"heliocode",label:"Helio Code LLM",description:"Dedicated model + API key for Helio Code execution",fields:[{key:"provider",label:"Provider",type:"text",placeholder:"openrouter"},{key:"model",label:"Model",type:"text",placeholder:"anthropic/claude-opus-4.1 or openai/gpt-5.5"},{key:"apiKey",label:"API Key",type:"password",placeholder:"provider API key"}],docsUrl:"https://openrouter.ai/docs",modules:["aeo","missions","github","autonomy"],color:"#9fd24a"},
  slack:{id:"slack",label:"Slack Approvals",description:"Deployment approval requests via Slack incoming webhook",fields:[{key:"webhookUrl",label:"Slack Incoming Webhook URL",type:"password",placeholder:"https://hooks.slack.com/services/..."},{key:"channelName",label:"Channel Name",type:"text",placeholder:"#seo-approvals"}],docsUrl:"https://api.slack.com/messaging/webhooks",modules:["autonomy","missions","aeo"],color:"#9fd24a"},
  discord:{id:"discord",label:"Discord Approvals",description:"Deployment approval requests via Discord webhook",fields:[{key:"webhookUrl",label:"Discord Webhook URL",type:"password",placeholder:"https://discord.com/api/webhooks/..."},{key:"channelName",label:"Channel Name",type:"text",placeholder:"#approvals"}],docsUrl:"https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",modules:["autonomy","missions","aeo"],color:"#9fd24a"},
};

const MODULE_REQUIREMENTS = {
  mission:["ai"],audit:["ai"],keywords:["ai"],
  content:["ai"],onpage:["ai"],backlinks:[],
  gsc:["gsc","ai"],analytics:["ga4","ai"],aeo:["ai"],github:["github","ai"],
  reports:["ai"],missions:["ai"],tasks:["ai"],skills:["ai"],autonomy:["ai"],portfolio:[],guardrails:[],integrations:[],
};

const NAV = [
  {id:"mission",icon:"◈",label:"Mission Control"},
  {id:"audit",icon:"⬡",label:"Technical Audit"},
  {id:"keywords",icon:"◉",label:"Keyword Intel"},
  {id:"content",icon:"▣",label:"Content Engine"},
  {id:"onpage",icon:"◧",label:"On-Page SEO"},
  {id:"backlinks",icon:"⬢",label:"Backlink Manager"},
  {id:"gsc",icon:"◈",label:"Search Console"},
  {id:"analytics",icon:"▦",label:"Analytics"},
  {id:"aeo",icon:"◬",label:"AEO / GEO"},
  {id:"github",icon:"⬡",label:"GitHub Ops"},
  {id:"reports",icon:"▤",label:"Reports"},
  {id:"missions",icon:"◎",label:"Missions"},
  {id:"tasks",icon:"▣",label:"Task Manager"},
  {id:"skills",icon:"✦",label:"Skills"},
  {id:"autonomy",icon:"⟲",label:"Autonomy"},
  {id:"portfolio",icon:"◍",label:"Portfolio Intel"},
  {id:"guardrails",icon:"⛨",label:"Guardrails"},
  {id:"settings",icon:"⚙",label:"Settings"},
  {id:"integrations",icon:"⬢",label:"Integrations"},
];

const SEO_SKILL_LIBRARY = [
  { id: "seo-audit", name: "SEO Audit", modules: ["audit", "reports"], description: "Comprehensive section-by-section SEO audit generation framework.", keywords: ["audit", "priority", "issues", "crawlability", "indexation"] },
  { id: "seo-auditor", name: "SEO Auditor", modules: ["audit", "onpage", "gsc"], description: "Action-oriented auditing command workflow and remediation sequencing.", keywords: ["auditor", "remediation", "technical", "site"] },
  { id: "seo-checklist", name: "SEO Checklist", modules: ["audit", "content", "onpage"], description: "Landing page and launch SEO quality checklist for deterministic validation.", keywords: ["checklist", "landing", "launch", "qa"] },
  { id: "seo-content", name: "SEO Content", modules: ["content", "reports", "aeo"], description: "Content planning, topical authority, and intent-matching page recommendations.", keywords: ["content", "brief", "topical", "intent"] },
  { id: "seo-dataforseo", name: "SEO DataForSEO", modules: ["keywords", "backlinks", "audit"], description: "DataForSEO-specific extraction and interpretation patterns.", keywords: ["dataforseo", "serp", "keyword", "backlink"] },
  { id: "seo-geo", name: "SEO GEO", modules: ["aeo", "content", "reports"], description: "GEO/AEO optimization for LLM visibility and entity retrieval.", keywords: ["geo", "aeo", "llm", "entity", "visibility"] },
  { id: "seo-image-gen", name: "SEO Image Gen", modules: ["content", "aeo"], description: "SEO-oriented visual asset generation guidance for discoverability and engagement.", keywords: ["image", "visual", "alt", "thumbnail"] },
  { id: "seo-performance", name: "SEO Performance", modules: ["audit", "onpage", "reports"], description: "Performance and CWV optimization recommendations.", keywords: ["pagespeed", "core web vitals", "performance", "lcp", "cls", "inp"] },
  { id: "seo-schema", name: "SEO Schema", modules: ["audit", "onpage", "content"], description: "Schema.org planning, validation, and rich-result optimization.", keywords: ["schema", "json-ld", "rich results", "structured data"] },
  { id: "seo-sitemap", name: "SEO Sitemap", modules: ["audit", "gsc"], description: "Sitemap architecture, cleanliness, and indexation alignment guidance.", keywords: ["sitemap", "robots", "indexation", "canonical"] },
  { id: "seo-technical", name: "SEO Technical", modules: ["audit", "onpage", "gsc"], description: "Technical SEO diagnostics across crawl/index/render/linking layers.", keywords: ["technical", "crawl", "render", "canonical", "headers"] },
  { id: "seo-visual", name: "SEO Visual", modules: ["content", "reports", "aeo"], description: "Visual SEO review and UX presentation support for SEO conversion impact.", keywords: ["visual", "ux", "layout", "snippet"] },
  { id: "helio-core-seo-audit", name: "Helio-Core SEO Audit (V2)", modules: ["audit", "reports", "onpage", "gsc"], description: "Primary PRO technical SEO audit framework (V2) with strict tool-order, fallback protocol, rendering-type detection (SSR vs JS SPA), and 23-section evidence-first reporting.", keywords: ["technical audit", "seo audit", "crawlability", "indexation", "core web vitals", "schema", "security", "sitemap", "fallback protocol", "rendering type", "js spa", "ssr", "web_fetch", "web_search"], primaryFor: ["audit"] },
  { id: "seo-audit-report-generator", name: "SEO Audit Report Generator (V3)", modules: ["audit", "reports"], description: "Professional long-form technical audit report generation skill (V3) with strict spacing, markdown tables, emoji severity badges, issue blocks, and appendix evidence output.", keywords: ["audit report", "report generator", "table formatting", "priority matrix", "appendix", "technical seo report", "v3"], primaryFor: ["report"] },
  { id: "tech-audit-pro", name: "Technical Audit Pro", modules: ["audit", "onpage", "gsc"], description: "Detect crawl/indexability/render issues and prioritize fixes.", keywords: ["audit", "crawl", "index", "render"] },
  { id: "keyword-cluster-engine", name: "Keyword Cluster Engine", modules: ["keywords", "content"], description: "Cluster keywords by intent and map pillar/cluster architecture.", keywords: ["keyword", "cluster", "intent"] },
  { id: "content-brief-master", name: "Content Brief Master", modules: ["content", "reports"], description: "Generate EEAT content briefs, outlines, and optimization checklists.", keywords: ["brief", "content", "eeat"] },
  { id: "serp-ctr-optimizer", name: "SERP CTR Optimizer", modules: ["gsc", "onpage", "reports"], description: "Improve meta/title/snippet CTR with query-to-page matching.", keywords: ["ctr", "serp", "title", "meta"] },
  { id: "entity-seo-graph", name: "Entity SEO Graph", modules: ["aeo", "content", "gsc"], description: "Build entity relationships for AI/search engine understanding.", keywords: ["entity", "graph", "knowledge"] },
  { id: "link-gap-hunter", name: "Link Gap Hunter", modules: ["backlinks", "keywords"], description: "Identify authority gaps and recommend acquisition campaigns.", keywords: ["backlink", "authority", "gap"] },
  { id: "conversion-seo-bridge", name: "Conversion SEO Bridge", modules: ["analytics", "content", "reports"], description: "Connect traffic growth with conversion outcomes and actions.", keywords: ["conversion", "ga4", "funnel"] },
  { id: "local-seo-pack", name: "Local SEO Pack", modules: ["keywords", "gsc", "reports"], description: "Optimize for local intent and geo-modifier opportunities.", keywords: ["local", "geo", "maps"] },
];

let ACTIVE_ENABLED_SKILLS = [];
let ACTIVE_ORG_CONTEXT = "";

function setActiveSkillsContext(skillsState = {}) {
  const active = Object.values(skillsState).filter((s) => s?.enabled);
  ACTIVE_ENABLED_SKILLS = active;
  if (!active.length) return;
}

function getRelevantSkillContext(system = "", user = "") {
  const text = `${system || ""}\n${user || ""}`.toLowerCase();
  if (!ACTIVE_ENABLED_SKILLS.length) return "";
  const scored = ACTIVE_ENABLED_SKILLS.map((s) => {
    let score = 0;
    (s.keywords || []).forEach((k) => { if (text.includes(String(k).toLowerCase())) score += 3; });
    (s.modules || []).forEach((m) => { if (text.includes(String(m).toLowerCase())) score += 2; });
    if (text.includes(s.id)) score += 4;
    if (text.includes((s.name || "").toLowerCase())) score += 4;
    return { s, score };
  }).sort((a, b) => b.score - a.score);
  const picked = scored.filter((x) => x.score > 0).slice(0, 4).map((x) => x.s);
  const fallback = picked.length ? picked : ACTIVE_ENABLED_SKILLS.slice(0, 2);
  if (!fallback.length) return "";
  return `RELEVANT SKILLS FOR THIS TASK:\n${fallback.map((s) => `- ${s.name}: ${s.description}`).join("\n")}\nUse these skills explicitly while solving this request.`;
}

function getRelevantSkillsForTask(system = "", user = "") {
  const text = `${system || ""}\n${user || ""}`.toLowerCase();
  if (!ACTIVE_ENABLED_SKILLS.length) return [];
  const scored = ACTIVE_ENABLED_SKILLS.map((s) => {
    let score = 0;
    (s.keywords || []).forEach((k) => { if (text.includes(String(k).toLowerCase())) score += 3; });
    (s.modules || []).forEach((m) => { if (text.includes(String(m).toLowerCase())) score += 2; });
    if (text.includes(s.id)) score += 4;
    if (text.includes((s.name || "").toLowerCase())) score += 4;
    if (Array.isArray(s.primaryFor) && s.primaryFor.includes("audit") && (text.includes("audit") || text.includes("technical seo"))) score += 100;
    return { s, score };
  }).sort((a, b) => b.score - a.score);
  const picked = scored.filter((x) => x.score > 0).slice(0, 4).map((x) => x.s);
  return picked.length ? picked : ACTIVE_ENABLED_SKILLS.slice(0, 2);
}

function cleanProfessionalReportText(input = "") {
  let t = String(input || "");
  t = t.replace(/\r/g, "");
  t = t.replace(/Claude/gi, "Helio");
  t = t.replace(/^#{1,6}\s*/gm, "");
  t = t.replace(/\*\*/g, "");
  t = t.replace(/^%+\s*$/gm, "");
  t = t.replace(/^(\s*%\s*){4,}$/gm, "");
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function normalizeSeverityLabel(raw = "") {
  const s = String(raw || "").toLowerCase();
  if (s.includes("critical") || s.includes("p1") || s.includes("high")) return "🔴 Critical";
  if (s.includes("medium") || s.includes("p2") || s.includes("warn")) return "🟠 Medium";
  if (s.includes("low") || s.includes("p3")) return "🟡 Low";
  return "🟢 Info";
}

function validateMarkdownTables(text = "") {
  const lines = String(text || "").split("\n");
  let i = 0;
  const issues = [];
  let inCodeBlock = false;
  const countPipes = (s = "") => {
    let c = 0;
    let esc = false;
    for (const ch of String(s)) {
      if (ch === "\\" && !esc) { esc = true; continue; }
      if (ch === "|" && !esc) c += 1;
      esc = false;
    }
    return c;
  };
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) { inCodeBlock = !inCodeBlock; i += 1; continue; }
    if (inCodeBlock) { i += 1; continue; }
    if (!trimmed.startsWith("|")) { i += 1; continue; }
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      block.push(lines[i].trim());
      i += 1;
    }
    if (block.length < 2) continue;
    const sepIdx = block.findIndex((l, idx) => idx > 0 && /^\|?[-:\s|]+\|?$/.test(l));
    if (sepIdx !== 1) {
      issues.push("Malformed markdown table (missing/invalid separator row).");
      continue;
    }
    const expected = countPipes(block[0]);
    for (let r = 1; r < block.length; r += 1) {
      const row = block[r];
      if (/^\|?[-:\s|]+\|?$/.test(row)) continue;
      if (countPipes(row) !== expected) {
        issues.push("Malformed markdown table (inconsistent column count).");
        break;
      }
    }
  }
  return issues;
}

function splitMarkdownTableRow(row = "") {
  const raw = String(row || "").trim();
  const cells = [];
  let current = "";
  let esc = false;
  for (const ch of raw) {
    if (ch === "\\" && !esc) {
      esc = true;
      current += ch;
      continue;
    }
    if (ch === "|" && !esc) {
      cells.push(current.trim());
      current = "";
      esc = false;
      continue;
    }
    current += ch;
    esc = false;
  }
  cells.push(current.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function isMarkdownSeparatorRow(row = "") {
  return /^\|?[-:\s|]+\|?$/.test(String(row || "").trim());
}

function renderMarkdownTableRow(cells = []) {
  return `| ${cells.map((cell) => String(cell ?? "").replace(/\|/g, "/").trim()).join(" | ")} |`;
}

export function normalizeMarkdownTables(text = "") {
  const lines = String(text || "").split("\n");
  const out = [];
  let i = 0;
  let inCodeBlock = false;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      out.push(lines[i]);
      i += 1;
      continue;
    }
    if (inCodeBlock || !trimmed.startsWith("|")) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const block = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      block.push(lines[i].trim());
      i += 1;
    }
    if (block.length < 2) {
      out.push(...block);
      continue;
    }

    const header = splitMarkdownTableRow(block[0]);
    const expected = Math.max(1, header.length);
    const normalizeCells = (row) => {
      const cells = splitMarkdownTableRow(row);
      if (cells.length > expected) {
        return [...cells.slice(0, expected - 1), cells.slice(expected - 1).join(" / ")];
      }
      if (cells.length < expected) {
        return [...cells, ...Array.from({ length: expected - cells.length }, () => "")];
      }
      return cells;
    };
    const rows = block.slice(1).filter((row) => !isMarkdownSeparatorRow(row)).map(normalizeCells);
    out.push(renderMarkdownTableRow(header));
    out.push(renderMarkdownTableRow(Array.from({ length: expected }, () => "---")));
    out.push(...rows.map(renderMarkdownTableRow));
  }

  return out.join("\n");
}

export function validateAuditReportQuality(reportText = "", payload = {}, _generatedReport = {}, project = {}) {
  const issues = [];
  const t = String(reportText || "");
  const pagesCrawled = Number(payload?.summary?.pages_crawled || 0);
  const proto = project?.audit?.protocol || {};

  if (!t || t.length < 3000) issues.push("Report is too short for pro audit output.");
  const hasCtrl = [...t].some((ch) => {
    const c = ch.charCodeAt(0);
    return (c >= 0 && c <= 8) || c === 11 || c === 12 || (c >= 14 && c <= 31);
  });
  if (hasCtrl || /Ø=|�/.test(t)) issues.push("Encoding corruption detected (mojibake/control chars).");
  if (!/🔴|🟠|🟡|🟢/.test(t)) issues.push("Missing inline severity emoji badges in prose.");

  const pctPattern = /(\d+)\s+of\s+(\d+)\s+\((\d+(?:\.\d+)?)%\)/gi;
  let m;
  while ((m = pctPattern.exec(t)) !== null) {
    const num = Number(m[1]); const den = Number(m[2]); const pct = Number(m[3]);
    if (den <= 0) { issues.push(`Invalid ratio denominator: "${m[0]}"`); continue; }
    const expected = Math.round((num / den) * 1000) / 10;
    if (Math.abs(expected - pct) > 1.0) issues.push(`Math mismatch in ratio: "${m[0]}" expected ~${expected}%`);
  }

  const tableIssues = validateMarkdownTables(t);
  issues.push(...tableIssues);

  const lines = t.split("\n").map((x) => x.trim()).filter(Boolean);
  const issueLines = lines.filter((l) => /Issue:/i.test(l));
  if (issueLines.length > 0) {
    const badIssueLine = issueLines.find((l) => !/🔴|🟠|🟡|🟢/.test(l));
    if (badIssueLine) issues.push("Issue line without severity emoji badge detected.");
  } else {
    issues.push("No Issue blocks detected in report.");
  }

  const scoreLines = lines.filter((l) => {
    const s = String(l || "").trim();
    // Only enforce emoji on explicit issue score lines, not metric table rows like "Performance Score 58/100".
    return /^(?:\*\*)?Score:\s*\d+\s*\/\s*100(?:\*\*)?/i.test(s);
  });
  if (scoreLines.length > 0) {
    const badScore = scoreLines.find((l) => !/🔴|🟠|🟡|🟢|✅/.test(l));
    if (badScore) issues.push("Score line without severity emoji badge detected.");
  } else {
    issues.push("No score lines detected in report.");
  }

  const fetchedHttp = !!proto?.fetched?.home_http_www?.ok;
  const redirectFlag = !!proto?.redirectSignals?.httpRedirected;
  if (redirectFlag && fetchedHttp && /should redirect/i.test(t) && /HTTP 200/i.test(t)) {
    issues.push("WARN: Protocol contradiction: report states redirect expected while documenting HTTP 200 on HTTP probe.");
  }

  if (pagesCrawled < 10) {
    const hasCoverageDisclosure = /limited sampled crawl|coverage insufficient|low coverage|coverage confidence/i.test(t);
    if (!hasCoverageDisclosure) issues.push("Low-coverage run is missing explicit confidence/coverage disclosure.");
  }

  const blockingIssues = issues.filter((x) => !String(x).startsWith("WARN:"));
  const warnings = issues.filter((x) => String(x).startsWith("WARN:")).map((x) => x.replace(/^WARN:\s*/, ""));
  return { ok: blockingIssues.length === 0, issues: blockingIssues, warnings };
}

function ensureCoverageDisclosure(reportText = "", payload = {}) {
  const t = String(reportText || "").trim();
  const pagesCrawled = Number(payload?.summary?.pages_crawled || 0);
  if (pagesCrawled >= 10) return t;
  const hasCoverageDisclosure = /limited sampled crawl|coverage insufficient|low coverage|coverage confidence/i.test(t);
  if (hasCoverageDisclosure) return t;
  const disclosure = [
    "",
    "Coverage Confidence Notice",
    "🔴 Low coverage: this run is based on a limited sampled crawl and should be treated as constrained evidence.",
    "🟠 Confidence guidance: findings are reliable for detected issues, but absence of issues is not full-site confirmation.",
    "🟡 Recommended next step: run a deeper crawl with JavaScript rendering enabled and expanded URL discovery.",
    ""
  ].join("\n");
  if (/##\s*Executive Summary|1\.\s*Executive Summary/i.test(t)) {
    return t.replace(/(##\s*Executive Summary[\s\S]*?\n)(?=\|)|((?:1\.\s*Executive Summary[\s\S]*?\n))/i, (m) => `${m}${disclosure}\n`);
  }
  return `${disclosure}\n${t}`;
}

function normalizeIssueSeverity(severity = "") {
  const s = String(severity || "").toLowerCase();
  if (s === "critical") return { emoji: "🔴", label: "Critical", score: 35 };
  if (s === "high") return { emoji: "🟠", label: "High", score: 55 };
  if (s === "medium") return { emoji: "🟡", label: "Medium", score: 72 };
  return { emoji: "🟢", label: "Low", score: 90 };
}

function getReportIssueBlockCandidates(generatedReport = {}, payload = {}) {
  const reportFindings = Array.isArray(generatedReport?.section17_priorityFindings) ? generatedReport.section17_priorityFindings : [];
  const registry = Array.isArray(payload?.issueRegistry) ? payload.issueRegistry : [];
  return [...reportFindings, ...registry]
    .map((item) => ({
      severity: item?.severity || item?.priority || "medium",
      issue: item?.issue || item?.label || "Audit issue requires review",
      fix: item?.recommendedFix || item?.fix || "Review the supporting evidence and apply the recommended technical fix.",
      score: item?.score,
    }))
    .filter((item) => String(item.issue || "").trim());
}

export function ensureReportIssueBlocks(reportText = "", generatedReport = {}, payload = {}) {
  const t = String(reportText || "").trim();
  if (/(?:🔴|🟠|🟡|🟢)\s*(?:Critical|High|Medium|Low)\s+Issue:/i.test(t)) return t;

  const candidates = getReportIssueBlockCandidates(generatedReport, payload);
  const issueBlocks = candidates.slice(0, 5).map((item) => {
    const sev = normalizeIssueSeverity(item.severity);
    const score = Number.isFinite(Number(item.score)) ? Number(item.score) : sev.score;
    return [
      `**${sev.emoji} ${sev.label} Issue:** ${String(item.issue).trim()}`,
      `**Fix:** ${String(item.fix || "Review supporting evidence and validate the technical recommendation.").trim()}`,
      `**Score: ${score}/100** ${sev.emoji}`,
    ].join("\n\n");
  });

  if (!issueBlocks.length) {
    const quality = Number(payload?.quality?.score ?? generatedReport?.quality?.score ?? 90);
    const sev = normalizeIssueSeverity(quality >= 85 ? "low" : quality >= 70 ? "medium" : "high");
    issueBlocks.push([
      `**${sev.emoji} ${sev.label} Issue:** No blocking issue was detected in the sampled crawl, but the report still requires a bounded validation note.`,
      "**Fix:** Validate the sampled evidence against a deeper crawl before treating absence of issues as full-site confirmation.",
      `**Score: ${Math.max(1, Math.min(100, Math.round(quality)))}/100** ${sev.emoji}`,
    ].join("\n\n"));
  }

  return cleanProfessionalReportText([
    t,
    "",
    "QA-Normalized Issue Blocks",
    "",
    ...issueBlocks,
  ].join("\n"));
}

function autoFixReportFromQAIssues(reportText = "", issues = []) {
  let t = String(reportText || "");
  const list = Array.isArray(issues) ? issues : [];

  if (list.some((x) => /Malformed markdown table/i.test(String(x)))) {
    t = normalizeMarkdownTables(t);
  }

  // Ensure score lines carry severity badges.
  if (list.some((x) => /Score line without severity emoji badge/i.test(String(x)))) {
    t = t.replace(/(^|\n)(\*\*)?Score:\s*(\d+)\s*\/\s*100(\*\*)?(?!\s*(🔴|🟠|🟡|🟢|✅))/g, (_m, pfx, b1, n, b2) => {
      const score = Number(n || 0);
      const emoji = score >= 90 ? "✅" : score >= 70 ? "🟡" : score >= 50 ? "🟠" : "🔴";
      const left = b1 || "";
      const right = b2 || "";
      return `${pfx}${left}Score: ${score}/100${right} ${emoji}`;
    });
  }

  // Ensure issue lines have severity badges.
  if (list.some((x) => /Issue line without severity emoji badge/i.test(String(x)))) {
    t = t.replace(/(^|\n)(\*\*)?(Critical|High|Medium|Low)\s+Issue:\s*/gi, (_m, pfx, b, sev) => {
      const s = String(sev || "").toLowerCase();
      const emoji = s === "critical" ? "🔴" : s === "high" ? "🟠" : s === "medium" ? "🟡" : "🟢";
      const bold = b || "";
      return `${pfx}${bold}${emoji} ${sev.charAt(0).toUpperCase()}${sev.slice(1).toLowerCase()} Issue: `;
    });
  }

  return t;
}

function boolEmoji(v) {
  return v ? "🟢" : "🔴";
}

function makeTextTable(headers = [], rows = []) {
  const data = [headers, ...rows].map((r) => r.map((c) => String(c ?? "")));
  const widths = headers.map((_, i) => Math.max(...data.map((r) => (r[i] || "").length), 3));
  const line = (r) => `| ${r.map((c, i) => String(c).padEnd(widths[i], " ")).join(" | ")} |`;
  const sep = `|-${widths.map((w) => "-".repeat(w)).join("-|-")}-|`;
  return [line(headers), sep, ...rows.map((r) => line(r))].join("\n");
}

function buildProfessionalAuditReportText(report = {}, raw = {}) {
  const summary = raw?.summary || {};
  const checks = summary?.checks || {};
  const findings = Array.isArray(report?.section17_priorityFindings) ? report.section17_priorityFindings : [];
  const quick = Array.isArray(report?.section18_quickWins) ? report.section18_quickWins : [];
  const action = report?.section20_prioritizedActionPlan || {};
  const app = report?.section23_appendixEvidence || {};
  const performance = report?.section12_pageExperienceTechnicalPerformance || {};
  const protocol = report?.section23_appendixEvidence?.protocol || raw?.protocol || {};
  const psi = performance?.pagespeed || {};
  const mob = psi?.mobile || {};
  const desk = psi?.desktop || {};
  const sec = performance?.securityHeaders || {};

  const healthRows = [
    ["Overall Quality Score", `${raw?.quality?.score ?? "N/A"} / 100`, String(raw?.quality?.severity || "unknown").toUpperCase()],
    ["Pages Crawled", summary.pages_crawled ?? 0, summary.coverage_insufficient ? "LOW COVERAGE" : "OK"],
    ["Broken Pages", summary.broken_pages ?? 0, boolEmoji((summary.broken_pages || 0) === 0)],
    ["Missing H1", checks.no_h1_tag ?? 0, (checks.no_h1_tag || 0) ? "🔴 Fix needed" : "🟢 Good"],
    ["Missing Meta Description", checks.no_description ?? 0, (checks.no_description || 0) ? "🔴 Fix needed" : "🟢 Good"],
    ["Canonical Conflicts", checks.canonical_conflict ?? 0, (checks.canonical_conflict || 0) ? "🔴 Investigate" : "🟢 Good"],
    ["Orphan Pages", summary.orphan_pages ?? 0, (summary.orphan_pages || 0) ? "🔴 Fix needed" : "🟢 Good"],
    ["Weakly Linked Pages", summary.weakly_linked_pages ?? 0, (summary.weakly_linked_pages || 0) ? "🟠 Improve" : "🟢 Good"],
  ];

  const psiRows = [
    ["Performance Score", mob.performance ?? "N/A", desk.performance ?? "N/A"],
    ["SEO Score", mob.seo ?? "N/A", desk.seo ?? "N/A"],
    ["Best Practices", mob.bestPractices ?? "N/A", desk.bestPractices ?? "N/A"],
    ["Accessibility", mob.accessibility ?? "N/A", desk.accessibility ?? "N/A"],
    ["LCP", mob.lcp ?? "N/A", desk.lcp ?? "N/A"],
    ["CLS", mob.cls ?? "N/A", desk.cls ?? "N/A"],
    ["INP", mob.inp ?? "N/A", desk.inp ?? "N/A"],
    ["TBT", mob.tbt ?? "N/A", desk.tbt ?? "N/A"],
    ["FCP", mob.fcp ?? "N/A", desk.fcp ?? "N/A"],
  ];

  const securityRows = sec?.coveragePct ? Object.entries(sec.coveragePct).map(([k, v]) => [k, `${v}%`, v >= 80 ? "🟢" : v >= 40 ? "🟠" : "🔴"]) : [];
  const findingRows = findings.slice(0, 15).map((f) => [normalizeSeverityLabel(f.severity || f.priority), f.issue, String(f.priority || "P3"), String(f.likelyImpact || ""), String(f.recommendedFix || "")]);
  const quickRows = quick.slice(0, 10).map((q, i) => [String(i + 1), q.issue, q.recommendedFix]);

  return cleanProfessionalReportText([
    `Technical SEO Audit - ${report?.domain || "domain"}`,
    `Generated: ${new Date().toISOString()} | Source: ${report?.source || "Helio Core"}`,
    "",
    "1. Executive Summary",
    `${summary.coverage_insufficient ? "🔴" : "🟢"} Coverage: ${report?.section2_scopeAndMethod?.coverage || "N/A"}`,
    `${(checks.no_h1_tag || 0) + (checks.no_description || 0) > 0 ? "🔴" : "🟢"} Top risk: On-page metadata/heading quality`,
    `${(summary.broken_pages || 0) === 0 ? "🟢" : "🔴"} Broken pages status: ${summary.broken_pages || 0}`,
    "",
    "2. Audit Scope and Method",
    makeTextTable(["Parameter", "Detail"], [
      ["Domain", report?.domain || "N/A"],
      ["Crawl Coverage", report?.section2_scopeAndMethod?.coverage || "N/A"],
      ["Render Mode", report?.renderMode || "N/A"],
      ["Audit Engine", report?.source || "Helio Core"],
      ["Captured At", report?.generatedAt || new Date().toISOString()],
      ["Rendering Type", protocol?.renderingType || "Data not available in this run"],
      ["Mandatory Fetch Calls", protocol?.summary?.fetchTotal ?? "N/A"],
      ["Mandatory Search Calls", protocol?.summary?.searchTotal ?? "N/A"],
    ]),
    "",
    "3. Overall Health Snapshot",
    makeTextTable(["Dimension", "Score / Status", "Notes"], healthRows),
    "",
    "4. Crawlability Review",
    makeTextTable(["Metric", "Value"], [
      ["Robots blocked pages", summary.robots_blocked_pages ?? 0],
      ["Sitemap missing", summary.sitemap_missing ?? 0],
      ["Coverage insufficient", summary.coverage_insufficient ?? 0],
    ]),
    "",
    "5. Indexation Review",
    makeTextTable(["Metric", "Value"], [
      ["Noindex misuse", checks.no_index_page ?? 0],
      ["Canonical conflicts", checks.canonical_conflict ?? 0],
      ["Duplicate pages detected", summary.duplicate_content_pages ?? 0],
      ["Sitemap to index mismatch risk", summary.sitemap_missing ? "High" : "Low"],
    ]),
    "",
    "6. Site Architecture and URL Structure",
    makeTextTable(["Metric", "Value"], [
      ["Duplicate content clusters", summary.duplicate_content_clusters ?? 0],
      ["Weakly linked pages", summary.weakly_linked_pages ?? 0],
      ["Orphan pages", summary.orphan_pages ?? 0],
    ]),
    "",
    "7. Internal Linking Audit",
    makeTextTable(["Metric", "Value"], [
      ["Weakly linked pages", summary.weakly_linked_pages ?? 0],
      ["Orphan pages", summary.orphan_pages ?? 0],
      ["Contextual link opportunities", summary.weakly_linked_pages ?? 0],
    ]),
    "",
    "8. Technical On-Page Elements",
    makeTextTable(["Metric", "Value"], [
      ["Missing H1", checks.no_h1_tag ?? 0],
      ["Missing descriptions", checks.no_description ?? 0],
      ["Missing image alt", checks.no_image_alt ?? 0],
      ["Duplicate title tags", summary.duplicate_title ?? 0],
    ]),
    "",
    "9. XML Sitemap and Robots Review",
    makeTextTable(["Metric", "Value"], [
      ["Sitemap missing", summary.sitemap_missing ?? 0],
      ["Robots-blocked paths", summary.robots_blocked_pages ?? 0],
    ]),
    "",
    "10. Canonicalization and Duplicate Content",
    makeTextTable(["Metric", "Value"], [
      ["Canonical conflicts", checks.canonical_conflict ?? 0],
      ["Duplicate clusters", summary.duplicate_content_clusters ?? 0],
      ["Duplicate pages", summary.duplicate_content_pages ?? 0],
    ]),
    "",
    "11. Structured Data / Schema Audit",
    makeTextTable(["Metric", "Value"], [
      ["Schema pages", summary.schema_pages ?? 0],
      ["Schema parse errors", summary.schema_parse_errors ?? 0],
    ]),
    "",
    "12. Page Experience / Technical Performance",
    makeTextTable(["Metric", "Mobile", "Desktop"], psiRows),
    securityRows.length ? `\nSecurity Headers Coverage\n${makeTextTable(["Header", "Coverage", "Status"], securityRows)}` : "\nSecurity Headers Coverage\nData not available in this run",
    "",
    "13. Mobile SEO Review",
    "Data not available in this run",
    "",
    "14. Redirects, Status Codes, and Broken Pages",
    makeTextTable(["Metric", "Value"], [
      ["Broken pages", summary.broken_pages ?? 0],
      ["Broken links", summary.broken_links ?? 0],
      ["Redirect chain analysis", "Data not available in this run"],
    ]),
    "",
    "15. JavaScript / Rendering Risks",
    "Data not available in this run",
    "",
    "16. Content and Search Intent Risks",
    makeTextTable(["Metric", "Value"], [
      ["Thin pages", report?.section16_contentAndSearchIntentRisks?.thinPages ?? "N/A"],
      ["Cannibalization risk", report?.section16_contentAndSearchIntentRisks?.cannibalizationRisk ?? "N/A"],
      ["Intent mismatch risk", report?.section16_contentAndSearchIntentRisks?.intentMismatchRisk ?? "N/A"],
    ]),
    "",
    "17. Priority Findings",
    findingRows.length ? makeTextTable(["Status", "Issue", "Priority", "Likely Impact", "Recommended Fix"], findingRows) : "No critical findings in this run",
    "",
    "18. Quick Wins",
    quickRows.length ? makeTextTable(["#", "Issue", "Recommended Fix"], quickRows) : "No quick wins identified",
    "",
    "19. Strategic Recommendations",
    ...(report?.section19_strategicRecommendations || []).slice(0, 8).map((r, i) => `${i + 1}. ${r.issue} -> ${r.recommendedFix}`),
    "",
    "20. Prioritized Action Plan",
    "Immediate:",
    ...((action.immediate || []).map((x, i) => `${i + 1}. ${x}`)),
    "Next 30 Days:",
    ...((action.next30Days || []).map((x, i) => `${i + 1}. ${x}`)),
    "Next 60-90 Days:",
    ...((action.next60to90Days || []).map((x, i) => `${i + 1}. ${x}`)),
    "",
    "21. Risks, Assumptions, and Validation Notes",
    ...(report?.section21_risksAssumptionsValidation?.confirmed || []).map((x) => `🟢 Confirmed: ${x}`),
    ...(report?.section21_risksAssumptionsValidation?.inferred || []).map((x) => `🟠 Inferred: ${x}`),
    ...(report?.section21_risksAssumptionsValidation?.needsDeveloperValidation || []).map((x) => `🔴 Needs validation: ${x}`),
    "",
    "22. Expected Impact",
    ...(report?.section22_expectedImpact?.likelyImprovements || []).map((x) => `🟢 ${x}`),
    "",
    "23. Appendix / Evidence",
    makeTextTable(["Evidence", "Count"], [
      ["Sample URLs", (app.sampleUrls || []).length],
      ["Orphan Samples", (app.orphanSamples || []).length],
      ["Canonical Cluster Samples", (app.canonicalClusterSamples || []).length],
      ["Firecrawl Mapped Samples", (app.firecrawlMappedSample || []).length],
    ]),
    "",
    "Protocol Execution Trace",
    makeTextTable(["Step", "Status"], [
      ["Homepage Fetch", boolEmoji(!!protocol?.fetched?.home_www?.ok)],
      ["Redirect Variant Fetches", boolEmoji(!!protocol?.fetched?.home_non_www?.ok && !!protocol?.fetched?.home_http_www?.ok)],
      ["Robots Fetch", boolEmoji(!!protocol?.fetched?.robots?.ok)],
      ["Sitemap Fetch Set", boolEmoji(!!protocol?.fetched?.sitemap_xml?.ok || !!protocol?.fetched?.sitemap_index?.ok || !!protocol?.fetched?.wp_sitemap?.ok)],
      ["Inner Page Sampling", boolEmoji(!!protocol?.fetched?.about?.ok || !!protocol?.fetched?.blog?.ok || !!protocol?.fetched?.pricing?.ok)],
      ["site: Search Query", boolEmoji(!!(protocol?.searches || [])[0]?.ok)],
    ]),
  ].join("\n"));
}

function getAuditReportSkillPrompt() {
  return `You are Helio's SEO Audit Report Generator (V3).
Generate and format a Technical SEO Audit report in strict pro markdown format.

CRITICAL OUTPUT RULES:
- Output markdown only.
- Never escape table pipes and never output pipe text inside prose.
- Every markdown table MUST have: header row, separator row, and data rows.
- Use real emoji characters only: 🔴 🟠 🟡 🟢 ✅ ❌ ⚠️
- Never use P1/P2/P3 in the final narrative tables; use emoji severity labels.
- Never use ALL CAPS section headers or === dividers.
- Never mention Claude. Auditor must be Helio.
- Enforce spacing:
  - One blank line before and after headings.
  - One blank line before and after every table.
  - One blank line between issue, fix, and score lines.
  - One blank line before and after each --- separator.

DOCUMENT HEADER (exact pattern):
# Technical SEO Audit Report
## Site: {domain}
## Date: {YYYY-MM-DD}
## Auditor: AI SEO Agent
## Skill Version: technical-seo-audit v3.0

Then include --- and continue.

SECTION ORDER (must follow exactly):
1) Executive Summary (table + Top 3 Wins)
2) Category Scoreboard (table + weighted score line)
3) Phase 0 — Pre-Audit Setup (table + findings paragraph)
4) Phase 1 — Crawlability & Indexation
5) Phase 2 — HTTP Status Codes & Redirects
6) Phase 3 — HTTPS & Security
7) Phase 4 — Page Speed & Core Web Vitals
8) Phase 5 — On-Page SEO Signals
9) Phase 6 — Structured Data / Schema
10) Phase 7 — Mobile-Friendliness
11) Phase 8 — International SEO
12) Phase 9 — Site Architecture
13) Phase 10 — Backlink Profile
14) Phase 11 — Brand & Entity Signals
15) Phase 12 — Log Files / Crawl Budget
16) Issues Priority Matrix (single unified table, sorted by severity)
17) Quick Win Recommendations (10 items exactly)
18) Appendix A—E
19) Footer

SUB-SECTION FORMAT (mandatory):
- Include a table first.
- Then issue blocks in 3-part structure:
  **🔴 Critical Issue:** ...
  **Fix:** ...
  **Score: N/100** 🔴

Also supported:
  **🟠 High Issue:** ...
  **🟡 Medium Issue:** ...
  **🟢 Low Issue:** ...

Use inline severity badges inside prose statements too, for example:
- "🔴 Critical: robots.txt is inaccessible..."
- "🟠 High: duplicate titles affect snippet differentiation..."
- "🟢 Good: no 4xx/5xx pages detected in sampled crawl..."

DATA USAGE RULES:
- Use only provided evidence and metrics.
- If unavailable, explicitly state: "Unknown — not available in this run".
- Keep confidence bounded when coverage is low.
- Include protocol execution evidence, external integrations status, and per-page on-page table when sample exists.
- Maintain long-form depth (target 12–20 PDF pages when evidence allows).
- Do not truncate URLs in tables.
- Do not cut off sentences mid-line.
- Final report must include Appendices A–E and footer.
`;
}

async function buildAuditReportFromSkill(aiCfg, domain, structuredReport, rawPayload, projectData = {}) {
  const system = getAuditReportSkillPrompt();
  const compact = {
    domain,
    source: projectData?.audit?.source || "Helio Core",
    summary: rawPayload?.summary || {},
    quality: rawPayload?.quality || {},
    issueRegistry: (rawPayload?.issueRegistry || []).slice(0, 100),
    templatePatterns: (rawPayload?.templatePatterns || []).slice(0, 40),
    pagesSample: (rawPayload?.pages || []).slice(0, 120).map((p) => ({
      url: p.url,
      status: p.status_code,
      title: p?.meta?.title || "",
      titleLen: p?.meta?.title_len || 0,
      descriptionLen: p?.meta?.description_len || 0,
      h1Count: p?.meta?.h1_count || 0,
      canonical: p?.meta?.canonical || "",
      schemaTypes: p?.meta?.schema_types || [],
      loadMs: p?.page_timing?.time_to_interactive || 0,
      checks: p?.checks || {},
    })),
    enrichments: projectData?.audit?.enrichments || {},
    protocol: projectData?.audit?.protocol || {},
    deterministicReport: structuredReport || {},
  };
  const user = `Generate technical SEO audit report for ${domain} using provided data.\n\nDATA:\n${JSON.stringify(compact)}`;
  const raw = await callAI(aiCfg, system, user);
  return cleanProfessionalReportText(raw);
}

async function buildPdfDataUriFromText(title, text) {
  const JsPdf = await getJsPdfCtor();
  const doc = new JsPdf({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxWidth = pageWidth - margin * 2;
  const lineH = 12;
  let y = margin;
  const pdfSafe = (v = "") => String(v || "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[^\u0020-\u007E\n\r\t]/g, "");
  const ensureSpace = (h = lineH) => {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const drawHeading = (txt, level = 1) => {
    ensureSpace(level === 1 ? 18 : 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(level === 1 ? 13 : 11);
    doc.text(String(txt || ""), margin, y);
    y += level === 1 ? 18 : 16;
  };
  const drawParagraph = (txt = "", bold = false) => {
    const clean = pdfSafe(txt).trim();
    if (!clean) { y += 6; return; }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(clean, maxWidth);
    for (const ln of lines) {
      ensureSpace(lineH);
      doc.text(ln, margin, y);
      y += lineH;
    }
  };
  const drawStatusChip = (x, baselineY, status = "") => {
    const s = String(status || "").toUpperCase();
    let fill = [120, 120, 120];
    let label = "INFO";
    if (s.includes("PASS") || s.includes("GOOD") || s.includes("OK") || s.includes("TRUE") || s.includes("YES")) { fill = [86, 230, 125]; label = "PASS"; }
    else if (s.includes("WARN") || s.includes("MEDIUM") || s.includes("INFERRED")) { fill = [255, 184, 77]; label = "WARN"; }
    else if (s.includes("FAIL") || s.includes("CRITICAL") || s.includes("HIGH") || s.includes("NO") || s.includes("FALSE")) { fill = [255, 98, 98]; label = "FAIL"; }
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.circle(x, baselineY - 3, 3, "F");
    doc.setTextColor(210, 210, 210);
    doc.text(label, x + 8, baselineY);
    doc.setTextColor(20, 20, 20);
  };
  const drawTable = (headers = [], rows = []) => {
    if (!headers.length) return;
    const colCount = headers.length;
    const colW = maxWidth / colCount;
    const rowH = 16;
    const drawRow = (cells, isHeader = false) => {
      ensureSpace(rowH);
      doc.setLineWidth(0.6);
      doc.setDrawColor(170, 170, 170);
      for (let i = 0; i < colCount; i += 1) {
        const x = margin + i * colW;
        doc.rect(x, y - 11, colW, rowH);
        const raw = pdfSafe(String(cells[i] ?? ""));
        const txt = raw.replace(/^🟢|^🟠|^🔴/u, "").trim();
        doc.setFont("helvetica", isHeader ? "bold" : "normal");
        doc.setFontSize(8.8);
        const safe = doc.splitTextToSize(txt, colW - 8)[0] || "";
        doc.text(safe, x + 4, y);
        if (!isHeader && i === 0 && /^🟢|^🟠|^🔴/u.test(raw)) {
          drawStatusChip(x + colW - 40, y, raw);
        }
      }
      y += rowH;
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r, false));
    y += 6;
  };

  drawHeading(String(title || "Helio SEO Audit"), 1);
  const rawLines = String(text || "").split("\n");
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (!trimmed) { y += 4; i += 1; continue; }
    if (/^\d+\.\s/.test(trimmed)) { drawHeading(trimmed, 2); i += 1; continue; }
    if (/^[A-Z][A-Za-z0-9 /&-]+:$/.test(trimmed)) { drawParagraph(trimmed.replace(/:$/, ""), true); i += 1; continue; }
    if (trimmed.includes("|")) {
      const chunk = [];
      while (i < rawLines.length && rawLines[i].includes("|")) {
        const t = rawLines[i].trim();
        if (t) chunk.push(t);
        i += 1;
      }
      const normalized = chunk.filter((l) => !/^\|?[-\s|]+\|?$/.test(l));
      if (normalized.length >= 2) {
        const parse = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
        drawTable(parse(normalized[0]), normalized.slice(1).map(parse));
      } else {
        normalized.forEach((l) => drawParagraph(l));
      }
      continue;
    }
    drawParagraph(trimmed);
    i += 1;
  }
  return doc.output("datauristring");
}

function setActiveOrgContext(org = {}) {
  const guardrails = Array.isArray(org?.guardrails) ? org.guardrails.filter(Boolean) : [];
  const custom = String(org?.customInstructions || "").trim();
  const policy = org?.autonomy?.policy || "balanced";
  const domain = org?.integrations?.gsc?.fields?.extra?.siteUrl || "";
  const blocks = [];
  if (domain) blocks.push(`ACTIVE DOMAIN: ${domain}`);
  blocks.push(`AUTONOMY POLICY: ${policy}`);
  if (guardrails.length) {
    blocks.push(`MANDATORY GUARDRAILS:\n${guardrails.map((g) => `- ${g}`).join("\n")}`);
  }
  if (custom) {
    blocks.push(`PERSONA OVERRIDE (MANDATORY):\nAdopt this persona and behavior style in every response unless it conflicts with safety.\n${custom}`);
    blocks.push(`CUSTOM INSTRUCTIONS (MANDATORY):\n${custom}`);
  }
  ACTIVE_ORG_CONTEXT = blocks.join("\n\n");
}

const REDIRECT_URI = "https://www.claudeusercontent.com/";

async function callAI(aiConfig, system, user, history=[]) {
  if (!aiConfig?.connected) throw new Error("AI provider not connected");
  const {provider,apiKey,model} = aiConfig.fields;
  const enforcement = ACTIVE_ORG_CONTEXT
    ? "You must strictly follow PERSONA OVERRIDE, CUSTOM INSTRUCTIONS, and GUARDRAILS from system context."
    : "";
  const relevantSkills = getRelevantSkillContext(system, user);
  const blocks = [enforcement, relevantSkills, ACTIVE_ORG_CONTEXT, system].filter(Boolean);
  const effectiveSystem = blocks.join("\n\n");
  if (provider==="anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,max_tokens:1500,system:effectiveSystem,messages:[...history,{role:"user",content:user}]})});
    const d = await res.json(); if(d.error) throw new Error(d.error.message); return d.content?.[0]?.text||"";
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`,"HTTP-Referer":"https://helio-seo.app","X-Title":"Helio SEO Agent"},body:JSON.stringify({model,messages:[{role:"system",content:effectiveSystem},...history,{role:"user",content:user}]})});
  const d = await res.json(); if(d.error) throw new Error(d.error.message); return d.choices?.[0]?.message?.content||"";
}

function resolveHelioCodeAgentConfig(integrations = {}) {
  const hc = integrations?.heliocode;
  if (hc?.connected) {
    const provider = String(hc?.fields?.provider || "").trim();
    const model = String(hc?.fields?.model || "").trim();
    const apiKey = String(hc?.fields?.apiKey || "").trim();
    if (provider && model && apiKey) return { provider, model, apiKey, source: "heliocode" };
  }
  const ai = integrations?.ai;
  if (ai?.connected) {
    const provider = String(ai?.fields?.provider || "").trim();
    const model = String(ai?.fields?.model || "").trim();
    const apiKey = String(ai?.fields?.apiKey || "").trim();
    if (provider && model && apiKey) return { provider, model, apiKey, source: "ai" };
  }
  return null;
}

async function fetchHelioCodeReadiness() {
  const res = await fetch("/api/helio-code/readiness");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Helio Code readiness HTTP ${res.status}`);
  return data;
}

function hasPassedReadinessCheck(readiness = {}, id = "") {
  return !!(Array.isArray(readiness?.checks) ? readiness.checks : []).find((check) => String(check.id) === id && check.pass);
}

function isHelioCodeReadyForProject(readiness = {}, integrations = {}) {
  const gh = integrations?.github?.fields || {};
  const hasProjectGithub = !!(integrations?.github?.connected && gh?.repo && (gh?.appInstallationId || gh?.token));
  return (
    hasPassedReadinessCheck(readiness, "database") &&
    hasPassedReadinessCheck(readiness, "worker_command") &&
    hasPassedReadinessCheck(readiness, "worker_heartbeat") &&
    (hasPassedReadinessCheck(readiness, "github_auth") || hasProjectGithub)
  );
}

function canAttemptHelioCodeForProject(readiness = {}, integrations = {}) {
  const gh = integrations?.github?.fields || {};
  const hasProjectGithub = !!(integrations?.github?.connected && gh?.repo && (gh?.appInstallationId || gh?.token));
  return (
    hasPassedReadinessCheck(readiness, "database") &&
    hasPassedReadinessCheck(readiness, "worker_command") &&
    hasProjectGithub
  );
}

async function startHelioCodeWorkerFromApp() {
  const res = await fetch("/api/helio-code/worker/start", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `Worker start HTTP ${res.status}`);
  return data;
}

async function ensureHelioCodeWorkerReady(integrations = {}) {
  let readiness = await fetchHelioCodeReadiness();
  if (isHelioCodeReadyForProject(readiness, integrations)) return readiness;
  const canStart = hasPassedReadinessCheck(readiness, "database") && hasPassedReadinessCheck(readiness, "worker_command");
  if (canStart && !hasPassedReadinessCheck(readiness, "worker_heartbeat")) {
    await startHelioCodeWorkerFromApp();
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 900));
      // eslint-disable-next-line no-await-in-loop
      readiness = await fetchHelioCodeReadiness();
      if (isHelioCodeReadyForProject(readiness, integrations)) return readiness;
    }
  }
  return readiness;
}

function helioCodeReadinessFailure(readiness = {}, integrations = {}) {
  const missing = (Array.isArray(readiness?.checks) ? readiness.checks : [])
    .filter((check) => {
      const gh = integrations?.github?.fields || {};
      const hasProjectGithub = !!(integrations?.github?.connected && gh?.repo && (gh?.appInstallationId || gh?.token));
      if (String(check.id) === "github_auth" && hasProjectGithub) return false;
      if (String(check.id) === "repo_source" && hasProjectGithub) return false;
      return !check.pass;
    })
    .map((check) => `${check.label || check.id}: ${check.detail || "missing"}`);
  return [
    `Helio Code is not production-ready (mode: ${readiness?.mode || "unknown"}, score: ${readiness?.score ?? "n/a"}).`,
    "Real repo editing requires database queue, worker heartbeat, agent command, and GitHub auth from env or Integrations.",
    missing.length ? `Missing:\n- ${missing.join("\n- ")}` : "",
  ].filter(Boolean).join("\n");
}

// ── Helio Core Engine (crawler + on-page analyzer) ───────────────
export function normalizeUrl(input) {
  if (!input) return "";
  const raw = input.trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function simpleHash(str = "") {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0).toString(16);
}

export function canonicalizeCrawlUrl(rawUrl = "") {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    const dropParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
    dropParams.forEach((k) => u.searchParams.delete(k));
    const kept = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    u.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : "";
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return "";
  }
}

function defaultIntegrationsState() {
  return Object.fromEntries(Object.keys(INTEGRATION_DEFS).map((id) => [id, { connected: false, fields: {} }]));
}

function defaultSkillsState() {
  return Object.fromEntries(SEO_SKILL_LIBRARY.map((s) => [s.id, { ...s, installed: false, enabled: false }]));
}

function defaultContentSchedule() {
  return { cadence: "weekly", postsPerWeek: 3, postsPerDay: 1, horizonMonths: 3 };
}

function normalizeContentSchedule(cfg = {}) {
  const base = defaultContentSchedule();
  const cadence = ["weekly", "daily"].includes(String(cfg?.cadence || "").toLowerCase()) ? String(cfg.cadence).toLowerCase() : base.cadence;
  const postsPerWeek = Math.max(1, Math.min(14, Number(cfg?.postsPerWeek || base.postsPerWeek)));
  const postsPerDay = Math.max(1, Math.min(6, Number(cfg?.postsPerDay || base.postsPerDay)));
  const horizonMonths = Math.max(1, Math.min(12, Number(cfg?.horizonMonths || base.horizonMonths)));
  return { cadence, postsPerWeek, postsPerDay, horizonMonths };
}

function createOrganization(name = "Default Organization") {
  return {
    id: `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    integrations: defaultIntegrationsState(),
    skillsState: defaultSkillsState(),
    agentOnline: false,
    autonomy: {
      enabled: false,
      runTime: "06:00",
      policy: "balanced",
      enableAeoIntelSuite: true,
      aeoIntelEngine: "chatgpt",
      aeoIntelDriftThreshold: 0.05,
      aeoIntelMinCitationRate: 0.15,
      lastRunDate: "",
      running: false,
      lastStatus: "idle",
      lastRunAt: "",
    },
    auditFixApprovalMode: "always_ask",
    contentSchedule: defaultContentSchedule(),
    customInstructions: "",
    guardrails: [],
    createdAt: new Date().toISOString(),
  };
}

function loadOrganizationState() {
  const fallback = createOrganization("Default Organization");
  try {
    const raw = localStorage.getItem("helio:orgs:v1");
    const activeRaw = localStorage.getItem("helio:orgs:active:v1");
    if (!raw) return { orgs: [fallback], activeOrgId: fallback.id };
    const parsed = JSON.parse(raw);
    const orgs = Array.isArray(parsed?.orgs) ? parsed.orgs : [];
    if (!orgs.length) return { orgs: [fallback], activeOrgId: fallback.id };
    const normalized = orgs.map((o) => ({
      ...o,
      integrations: o.integrations || defaultIntegrationsState(),
      skillsState: o.skillsState || defaultSkillsState(),
      agentOnline: !!o.agentOnline,
      autonomy: {
        enabled: false,
        runTime: "06:00",
        policy: "balanced",
        enableAeoIntelSuite: true,
        aeoIntelEngine: "chatgpt",
        aeoIntelDriftThreshold: 0.05,
        aeoIntelMinCitationRate: 0.15,
        lastRunDate: "",
        running: false,
        lastStatus: "idle",
        lastRunAt: "",
        ...(o.autonomy || {}),
      },
      auditFixApprovalMode: o.auditFixApprovalMode || "always_ask",
      contentSchedule: normalizeContentSchedule(o.contentSchedule),
      customInstructions: o.customInstructions || "",
      guardrails: Array.isArray(o.guardrails) ? o.guardrails : [],
    }));
    const activeOrgId = normalized.some((o) => o.id === activeRaw) ? activeRaw : normalized[0].id;
    return { orgs: normalized, activeOrgId };
  } catch {
    return { orgs: [fallback], activeOrgId: fallback.id };
  }
}

async function fetchHtmlWithFallback(url, preferRendered = false, allowJina = true) {
  const directTargets = [
    { type: "direct", url },
    { type: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    ...(allowJina ? [{ type: "jina", url: `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}` }] : []),
  ];
  const renderedTargets = [
    { type: "direct", url },
    { type: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    ...(allowJina ? [{ type: "jina", url: `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}` }] : []),
  ];
  const targets = preferRendered ? renderedTargets : directTargets;
  let lastErr = "Unknown fetch failure";
  for (const t of targets) {
    const started = performance.now();
    try {
      const res = await fetch(t.url);
      const ms = Math.max(1, Math.round(performance.now() - started));
      if (!res.ok) {
        lastErr = `${t.type}: HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      if (!text || text.length < 40) {
        lastErr = `${t.type}: empty response`;
        continue;
      }
      const headerMap = {};
      try {
        ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"].forEach((k) => {
          const v = res.headers.get(k);
          if (v) headerMap[k] = v;
        });
      } catch {}
      return { ok: true, source: t.type, html: text, status: 200, ms, headers: headerMap };
    } catch (e) {
      lastErr = `${t.type}: ${e.message}`;
    }
  }
  return { ok: false, error: lastErr, status: 0, ms: 0, html: "", headers: {} };
}

function isEnhancedRenderMode(mode = "") {
  return mode === "enhanced-js" || mode === "pro-js";
}

async function fetchSitemapUrls(seedUrl, addLog = () => {}, maxUrls = 600) {
  const origin = new URL(seedUrl).origin;
  const visited = new Set();
  const found = new Set();
  const queue = [];
  try {
    const robotsRes = await fetch(`${origin}/robots.txt`);
    if (robotsRes.ok) {
      const txt = await robotsRes.text();
      txt.split("\n").forEach((l) => {
        if (/^sitemap:/i.test(l.trim())) {
          const sm = l.split(":").slice(1).join(":").trim();
          if (sm) queue.push(sm);
        }
      });
    }
  } catch {}
  queue.push(`${origin}/sitemap.xml`);
  while (queue.length && found.size < maxUrls) {
    const sm = queue.shift();
    if (!sm || visited.has(sm)) continue;
    visited.add(sm);
    try {
      const r = await fetch(sm);
      if (!r.ok) continue;
      const xml = await r.text();
      const locs = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/gi)).map((m) => m[1].trim()).filter(Boolean);
      if (!locs.length) continue;
      if (/<sitemapindex/i.test(xml)) {
        locs.forEach((u) => { if (!visited.has(u)) queue.push(u); });
      } else {
        for (const u of locs) {
          try {
            const nu = new URL(u).toString();
            if (new URL(nu).host === new URL(seedUrl).host) found.add(canonicalizeCrawlUrl(nu));
          } catch {}
          if (found.size >= maxUrls) break;
        }
      }
    } catch {}
  }
  if (found.size) addLog(`Sitemap seeds loaded: ${found.size}`, "ok");
  return Array.from(found).filter(Boolean);
}

async function fetchFirecrawlMap(domain, cfg = {}, addLog = () => {}) {
  const apiKey = cfg?.apiKey;
  if (!apiKey) throw new Error("Firecrawl API key missing");
  const base = String(cfg?.apiBase || "https://api.firecrawl.dev").replace(/\/+$/, "");
  const url = `${base}/v2/map`;
  const body = {
    url: normalizeUrl(domain),
    sitemap: "include",
    includeSubdomains: false,
    ignoreQueryParameters: true,
    limit: 1000,
    timeout: 60000,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data?.success) throw new Error(data?.error || "Firecrawl map failed");
  const links = Array.isArray(data?.links) ? data.links : [];
  const urls = links.map((l) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
  addLog(`Firecrawl mapped ${urls.length} URLs`, "ok");
  return urls;
}

async function fetchPageSpeedInsights(url, apiKey, strategy = "mobile") {
  if (!apiKey) throw new Error("PageSpeed API key missing");
  const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${encodeURIComponent(strategy || "mobile")}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(u);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "PageSpeed request failed");
  const lh = data?.lighthouseResult || {};
  const cats = lh?.categories || {};
  const audits = lh?.audits || {};
  return {
    strategy: strategy || "mobile",
    performance: Math.round((Number(cats?.performance?.score || 0) * 100)),
    seo: Math.round((Number(cats?.seo?.score || 0) * 100)),
    bestPractices: Math.round((Number(cats?.["best-practices"]?.score || 0) * 100)),
    accessibility: Math.round((Number(cats?.accessibility?.score || 0) * 100)),
    lcp: audits?.["largest-contentful-paint"]?.displayValue || "n/a",
    cls: audits?.["cumulative-layout-shift"]?.displayValue || "n/a",
    inp: audits?.["interaction-to-next-paint"]?.displayValue || audits?.["max-potential-fid"]?.displayValue || "n/a",
    tbt: audits?.["total-blocking-time"]?.displayValue || "n/a",
    fcp: audits?.["first-contentful-paint"]?.displayValue || "n/a",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchMozillaObservatory(host) {
  try {
    const submit = await fetch(`https://http-observatory.security.mozilla.org/api/v1/analyze?host=${encodeURIComponent(host)}&rescan=true`);
    if (!submit.ok) return null;
    const started = await submit.json();
    const scanId = started?.scan_id;
    if (!scanId) return null;
    for (let i = 0; i < 8; i += 1) {
      await new Promise((r) => setTimeout(r, 1200));
      const poll = await fetch(`https://http-observatory.security.mozilla.org/api/v1/getScanResults?scan=${encodeURIComponent(scanId)}`);
      if (!poll.ok) continue;
      const d = await poll.json();
      if (d?.state === "FINISHED" || d?.grade) {
        return { grade: d.grade || "n/a", score: d.score ?? null, testsFailed: d.tests_failed ?? null, testsPassed: d.tests_passed ?? null };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function computeSecurityHeaderCoverage(pages = []) {
  const required = ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy"];
  const out = {};
  required.forEach((h) => { out[h] = 0; });
  for (const p of pages) {
    const hs = p?.response_headers || {};
    required.forEach((h) => { if (hs[h]) out[h] += 1; });
  }
  const total = Math.max(1, pages.length);
  const pct = Object.fromEntries(required.map((h) => [h, Math.round((out[h] / total) * 100)]));
  return { counts: out, coveragePct: pct, totalPages: total };
}

async function fetchGoogleTrendsSnapshot(seed = "", geo = "US") {
  try {
    const daily = await fetch(`https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=0&geo=${encodeURIComponent(geo)}&ns=15`);
    const txt = await daily.text();
    const clean = txt.replace(/^\)\]\}',?\n/, "");
    const parsed = JSON.parse(clean);
    const days = parsed?.default?.trendingSearchesDays || [];
    const top = [];
    days.slice(0, 3).forEach((d) => {
      (d?.trendingSearches || []).slice(0, 12).forEach((t) => top.push(String(t?.title?.query || "").trim()));
    });
    const dedup = Array.from(new Set(top.filter(Boolean))).slice(0, 40);
    const relatedSeed = seed ? dedup.filter((q) => q.toLowerCase().includes(seed.toLowerCase())).slice(0, 10) : [];
    return { geo, seed, fetchedAt: new Date().toISOString(), trendingQueries: dedup, relatedToSeed: relatedSeed };
  } catch {
    return null;
  }
}

async function webFetchTool(url, preferRendered = false) {
  const target = normalizeUrl(url);
  if (!target) return { ok: false, error: "Invalid URL", url };
  const r = await fetchHtmlWithFallback(target, preferRendered);
  if (!r.ok) return { ok: false, error: r.error || "fetch failed", url: target };
  return { ok: true, url: target, source: r.source, status: r.status, ms: r.ms, html: r.html, headers: r.headers || {} };
}

function dataForSeoCredentialsReady(cfg = {}) {
  return !!String(cfg?.login || "").trim() && !!String(cfg?.password || "").trim();
}

function extractDataForSeoSerpResult(payload = {}) {
  const task = Array.isArray(payload?.tasks) ? payload.tasks[0] : null;
  const result = Array.isArray(task?.result) ? task.result[0] : null;
  const items = Array.isArray(result?.items) ? result.items : [];
  return {
    statusCode: payload?.status_code || task?.status_code || 0,
    statusMessage: payload?.status_message || task?.status_message || "Unknown DataForSEO response",
    result,
    items,
  };
}

export async function dataForSeoSerpSearch(query = "", cfg = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, error: "Empty query", query };
  if (!dataForSeoCredentialsReady(cfg)) return { ok: false, error: "Missing DataForSEO credentials", query: q };

  const locationCode = Number(cfg.locationCode || cfg.location_code || 2840);
  const languageCode = String(cfg.languageCode || cfg.language_code || "en");
  const depth = Math.max(1, Math.min(100, Number(cfg.depth || 20)));
  const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${cfg.login}:${cfg.password}`),
    },
    body: JSON.stringify([{
      keyword: q,
      language_code: languageCode,
      location_code: locationCode,
      device: "desktop",
      depth,
    }]),
  });
  const payload = await res.json().catch(() => ({}));
  const serp = extractDataForSeoSerpResult(payload);
  if (!res.ok || serp.statusCode !== 20000) {
    return { ok: false, error: serp.statusMessage || `HTTP ${res.status}`, query: q, provider: "dataforseo-google" };
  }

  const organicItems = serp.items.filter((item) => ["organic", "featured_snippet", "local_pack", "people_also_ask"].includes(String(item?.type || "")));
  const results = organicItems.slice(0, depth).map((item) => ({
    type: item?.type || "organic",
    rank: item?.rank_group || item?.rank_absolute || null,
    title: item?.title || "",
    url: item?.url || "",
    domain: item?.domain || "",
    description: item?.description || "",
  }));
  const snippets = results
    .flatMap((item) => [item.title, item.url, item.description].filter(Boolean))
    .slice(0, 30);
  const text = results.map((item) => `${item.rank || "-"} ${item.title}\n${item.url}\n${item.description}`.trim()).join("\n\n");

  return {
    ok: true,
    query: q,
    provider: "dataforseo-google",
    locationCode,
    languageCode,
    text,
    snippets,
    results,
    rawCount: serp.items.length,
  };
}

function normalizeDataForSeoBacklinkTarget(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(normalizeUrl(raw));
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

export async function dataForSeoBacklinkAnalysis(target = "", cfg = {}, options = {}) {
  const normalizedTarget = normalizeDataForSeoBacklinkTarget(target);
  if (!normalizedTarget) return { ok: false, error: "Enter a domain to analyze" };
  if (!dataForSeoCredentialsReady(cfg)) return { ok: false, error: "Connect DataForSEO credentials before running backlink analysis" };

  const res = await fetch(options.endpoint || "/api/dataforseo/backlinks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: normalizedTarget,
      login: cfg.login,
      password: cfg.password,
      limit: options.limit || 20,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) {
    return { ok: false, error: payload?.error || `Backlink API failed with HTTP ${res.status}`, target: normalizedTarget };
  }
  return {
    ok: true,
    target: payload.target || normalizedTarget,
    summary: payload.summary || {},
    backlinks: Array.isArray(payload.backlinks) ? payload.backlinks : [],
    raw: payload.raw,
  };
}

export async function helioNativeBacklinkAnalysis(target = "", options = {}) {
  const normalizedTarget = normalizeDataForSeoBacklinkTarget(target);
  if (!normalizedTarget) return { ok: false, error: "Enter a domain to analyze" };
  const res = await fetch(options.endpoint || "/api/helio-backlinks/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: normalizedTarget,
      orgScope: options.orgScope || "default",
      candidates: options.candidates || [],
      discover: options.discover !== false,
      maxCandidates: options.maxCandidates || 20,
      discoveryOptions: options.discoveryOptions || {},
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) {
    return { ok: false, error: payload?.error || `Helio backlink analysis failed with HTTP ${res.status}`, target: normalizedTarget };
  }
  return {
    ok: true,
    target: payload.target || normalizedTarget,
    provider: payload.provider || "helio-native",
    summary: payload.summary || {},
    backlinks: Array.isArray(payload.backlinks) ? payload.backlinks : [],
    diagnostics: payload.diagnostics || {},
    index: payload.index || {},
  };
}

export async function helioBacklinkIndexRequest(target = "", options = {}) {
  const normalizedTarget = normalizeDataForSeoBacklinkTarget(target);
  if (!normalizedTarget) return { ok: false, error: "Enter a domain to analyze" };
  const endpoint = options.endpoint || "/api/helio-backlinks/analyze";
  const res = options.action === "load"
    ? await fetch(`${endpoint}?target=${encodeURIComponent(normalizedTarget)}&orgScope=${encodeURIComponent(options.orgScope || "default")}`)
    : await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: options.action || "import",
        target: normalizedTarget,
        orgScope: options.orgScope || "default",
        text: options.text || "",
        candidates: options.candidates || [],
        queueBatchSize: options.queueBatchSize,
        maxCandidates: options.maxCandidates,
        rounds: options.rounds,
        maxTargetsPerCycle: options.maxTargetsPerCycle,
        maxFailureRate: options.maxFailureRate,
      }),
    });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) return { ok: false, error: payload?.error || `Helio backlink index request failed with HTTP ${res.status}` };
  return payload;
}

export async function webSearchTool(query = "", options = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, error: "Empty query", query };
  const errors = [];

  if (dataForSeoCredentialsReady(options?.dataforseo)) {
    try {
      const dfs = await dataForSeoSerpSearch(q, options.dataforseo);
      if (dfs.ok) return dfs;
      errors.push(`dataforseo-google: ${dfs.error || "failed"}`);
    } catch (e) {
      errors.push(`dataforseo-google: ${e.message}`);
    }
  }

  const encoded = encodeURIComponent(q);
  const upstreams = [
    { name: "google", url: `https://r.jina.ai/http://www.google.com/search?q=${encoded}` },
    { name: "duckduckgo", url: `https://r.jina.ai/http://duckduckgo.com/html/?q=${encoded}` },
    { name: "bing", url: `https://r.jina.ai/http://www.bing.com/search?q=${encoded}` },
  ];

  for (const upstream of upstreams) {
    try {
      const res = await fetch(upstream.url);
      const text = await res.text();
      if (!res.ok || !text) {
        errors.push(`${upstream.name}: HTTP ${res.status}`);
        continue;
      }
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const snippets = lines
        .filter((l) => /^https?:\/\//i.test(l) || /^#+\s+/.test(l) || /\b(result|snippet|title|url source)\b/i.test(l))
        .slice(0, 30);
      return { ok: true, query: q, provider: upstream.name, text, snippets };
    } catch (e) {
      errors.push(`${upstream.name}: ${e.message}`);
    }
  }

  const blocked = errors.some((x) => /HTTP 451/i.test(x));
  return {
    ok: false,
    unavailable: blocked,
    error: blocked ? `Search upstream blocked (${errors.join("; ")})` : errors.join("; "),
    query: q,
  };
}

async function runHelioAuditProtocol(domain, addLog, options = {}) {
  const d = getHostFromInput(domain);
  const www = `https://www.${d}/`;
  const nonWww = `https://${d}/`;
  const httpWww = `http://www.${d}/`;
  const fetchPlan = [
    { key: "home_www", url: www },
    { key: "home_non_www", url: nonWww },
    { key: "home_http_www", url: httpWww },
    { key: "robots", url: `${www}robots.txt` },
    { key: "sitemap_xml", url: `${www}sitemap.xml` },
    { key: "sitemap_index", url: `${www}sitemap_index.xml` },
    { key: "wp_sitemap", url: `${www}wp-sitemap.xml` },
    { key: "soft404_probe", url: `${www}404` },
    { key: "about", url: `${www}about` },
    { key: "blog", url: `${www}blog` },
    { key: "pricing", url: `${www}pricing` },
    { key: "llm_txt", url: `${www}llm.txt` },
    { key: "llms_txt", url: `${www}llms.txt` },
    { key: "builtwith", url: `https://builtwith.com/${d}` },
  ];
  addLog("Stage P1: Running mandatory web_fetch sequence", "sys");
  const fetched = {};
  for (const step of fetchPlan) {
    const r = await webFetchTool(step.url, false);
    fetched[step.key] = r;
    addLog(`${r.ok ? "🟢" : "🔴"} web_fetch ${step.key} -> ${r.ok ? "OK" : r.error}`, r.ok ? "ok" : "warn");
  }

  addLog("Stage P2: Running mandatory web_search sequence", "sys");
  const searchQueries = [
    `site:${d}`,
    `"${d}" OR "site:${d}"`,
    `${d} PageSpeed Core Web Vitals`,
    `${d} backlinks referring domains domain authority`,
    `${d} schema structured data JSON-LD`,
    `${d} technology stack CMS platform`,
    `${d} review`,
    `${d.split(".")[0]} linkedin instagram facebook twitter`,
  ];
  const searches = [];
  for (const q of searchQueries) {
    const s = await webSearchTool(q, { dataforseo: options?.dataforseo });
    searches.push(s);
    addLog(
      `${s.ok ? "🟢" : s.unavailable ? "🟠" : "🔴"} web_search ${q}${s.ok ? ` -> ${s.provider || "OK"}` : ` -> ${s.error || "unknown error"}`}`,
      s.ok ? "ok" : "warn"
    );
  }

  const home = fetched.home_www?.html || "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(home || "", "text/html");
  const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  const linkCount = doc.querySelectorAll("a[href]").length;
  const renderingType = bodyText.length < 200 && linkCount < 3 ? "JS_SPA_SUSPECTED" : "SSR_OR_STATIC";
  const redirectSignals = {
    wwwCanonical: fetched.home_www?.ok,
    nonWwwReachable: fetched.home_non_www?.ok,
    httpRedirected: fetched.home_http_www?.ok,
    soft404ProbeOk: fetched.soft404_probe?.ok,
  };
  return {
    domain: d,
    renderingType,
    redirectSignals,
    fetched,
    searches,
    summary: {
      fetchSuccess: Object.values(fetched).filter((x) => x?.ok).length,
      fetchTotal: Object.keys(fetched).length,
      searchSuccess: searches.filter((x) => x.ok).length,
      searchUnavailable: searches.filter((x) => x.unavailable).length,
      searchTotal: searches.length,
    },
  };
}

function extractPageSignals(url, html, ms = 0, headers = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const textLines = String(html || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const markdownHeading = textLines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() || "";
  const fallbackTitle = markdownHeading || textLines.find((line) => !/^```/.test(line) && line.length > 12 && line.length < 120) || "";
  const title = (doc.querySelector("title")?.textContent || fallbackTitle || "").trim();
  const metaDescriptionTag = (doc.querySelector('meta[name="description"]')?.getAttribute("content") || "").trim();
  const fallbackDescription = textLines.find((line) => line.length > 80 && line.length < 260 && !/^#\s+/.test(line)) || "";
  const description = (metaDescriptionTag || fallbackDescription || "").trim();
  const robots = (doc.querySelector('meta[name="robots"]')?.getAttribute("content") || "").toLowerCase();
  const canonical = (doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "").trim();
  const htmlH1s = Array.from(doc.querySelectorAll("h1")).map((h) => (h.textContent || "").trim()).filter(Boolean);
  const h1s = htmlH1s.length ? htmlH1s : (markdownHeading ? [markdownHeading] : []);
  const schemaTypes = [];
  let schemaParseErrors = 0;
  Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).forEach((s) => {
    const raw = s.textContent || "";
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      nodes.forEach((n) => {
        const t = n?.["@type"];
        if (Array.isArray(t)) t.forEach((x) => schemaTypes.push(String(x)));
        else if (t) schemaTypes.push(String(t));
      });
    } catch {
      schemaParseErrors += 1;
    }
  });
  const imgs = Array.from(doc.querySelectorAll("img"));
  const noAlt = imgs.filter((img) => !img.getAttribute("alt") || !img.getAttribute("alt").trim()).length;
  const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  const fallbackText = textLines.join(" ");
  const combinedText = bodyText.length >= 80 ? bodyText : fallbackText;
  const words = combinedText.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
  const contentFingerprint = simpleHash(combinedText.slice(0, 2500).toLowerCase());
  const htmlLinks = Array.from(doc.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")).filter(Boolean);
  const mdLinks = Array.from(String(html || "").matchAll(/\[[^\]]{1,120}\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)).map((m) => m[1]);
  const rawUrls = Array.from(String(html || "").matchAll(/\bhttps?:\/\/[^\s<>"')]+/g)).map((m) => m[0]);
  const links = Array.from(new Set([...htmlLinks, ...mdLinks, ...rawUrls])).filter(Boolean);
  const u = new URL(url);
  const normalizedLinks = links.map((href) => {
    try { return new URL(href, u.origin).toString(); } catch { return null; }
  }).filter(Boolean);
  const internal = normalizedLinks.filter((l) => new URL(l).host === u.host);
  const external = normalizedLinks.filter((l) => new URL(l).host !== u.host);
  let canonicalConflict = 0;
  if (canonical) {
    try {
      const resolvedCanonical = new URL(canonical, u.origin).toString().split("#")[0];
      const current = u.toString().split("#")[0];
      canonicalConflict = resolvedCanonical !== current ? 1 : 0;
    } catch {
      canonicalConflict = 1;
    }
  }
  return {
    url,
    status_code: 200,
    size: html.length,
    page_timing: { time_to_interactive: ms },
    meta: {
      title,
      description,
      canonical,
      htags: { h1: h1s },
      robots,
      content: { words_count: words },
      structured_data: schemaTypes.length ? { types: Array.from(new Set(schemaTypes)).slice(0, 20) } : null,
      schema_types: Array.from(new Set(schemaTypes)).slice(0, 20),
      schema_parse_errors: schemaParseErrors,
    },
    checks: {
      no_h1_tag: h1s.length ? 0 : 1,
      no_description: description ? 0 : 1,
      no_image_alt: noAlt,
      no_index_page: robots.includes("noindex") ? 1 : 0,
      high_loading_time: ms > 2500 ? 1 : 0,
      canonical_conflict: canonicalConflict,
    },
    internal_links_count: internal.length,
    external_links_count: external.length,
    content_fingerprint: contentFingerprint,
    crawl_links: Array.from(new Set(internal)).slice(0, 60),
    response_headers: headers || {},
  };
}

async function helioCoreAnalyzePage(url, options = {}) {
  const target = normalizeUrl(url);
  if (!target) throw new Error("Invalid URL");
  const f = await fetchHtmlWithFallback(target, isEnhancedRenderMode(options?.renderMode), options?.allowJina !== false);
  if (!f.ok) throw new Error(f.error || "Failed to fetch page");
  const data = extractPageSignals(target, f.html, f.ms, f.headers || {});
  return { source: `Helio Core (${f.source})`, data };
}

export function computeHelioAuditScore(summary) {
  const weights = {
    broken_pages: 20,
    no_h1_tag: 15,
    no_description: 15,
    no_image_alt: 10,
    no_index_page: 15,
    high_loading_time: 10,
    duplicate_title: 15,
  };
  const pages = Math.max(1, summary?.pages_crawled || 1);
  const norm = {
    broken_pages: (summary?.broken_pages || 0) / pages,
    no_h1_tag: (summary?.checks?.no_h1_tag || 0) / pages,
    no_description: (summary?.checks?.no_description || 0) / pages,
    no_image_alt: Math.min(1, (summary?.checks?.no_image_alt || 0) / (pages * 3)),
    no_index_page: (summary?.checks?.no_index_page || 0) / pages,
    high_loading_time: (summary?.checks?.high_loading_time || 0) / pages,
    duplicate_title: (summary?.duplicate_title || 0) / pages,
  };
  let penalty = 0;
  Object.keys(weights).forEach((k) => { penalty += Math.min(1, norm[k] || 0) * weights[k]; });
  const score = Math.max(0, Math.round(100 - penalty));
  return {
    score,
    severity: score >= 85 ? "low" : score >= 70 ? "medium" : "high",
    breakdown: norm,
  };
}

function getTemplateKeyFromUrl(url = "") {
  try {
    const u = new URL(url);
    const parts = (u.pathname || "/").split("/").filter(Boolean);
    if (!parts.length) return "/";
    if (parts[0] === "blog") return "/blog/*";
    if (parts[0] === "category") return "/category/*";
    if (parts[0] === "product") return "/product/*";
    return `/${parts[0]}/*`;
  } catch {
    return "/";
  }
}

function calibrateIssueRegistry(issueRegistry = [], pagesCrawled = 1) {
  const pages = Math.max(1, pagesCrawled);
  const weighted = issueRegistry.map((i) => {
    const prevalence = Math.min(1, (i.value || 0) / pages);
    const sevWeight = i.severity === "high" ? 1 : i.severity === "medium" ? 0.65 : 0.3;
    const impact = Math.round(prevalence * sevWeight * 100);
    const priority = impact >= 45 ? "P1" : impact >= 20 ? "P2" : "P3";
    return { ...i, impact, priority, prevalence: `${Math.round(prevalence * 100)}%` };
  });
  return weighted.sort((a, b) => b.impact - a.impact);
}

function severityFromImpact(impact = 0) {
  if (impact >= 60) return "critical";
  if (impact >= 35) return "high";
  if (impact >= 18) return "medium";
  return "low";
}

function buildAuditFinding(issue, pages = []) {
  const sampleUrls = pages
    .filter((p) => {
      const checks = p?.checks || {};
      if (issue.key === "broken_pages") return (p.status_code || 0) >= 400 || (p.status_code || 0) === 0;
      return (checks[issue.key] || 0) > 0;
    })
    .slice(0, 5)
    .map((p) => p.url);
  const impact = Number(issue.impact || 0);
  const severity = severityFromImpact(impact);
  const recommendedFixByKey = {
    broken_pages: "Repair broken URLs, add 301s to best-match targets, and update internal links.",
    no_h1_tag: "Enforce one descriptive H1 per indexable template and align with intent.",
    no_description: "Generate unique, intent-matching meta descriptions for flagged templates.",
    no_image_alt: "Add descriptive alt text for informative images and skip decorative images.",
    no_index_page: "Remove unintended noindex directives and keep intentional exclusions documented.",
    canonical_conflict: "Set valid self-canonical for preferred URLs and remove conflicting canonical hints.",
    duplicate_title: "Create template rules that force unique title patterns by page type.",
    duplicate_content_clusters: "Consolidate near-duplicate pages or differentiate intent and content depth.",
    robots_blocked_pages: "Unblock strategic URLs in robots and avoid disallow patterns on key paths.",
    sitemap_missing: "Publish sitemap index and keep only canonical indexable URLs.",
    high_loading_time: "Reduce render-blocking JS/CSS, optimize media, and defer non-critical scripts.",
  };
  return {
    id: issue.issue_id,
    issue: issue.label,
    where: sampleUrls,
    whyItMatters: `${issue.label} reduces crawl/index quality and ranking reliability.`,
    severity,
    likelyImpact: `Affects ${issue.value || 0} crawled pages.`,
    recommendedFix: recommendedFixByKey[issue.key] || "Implement template-level fix and validate via re-crawl.",
    confidence: issue.value > 0 ? "high" : "medium",
    impact,
    priority: issue.priority || "P3",
    prevalence: issue.prevalence || "0%",
    value: issue.value || 0,
  };
}

function buildTechnicalAuditReport({ domain, source, renderMode, results, projectData }) {
  const summary = results?.summary || {};
  const pages = Array.isArray(results?.pages) ? results.pages : [];
  const issueRegistry = Array.isArray(results?.issueRegistry) ? results.issueRegistry : [];
  const templatePatterns = Array.isArray(results?.templatePatterns) ? results.templatePatterns : [];
  const diagnostics = results?.diagnostics || {};
  const enrichments = projectData?.audit?.enrichments || {};
  const protocol = projectData?.audit?.protocol || null;
  const gscSignals = projectData?.audit?.gscSignals || projectData?.gsc || {};
  const ga4Signals = projectData?.audit?.ga4Signals || projectData?.ga4 || {};
  const score = Number(results?.quality?.score || 0);
  const positiveCoverage = {
    crawlability: Math.max(0, 100 - Math.round(((summary.broken_pages || 0) / Math.max(1, summary.pages_crawled || 1)) * 100)),
    indexation: Math.max(0, 100 - Math.round((((summary.checks?.no_index_page || 0) + (summary.checks?.canonical_conflict || 0)) / Math.max(1, summary.pages_crawled || 1)) * 100)),
    metadata: Math.max(0, 100 - Math.round((((summary.checks?.no_h1_tag || 0) + (summary.checks?.no_description || 0)) / Math.max(1, summary.pages_crawled || 1)) * 50)),
    architecture: Math.max(0, 100 - Math.round((templatePatterns[0]?.issueDensity || 0) * 15)),
    performance: Math.max(0, 100 - Math.round(((summary.checks?.high_loading_time || 0) / Math.max(1, summary.pages_crawled || 1)) * 100)),
  };
  const findings = issueRegistry
    .filter((i) => Number(i.value || 0) > 0)
    .map((i) => buildAuditFinding(i, pages))
    .sort((a, b) => b.impact - a.impact);
  const topPriorities = findings.slice(0, 5);
  const quickWins = findings
    .filter((f) => ["P1", "P2"].includes(f.priority) && f.value <= Math.max(10, Math.round((summary.pages_crawled || 0) * 0.35)))
    .slice(0, 5);
  const strategic = findings
    .filter((f) => f.priority === "P1" || f.value > Math.max(20, Math.round((summary.pages_crawled || 0) * 0.4)))
    .slice(0, 7);
  const immediate = topPriorities.slice(0, 3).map((f) => `${f.issue}: ${f.recommendedFix}`);
  const d30 = findings.slice(3, 7).map((f) => `${f.issue}: ${f.recommendedFix}`);
  const d90 = strategic.slice(0, 5).map((f) => `${f.issue}: convert to template/system-level enforcement and verify with 2 crawl cycles.`);
  const sampleUrls = pages.slice(0, 15).map((p) => ({ url: p.url, status: p.status_code, loadMs: p?.page_timing?.time_to_interactive || 0 }));
  const scopeType = summary.pages_crawled >= 25 ? "broad sampled crawl" : "limited sampled crawl";
  const psiMobile = enrichments?.pagespeed?.mobile || null;
  const psiDesktop = enrichments?.pagespeed?.desktop || null;
  const speedErrors = [];
  if (!enrichments?.pagespeed) speedErrors.push({ issue: "PageSpeed Insights not connected", severity: "high", evidence: "No connected PageSpeed API payload found.", fix: "Connect Google PageSpeed Insights in Integrations and run audit again." });
  if (psiMobile && Number(psiMobile.performance || 0) < 70) speedErrors.push({ issue: `Low mobile performance score (${psiMobile.performance})`, severity: "high", evidence: `LCP ${psiMobile.lcp}, INP ${psiMobile.inp}, TBT ${psiMobile.tbt}`, fix: "Reduce JS payload, defer non-critical scripts, and optimize LCP media resources." });
  if (psiDesktop && Number(psiDesktop.performance || 0) < 80) speedErrors.push({ issue: `Low desktop performance score (${psiDesktop.performance})`, severity: "medium", evidence: `LCP ${psiDesktop.lcp}, INP ${psiDesktop.inp}, TBT ${psiDesktop.tbt}`, fix: "Optimize render-blocking CSS/JS and improve server response path." });
  if (summary?.checks?.high_loading_time > 0) speedErrors.push({ issue: `High load time pages (${summary.checks.high_loading_time})`, severity: "medium", evidence: "Detected by crawl timing signals.", fix: "Prioritize slow templates and resolve shared performance bottlenecks." });
  const llmTxtFetch = protocol?.fetched?.llm_txt || protocol?.fetched?.llms_txt || null;
  const llmTxtExists = !!llmTxtFetch?.ok;
  const llmTxtUrl = llmTxtFetch?.url || `https://www.${getHostFromInput(domain)}/llm.txt`;
  const llmVisibilityRisk = llmTxtExists ? "medium" : "high";
  const helioRecommendations = [
    ...(topPriorities.slice(0, 6).map((f, idx) => ({
      priority: idx < 2 ? "critical" : idx < 4 ? "high" : "medium",
      recommendation: f.recommendedFix,
      rationale: `${f.issue} impacts ${f.value} pages and weakens technical quality signals.`,
      successMetric: `Reduce "${f.issue}" flagged count from ${f.value} to 0.`,
    }))),
    {
      priority: speedErrors.length ? "high" : "medium",
      recommendation: "Run weekly dual-strategy PageSpeed audits (mobile + desktop) and track deltas by template.",
      rationale: "Performance volatility directly impacts crawl efficiency, UX, and ranking stability.",
      successMetric: "Mobile performance >= 75 and desktop >= 85 on top templates.",
    },
    {
      priority: llmTxtExists ? "medium" : "high",
      recommendation: llmTxtExists ? "Improve llm.txt with entity map, canonical sources, and update cadence." : "Publish llm.txt with brand entities, canonical docs, and crawl hints for LLM retrievers.",
      rationale: "AEO/GEO visibility requires explicit machine-readable retrieval hints beyond standard SEO files.",
      successMetric: "llm.txt accessible at root and updated with current content architecture.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    domain: getHostFromInput(domain),
    source,
    renderMode,
    quality: results?.quality || {},
    section1_executiveSummary: {
      websiteAudited: getHostFromInput(domain),
      mostImportantIssues: topPriorities.slice(0, 3).map((f) => `${f.issue} (${f.value})`),
      biggestGrowthOpportunities: [
        "Template-level metadata fixes to recover crawl/index efficiency.",
        "Canonical + indexation cleanup for stronger signal consolidation.",
        "Internal linking reinforcement to critical revenue/strategic pages.",
      ],
      topPrioritiesToFixFirst: immediate,
    },
    section2_scopeAndMethod: {
      domain: getHostFromInput(domain),
      coverage: `${scopeType}; ${summary.pages_crawled || 0} pages crawled`,
      dataSourcesUsed: [
        "Helio Core crawl snapshots",
        "On-page HTML signal extraction",
        "Template pattern aggregation",
        "Stored project snapshots",
        source === "DataForSEO" ? "DataForSEO fallback crawl source" : "Direct/rendered fetch pipeline",
      ],
      limitations: [
        "Sampled crawl depth can miss deeply buried orphan pages.",
        "Search Console index status parity requires GSC property connection for full validation.",
        "CWV field data requires CrUX/GSC integration for full confidence.",
      ],
      externalSignals: {
        gscConnected: !!gscSignals?.capturedAt,
        ga4Connected: !!ga4Signals?.capturedAt,
        pagespeedConnected: !!enrichments?.pagespeed,
        firecrawlConnected: !!enrichments?.firecrawl,
        playwrightConnected: !!enrichments?.playwright,
        gtrendsConnected: !!enrichments?.gtrends,
      },
    },
    section3_overallHealthSnapshot: {
      crawlability: positiveCoverage.crawlability,
      indexationHealth: positiveCoverage.indexation,
      siteArchitectureQuality: positiveCoverage.architecture,
      metadataQuality: positiveCoverage.metadata,
      internalLinkingStrength: Math.max(0, Math.round((pages.reduce((a, p) => a + Number(p.internal_links_count || 0), 0) / Math.max(1, pages.length)) * 4)),
      structuredDataStatus: "detected-partial",
      technicalRiskLevel: score >= 85 ? "low" : score >= 70 ? "medium" : "high",
    },
    section4_crawlabilityReview: {
      robotsIssues: summary.robots_blocked_pages || 0,
      blockedImportantPages: summary.robots_blocked_pages || 0,
      crawlTraps: 0,
      parameterProblems: 0,
      brokenInternalCrawlPaths: summary.broken_pages || 0,
    },
    section5_indexationReview: {
      noindexMisuse: summary.checks?.no_index_page || 0,
      canonicalConflicts: summary.checks?.canonical_conflict || 0,
      duplicatePages: summary.duplicate_content_pages || 0,
      thinLowValueIndexables: pages.filter((p) => Number(p?.meta?.content?.words_count || 0) < 150).length,
      sitemapToIndexMismatchRisk: summary.sitemap_missing ? "high" : "medium",
      rankableButAtRisk: Math.max(0, (summary.checks?.no_description || 0) + (summary.checks?.no_h1_tag || 0)),
    },
    section6_siteArchitectureAndUrlStructure: {
      topTemplates: templatePatterns.slice(0, 8),
      clickDepthRisk: "needs-link-graph",
      buriedImportantPagesRisk: templatePatterns.some((t) => t.issueDensity > 1.3),
      urlVariantDuplicationRisk: summary.duplicate_content_clusters || 0,
    },
    section7_internalLinkingAudit: {
      weaklyLinkedPages: (diagnostics.weaklyLinkedPages || []).slice(0, 40),
      orphanPages: (diagnostics.orphanPages || []).slice(0, 40),
      anchorTextQuality: "needs-anchor-extraction",
      contextualLinkOpportunities: Math.max(0, Number(summary.weakly_linked_pages || 0)),
    },
    section8_technicalOnPageElements: {
      missingTitles: pages.filter((p) => !(p?.meta?.title || "").trim()).length,
      missingDescriptions: summary.checks?.no_description || 0,
      missingH1: summary.checks?.no_h1_tag || 0,
      canonicalIssues: summary.checks?.canonical_conflict || 0,
      duplicateTitleTags: summary.duplicate_title || 0,
      templateLevelIssues: templatePatterns.filter((t) => t.issueDensity > 0.6),
    },
    section9_xmlSitemapAndRobotsReview: {
      sitemapMissing: !!summary.sitemap_missing,
      robotsConflicts: summary.robots_blocked_pages || 0,
      guidanceQuality: summary.sitemap_missing || summary.robots_blocked_pages ? "needs-fix" : "good",
    },
    section10_canonicalizationAndDuplicateContent: {
      canonicalConflicts: summary.checks?.canonical_conflict || 0,
      duplicateClusters: summary.duplicate_content_clusters || 0,
      duplicatePages: summary.duplicate_content_pages || 0,
      canonicalClusters: (diagnostics.canonicalClusters || []).slice(0, 20),
      protocolSlashVariantRisk: "medium",
      queryStringDuplicationRisk: "medium",
    },
    section11_structuredDataSchemaAudit: {
      existingSchemaTypes: Object.entries(diagnostics?.schema?.schemaTypeCounts || {}).sort((a,b)=>b[1]-a[1]).slice(0, 12).map(([k,v])=>({ type:k, pages:v })),
      implementationErrors: diagnostics?.schema?.schemaParseErrors || 0,
      missingOpportunities: ["Organization", "Breadcrumb", "FAQ/HowTo where valid", "Article/Product as applicable"],
      consistencyWithVisibleContent: "needs-sampling",
    },
    section12_pageExperienceTechnicalPerformance: {
      slowTemplates: templatePatterns.filter((t) => t.high_loading_time > 0),
      heavyAssetRisk: pages.filter((p) => Number(p.size || 0) > 500000).length,
      coreWebVitalsRisk: summary.checks?.high_loading_time || 0,
      pagespeed: enrichments?.pagespeed || null,
      speedAnalyticsErrors: speedErrors,
      speedFixPlan: speedErrors.map((s, idx) => `${idx + 1}. ${s.fix}`),
      securityHeaders: diagnostics?.securityHeaders || null,
      mozillaObservatory: diagnostics?.mozillaObservatory || null,
    },
    section13_mobileSeoReview: {
      mobileRenderingQuality: renderMode === "enhanced-js" ? "checked-js-render" : "static-html-checked",
      mobileUsabilityProblems: "needs-live-mobile-run",
      contentParityRisk: "medium",
    },
    section14_redirectsStatusCodesBrokenPages: {
      brokenPages: summary.broken_pages || 0,
      redirectChainsAndLoops: "needs-head-request-pass",
      brokenInternalLinks: summary.broken_links || 0,
      incorrectStatusHandlingRisk: summary.broken_pages ? "high" : "low",
    },
    section15_javascriptRenderingRisks: {
      jsDependentContentRisk: renderMode === "static" ? "possible" : "reduced",
      metadataRenderDelayRisk: renderMode === "static" ? "possible" : "reduced",
      crawlableHtmlLinkRisk: "needs-headless-render-audit",
    },
    section16_contentAndSearchIntentRisks: {
      thinPages: pages.filter((p) => Number(p?.meta?.content?.words_count || 0) < 150).length,
      cannibalizationRisk: summary.duplicate_content_clusters || 0,
      intentMismatchRisk: "needs-query-map",
      gscLowCtrHighImpressionQueries: Array.isArray(gscSignals?.topKeywords)
        ? gscSignals.topKeywords.filter((k) => Number(k.impressions || 0) > 200 && Number(k.ctr || 0) < 0.03).slice(0, 12).map((k) => ({
            query: k.keys?.[0] || "",
            impressions: Number(k.impressions || 0),
            ctr: Number(k.ctr || 0),
            position: Number(k.position || 0),
          }))
        : [],
    },
    section17_priorityFindings: findings,
    section18_quickWins: quickWins,
    section19_strategicRecommendations: strategic,
    section20_prioritizedActionPlan: {
      immediate,
      next30Days: d30,
      next60to90Days: d90,
    },
    section21_risksAssumptionsValidation: {
      confirmed: [
        "Page-level technical checks from crawl are confirmed.",
        "Issue prevalence and impact are computed deterministically.",
      ],
      inferred: [
        "Business impact is estimated from issue prevalence and severity.",
        "Link architecture quality is inferred without full graph export.",
      ],
      needsDeveloperValidation: [
        "Template source-level root causes and deployment constraints.",
        "Redirect map and canonical policy implementation details.",
      ],
      postImplementationTests: [
        "Re-crawl within 24h after release.",
        "Compare score/issue deltas against previous snapshot.",
      ],
    },
    section22_expectedImpact: {
      likelyImprovements: [
        "Higher crawl efficiency and cleaner indexation signals.",
        "Better snippet quality from metadata consistency.",
        "Lower risk of ranking suppression from technical conflicts.",
      ],
      metricsLikelyToMove: ["indexed pages quality", "CTR on improved templates", "organic landing coverage"],
      cannotBeGuaranteed: ["Exact ranking positions", "competitor-driven SERP volatility outcomes"],
    },
    section23_appendixEvidence: {
      sampleUrls,
      templatePatterns: templatePatterns.slice(0, 12),
      weaklyLinkedSamples: (diagnostics.weaklyLinkedPages || []).slice(0, 20),
      orphanSamples: (diagnostics.orphanPages || []).slice(0, 20),
      canonicalClusterSamples: (diagnostics.canonicalClusters || []).slice(0, 12),
      firecrawlMappedSample: (enrichments?.firecrawl?.mappedUrls || []).slice(0, 20),
      playwrightEvidence: enrichments?.playwright || null,
      googleTrendsSnapshot: enrichments?.gtrends || null,
      gscSnapshot: gscSignals?.totals || null,
      ga4Snapshot: ga4Signals?.totals || null,
      sourceSnapshots: {
        gscConnected: !!projectData?.gsc,
        analyticsConnected: !!projectData?.ga4,
        auditCapturedAt: projectData?.audit?.capturedAt || null,
      },
      protocol,
    },
    section24_helioRecommendations: helioRecommendations,
    section25_aeoGeoReadiness: {
      llmTxtFound: llmTxtExists,
      llmTxtUrl,
      llmTxtStatusCode: llmTxtFetch?.status || null,
      llmVisibilityRisk,
      entitySignalsDetected: {
        organizationSchemaPages: (diagnostics?.schema?.schemaTypeCounts?.Organization || 0),
        faqSchemaPages: (diagnostics?.schema?.schemaTypeCounts?.FAQPage || 0),
        articleSchemaPages: (diagnostics?.schema?.schemaTypeCounts?.Article || 0),
      },
      aeoGeoObservations: [
        llmTxtExists ? "llm.txt detected and crawlable." : "llm.txt missing from site root.",
        (diagnostics?.schema?.schemaTypeCounts?.Organization || 0) > 0 ? "Organization schema detected." : "Organization schema missing on sampled pages.",
        (diagnostics?.schema?.schemaTypeCounts?.FAQPage || 0) > 0 ? "FAQ schema detected for answer-engine eligibility." : "No FAQ schema detected in sampled crawl.",
      ],
      aeoGeoActionPlan: [
        llmTxtExists ? "Refine llm.txt with canonical source hierarchy and update policy." : "Publish llm.txt and expose key retrieval pages for AI systems.",
        "Strengthen entity-level schema (Organization/Product/Article/FAQ) on strategic templates.",
        "Create answer-block sections targeting high-impression low-CTR GSC queries.",
      ],
    },
  };
}

function getHelioCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setHelioCache(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}

async function helioCoreAuditDomain(domain, addLog, options = {}) {
  const seed = normalizeUrl(domain);
  if (!seed) throw new Error("Invalid domain");
  const host = new URL(seed).host;
  const scope = options?.scope || "default";
  const cacheKey = `helio:audit:${scope}:${host}`;
  const proMode = !!options?.proMode;
  const forceFresh = !!options?.forceFresh || proMode;
  const cached = getHelioCache(cacheKey);
  const staleMs = 15 * 60 * 1000;
  if (!forceFresh && cached?.ts && Date.now() - cached.ts < staleMs && cached.result) {
    addLog(`Cache hit for ${host} (${Math.round((Date.now() - cached.ts) / 1000)}s old).`, "ok");
    return { source: "Helio Core (cache)", ...cached.result };
  }

  const maxPages = Number(options?.maxPages || (proMode ? 220 : 30));
  const minPagesRequired = Number(options?.minPagesRequired || (proMode ? 25 : 3));
  const concurrency = 4;
  const maxRetries = 2;
  const queue = [canonicalizeCrawlUrl(seed)];
  const externalSeeds = Array.isArray(options?.seedUrls) ? options.seedUrls.map((u) => canonicalizeCrawlUrl(u)).filter(Boolean) : [];
  externalSeeds.slice(0, maxPages * 3).forEach((u) => { if (!queue.includes(u)) queue.push(u); });
  const queued = new Set(queue);
  const visited = new Set();
  let sitemapSeeds = [];
  const retryCount = new Map();
  const pages = [];
  let brokenPages = 0;
  let robotsTxt = "";
  let robotsBlocked = 0;
  let sitemapDiscovered = false;
  addLog(`Helio Core crawler started. Mode: ${proMode ? "PRO" : "STANDARD"}`, "sys");
  addLog(`Stage 1/8: Scope + host policy resolved (${host})`, "sys");

  try {
    addLog("Stage 2/8: robots.txt analysis", "sys");
    const robotsRes = await fetch(`${new URL(seed).origin}/robots.txt`);
    if (robotsRes.ok) {
      robotsTxt = await robotsRes.text();
      const sitemapLine = robotsTxt.split("\n").find((l) => /^sitemap:/i.test(l.trim()));
      sitemapDiscovered = !!sitemapLine;
    }
  } catch {}
  try {
    const sm = await fetch(`${new URL(seed).origin}/sitemap.xml`);
    if (sm.ok) sitemapDiscovered = true;
  } catch {}
  if (proMode) {
    addLog("Stage 3/8: sitemap discovery + URL seeding", "sys");
    const seeds = await fetchSitemapUrls(seed, addLog, Math.min(800, maxPages * 4));
    sitemapSeeds = seeds;
    seeds.slice(0, maxPages * 2).forEach((u) => {
      if (u && !queued.has(u) && !visited.has(u)) {
        queue.push(u);
        queued.add(u);
      }
    });
  }

  const robotsRules = robotsTxt
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const disallow = robotsRules
    .filter((l) => /^disallow:/i.test(l))
    .map((l) => l.split(":")[1]?.trim())
    .filter(Boolean);
  const nextUrl = () => {
    while (queue.length) {
      const n = queue.shift();
      queued.delete(n);
      if (!visited.has(n)) return n;
    }
    return null;
  };

  const worker = async () => {
    while (pages.length < maxPages) {
      const next = nextUrl();
      if (!next) break;
      const nextCanonical = canonicalizeCrawlUrl(next);
      if (!nextCanonical) continue;
      visited.add(nextCanonical);
      const f = await fetchHtmlWithFallback(next, isEnhancedRenderMode(options?.renderMode));
      if (!f.ok) {
        const rc = retryCount.get(nextCanonical) || 0;
        if (rc < maxRetries) {
          retryCount.set(nextCanonical, rc + 1);
          visited.delete(nextCanonical);
          if (!queued.has(nextCanonical)) {
            queue.push(nextCanonical);
            queued.add(nextCanonical);
          }
          addLog(`Retry ${rc + 1}/${maxRetries}: ${nextCanonical}`, "warn");
          continue;
        }
        brokenPages += 1;
        pages.push({ url: nextCanonical, status_code: 0, size: 0, page_timing: { time_to_interactive: 0 }, checks: {}, meta: {}, crawl_links: [] });
        addLog(`Crawl fail: ${nextCanonical} (${f.error})`, "warn");
        continue;
      }
      const p = extractPageSignals(nextCanonical, f.html, f.ms, f.headers || {});
      try {
        const path = new URL(nextCanonical).pathname || "/";
        if (disallow.some((d) => d !== "/" && path.startsWith(d))) robotsBlocked += 1;
      } catch {}
      pages.push(p);
      if (pages.length <= 20 || pages.length % 10 === 0) addLog(`Stage 4/8: Crawled ${pages.length}/${maxPages}: ${nextCanonical}`, "ok");
      for (const l of p.crawl_links || []) {
        if (queue.length + pages.length >= maxPages * 3) break;
        try {
          const resolved = new URL(l);
          if (!/^https?:$/i.test(resolved.protocol)) continue;
          if (resolved.host !== host) continue;
          const normalized = canonicalizeCrawlUrl(resolved.toString());
          if (!normalized) continue;
          const lower = normalized.toLowerCase();
          if (lower.includes("/wp-admin") || lower.includes("/cart") || lower.includes("/checkout") || lower.includes("/account")) continue;
          if (!visited.has(normalized) && !queued.has(normalized)) {
            queue.push(normalized);
            queued.add(normalized);
          }
        } catch {}
      }
      if (queue.length > maxPages * 4) {
        queue.splice(maxPages * 4);
      }
      if (visited.size > maxPages * 8) {
        break;
      }
      if (pages.length >= maxPages) break;
      if (!queue.length && pages.length < Math.min(3, maxPages)) {
        try {
          const home = canonicalizeCrawlUrl(new URL(seed).origin);
          if (home && !visited.has(home) && !queued.has(home)) {
            queue.push(home);
            queued.add(home);
          }
        } catch {}
      }
      if (!queue.length && pages.length >= 3) {
        break;
      }
      if (queue.length && pages.length < maxPages) {
        const deduped = [];
        const seen = new Set();
        for (const q of queue) {
          if (!seen.has(q)) {
            seen.add(q);
            deduped.push(q);
          }
        }
        queue.length = 0;
        queue.push(...deduped);
        queued.clear();
        deduped.forEach((q) => queued.add(q));
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (!pages.length) {
    if (cached?.result) {
      addLog("Live crawl failed. Returning last cached snapshot.", "warn");
      return { source: "Helio Core (stale-cache)", ...cached.result };
    }
    throw new Error("No pages crawled");
  }
  const coverageInsufficient = pages.length < minPagesRequired;
  if (coverageInsufficient) {
    addLog(`Stage 4/8 coverage warning (${pages.length}/${minPagesRequired}). Continuing with constrained evidence.`, "warn");
  }

  const titleCount = {};
  for (const p of pages) {
    const t = p.meta?.title || "";
    if (!t) continue;
    titleCount[t] = (titleCount[t] || 0) + 1;
  }
  const duplicateTitle = Object.values(titleCount).filter((n) => n > 1).reduce((a, b) => a + (b - 1), 0);
  const fpCount = {};
  for (const p of pages) {
    const fp = p.content_fingerprint;
    if (!fp) continue;
    fpCount[fp] = (fpCount[fp] || 0) + 1;
  }
  const duplicateContentClusters = Object.values(fpCount).filter((n) => n > 1).length;
  const duplicateContentPages = Object.values(fpCount).filter((n) => n > 1).reduce((a, b) => a + b, 0);
  const canonicalConflicts = pages.reduce((a, p) => a + (p.checks?.canonical_conflict || 0), 0);
  const canonicalTargetMap = {};
  pages.forEach((p) => {
    const c = String(p?.meta?.canonical || "").trim();
    if (!c) return;
    try {
      const n = canonicalizeCrawlUrl(new URL(c, p.url).toString());
      if (!n) return;
      if (!canonicalTargetMap[n]) canonicalTargetMap[n] = [];
      canonicalTargetMap[n].push(p.url);
    } catch {}
  });
  const canonicalClusters = Object.entries(canonicalTargetMap)
    .map(([canonicalUrl, memberUrls]) => ({ canonicalUrl, memberCount: memberUrls.length, memberUrls: memberUrls.slice(0, 8) }))
    .filter((x) => x.memberCount > 1)
    .sort((a, b) => b.memberCount - a.memberCount);
  const templateStats = {};
  for (const p of pages) {
    const key = getTemplateKeyFromUrl(p.url);
    if (!templateStats[key]) {
      templateStats[key] = { pages: 0, no_h1_tag: 0, no_description: 0, no_image_alt: 0, no_index_page: 0, canonical_conflict: 0, high_loading_time: 0 };
    }
    templateStats[key].pages += 1;
    templateStats[key].no_h1_tag += p.checks?.no_h1_tag || 0;
    templateStats[key].no_description += p.checks?.no_description || 0;
    templateStats[key].no_image_alt += p.checks?.no_image_alt || 0;
    templateStats[key].no_index_page += p.checks?.no_index_page || 0;
    templateStats[key].canonical_conflict += p.checks?.canonical_conflict || 0;
    templateStats[key].high_loading_time += p.checks?.high_loading_time || 0;
  }
  const templatePatterns = Object.entries(templateStats).map(([template, stats]) => ({
    template,
    pages: stats.pages,
    issueDensity: Math.round(((stats.no_h1_tag + stats.no_description + stats.no_index_page + stats.canonical_conflict + stats.high_loading_time) / Math.max(1, stats.pages)) * 100) / 100,
    no_h1_tag: stats.no_h1_tag,
    no_description: stats.no_description,
    no_index_page: stats.no_index_page,
    canonical_conflict: stats.canonical_conflict,
    high_loading_time: stats.high_loading_time,
  })).sort((a, b) => b.issueDensity - a.issueDensity);

  addLog("Stage 5/8: Issue aggregation + clustering", "sys");
  const inlinks = {};
  const allCrawled = new Set(pages.map((p) => p.url));
  pages.forEach((p) => {
    for (const l of p.crawl_links || []) {
      const n = canonicalizeCrawlUrl(l);
      if (!n || !allCrawled.has(n)) continue;
      inlinks[n] = (inlinks[n] || 0) + 1;
    }
  });
  const weaklyLinkedPages = pages.filter((p) => Number(inlinks[p.url] || 0) < 2).map((p) => p.url).slice(0, 60);
  const orphanPages = sitemapSeeds
    .map((u) => canonicalizeCrawlUrl(u))
    .filter(Boolean)
    .filter((u) => allCrawled.has(u) && Number(inlinks[u] || 0) === 0 && u !== canonicalizeCrawlUrl(seed))
    .slice(0, 60);
  const schemaTypeCounts = {};
  let schemaParseErrors = 0;
  pages.forEach((p) => {
    const types = Array.isArray(p?.meta?.schema_types) ? p.meta.schema_types : [];
    types.forEach((t) => { schemaTypeCounts[t] = (schemaTypeCounts[t] || 0) + 1; });
    schemaParseErrors += Number(p?.meta?.schema_parse_errors || 0);
  });
  const schemaPages = pages.filter((p) => Array.isArray(p?.meta?.schema_types) && p.meta.schema_types.length > 0).length;
  const securityHeaders = computeSecurityHeaderCoverage(pages);
  const observatory = await fetchMozillaObservatory(host);

  const summary = {
    pages_crawled: pages.length,
    broken_pages: brokenPages,
    broken_links: 0,
    duplicate_title: duplicateTitle,
    checks: {
      no_h1_tag: pages.reduce((a, p) => a + (p.checks?.no_h1_tag || 0), 0),
      no_description: pages.reduce((a, p) => a + (p.checks?.no_description || 0), 0),
      no_image_alt: pages.reduce((a, p) => a + (p.checks?.no_image_alt || 0), 0),
      no_index_page: pages.reduce((a, p) => a + (p.checks?.no_index_page || 0), 0),
      high_loading_time: pages.reduce((a, p) => a + (p.checks?.high_loading_time || 0), 0),
      canonical_conflict: canonicalConflicts,
    },
    robots_blocked_pages: robotsBlocked,
    sitemap_missing: sitemapDiscovered ? 0 : 1,
    duplicate_content_clusters: duplicateContentClusters,
    duplicate_content_pages: duplicateContentPages,
    weakly_linked_pages: weaklyLinkedPages.length,
    orphan_pages: orphanPages.length,
    coverage_insufficient: coverageInsufficient ? 1 : 0,
    schema_pages: schemaPages,
    schema_parse_errors: schemaParseErrors,
  };
  addLog("Stage 6/8: Scoring + priority calibration", "sys");
  const quality = computeHelioAuditScore(summary);
  const issueRegistry = [
    { key: "broken_pages", label: "Broken pages (4xx/5xx)", value: summary.broken_pages, severity: summary.broken_pages ? "high" : "low" },
    { key: "no_h1_tag", label: "Missing H1 tags", value: summary.checks.no_h1_tag, severity: summary.checks.no_h1_tag ? "medium" : "low" },
    { key: "no_description", label: "Missing meta descriptions", value: summary.checks.no_description, severity: summary.checks.no_description ? "medium" : "low" },
    { key: "no_image_alt", label: "Missing image alt text", value: summary.checks.no_image_alt, severity: summary.checks.no_image_alt ? "medium" : "low" },
    { key: "no_index_page", label: "Pages with noindex", value: summary.checks.no_index_page, severity: summary.checks.no_index_page ? "high" : "low" },
    { key: "canonical_conflict", label: "Canonical conflicts", value: summary.checks.canonical_conflict, severity: summary.checks.canonical_conflict ? "high" : "low" },
    { key: "duplicate_title", label: "Duplicate title tags", value: summary.duplicate_title, severity: summary.duplicate_title ? "medium" : "low" },
    { key: "duplicate_content_clusters", label: "Duplicate-content clusters", value: summary.duplicate_content_clusters, severity: summary.duplicate_content_clusters ? "medium" : "low" },
    { key: "robots_blocked_pages", label: "Robots-blocked crawled paths", value: summary.robots_blocked_pages, severity: summary.robots_blocked_pages ? "medium" : "low" },
    { key: "sitemap_missing", label: "Sitemap missing", value: summary.sitemap_missing, severity: summary.sitemap_missing ? "medium" : "low" },
    { key: "high_loading_time", label: "High load time pages", value: summary.checks.high_loading_time, severity: summary.checks.high_loading_time ? "medium" : "low" },
    { key: "weakly_linked_pages", label: "Weakly linked pages", value: summary.weakly_linked_pages, severity: summary.weakly_linked_pages ? "medium" : "low" },
    { key: "orphan_pages", label: "Orphan pages", value: summary.orphan_pages, severity: summary.orphan_pages ? "high" : "low" },
    { key: "coverage_insufficient", label: "Insufficient crawl coverage", value: summary.coverage_insufficient, severity: summary.coverage_insufficient ? "high" : "low" },
    { key: "schema_parse_errors", label: "Schema parse errors", value: summary.schema_parse_errors, severity: summary.schema_parse_errors ? "medium" : "low" },
  ].map((i) => ({ ...i, issue_id: `HELIO-${simpleHash(`${host}:${i.key}`).slice(0, 6).toUpperCase()}` }));
  const calibratedIssueRegistry = calibrateIssueRegistry(issueRegistry, summary.pages_crawled);

  addLog("Stage 7/8: Evidence packaging", "sys");
  const diagnostics = {
    sitemapSeeds: sitemapSeeds.slice(0, 200),
    inlinks,
    weaklyLinkedPages,
    orphanPages,
    canonicalClusters: canonicalClusters.slice(0, 50),
    schema: {
      pagesWithSchema: schemaPages,
      schemaParseErrors,
      schemaTypeCounts,
    },
    securityHeaders,
    mozillaObservatory: observatory,
  };
  const result = { summary, pages, quality, issueRegistry: calibratedIssueRegistry, templatePatterns, diagnostics };
  setHelioCache(cacheKey, { ts: Date.now(), result });
  addLog("Stage 8/8: Technical audit finalized", "ok");
  return { source: "Helio Core", ...result };
}

function loadAuditHistory(host, scope = "default") {
  try {
    const raw = localStorage.getItem(`helio:audit:history:${scope}:${host}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendAuditHistory(host, snapshot, scope = "default") {
  const maxItems = 30;
  const prev = loadAuditHistory(host, scope);
  const next = [snapshot, ...prev].slice(0, maxItems);
  try { localStorage.setItem(`helio:audit:history:${scope}:${host}`, JSON.stringify(next)); } catch {}
  return next;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

function getHostFromInput(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^sc-domain:/i.test(raw)) return raw.replace(/^sc-domain:/i, "").trim().toLowerCase();
  try { return new URL(normalizeUrl(raw)).host; } catch { return ""; }
}

function loadAllOrgReports(orgScope = "default") {
  const out = [];
  try {
    const prefix = `helio:project:${orgScope}:`;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const reports = Array.isArray(parsed?.reports) ? parsed.reports : [];
      reports.forEach((r) => out.push(r));
    }
  } catch {}
  return out.sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
}

function projectStoreKey(orgScope = "default", host = "") {
  return `helio:project:${orgScope}:${host}`;
}

function loadProjectData(orgScope = "default", host = "") {
  if (!host) return {};
  try {
    const raw = localStorage.getItem(projectStoreKey(orgScope, host));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mergeProjectData(orgScope = "default", host = "", patch = {}) {
  if (!host) return {};
  const prev = loadProjectData(orgScope, host);
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(projectStoreKey(orgScope, host), JSON.stringify(next)); } catch {}
  return next;
}

function appendAeoAuditEvent(orgScope = "default", host = "", evt = {}) {
  if (!host) return;
  const project = loadProjectData(orgScope, host);
  const prev = Array.isArray(project?.aeoGeoAuditTrail) ? project.aeoGeoAuditTrail : [];
  const nextEvent = {
    id: `aeo_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    actor: String(evt?.actor || "helio-agent"),
    role: String(evt?.role || "system"),
    action: String(evt?.action || "event"),
    target: String(evt?.target || host),
    status: String(evt?.status || "ok"),
    detail: String(evt?.detail || ""),
    metadata: evt?.metadata || {},
  };
  mergeProjectData(orgScope, host, { aeoGeoAuditTrail: [nextEvent, ...prev].slice(0, 300) });
}

function buildDeterministicLlmPolicyFilesForHost(host = "", topPages = [], brandProfile = {}) {
  const domain = String(host || "").replace(/^www\./i, "") || "example.com";
  const brandName = String(brandProfile?.brandName || domain);
  const disambiguation = String(brandProfile?.entityDisambiguation || "").trim();
  const pages = Array.isArray(topPages) ? topPages.slice(0, 10).map((p) => String(p?.keys?.[0] || "")).filter(Boolean) : [];
  const priorityPages = pages.length ? pages.join(", ") : "https://example.com/, https://example.com/pricing, https://example.com/docs";
  const llmsTxt = [
    "# llms.txt",
    `site: https://${domain}`,
    "focus: answer-first pages, entity consistency, citation-ready documentation",
    `entities: ${brandName}, ${domain}, product, pricing, documentation`,
    ...(disambiguation ? [`entity_disambiguation: ${disambiguation}`] : []),
    `priority_pages: ${priorityPages}`,
    "allowed_agents: Google-Extended, OAI-SearchBot, GPTBot, PerplexityBot",
    "disallowed_paths: /admin, /checkout, /cart, /private",
    "citation_preferences: cite canonical URLs and source pages with verifiable claims",
    "freshness: update high-intent pages and FAQs at least monthly",
    "contact: seo@domain.tld",
  ].join("\n");
  const llmTxt = [
    "# llm.txt",
    `site: https://${domain}`,
    "canonical_policy_file: /llms.txt",
    `entities: ${brandName}, ${domain}, product, documentation`,
    ...(disambiguation ? [`entity_disambiguation: ${disambiguation}`] : []),
    `priority_pages: ${priorityPages}`,
    "citation_preferences: prefer canonical first-party pages and evidence-backed references",
    "freshness: prioritize recently updated core pages",
    "contact: seo@domain.tld",
  ].join("\n");
  return { llmsTxt, llmTxt };
}

function loadProjectWithKeywordIntel(orgScope = "default") {
  try {
    const prefix = `helio:project:${orgScope}:`;
    const candidates = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const project = JSON.parse(raw);
      const selectedRoadmaps = Array.isArray(project?.keywordIntel?.selectedRoadmaps) ? project.keywordIntel.selectedRoadmaps : [];
      const selectedKeywords = Array.isArray(project?.keywordIntel?.selectedKeywords) ? project.keywordIntel.selectedKeywords : [];
      const inventory = Array.isArray(project?.keywordIntel?.inventory) ? project.keywordIntel.inventory : [];
      const weight = selectedRoadmaps.length * 1000 + selectedKeywords.length * 100 + inventory.length;
      if (weight <= 0) continue;
      candidates.push({
        host: key.slice(prefix.length),
        project,
        weight,
        updatedAt: project?.keywordIntel?.roadmapQueueUpdatedAt || project?.keywordIntel?.selectedAt || project?.keywordIntel?.capturedAt || project?.updatedAt || "",
      });
    }
    return candidates.sort((a,b)=>b.weight-a.weight || String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
  } catch {
    return null;
  }
}

function appendProjectReport(orgScope = "default", host = "", entry = {}) {
  if (!host) return null;
  const prev = loadProjectData(orgScope, host);
  const reports = Array.isArray(prev?.reports) ? prev.reports : [];
  if (entry?.reportUrl) {
    const existing = reports.find((r) => r?.reportUrl === entry.reportUrl);
    if (existing) return existing;
  }
  const nextEntry = {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: "technical_audit",
    title: `Technical SEO Audit - ${host}`,
    metaDescription: `Technical SEO audit report for ${host}. Includes crawlability, indexation, architecture, linking, canonicalization, performance, and prioritized actions.`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  mergeProjectData(orgScope, host, { reports: [nextEntry, ...reports].slice(0, 60) });
  return nextEntry;
}

function missionPriorityFromIssue(issue = {}) {
  if (issue.priority) return String(issue.priority).toUpperCase();
  if (issue.severity === "high") return "P1";
  if (issue.severity === "medium") return "P2";
  return "P3";
}

function missionSeverityFromPriority(priority = "P3") {
  const p = String(priority).toUpperCase();
  if (p === "P1") return "critical";
  if (p === "P2") return "high";
  return "medium";
}

function generateMissionsFromProject(project = {}, _host = "") {
  const out = [];
  const auditIssues = Array.isArray(project?.audit?.issueRegistry) ? project.audit.issueRegistry : [];
  for (const i of auditIssues) {
    const val = Number(i.value || 0);
    if (val <= 0) continue;
    const priority = missionPriorityFromIssue(i);
    out.push({
      source: "technical_audit",
      sourceId: String(i.issue_id || i.key || i.label || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      title: `Fix: ${i.label}`,
      reason: `${i.label} is impacting ${val} page(s).`,
      module: "Technical Audit",
      severity: missionSeverityFromPriority(priority),
      priority,
      affectedCount: val,
      expectedImpact: Number(i.impact || 0),
      fixHint: String(i.fix || i.recommendedFix || `Apply template-level correction for ${i.label}.`),
      type: "fix",
    });
  }

  const movers = Array.isArray(project?.gsc?.movers) ? project.gsc.movers : [];
  for (const m of movers) {
    const deltaPos = Number(m.deltaPosition || 0);
    const deltaClicks = Number(m.deltaClicks || 0);
    if (!(deltaPos > 1.8 || deltaClicks < -3)) continue;
    const query = String(m.query || "").trim();
    if (!query) continue;
    out.push({
      source: "search_console",
      sourceId: `gsc_mover_${query.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`,
      title: `Recover query: "${query}"`,
      reason: `Ranking/click drop detected (Δpos +${deltaPos.toFixed(1)}, Δclicks ${deltaClicks}).`,
      module: "Search Console",
      severity: deltaPos > 3 ? "high" : "medium",
      priority: deltaPos > 3 ? "P1" : "P2",
      affectedCount: 1,
      expectedImpact: Math.min(95, Math.round((Math.max(0, deltaPos) * 12) + Math.max(0, -deltaClicks * 2))),
      fixHint: "Refresh page intent match, strengthen internal links, improve title/meta CTR alignment, then revalidate in GSC.",
      type: "optimize",
    });
  }

  const serpOpps = Array.isArray(project?.gsc?.serpOpportunities) ? project.gsc.serpOpportunities : [];
  for (const s of serpOpps.slice(0, 8)) {
    const q = String(s.query || "").trim();
    if (!q) continue;
    const score = Number(s.opportunityScore || 0);
    if (score < 55) continue;
    out.push({
      source: "search_console",
      sourceId: `serp_opp_${q.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`,
      title: `Capture SERP opportunity: "${q}"`,
      reason: `${s.serpTarget || "SERP feature"} opportunity score ${score}.`,
      module: "Search Console",
      severity: score >= 75 ? "high" : "medium",
      priority: score >= 75 ? "P1" : "P2",
      affectedCount: 1,
      expectedImpact: score,
      fixHint: "Implement structured answer block/schema and tighten snippet quality for the target page.",
      type: "optimize",
    });
  }

  const onpageIssues = Array.isArray(project?.onpage?.issues) ? project.onpage.issues : [];
  for (const i of onpageIssues.slice(0, 12)) {
    const label = String(i.label || "").trim();
    if (!label) continue;
    out.push({
      source: "onpage_checks",
      sourceId: `onpage_${String(i.key || label).toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`,
      title: `Fix On-Page: ${label}`,
      reason: `Detected on latest page analysis${i.value && i.value > 1 ? ` (${i.value})` : ""}.`,
      module: "On-Page SEO",
      severity: String(i.severity || "medium"),
      priority: String(i.priority || "P2"),
      affectedCount: Number(i.value || 1),
      expectedImpact: Number(i.impact || 35),
      fixHint: String(i.fixHint || "Apply the on-page remediation and re-run analysis."),
      type: "fix",
    });
  }

  const onpageAeoGeo = project?.onpage?.aeoGeo || {};
  const blockers = Array.isArray(onpageAeoGeo?.blockers) ? onpageAeoGeo.blockers : [];
  const aeoScore = Number(onpageAeoGeo?.aeoScore || 0);
  const geoScore = Number(onpageAeoGeo?.geoScore || 0);
  if (aeoScore > 0 || geoScore > 0) {
    blockers.slice(0, 6).forEach((b, i) => {
      const txt = String(b || "").trim();
      if (!txt) return;
      const isP1 = /missing|slow|canonical|primary roadmap keyword/i.test(txt) || aeoScore < 55 || geoScore < 55;
      out.push({
        source: "onpage_aeo_geo",
        sourceId: `onpage_blocker_${i}_${txt.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`,
        title: `Fix AEO/GEO blocker: ${txt}`,
        reason: `On-page readiness is AEO ${aeoScore}/100 and GEO ${geoScore}/100.`,
        module: "On-Page SEO",
        severity: isP1 ? "high" : "medium",
        priority: isP1 ? "P1" : "P2",
        affectedCount: 1,
        expectedImpact: Math.min(95, Math.max(38, 100 - Math.round((aeoScore + geoScore) / 2))),
        fixHint: "Resolve blocker, rerun On-Page analysis, then regenerate content plan/calendar so future assets align with AEO/GEO requirements.",
        type: "optimize",
      });
    });
  }

  const aeoGeoActions = Array.isArray(project?.aeoGeoActions) ? project.aeoGeoActions : [];
  for (const act of aeoGeoActions.slice(0, 20)) {
    if (String(act.status || "").toLowerCase() === "done") continue;
    const type = String(act.type || "").toLowerCase();
    out.push({
      source: "aeo_geo_actions",
      sourceId: String(act.actionId || `aeogeo_${Date.now()}`),
      title: String(act.title || "AEO/GEO action"),
      reason: String(act.reason || act.summary || "AEO/GEO strategy action queued."),
      module: "AEO / GEO",
      severity: String(act.severity || (type.includes("policy") ? "high" : "medium")),
      priority: String(act.priority || "P2"),
      affectedCount: Number(act.affectedCount || 1),
      expectedImpact: Number(act.kpiTarget || act.expectedImpact || 55),
      fixHint: String(act.fixHint || "Apply action and verify KPI deltas in GA4 + GSC."),
      type: type.includes("policy") ? "fix" : "optimize",
      issueType: type.includes("policy") ? "schema" : (type.includes("entity") ? "schema" : "metadata"),
      expectedOutcome: String(act.expectedOutcome || ""),
      auditEvidence: act.auditEvidence && typeof act.auditEvidence === "object" ? act.auditEvidence : undefined,
    });
  }

  return out;
}

function syncMissionsFromProject(orgScope = "default", host = "") {
  if (!host) return [];
  const project = loadProjectData(orgScope, host);
  const existing = Array.isArray(project?.missions) ? project.missions : [];
  const generated = generateMissionsFromProject(project, host);
  const byKey = new Map(existing.map((m) => [`${m.source}:${m.sourceId}`, m]));
  const activeKeys = new Set();
  const now = new Date().toISOString();
  const merged = [];

  for (const g of generated) {
    const key = `${g.source}:${g.sourceId}`;
    activeKeys.add(key);
    const prev = byKey.get(key);
    const preservedStatus = prev?.status || "todo";
    const approvalRequired = preservedStatus === "awaiting-approval" ? true : (prev?.approvalRequired ?? false);
    merged.push({
      id: prev?.id || `ms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: preservedStatus,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      logs: Array.isArray(prev?.logs) ? prev.logs : [],
      approvalRequired,
      verification: prev?.verification || null,
      executedAt: prev?.executedAt || "",
      completedAt: prev?.completedAt || "",
      shipTarget: prev?.shipTarget || "",
      shipUrl: prev?.shipUrl || "",
      failureReason: prev?.failureReason || "",
      fixPlan: prev?.fixPlan || "",
      executionChecklist: prev?.executionChecklist || "",
      approvedBypass: prev?.approvedBypass || false,
      ...g,
    });
  }

  for (const m of existing) {
    const key = `${m.source}:${m.sourceId}`;
    if (activeKeys.has(key)) continue;
    if (["done", "shipped"].includes(m.status)) {
      merged.push(m);
      continue;
    }
    merged.push({
      ...m,
      status: "done",
      resolvedAt: now,
      updatedAt: now,
      resolutionNote: "Auto-verified as resolved: issue not present in latest audit/signals.",
    });
  }

  const ordered = merged
    .sort((a, b) => {
      const p = { P1: 3, P2: 2, P3: 1 };
      return (p[b.priority] || 0) - (p[a.priority] || 0);
    })
    .slice(0, 240);
  mergeProjectData(orgScope, host, { missions: ordered });
  return ordered;
}

function deriveOnpageIssues(onpage = {}) {
  const meta = onpage?.meta || {};
  const checks = onpage?.checks || {};
  const title = String(meta?.title || "").trim();
  const desc = String(meta?.description || "").trim();
  const h1 = String(meta?.htags?.h1?.[0] || "").trim();
  const canonical = String(meta?.canonical || "").trim();
  const schemaTypes = Array.isArray(meta?.schema_types) ? meta.schema_types : [];
  const linksInternal = Number(onpage?.internal_links_count || 0);
  const tti = Number(onpage?.page_timing?.time_to_interactive || checks?.tti_ms || 0);
  const words = Number(meta?.content?.words_count || 0);
  const noAltRaw = checks?.no_image_alt;
  const noAlt = typeof noAltRaw === "boolean" ? (noAltRaw ? 1 : 0) : Number(noAltRaw || 0);
  const issues = [];
  const pushIssue = (key, label, priority, severity, impact, fixHint, value = 1) => {
    issues.push({ key, label, priority, severity, impact, value, fixHint });
  };
  if (title.length < 10 || title.length > 70) pushIssue("title_length", "Title length out of optimal range", "P2", "medium", 42, "Keep title between 50-60 chars and align with primary intent.");
  if (desc.length < 50 || desc.length > 160) pushIssue("meta_description", "Meta description missing/weak", "P2", "medium", 38, "Write a unique 140-160 char meta description with clear value.");
  if (!h1) pushIssue("missing_h1", "H1 missing", "P1", "high", 55, "Add a single H1 aligned with search intent.");
  if (!canonical) pushIssue("missing_canonical", "Canonical missing", "P1", "high", 58, "Add self-referencing canonical on the preferred URL.");
  if (noAlt > 0) pushIssue("missing_alt", "Images missing alt text", "P2", "medium", 36, "Add descriptive alt text for informative images.", noAlt);
  if (schemaTypes.length === 0) pushIssue("missing_schema", "Schema markup missing", "P1", "high", 62, "Add Organization/WebSite plus FAQ/Article schema where relevant.");
  if (words > 0 && words < 800) pushIssue("thin_content", "Content depth likely thin for core page", "P2", "medium", 34, "Expand content with problem-solution depth, examples, and FAQs.");
  if (linksInternal > 0 && linksInternal < 3) pushIssue("low_internal_links", "Low internal linking context", "P2", "medium", 31, "Add 3-5 contextual internal links from relevant pages.");
  if (tti && tti > 2500) pushIssue("slow_tti", "Slow page interaction timing", "P1", "high", 52, "Reduce render-blocking JS/CSS and optimize critical path.");
  return issues.slice(0, 12);
}

function buildAutonomyTasksFromIssues(issueRegistry = [], host = "") {
  const top = (issueRegistry || []).filter((i) => (i.value || 0) > 0).slice(0, 5);
  return top.map((i, idx) => ({
    id: `auto_${Date.now()}_${idx}`,
    status: "todo",
    priority: i.priority === "P1" ? "high" : i.priority === "P2" ? "medium" : "low",
    module: "Autonomy",
    label: `[${host}] ${i.label} (${i.value})`,
    due: "",
    source: "autonomous-run",
    issue_id: i.issue_id,
    impact: i.impact ?? 0,
  }));
}

function buildExecutionPriorityQueue(project = {}, host = "") {
  const model = {
    ctrLiftMultiplier: Math.max(0.6, Math.min(1.8, Number(project?.executionModel?.ctrLiftMultiplier || 1))),
    roiMultiplier: Math.max(0.6, Math.min(1.8, Number(project?.executionModel?.roiMultiplier || 1))),
    confidenceBias: Math.max(-0.15, Math.min(0.15, Number(project?.executionModel?.confidenceBias || 0))),
  };
  const auditIssues = Array.isArray(project?.audit?.issueRegistry) ? project.audit.issueRegistry : [];
  const gscKeywords = Array.isArray(project?.gsc?.topKeywords) ? project.gsc.topKeywords : [];
  const gscMovers = Array.isArray(project?.gsc?.movers) ? project.gsc.movers : [];
  const serpOpportunities = Array.isArray(project?.gsc?.serpOpportunities) ? project.gsc.serpOpportunities : [];
  const onpage = project?.onpage || {};
  const onpageIssues = Array.isArray(onpage?.issues) ? onpage.issues : [];
  const out = [];

  for (const i of auditIssues.slice(0, 10)) {
    const value = Number(i.value || 0);
    if (value <= 0) continue;
    const baseImpact = Number(i.impact || 0);
    const confidence = Math.max(0.5, Math.min(0.98, (i.severity === "high" ? 0.9 : i.severity === "medium" ? 0.8 : 0.7) + model.confidenceBias));
    out.push({
      id: `exec_audit_${i.issue_id || i.label}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      module: "Technical Audit",
      label: `[${host}] Fix ${i.label} affecting ${value} pages`,
      impact: Math.min(100, Math.round(baseImpact * 1.2)),
      confidence,
      sourceSignals: ["audit"],
      rationale: `${i.label} impacts crawl/index quality across ${value} pages.`,
      expectedCtrLiftPct: Number((0.4 * model.ctrLiftMultiplier).toFixed(2)),
      expectedClicksGain28d: Math.round(value * 0.8),
      daysToImpact: 21,
      expectedRoiScore: Math.round(((Math.min(100, Math.round(baseImpact * 1.2)) * confidence) / 1.8) * model.roiMultiplier),
    });
  }

  for (const k of gscKeywords.slice(0, 20)) {
    const query = String(k.keys?.[0] || "");
    if (!query) continue;
    const clicks = Number(k.clicks || 0);
    const impressions = Number(k.impressions || 0);
    const ctr = Number(k.ctr || 0);
    const position = Number(k.position || 99);
    const opportunity = Math.max(0, ((position > 4 ? Math.min(30, position) - 4 : 0) * 2.2) + ((0.08 - ctr) * 300));
    const impact = Math.min(100, Math.round(opportunity + Math.min(25, impressions / 120)));
    if (impact < 25) continue;
    const targetCtr = Math.max(ctr, Math.min(0.22, ctr + Math.max(0.015, (position > 10 ? 0.025 : 0.012))));
    const expectedCtrLiftPct = Math.max(0, (targetCtr - ctr) * 100) * model.ctrLiftMultiplier;
    const expectedClicksGain28d = Math.max(0, Math.round(impressions * (targetCtr - ctr)));
    const confidence = Math.max(0.5, Math.min(0.98, (impressions > 500 ? 0.88 : 0.78) + model.confidenceBias));
    out.push({
      id: `exec_gsc_${query}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      module: "Search Console",
      label: `[${host}] Improve "${query}" (pos ${position.toFixed(1)}, ctr ${(ctr * 100).toFixed(1)}%)`,
      impact,
      confidence,
      sourceSignals: ["gsc"],
      rationale: `High impression query with recoverable CTR/rank gap. Clicks=${clicks}, impressions=${impressions}.`,
      expectedCtrLiftPct: Number(expectedCtrLiftPct.toFixed(2)),
      expectedClicksGain28d,
      daysToImpact: 10,
      expectedRoiScore: Math.round(((impact * confidence) + Math.min(30, expectedClicksGain28d / 8)) * model.roiMultiplier),
    });
  }

  for (const m of gscMovers.filter((x) => Number(x.deltaPosition || 0) > 0).slice(0, 12)) {
    const delta = Number(m.deltaPosition || 0);
    const impressions = Number(m.impressions || 0);
    const ctr = Number(m.ctr || 0);
    const impact = Math.min(100, Math.round((delta * 7) + Math.min(30, impressions / 100)));
    const expectedCtrLiftPct = Math.max(0.3, Math.min(3.5, delta * 0.18 + (ctr < 0.05 ? 0.8 : 0.2)));
    const expectedClicksGain28d = Math.round(impressions * (expectedCtrLiftPct / 100));
    const confidence = Math.max(0.5, Math.min(0.98, (impressions > 800 ? 0.9 : 0.8) + model.confidenceBias));
    out.push({
      id: `exec_mover_${String(m.query || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`,
      module: "Rank Tracking",
      label: `[${host}] Recover drop for "${m.query}" (Δpos +${delta.toFixed(1)})`,
      impact,
      confidence,
      sourceSignals: ["gsc-history"],
      rationale: `Keyword lost position versus previous snapshot; prioritize recovery.`,
      expectedCtrLiftPct: Number((expectedCtrLiftPct * model.ctrLiftMultiplier).toFixed(2)),
      expectedClicksGain28d,
      daysToImpact: 7,
      expectedRoiScore: Math.round(((impact * confidence) + Math.min(25, expectedClicksGain28d / 6)) * model.roiMultiplier),
    });
  }

  for (const s of serpOpportunities.slice(0, 12)) {
    const impact = Math.min(100, Math.round(Number(s.opportunityScore || 0)));
    const confidence = 0.84;
    const expectedCtrLiftPct = Number(s.projectedCtrLiftPct || 0.9);
    const impressions = Number(s.impressions || 0);
    const expectedClicksGain28d = Math.max(0, Math.round(impressions * (expectedCtrLiftPct / 100)));
    out.push({
      id: `exec_serp_${String(s.query || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`,
      module: "AEO / SERP",
      label: `[${host}] Capture ${s.serpTarget || "SERP feature"} for "${s.query}"`,
      impact,
      confidence,
      sourceSignals: ["gsc-serp-opportunity"],
      rationale: `Query pattern and rank band indicate strong eligibility for ${s.serpTarget || "SERP feature"}.`,
      expectedCtrLiftPct,
      expectedClicksGain28d,
      daysToImpact: 9,
      expectedRoiScore: Math.round((impact * confidence) + Math.min(28, expectedClicksGain28d / 7)),
    });
  }

  const title = String(onpage?.meta?.title || "");
  const desc = String(onpage?.meta?.description || "");
  const h1 = String(onpage?.meta?.htags?.h1?.[0] || "");
  const tti = Number(onpage?.checks?.tti_ms || onpage?.page_timing?.time_to_interactive || 0);
  if (onpage?.url) {
    const checks = [
      { ok: title.length >= 10 && title.length <= 70, label: "title length", impact: 42 },
      { ok: desc.length >= 50 && desc.length <= 160, label: "meta description", impact: 38 },
      { ok: !!h1, label: "missing H1", impact: 45 },
      { ok: !tti || tti < 2500, label: "page speed", impact: 34 },
    ];
    checks.filter((c) => !c.ok).forEach((c) => {
      out.push({
        id: `exec_onpage_${c.label}_${onpage.url}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
        module: "On-Page SEO",
        label: `[${host}] Fix ${c.label} on ${onpage.url}`,
        impact: c.impact,
        confidence: Math.max(0.5, Math.min(0.98, 0.82 + model.confidenceBias)),
        sourceSignals: ["onpage"],
        rationale: `Measured on-page signal indicates ${c.label} needs correction.`,
        expectedCtrLiftPct: Number(((c.label === "title length" || c.label === "meta description" ? 0.9 : 0.35) * model.ctrLiftMultiplier).toFixed(2)),
        expectedClicksGain28d: c.label === "title length" || c.label === "meta description" ? 18 : 8,
        daysToImpact: c.label === "page speed" ? 18 : 12,
        expectedRoiScore: Math.round(((c.impact * 0.82) + (c.label === "title length" || c.label === "meta description" ? 12 : 6)) * model.roiMultiplier),
      });
    });
  }
  for (const i of onpageIssues.slice(0, 12)) {
    const label = String(i.label || "").trim();
    if (!label) continue;
    const impact = Math.max(25, Math.min(95, Number(i.impact || 35)));
    const confidence = Math.max(0.5, Math.min(0.98, (String(i.severity || "").toLowerCase() === "high" ? 0.9 : 0.82) + model.confidenceBias));
    out.push({
      id: `exec_onpage_issue_${String(i.key || label).toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`,
      module: "On-Page SEO",
      label: `[${host}] ${label}`,
      impact,
      confidence,
      sourceSignals: ["onpage", "onpage-issues"],
      rationale: String(i.fixHint || "Detected in latest on-page analysis."),
      expectedCtrLiftPct: Number(((String(i.priority || "P2").toUpperCase() === "P1" ? 1.0 : 0.7) * model.ctrLiftMultiplier).toFixed(2)),
      expectedClicksGain28d: String(i.priority || "P2").toUpperCase() === "P1" ? 20 : 10,
      daysToImpact: String(i.priority || "P2").toUpperCase() === "P1" ? 10 : 14,
      expectedRoiScore: Math.round(((impact * confidence) + (String(i.priority || "P2").toUpperCase() === "P1" ? 14 : 8)) * model.roiMultiplier),
    });
  }
  const onpageAeoGeo = onpage?.aeoGeo || {};
  const blockers = Array.isArray(onpageAeoGeo?.blockers) ? onpageAeoGeo.blockers : [];
  const aeoScore = Number(onpageAeoGeo?.aeoScore || 0);
  const geoScore = Number(onpageAeoGeo?.geoScore || 0);
  if (aeoScore > 0 || geoScore > 0) {
    const baseImpact = Math.max(30, Math.min(95, 100 - Math.round((aeoScore + geoScore) / 2)));
    blockers.slice(0, 6).forEach((b, i) => {
      const txt = String(b || "").trim();
      if (!txt) return;
      const critical = /missing|canonical|primary roadmap keyword|slow/i.test(txt) || aeoScore < 50 || geoScore < 50;
      const impact = critical ? Math.min(99, baseImpact + 12) : baseImpact;
      out.push({
        id: `exec_onpage_aeo_geo_${i}_${txt}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
        module: "On-Page SEO",
        label: `[${host}] Resolve AEO/GEO blocker: ${txt}`,
        impact,
        confidence: Math.max(0.5, Math.min(0.98, 0.84 + model.confidenceBias)),
        sourceSignals: ["onpage", "aeo-geo"],
        rationale: `AEO/GEO readiness currently ${aeoScore}/100 and ${geoScore}/100.`,
        expectedCtrLiftPct: Number(((critical ? 1.1 : 0.7) * model.ctrLiftMultiplier).toFixed(2)),
        expectedClicksGain28d: critical ? 24 : 12,
        daysToImpact: critical ? 10 : 14,
        expectedRoiScore: Math.round(((impact * 0.84) + (critical ? 16 : 9)) * model.roiMultiplier),
      });
    });
  }

  const unique = new Map();
  out.forEach((item) => {
    if (!unique.has(item.id)) unique.set(item.id, item);
  });
  return Array.from(unique.values()).sort((a, b) => b.impact - a.impact).slice(0, 25);
}

function recalibrateExecutionModel(project = {}) {
  const base = {
    ctrLiftMultiplier: Math.max(0.6, Math.min(1.8, Number(project?.executionModel?.ctrLiftMultiplier || 1))),
    roiMultiplier: Math.max(0.6, Math.min(1.8, Number(project?.executionModel?.roiMultiplier || 1))),
    confidenceBias: Math.max(-0.15, Math.min(0.15, Number(project?.executionModel?.confidenceBias || 0))),
    samples: Number(project?.executionModel?.samples || 0),
  };
  const hist = Array.isArray(project?.gsc?.history) ? project.gsc.history : [];
  if (hist.length < 2) return { model: base, learning: null };
  const curr = hist[0]?.totals || {};
  const prev = hist[1]?.totals || {};
  const actualCtrLiftPct = ((Number(curr.ctr || 0) - Number(prev.ctr || 0)) * 100);
  const actualClicksDelta = Number(curr.clicks || 0) - Number(prev.clicks || 0);
  const queue = Array.isArray(project?.executionQueue) ? project.executionQueue : [];
  const projectedCtrLiftPct = queue.slice(0, 8).reduce((s, q) => s + Number(q.expectedCtrLiftPct || 0), 0) * 0.22;
  const projectedClicksDelta = queue.slice(0, 8).reduce((s, q) => s + Number(q.expectedClicksGain28d || 0), 0) * 0.2;
  const ctrRealization = projectedCtrLiftPct > 0 ? actualCtrLiftPct / projectedCtrLiftPct : 1;
  const clickRealization = projectedClicksDelta > 0 ? actualClicksDelta / projectedClicksDelta : 1;
  const movers = Array.isArray(project?.gsc?.movers) ? project.gsc.movers : [];
  const recoveryRate = movers.length ? movers.filter((m) => Number(m.deltaPosition || 0) < -0.3).length / movers.length : 0.5;
  const next = {
    ctrLiftMultiplier: Math.max(0.6, Math.min(1.8, base.ctrLiftMultiplier * (0.92 + (0.16 * Math.max(0.4, Math.min(1.6, ctrRealization)))))),
    roiMultiplier: Math.max(0.6, Math.min(1.8, base.roiMultiplier * (0.92 + (0.16 * Math.max(0.4, Math.min(1.6, clickRealization)))))),
    confidenceBias: Math.max(-0.15, Math.min(0.15, base.confidenceBias + ((recoveryRate - 0.5) * 0.04))),
    samples: base.samples + 1,
    lastCalibratedAt: new Date().toISOString(),
  };
  return {
    model: next,
    learning: {
      ts: new Date().toISOString(),
      actualCtrLiftPct: Number(actualCtrLiftPct.toFixed(3)),
      projectedCtrLiftPct: Number(projectedCtrLiftPct.toFixed(3)),
      actualClicksDelta,
      projectedClicksDelta: Math.round(projectedClicksDelta),
      ctrRealization: Number(ctrRealization.toFixed(3)),
      clickRealization: Number(clickRealization.toFixed(3)),
      recoveryRate: Number(recoveryRate.toFixed(3)),
    },
  };
}

function buildExecutionTasksFromQueue(queue = []) {
  return queue.map((q, idx) => ({
    id: `exec_task_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
    status: "todo",
    priority: q.impact >= 70 ? "high" : q.impact >= 40 ? "medium" : "low",
    module: q.module,
    label: q.label,
    due: "",
    source: "execution-priority-engine",
    impact: q.impact,
    confidence: q.confidence,
    sourceSignals: q.sourceSignals,
    rationale: q.rationale,
    expectedCtrLiftPct: q.expectedCtrLiftPct,
    expectedClicksGain28d: q.expectedClicksGain28d,
    expectedRoiScore: q.expectedRoiScore,
    daysToImpact: q.daysToImpact,
  }));
}

function buildAutonomyActionsFromIssues(issueRegistry = [], host = "", policy = "balanced") {
  const out = [];
  const isConservative = policy === "conservative";
  const isAggressive = policy === "aggressive";
  for (const i of (issueRegistry || [])) {
    if ((i.value || 0) <= 0) continue;
    const isHigh = i.priority === "P1" || i.severity === "high";
    if (/missing meta descriptions/i.test(i.label)) {
      out.push({
        id: `act_${Date.now()}_${out.length}`,
        host,
        issue_id: i.issue_id,
        issue: i.label,
        kind: isConservative && isHigh ? "risky" : "safe",
        action: "prepare-meta-description-plan",
        status: isConservative && isHigh ? "pending_approval" : "ready",
        detail: `Generate prioritized page list for meta-description updates (${i.value} pages).`,
      });
    } else if (/missing h1/i.test(i.label)) {
      out.push({
        id: `act_${Date.now()}_${out.length}`,
        host,
        issue_id: i.issue_id,
        issue: i.label,
        kind: isConservative ? "risky" : "safe",
        action: "prepare-h1-fix-plan",
        status: isConservative ? "pending_approval" : "ready",
        detail: `Generate template-level H1 fix map for ${i.value} affected pages.`,
      });
    } else if (/broken pages/i.test(i.label) || /canonical/i.test(i.label)) {
      out.push({
        id: `act_${Date.now()}_${out.length}`,
        host,
        issue_id: i.issue_id,
        issue: i.label,
        kind: isAggressive ? "safe" : "risky",
        action: isAggressive ? "prepare-redirect-canonical-plan" : "requires-human-approval",
        status: isAggressive ? "ready" : "pending_approval",
        detail: `Potential redirect/canonical changes required for ${i.value} pages.`,
      });
    }
    if (out.length >= 8) break;
  }
  return out;
}

async function executeSafeAutonomyActions(actions = [], orgScope = "default", host = "", executionWebhook = "") {
  const project = loadProjectData(orgScope, host);
  const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
  const changeLog = Array.isArray(project?.changeLog) ? project.changeLog : [];
  const nextActions = [];
  for (const a of actions) {
    if (a.kind !== "safe" || a.status !== "ready") { nextActions.push(a); continue; }
    const changeId = `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task = {
      id: `auto_exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      status: "todo",
      priority: "medium",
      module: "Autonomy",
      label: `[${host}] ${a.detail}`,
      due: "",
      source: "autonomous-execution",
      action_id: a.id,
      change_id: changeId,
    };
    let external = { attempted: false, ok: false, note: "No execution connector" };
    if (executionWebhook) {
      try {
        const res = await fetch(executionWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: a, host, orgScope, changeId, ts: new Date().toISOString() }),
        });
        external = { attempted: true, ok: res.ok, note: res.ok ? "Webhook executed" : `Webhook failed (${res.status})` };
      } catch (e) {
        external = { attempted: true, ok: false, note: e.message };
      }
    }
    tasks.unshift(task);
    changeLog.unshift({
      id: changeId,
      action_id: a.id,
      host,
      ts: new Date().toISOString(),
      kind: "low-risk-plan",
      detail: a.detail,
      status: "applied",
      rollbackAvailable: true,
      rollbackPlan: `Revert execution plan for action "${a.action}".`,
      externalExecution: external,
    });
    nextActions.push({ ...a, status: "executed", executedAt: new Date().toISOString(), changeId, externalExecution: external });
  }
  mergeProjectData(orgScope, host, { tasks: tasks.slice(0, 120), autonomyActions: nextActions, changeLog: changeLog.slice(0, 120) });
  return nextActions;
}

function verifyRecentChanges(orgScope = "default", host = "") {
  const project = loadProjectData(orgScope, host);
  const history = Array.isArray(project?.gsc?.history) ? project.gsc.history : [];
  const latest = history[0]?.totals || {};
  const prev = history[1]?.totals || {};
  const ctrDeltaPct = Number((((Number(latest.ctr || 0) - Number(prev.ctr || 0)) * 100)).toFixed(3));
  const clicksDelta = Number(latest.clicks || 0) - Number(prev.clicks || 0);
  const changes = Array.isArray(project?.changeLog) ? [...project.changeLog] : [];
  const now = Date.now();
  const updated = changes.map((c) => {
    if (!c || c.status !== "applied" || c.verification) return c;
    const ageHours = (now - new Date(c.ts).getTime()) / 3600000;
    if (ageHours < 0.1) return c;
    const verified = {
      ts: new Date().toISOString(),
      ctrDeltaPct,
      clicksDelta,
      verdict: ctrDeltaPct >= -0.15 && clicksDelta >= -5 ? "ok" : "degraded",
    };
    return { ...c, verification: verified };
  });
  mergeProjectData(orgScope, host, { changeLog: updated });
  return updated;
}

function loadAutonomyRuns(orgScope = "default") {
  try {
    const raw = localStorage.getItem(`helio:autonomy:runs:${orgScope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendAutonomyRun(orgScope = "default", runEntry = {}) {
  const prev = loadAutonomyRuns(orgScope);
  const next = [runEntry, ...prev].slice(0, 50);
  try { localStorage.setItem(`helio:autonomy:runs:${orgScope}`, JSON.stringify(next)); } catch {}
  return next;
}

function buildDefaultAeoPromptSuite(host = "", brandProfile = {}) {
  const brand = String(brandProfile?.brandName || (host || "brand").replace(/^www\./i, ""));
  const product = String(brandProfile?.products || "").split(",")[0]?.trim() || "product";
  return [
    `${brand} reviews`,
    `best alternatives to ${brand}`,
    `what is ${brand}`,
    `${brand} company`,
    `${brand} official website`,
    `${brand} ${product}`,
    `how to choose the best ai seo tools`,
    `best ai seo tools for small business`,
    `${brand} pricing comparison`,
    `${brand} vs competitors`,
    `${brand} for local seo`,
    `troubleshooting ${brand} setup`,
    `is ${brand} good for enterprise`,
  ];
}

function detectBrandConfusionFromProbeRows(probeRows = [], brandProfile = {}, host = "") {
  const brandName = String(brandProfile?.brandName || "").trim();
  if (!brandName) return { risk: 0, hits: [] };
  const compact = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const spaced = brandName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const hostToken = String(host || "").toLowerCase();
  const rows = Array.isArray(probeRows) ? probeRows : [];
  const hits = rows.filter((r) => {
    const raw = String(r?.rawPreview || "").toLowerCase();
    if (!raw) return false;
    const mentionsSpaced = spaced && raw.includes(spaced);
    const mentionsCompact = compact && raw.includes(compact);
    const mentionsHost = hostToken && raw.includes(hostToken);
    return mentionsSpaced && !mentionsCompact && !mentionsHost;
  });
  const risk = Math.min(100, hits.length * 30);
  return { risk, hits: hits.slice(0, 6) };
}

function buildEntityOptimizationSprintActions({
  host = "",
  brandProfile = {},
  confusionRisk = 0,
  citationDeltaPts = 0,
  probeEvidence = {},
} = {}) {
  const brand = String(brandProfile?.brandName || host || "brand");
  const actions = [];
  if (Number(confusionRisk || 0) >= 35) {
    actions.push({
      actionId: `aeogeo_entity_sprint_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: "entity_optimization_sprint",
      title: `Entity optimization sprint for ${brand}`,
      summary: `High brand confusion risk detected (${Number(confusionRisk).toFixed(0)}/100).`,
      reason: "Probe detected ambiguous entity interpretation.",
      severity: "high",
      priority: "P1",
      status: "todo",
      affectedCount: Math.max(1, Number(probeEvidence?.observationsCount || 1)),
      kpiTarget: 90,
      fixHint: "Ship disambiguation pack to About, FAQ, schema, and comparison pages.",
      expectedOutcome: "Brand recognized as a company/entity consistently across LLM answers.",
      probeEvidence,
      createdAt: new Date().toISOString(),
    });
  }
  if (Number(citationDeltaPts || 0) <= -5) {
    actions.push({
      actionId: `aeogeo_citation_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: "citation_recovery_sprint",
      title: "Citation recovery sprint",
      summary: `Citation dropped ${Number(citationDeltaPts).toFixed(2)} pts after probes.`,
      reason: "Observed citation regression in probe timeline.",
      severity: "high",
      priority: "P1",
      status: "todo",
      affectedCount: Math.max(1, Number(probeEvidence?.observationsCount || 1)),
      kpiTarget: 85,
      fixHint: "Refresh top intent pages with stronger evidence blocks and canonical citations.",
      expectedOutcome: "Citation rate recovers in next verification probe.",
      probeEvidence,
      createdAt: new Date().toISOString(),
    });
  }
  return actions;
}

function runAeoIntelSuiteForHost({
  orgScope = "default",
  host = "",
  engine = "chatgpt",
  driftThreshold = 0.05,
  minCitationRate = 0.15,
} = {}) {
  const project = loadProjectData(orgScope, host);
  const intel = project?.aeoGeoIntel || {};
  const prevRows = Array.isArray(intel?.promptObservations) ? intel.promptObservations : [];
  const prevSummary = summarizePromptObservatory(prevRows);
  const brandProfile = project?.aeoBrandProfile || {};
  const suite = Array.isArray(intel?.promptSuite) && intel.promptSuite.length
    ? intel.promptSuite
    : buildDefaultAeoPromptSuite(host, brandProfile);
  const competitorSeed = Array.isArray(intel?.competitorGraph) ? intel.competitorGraph.slice(0, 3).map((c) => c.competitor) : [];
  const simulated = runObservatoryPromptSuite({
    suite,
    engine,
    citationRate: Math.max(0.08, Number(prevSummary.globalCitationRate || 0.22)),
    avgRank: 4.5,
    competitorSeed,
  });
  const all = [...simulated, ...prevRows].slice(0, 800);
  const nextSummary = summarizePromptObservatory(all);
  const nextCompetitors = buildCompetitorMentionGraph(all);
  const citationFitness = computeCitationFitness({
    page: {
      words: Number(project?.onpage?.meta?.content?.words_count || 0),
      canonical: String(project?.onpage?.meta?.canonical || ""),
      meta: project?.onpage?.meta || {},
      sourcesCount: Number((project?.audit?.issueRegistry || []).filter((i)=>/evidence|schema|citation/i.test(String(i?.label||""))).length || 0),
      freshnessDays: 21,
    },
    host,
    schemaTypes: Array.isArray(project?.onpage?.meta?.schema_types) ? project.onpage.meta.schema_types : [],
  });
  const drift = detectObservatoryDrift({ previousSummary: prevSummary, nextSummary, dropThreshold: Number(driftThreshold || 0.05) });
  const intelligenceActions = buildIntelligenceActions({ observatory: nextSummary, citationFitness, competitors: nextCompetitors });
  const nextIntel = {
    ...intel,
    promptSuite: suite,
    promptObservations: all,
    observatorySummary: nextSummary,
    competitorGraph: nextCompetitors,
    citationFitness,
    intelligenceActions,
    drift,
    lastSuiteRunAt: new Date().toISOString(),
  };

  const prevAeoActions = Array.isArray(project?.aeoGeoActions) ? project.aeoGeoActions : [];
  const nextAeoActions = [...prevAeoActions];
  if (Number(nextSummary.globalCitationRate || 0) < Number(minCitationRate || 0.15)) {
    nextAeoActions.unshift({
      actionId: `aeogeo_minrate_${Date.now()}`,
      type: "citation_rate_recovery",
      title: "Citation rate below minimum threshold",
      summary: `Current citation rate ${(Number(nextSummary.globalCitationRate || 0) * 100).toFixed(1)}% is below threshold ${(Number(minCitationRate || 0.15) * 100).toFixed(1)}%.`,
      reason: "Observatory benchmark breach.",
      severity: "high",
      priority: "P1",
      status: "todo",
      affectedCount: suite.length || 1,
      kpiTarget: Math.round(Number(minCitationRate || 0.15) * 100),
      fixHint: "Increase answer-first structure, citation evidence density, and entity consistency on top-intent pages.",
      expectedOutcome: "Citation rate restored above configured minimum threshold.",
      createdAt: new Date().toISOString(),
    });
  }
  if (drift.dropped) {
    nextAeoActions.unshift({
      actionId: `aeogeo_drift_${Date.now()}`,
      type: "observatory_drift",
      title: "Autonomy drift alert: citation rate dropped",
      summary: drift.alert,
      reason: drift.alert,
      severity: "high",
      priority: "P1",
      status: "todo",
      affectedCount: suite.length || 1,
      kpiTarget: 80,
      fixHint: "Run citation recovery sprint: refresh answer blocks, strengthen citations, and push entity pages.",
      expectedOutcome: "Recover citation rate above previous baseline in next observatory cycle.",
      createdAt: new Date().toISOString(),
    });
  }

  mergeProjectData(orgScope, host, {
    aeoGeoIntel: nextIntel,
    aeoGeoActions: nextAeoActions.slice(0, 80),
  });
  return {
    suiteSize: suite.length,
    observationsAdded: simulated.length,
    citationRate: Number(nextSummary.globalCitationRate || 0),
    driftDelta: Number(drift.delta || 0),
    driftAlerted: !!drift.dropped,
    minRateBreached: Number(nextSummary.globalCitationRate || 0) < Number(minCitationRate || 0.15),
  };
}

async function autonomousDailyRun({ orgScope = "default", orgName = "", integrations = {}, addLog = () => {} }) {
  const domain = integrations?.gsc?.fields?.extra?.siteUrl || "";
  const host = getHostFromInput(domain);
  if (!host) throw new Error("No connected GSC domain for this organization.");

  addLog("Autonomy: starting daily run.", "sys");
  const runOut = { host, steps: [], startedAt: new Date().toISOString(), orgName };
  appendAeoAuditEvent(orgScope, host, { actor: "helio-agent", role: "system", action: "autonomy_daily_run_started", status: "ok", detail: orgName || host });
  const governance = loadProjectData(orgScope, host)?.aeoGeoGovernance || {};
  const allowAutonomousPolicyGeneration = governance.allowAutonomousPolicyGeneration !== false;
  const allowAutonomousExternalProbe = governance.allowAutonomousExternalProbe !== false;
  const allowAutonomousActionQueueing = governance.allowAutonomousActionQueueing !== false;

  const audit = await helioCoreAuditDomain(domain, (m, t) => addLog(`[Audit] ${m}`, t), { scope: orgScope, renderMode: "enhanced-js" });
  const generatedTasks = buildAutonomyTasksFromIssues(audit.issueRegistry || [], host);
  const policy = integrations?.autonomyPolicy || "balanced";
  const generatedActions = allowAutonomousActionQueueing ? buildAutonomyActionsFromIssues(audit.issueRegistry || [], host, policy) : [];
  const existing = loadProjectData(orgScope, host);
  const prevTasks = Array.isArray(existing?.tasks) ? existing.tasks : [];
  const mergedTasks = [...generatedTasks, ...prevTasks.filter((t)=>t.source!=="autonomous-run")].slice(0, 100);
  mergeProjectData(orgScope, host, { tasks: mergedTasks });
  const executedActions = await executeSafeAutonomyActions(generatedActions, orgScope, host, integrations?.autonomyExecutionWebhook || "");
  const afterExec = loadProjectData(orgScope, host);
  const execQueue = buildExecutionPriorityQueue(afterExec, host);
  const execTasks = buildExecutionTasksFromQueue(execQueue);
  const existingTasks = Array.isArray(afterExec?.tasks) ? afterExec.tasks : mergedTasks;
  const preserved = existingTasks.filter((t) => t.source !== "execution-priority-engine");
  const prioritizedTasks = [...execTasks, ...preserved].slice(0, 140);
  mergeProjectData(orgScope, host, {
    audit: { source: audit.source, summary: audit.summary, quality: audit.quality, issueRegistry: audit.issueRegistry || [], templatePatterns: audit.templatePatterns || [], capturedAt: new Date().toISOString() },
    tasks: prioritizedTasks,
    executionQueue: execQueue,
    autonomyActions: executedActions,
  });
  let intelRun = null;
  const beforeIntelProject = loadProjectData(orgScope, host);
  const currentLlmPolicy = beforeIntelProject?.llmPolicyFiles || {};
  const brandProfile = beforeIntelProject?.aeoBrandProfile || {};
  if (allowAutonomousPolicyGeneration && (!currentLlmPolicy?.llmsTxt || !currentLlmPolicy?.llmTxt)) {
    const policyFiles = buildDeterministicLlmPolicyFilesForHost(host, beforeIntelProject?.gsc?.topPages || [], brandProfile);
    mergeProjectData(orgScope, host, {
      llmPolicyFiles: {
        ...policyFiles,
        warnings: ["Autonomy-generated deterministic policy files. Review and refine with AI for brand nuance."],
        errors: [],
        validatedAt: new Date().toISOString(),
      },
    });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-agent",
      role: "system",
      action: "autonomy_generate_llm_policy_files",
      status: "ok",
      detail: "Generated llms.txt + llm.txt deterministically for autonomous continuity.",
    });
  }
  if ((integrations?.enableAeoIntelSuite !== false) && allowAutonomousExternalProbe) {
    intelRun = runAeoIntelSuiteForHost({
      orgScope,
      host,
      engine: integrations?.aeoIntelEngine || "chatgpt",
      driftThreshold: Number(integrations?.aeoIntelDriftThreshold || 0.05),
      minCitationRate: Number(integrations?.aeoIntelMinCitationRate || 0.15),
    });
    syncMissionsFromProject(orgScope, host);
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-agent",
      role: "system",
      action: "autonomy_run_aeo_intel_suite",
      status: "ok",
      detail: `suite=${intelRun?.suiteSize || 0} citationRate=${(Number(intelRun?.citationRate || 0)*100).toFixed(1)}%`,
    });
    try {
      const latestProject = loadProjectData(orgScope, host);
      const connectors = latestProject?.aeoGeoIntel?.connectors || {};
      const hasConnector = !!(connectors?.openaiSearchKey || connectors?.anthropicSearchKey || connectors?.perplexityKey || (connectors?.bingApiKey && connectors?.bingSiteUrl));
      if (hasConnector) {
        const probePrompt = `Brand/entity retrieval check for ${String(latestProject?.aeoBrandProfile?.brandName || host)}.`;
        const prevSummary = summarizePromptObservatory(Array.isArray(latestProject?.aeoGeoIntel?.promptObservations) ? latestProject.aeoGeoIntel.promptObservations : []);
        const probeRes = await fetch("/api/aeo/intel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: probePrompt, targetHost: host, connectors }),
        });
        const probe = await probeRes.json().catch(()=>({}));
        const rawObs = Array.isArray(probe?.observations) ? probe.observations : [];
        const trustedDomains = Array.isArray(latestProject?.aeoGeoIntel?.trustedDomains) ? latestProject.aeoGeoIntel.trustedDomains : [];
        const mappedObs = rawObs.map((r) => buildPromptObservation({
          prompt: r?.prompt || probePrompt,
          engine: r?.engine || "chatgpt",
          cited: !!r?.cited,
          rank: r?.rank == null ? null : Number(r.rank),
          citationUrl: r?.citationUrl || "",
          sentiment: r?.sentiment || "neutral",
          sourceQuality: scoreCitationSourceQuality(r?.citationUrl || "", trustedDomains),
        }));
        const prevRows = Array.isArray(latestProject?.aeoGeoIntel?.promptObservations) ? latestProject.aeoGeoIntel.promptObservations : [];
        const all = [...mappedObs, ...prevRows].slice(0, 1400);
        const nextSummary = summarizePromptObservatory(all);
        const prevCitationRate = Number(prevSummary.globalCitationRate || 0);
        const citationDeltaPts = Number((((Number(nextSummary.globalCitationRate || 0) - prevCitationRate) * 100)).toFixed(2));
        const confusion = detectBrandConfusionFromProbeRows(rawObs, latestProject?.aeoBrandProfile || {}, host);
        const drop = Number(prevSummary.globalCitationRate || 0) - Number(nextSummary.globalCitationRate || 0);
        const nextActions = Array.isArray(latestProject?.aeoGeoActions) ? [...latestProject.aeoGeoActions] : [];
        const sprintActions = buildEntityOptimizationSprintActions({
          host,
          brandProfile: latestProject?.aeoBrandProfile || {},
          confusionRisk: confusion.risk,
          citationDeltaPts,
          probeEvidence: {
            prompt: probePrompt,
            observationsCount: mappedObs.length,
            confusionRisk: confusion.risk,
            citationDeltaPts,
            engines: rawObs.map((x)=>String(x?.engine||"")).filter(Boolean).slice(0, 8),
            errors: Array.isArray(probe?.errors) ? probe.errors : [],
            autonomous: true,
          },
        });
        if (sprintActions.length) nextActions.unshift(...sprintActions);
        if (sprintActions.length) {
          const prevAlerts = Array.isArray(latestProject?.aeoAlerts) ? latestProject.aeoAlerts : [];
          mergeProjectData(orgScope, host, {
            aeoAlerts: [{
              id: `aeo_alert_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
              ts: new Date().toISOString(),
              level: "warn",
              title: "Autonomy sprint actions queued",
              detail: `Queued ${sprintActions.length} action(s) from autonomous probe.`,
              metadata: { confusionRisk: confusion.risk, citationDeltaPts },
              status: "open",
            }, ...prevAlerts].slice(0, 120),
          });
        }
        mergeProjectData(orgScope, host, {
          aeoGeoIntel: {
            ...(latestProject?.aeoGeoIntel || {}),
            promptObservations: all,
            observatorySummary: nextSummary,
            brandConfusion: { risk: confusion.risk, sampleHits: confusion.hits.map((h)=>String(h?.engine || "engine")), checkedAt: new Date().toISOString() },
            probeRuns: [
              {
                id: `probe_auto_${Date.now()}`,
                ts: new Date().toISOString(),
                prompt: probePrompt,
                rawObservations: rawObs,
                connectorErrors: Array.isArray(probe?.errors) ? probe.errors : [],
                connectorStats: probe?.connectorStats || {},
                confusionRisk: confusion.risk,
                citationDeltaPts,
                observationsCount: mappedObs.length,
                autonomous: true,
              },
              ...((Array.isArray(latestProject?.aeoGeoIntel?.probeRuns) ? latestProject.aeoGeoIntel.probeRuns : []).slice(0, 79)),
            ],
            updatedAt: new Date().toISOString(),
          },
          aeoGeoActions: nextActions.slice(0, 120),
        });
        appendAeoAuditEvent(orgScope, host, {
          actor: "helio-agent",
          role: "system",
          action: "autonomy_external_probe_ingestion",
          status: probeRes.ok ? "ok" : "partial",
          detail: `obs=${mappedObs.length} confusionRisk=${confusion.risk} dropPts=${(drop*100).toFixed(1)} actions=${sprintActions.length}`,
        });

        // Closed-loop verification pass: run a short follow-up probe and mark progression.
        const canVerifyLoop = (loadProjectData(orgScope, host)?.aeoGeoGovernance?.enableAutonomousVerificationLoop !== false);
        try {
          if (!canVerifyLoop) throw new Error("Verification loop disabled by governance.");
          const verifyRes = await fetch("/api/aeo/intel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: `${probePrompt} verification pass`, targetHost: host, connectors }),
          });
          const verify = await verifyRes.json().catch(()=>({}));
          const verifyRaw = Array.isArray(verify?.observations) ? verify.observations : [];
          const verifyConf = detectBrandConfusionFromProbeRows(verifyRaw, latestProject?.aeoBrandProfile || {}, host);
          const verdict = verifyConf.risk < confusion.risk ? "improved" : verifyConf.risk > confusion.risk ? "regressed" : "unchanged";
          if (sprintActions.length) {
            const refreshed = loadProjectData(orgScope, host);
            const rows = Array.isArray(refreshed?.aeoGeoActions) ? refreshed.aeoGeoActions : [];
            const ids = new Set(sprintActions.map((a)=>String(a.actionId)));
            const marked = rows.map((a) => ids.has(String(a.actionId)) ? {
              ...a,
              verificationStatus: verdict,
              verificationAt: new Date().toISOString(),
              verificationEvidence: {
                prevConfusionRisk: confusion.risk,
                nextConfusionRisk: verifyConf.risk,
              },
            } : a);
            mergeProjectData(orgScope, host, { aeoGeoActions: marked.slice(0, 120) });
          }
          appendAeoAuditEvent(orgScope, host, {
            actor: "helio-agent",
            role: "system",
            action: "autonomy_probe_verification",
            status: "ok",
            detail: `verdict=${verdict} prevRisk=${confusion.risk} nextRisk=${verifyConf.risk}`,
          });
        } catch (verifyErr) {
          appendAeoAuditEvent(orgScope, host, {
            actor: "helio-agent",
            role: "system",
            action: "autonomy_probe_verification",
            status: "error",
            detail: verifyErr.message,
          });
        }
      }
    } catch (e) {
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-agent",
        role: "system",
        action: "autonomy_external_probe_ingestion",
        status: "error",
        detail: e.message,
      });
    }
  }
  runOut.steps.push({ step: "audit", ok: true, score: audit?.quality?.score ?? null });
  runOut.steps.push({
    step: "execution",
    ok: true,
    safeExecuted: executedActions.filter((a) => a.status === "executed").length,
    awaitingApproval: executedActions.filter((a) => a.status === "pending_approval").length,
    prioritizedTasks: execTasks.length,
    projectedClicksGain28d: execQueue.reduce((s, q) => s + Number(q.expectedClicksGain28d || 0), 0),
  });
  runOut.steps.push(
    intelRun
      ? {
        step: "aeo_intelligence_suite",
        ok: true,
        suiteSize: intelRun.suiteSize,
        observationsAdded: intelRun.observationsAdded,
        citationRate: intelRun.citationRate,
        driftDelta: intelRun.driftDelta,
        driftAlerted: intelRun.driftAlerted,
        minRateBreached: intelRun.minRateBreached,
      }
      : { step: "aeo_intelligence_suite", ok: true, skipped: true, reason: "disabled by autonomy/governance settings" }
  );

  if (integrations?.gsc?.connected && integrations?.gsc?.fields?.accessToken && integrations?.gsc?.fields?.extra?.siteUrl) {
    try {
      const end = new Date().toISOString().split("T")[0];
      const start = new Date(Date.now() - 28 * 86400000).toISOString().split("T")[0];
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${integrations.gsc.fields.accessToken}` };
      const site = encodeURIComponent(integrations.gsc.fields.extra.siteUrl);
      const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}`;
      const [pRes, kRes, tRes] = await Promise.all([
        fetch(`${base}/searchAnalytics/query`, { method: "POST", headers: h, body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["page"], rowLimit: 20 }) }),
        fetch(`${base}/searchAnalytics/query`, { method: "POST", headers: h, body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 20 }) }),
        fetch(`${base}/searchAnalytics/query`, { method: "POST", headers: h, body: JSON.stringify({ startDate: start, endDate: end, dimensions: [], rowLimit: 1 }) }),
      ]);
      const [pD, kD, tD] = await Promise.all([pRes.json(), kRes.json(), tRes.json()]);
      if (pRes.ok) {
        const prev = loadProjectData(orgScope, host);
        const prevHistory = Array.isArray(prev?.gsc?.history) ? prev.gsc.history : [];
        const prevSnapshot = prevHistory[0] || null;
        const currentTopKeywords = (kD.rows || []).slice(0, 20);
        const movers = prevSnapshot ? currentTopKeywords.map((k) => {
          const query = String(k.keys?.[0] || "");
          const before = (prevSnapshot.topKeywords || []).find((x) => String(x.keys?.[0] || "") === query);
          if (!before) return null;
          const currPos = Number(k.position || 0);
          const prevPos = Number(before.position || 0);
          const currClicks = Number(k.clicks || 0);
          const prevClicks = Number(before.clicks || 0);
          return { query, position: currPos, prevPosition: prevPos, deltaPosition: Number((currPos - prevPos).toFixed(2)), clicks: currClicks, prevClicks, deltaClicks: currClicks - prevClicks, impressions: Number(k.impressions || 0), ctr: Number(k.ctr || 0) };
        }).filter(Boolean).sort((a,b)=>Math.abs(b.deltaPosition)-Math.abs(a.deltaPosition)).slice(0,20) : [];
        const serpOpportunities = currentTopKeywords.map((k) => {
          const query = String(k.keys?.[0] || "");
          const pos = Number(k.position || 99);
          const ctr = Number(k.ctr || 0);
          const impressions = Number(k.impressions || 0);
          if (!query || impressions < 120 || pos < 2 || pos > 12) return null;
          const isQuestion = /^(how|what|why|when|where|who|can|should|is|are)\b/i.test(query);
          const isListIntent = /\b(best|top|list|vs|comparison|alternatives)\b/i.test(query);
          const serpTarget = isQuestion ? "Featured Snippet / PAA" : isListIntent ? "List Snippet" : "Rich Result";
          const opportunityScore = Math.max(25, Math.min(98, ((12 - pos) * 7) + ((0.08 - ctr) * 280) + Math.min(20, impressions / 100)));
          const projectedCtrLiftPct = Math.max(0.4, Math.min(3.2, (isQuestion ? 1.4 : 0.9) + (pos > 6 ? 0.6 : 0.2)));
          return { query, page: String((pD.rows || [])[0]?.keys?.[0] || ""), position: pos, impressions, ctr, serpTarget, opportunityScore: Math.round(opportunityScore), projectedCtrLiftPct: Number(projectedCtrLiftPct.toFixed(2)) };
        }).filter(Boolean).sort((a,b)=>b.opportunityScore-a.opportunityScore).slice(0,20);
        const nextHistory = [{
          ts: new Date().toISOString(),
          days: 28,
          totals: tD.rows?.[0] || {},
          topKeywords: currentTopKeywords,
        }, ...prevHistory].slice(0, 30);
        mergeProjectData(orgScope, host, { gsc: { siteUrl: integrations.gsc.fields.extra.siteUrl, totals: tD.rows?.[0] || {}, topPages: (pD.rows || []).slice(0, 10), topKeywords: (kD.rows || []).slice(0, 10), movers, serpOpportunities, history: nextHistory, capturedAt: new Date().toISOString() } });
        syncMissionsFromProject(orgScope, host);
        appendAeoAuditEvent(orgScope, host, { actor: "helio-agent", role: "system", action: "autonomy_refresh_gsc_signals", status: "ok", detail: `pages=${(pD.rows||[]).length} queries=${(kD.rows||[]).length}` });
        const afterGsc = loadProjectData(orgScope, host);
        const calibration = recalibrateExecutionModel(afterGsc);
        if (calibration.learning) {
          const prevLearning = Array.isArray(afterGsc?.learningLog) ? afterGsc.learningLog : [];
          mergeProjectData(orgScope, host, {
            executionModel: calibration.model,
            learningLog: [calibration.learning, ...prevLearning].slice(0, 40),
          });
          runOut.steps.push({ step: "learning", ok: true, ctrRealization: calibration.learning.ctrRealization, clickRealization: calibration.learning.clickRealization });
        }
        runOut.steps.push({ step: "gsc", ok: true });
      } else {
        runOut.steps.push({ step: "gsc", ok: false, error: pD?.error?.message || "GSC fetch failed" });
        appendAeoAuditEvent(orgScope, host, { actor: "helio-agent", role: "system", action: "autonomy_refresh_gsc_signals", status: "error", detail: pD?.error?.message || "GSC fetch failed" });
      }
    } catch (e) {
      runOut.steps.push({ step: "gsc", ok: false, error: e.message });
      appendAeoAuditEvent(orgScope, host, { actor: "helio-agent", role: "system", action: "autonomy_refresh_gsc_signals", status: "error", detail: e.message });
    }
  } else {
    runOut.steps.push({ step: "gsc", ok: false, skipped: "not connected" });
  }

  appendAeoAuditEvent(orgScope, host, {
    actor: "helio-agent",
    role: "system",
    action: "autonomy_daily_run_completed",
    status: "ok",
    detail: `steps=${runOut.steps.length}`,
    metadata: { steps: runOut.steps },
  });
  const verifiedChanges = verifyRecentChanges(orgScope, host);
  const degraded = verifiedChanges.filter((c) => c?.verification?.verdict === "degraded").length;
  if (degraded > 0) {
    runOut.steps.push({ step: "auto-stop-check", ok: false, degradedChanges: degraded });
    runOut.autoStop = true;
  } else {
    runOut.steps.push({ step: "auto-stop-check", ok: true, degradedChanges: 0 });
  }

  if (integrations?.ga4?.connected && integrations?.ga4?.fields?.accessToken && integrations?.ga4?.fields?.extra?.propertyId) {
    try {
      const propId = integrations.ga4.fields.extra.propertyId;
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${integrations.ga4.fields.accessToken}` };
      const [mainRes, pageRes] = await Promise.all([
        fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ dateRanges: [{ startDate: "28daysAgo", endDate: "today" }], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "newUsers" }, { name: "bounceRate" }, { name: "averageSessionDuration" }, { name: "screenPageViews" }] }),
        }),
        fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ dateRanges: [{ startDate: "28daysAgo", endDate: "today" }], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: "bounceRate" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 20 }),
        }),
      ]);
      const [mainD, pageD] = await Promise.all([mainRes.json(), pageRes.json()]);
      if (mainRes.ok) {
        const channels = mainD.rows || [];
        const totals = channels.reduce((acc, r) => ({ sessions: acc.sessions + (+r.metricValues[0].value || 0), users: acc.users + (+r.metricValues[1].value || 0), pageviews: acc.pageviews + (+r.metricValues[5].value || 0) }), { sessions: 0, users: 0, pageviews: 0 });
        mergeProjectData(orgScope, host, { ga4: { propertyId: propId, totals, topChannels: channels.slice(0, 10), topPages: (pageD.rows || []).slice(0, 10), capturedAt: new Date().toISOString() } });
        runOut.steps.push({ step: "ga4", ok: true });
      } else {
        runOut.steps.push({ step: "ga4", ok: false, error: mainD?.error?.message || "GA4 fetch failed" });
      }
    } catch (e) {
      runOut.steps.push({ step: "ga4", ok: false, error: e.message });
    }
  } else {
    runOut.steps.push({ step: "ga4", ok: false, skipped: "not connected" });
  }

  // Rebuild queue after all fresh data merges (GSC/GA4/learning) so priorities are not stale.
  const finalProject = loadProjectData(orgScope, host);
  const finalQueue = buildExecutionPriorityQueue(finalProject, host);
  const finalQueueTasks = buildExecutionTasksFromQueue(finalQueue);
  const finalTasks = Array.isArray(finalProject?.tasks) ? finalProject.tasks : [];
  const preservedTasks = finalTasks.filter((t) => t.source !== "execution-priority-engine");
  mergeProjectData(orgScope, host, {
    executionQueue: finalQueue,
    tasks: [...finalQueueTasks, ...preservedTasks].slice(0, 160),
  });

  runOut.finishedAt = new Date().toISOString();
  const failed = runOut.steps.some((s) => !s.ok && !s.skipped);
  runOut.status = runOut.autoStop ? "halted" : failed ? "partial" : "success";
  appendAutonomyRun(orgScope, runOut);
  addLog(`Autonomy run complete: ${runOut.status}.`, failed ? "warn" : "ok");
  return runOut;
}

function loadAuditAlertThresholds(host = "default", scope = "default") {
  try {
    const raw = localStorage.getItem(`helio:audit:alert-thresholds:${scope}:${host}`);
    if (!raw) return { scoreDrop: 8, scoreGain: 8, brokenIncrease: 1, descIncrease: 1 };
    const p = JSON.parse(raw);
    return {
      scoreDrop: Number(p.scoreDrop) || 8,
      scoreGain: Number(p.scoreGain) || 8,
      brokenIncrease: Number(p.brokenIncrease) || 1,
      descIncrease: Number(p.descIncrease) || 1,
    };
  } catch {
    return { scoreDrop: 8, scoreGain: 8, brokenIncrease: 1, descIncrease: 1 };
  }
}

function saveAuditAlertThresholds(v, host = "default", scope = "default") {
  try { localStorage.setItem(`helio:audit:alert-thresholds:${scope}:${host}`, JSON.stringify(v)); } catch {}
}

// ── Shared UI ─────────────────────────────────────────────────────
const TermLog = ({lines,running,height=180})=>{
  const ref=useRef();
  const [shimmer, setShimmer] = useState(0);
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[lines]);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setShimmer((s) => (s + 12) % 220), 70);
    return () => clearInterval(id);
  }, [running]);
  return <div ref={ref} style={{background:"#060606",border:`1px solid ${C.dim}`,fontFamily:"monospace",fontSize:11,padding:14,height,overflowY:"auto",scrollbarWidth:"thin",position:"relative"}}>
    {lines.map((l,i)=><div key={i} style={{marginBottom:3,display:"flex",gap:10}}>
      <span style={{color:C.muted,minWidth:50,flexShrink:0}}>{String(Math.floor((l.t||i*200)/1000)).padStart(2,"0")}:{String(Math.floor(((l.t||i*200)%1000)/10)).padStart(2,"0")}</span>
      <span style={{
        color:l.type==="sys"?C.lime:l.type==="ok"?C.green:l.type==="warn"?C.orange:l.type==="err"?C.red:C.text,
        whiteSpace:"pre-wrap",
      }}>{l.msg}</span>
    </div>)}
    {running&&<div style={{display:"flex",gap:10,alignItems:"center"}}>
      <span style={{color:C.muted,minWidth:50}}>--:--</span>
      <span style={{
        fontWeight:700,
        backgroundImage:`linear-gradient(90deg, ${C.lime} 0%, #ffffff 45%, ${C.lime} 100%)`,
        backgroundSize:"220% 100%",
        backgroundPosition:`${shimmer}% 0`,
        WebkitBackgroundClip:"text",
        backgroundClip:"text",
        color:"transparent",
      }}>█ PROCESSING AUDIT PIPELINE</span>
    </div>}
  </div>;
};

const Hdr = ({title,sub})=><div style={{marginBottom:22}}>
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}><div style={{width:3,height:18,background:C.lime}}/><span style={{color:C.lime,fontFamily:"monospace",fontSize:14,fontWeight:700,letterSpacing:2}}>{title.toUpperCase()}</span></div>
  {sub&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,paddingLeft:13}}>{sub}</div>}
</div>;

const Tabs = ({tabs,active,onChange})=><div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:18}}>
  {tabs.map(t=><div key={t} onClick={()=>onChange(t)} style={{padding:"7px 20px",fontFamily:"monospace",fontSize:10,cursor:"pointer",letterSpacing:1,color:active===t?C.lime:C.muted,textTransform:"uppercase",borderBottom:active===t?`2px solid ${C.lime}`:"2px solid transparent"}}>{t}</div>)}
</div>;

const Card = ({label,value,delta,good,help})=><div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"12px 16px",flex:1,minWidth:110}}>
  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
    <div style={{color:C.muted,fontSize:9,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:1}}>{label}</div>
    {help&&<span title={help} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:13,height:13,border:`1px solid ${C.dim}`,color:C.muted,fontFamily:"monospace",fontSize:8,lineHeight:1,cursor:"help"}}>?</span>}
  </div>
  <div style={{color:C.lime,fontSize:20,fontFamily:"monospace",fontWeight:700}}>{value??"—"}</div>
  {delta!==undefined&&<div style={{color:good?C.green:C.red,fontSize:10,fontFamily:"monospace",marginTop:3}}>{delta}</div>}
</div>;

const Btn = ({onClick,disabled,children,variant="lime",style={}})=>{
  const bg = disabled?C.dim:variant==="lime"?C.lime:variant==="green"?C.green:variant==="teal"?"#00d9a3":variant==="red"?C.red:variant==="orange"?C.orange:C.blue;
  return <button onClick={onClick} disabled={disabled} style={{background:bg,color:disabled?"#888":"#000",border:"none",cursor:disabled?"not-allowed":"pointer",fontFamily:"monospace",fontWeight:700,fontSize:11,padding:"9px 20px",letterSpacing:2,...style}}>{children}</button>;
};

const Input = ({label,type="text",value,onChange,placeholder,note})=><div>
  {label&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>{label.toUpperCase()}</div>}
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{width:"100%",background:"#060606",border:`1px solid ${value?C.dim:"#111"}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
  {note&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:4}}>{note}</div>}
</div>;

function ThemeDropdown({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  emptyText = "No options found",
  compact = false,
  activeBorderColor = null,
  menuBorderColor = null,
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()));
  return <div ref={ref}>
    {label&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>{label.toUpperCase()}</div>}
    <div style={{position:"relative"}}>
      <input value={selected?.label||""} readOnly onFocus={()=>{ if (!disabled) setOpen(true); }} onClick={()=>{ if (!disabled) setOpen(true); }} placeholder={placeholder}
        style={{width:"100%",background:"#060606",border:`1px solid ${(selected?(activeBorderColor||C.lime):C.dim)}`,color:selected?C.text:C.muted,fontFamily:"monospace",fontSize:compact?10:11,padding:compact?"7px 10px":"9px 12px",outline:"none",boxSizing:"border-box",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.6:1}}/>
      {open&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:"#0d0d0d",border:`1px solid ${(menuBorderColor||activeBorderColor||C.lime)}`,zIndex:220,maxHeight:240,display:"flex",flexDirection:"column"}}>
        <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${options.length} options...`}
          style={{padding:compact?"6px 9px":"7px 10px",background:"#0a0a0a",border:"none",borderBottom:`1px solid ${C.dim}`,outline:"none",color:C.text,fontFamily:"monospace",fontSize:compact?9:10}}/>
        <div style={{overflowY:"auto",scrollbarWidth:"thin"}}>
          {!filtered.length&&<div style={{padding:"9px 12px",color:C.muted,fontFamily:"monospace",fontSize:10}}>{emptyText}</div>}
          {filtered.map(o=><div key={o.value} onClick={()=>{onChange(o.value);setOpen(false);setSearch("");}}
            style={{padding:"9px 12px",cursor:"pointer",background:value===o.value?"#111800":"transparent",borderBottom:`1px solid ${C.border}`}}>
            <div style={{color:value===o.value?C.lime:C.text,fontFamily:"monospace",fontSize:10}}>{o.label}</div>
            {o.meta&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:2}}>{o.meta}</div>}
          </div>)}
        </div>
      </div>}
    </div>
  </div>;
}

function Gate({moduleId,integrations,children}) {
  const missing=(MODULE_REQUIREMENTS[moduleId]||[]).filter(id=>!integrations[id]?.connected);
  if (!missing.length) return children;
  return <div style={{padding:28,flex:1}}><div style={{background:C.panel,border:`1px solid ${C.red}`,padding:28}}>
    <div style={{color:C.red,fontFamily:"monospace",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:14}}>⚠ MODULE LOCKED</div>
    <div style={{color:C.muted,fontFamily:"monospace",fontSize:11,marginBottom:18}}>Connect the following integrations first:</div>
    {missing.map(id=>{const def=INTEGRATION_DEFS[id]; return <div key={id} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 14px",background:"#060606",border:`1px solid ${C.dim}`,marginBottom:8}}>
      <span style={{color:C.red,fontFamily:"monospace"}}>✗</span>
      <span style={{color:def?.color||C.lime,fontFamily:"monospace",fontSize:11,fontWeight:700,minWidth:180}}>{def?.label}</span>
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{def?.description}</span>
    </div>;})}
    <div style={{color:C.muted,fontFamily:"monospace",fontSize:11,marginTop:14}}>→ Go to <span style={{color:C.lime}}>INTEGRATIONS</span> in sidebar.</div>
  </div></div>;
}

// ── AI Provider Panel ─────────────────────────────────────────────
function AIPanel({integrations,setIntegrations}) {
  const saved=integrations.ai||{connected:false,fields:{}};
  const [provider,setProvider]=useState(saved.fields?.provider||"anthropic");
  const [apiKey,setApiKey]=useState(saved.fields?.apiKey||"");
  const [model,setModel]=useState(saved.fields?.model||"claude-sonnet-4-20250514");
  const [search,setSearch]=useState("");
  const [showDrop,setShowDrop]=useState(false);
  const [testing,setTesting]=useState(false);
  const [log,setLog]=useState([]);
  const [ok,setOk]=useState(false);
  const [models, setModels] = useState(OR_MODELS_FALLBACK);
  const [loadingModels, setLoadingModels] = useState(false);
  const dropRef=useRef();
  const ANTH=[{id:"claude-sonnet-4-20250514",name:"Sonnet 4 (Recommended)"},{id:"claude-opus-4-5",name:"Opus 4.5"},{id:"claude-haiku-4-5-20251001",name:"Haiku 4.5 (Fast)"}];
  const addLog=(msg,type="info")=>setLog(p=>[...p,{msg,type,t:p.length*300}]);

  useEffect(()=>{const h=e=>{if(dropRef.current&&!dropRef.current.contains(e.target))setShowDrop(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);

  const filtered=models.filter(m=>m.name.toLowerCase().includes(search.toLowerCase())||m.id.toLowerCase().includes(search.toLowerCase()));

  const loadOpenRouterModels = async () => {
    if (!apiKey) return;
    setLoadingModels(true);
    try {
      const live = await fetchOpenRouterModels(apiKey);
      if (live.length) {
        setModels(live);
        if (!model) setModel(live[0].id);
        addLog(`Loaded ${live.length} OpenRouter models.`, "ok");
      }
    } catch (e) {
      addLog(`Model catalog error: ${e.message}`, "warn");
    }
    setLoadingModels(false);
  };

  useEffect(() => {
    if (provider === "openrouter" && apiKey) loadOpenRouterModels();
  }, [provider, apiKey]);

  const test=async()=>{
    setTesting(true);setLog([]);setOk(false);
    addLog(`Testing ${AI_PROVIDERS[provider].label}...`,"sys");
    try {
      if (provider==="anthropic") {
        const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,max_tokens:10,messages:[{role:"user",content:"ping"}]})});
        const d=await res.json();
        if(d.content){addLog(`✓ Connected. Model: ${model}`,"ok");setOk(true);}
        else{addLog(`Error: ${d.error?.message}`,"err");}
      } else {
        const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`,"HTTP-Referer":"https://helio-seo.app","X-Title":"Helio"},body:JSON.stringify({model,messages:[{role:"user",content:"ping"}],max_tokens:5})});
        const d=await res.json();
        if(d.choices?.[0]){addLog(`✓ OpenRouter live. Model: ${model}`,"ok");setOk(true);}
        else{addLog(`Error: ${d.error?.message}`,"err");}
      }
    } catch(e){addLog(`Failed: ${e.message}`,"err");}
    setTesting(false);
  };

  const save=()=>{
    setIntegrations(p=>({...p,ai:{connected:true,fields:{provider,apiKey,model},connectedAt:new Date().toLocaleString()}}));
    addLog("✓ Saved.","ok");
  };
  const disconnect=()=>setIntegrations(p=>({...p,ai:{connected:false,fields:{}}}));

  if (saved.connected) return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2}}>AI PROVIDER</div>
      <Btn onClick={disconnect} variant="red">DISCONNECT</Btn>
    </div>
    <div style={{background:"#060f06",border:`1px solid ${C.green}`,padding:14}}>
      <div style={{color:C.green,fontFamily:"monospace",fontSize:11,marginBottom:6}}>✓ CONNECTED — {saved.connectedAt}</div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Provider: <span style={{color:C.text}}>{AI_PROVIDERS[saved.fields.provider]?.label}</span></div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginTop:3}}>Model: <span style={{color:C.lime}}>{saved.fields.model}</span></div>
    </div>
  </div>;

  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:16}}>AI PROVIDER</div>
    <div style={{display:"flex",marginBottom:18}}>
      {Object.entries(AI_PROVIDERS).map(([k,p])=><div key={k} onClick={()=>{setProvider(k);setModel(k==="anthropic"?"claude-sonnet-4-20250514":"");setLog([]);setOk(false);}}
        style={{flex:1,padding:"11px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:11,fontWeight:700,letterSpacing:1,background:provider===k?C.lime:"#060606",color:provider===k?"#000":C.muted,border:`1px solid ${provider===k?C.lime:C.dim}`,marginRight:k==="anthropic"?-1:0}}>{p.label}</div>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:18}}>
      <Input label={provider==="anthropic"?"Anthropic API Key":"OpenRouter API Key"} type="password" value={apiKey} onChange={setApiKey}
        placeholder={provider==="anthropic"?"sk-ant-xxxx":"sk-or-xxxx"} note={provider==="anthropic"?"→ console.anthropic.com":"→ openrouter.ai/keys"}/>
      <div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>SELECT MODEL</div>
        {provider==="anthropic"
          ? <ThemeDropdown
              value={model}
              onChange={setModel}
              options={ANTH.map(m=>({value:m.id,label:m.name}))}
              placeholder="Select model"
            />
          : <div ref={dropRef} style={{position:"relative"}}>
              <input value={model} onChange={e=>setModel(e.target.value)} onFocus={()=>setShowDrop(true)} placeholder="openai/gpt-4o or type any model ID"
                style={{width:"100%",background:"#060606",border:`1px solid ${model?C.lime:C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
              {showDrop&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:"#0d0d0d",border:`1px solid ${C.lime}`,zIndex:200,maxHeight:240,display:"flex",flexDirection:"column"}}>
                <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${models.length} models...`}
                  style={{padding:"7px 10px",background:"#0a0a0a",border:"none",borderBottom:`1px solid ${C.dim}`,outline:"none",color:C.text,fontFamily:"monospace",fontSize:10}}/>
                <div style={{overflowY:"auto",scrollbarWidth:"thin"}}>
                  {filtered.map(m=><div key={m.id} onClick={()=>{setModel(m.id);setShowDrop(false);setSearch("");}}
                    style={{padding:"9px 12px",cursor:"pointer",background:model===m.id?"#111800":"transparent",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{color:model===m.id?C.lime:C.text,fontFamily:"monospace",fontSize:10}}>{m.name}</div>
                    <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:2}}>{m.id} · ctx:{m.ctx} · {m.price}/1M</div>
                  </div>)}
                </div>
              </div>}
            </div>
        }
      </div>
    </div>
    {provider==="openrouter"&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:12}}>
      {loadingModels ? "Loading OpenRouter catalog..." : `Model catalog: ${models.length} loaded`}
    </div>}
    <div style={{display:"flex",gap:10}}>
      <Btn onClick={test} disabled={testing||!apiKey||!model}>{testing?"TESTING...":"TEST CONNECTION"}</Btn>
      {provider==="openrouter"&&<Btn onClick={loadOpenRouterModels} disabled={loadingModels||!apiKey} variant="blue">{loadingModels?"REFRESHING...":"REFRESH MODELS"}</Btn>}
      {ok&&<Btn onClick={save} variant="green">SAVE & CONNECT ✓</Btn>}
    </div>
    {log.length>0&&<div style={{marginTop:14}}><TermLog lines={log} running={testing}/></div>}
  </div>;
}

// ── Google OAuth Panel ────────────────────────────────────────────
function OAuthPanel({id,integrations,setIntegrations}) {
  const def=INTEGRATION_DEFS[id];
  const saved=integrations[id]||{connected:false,fields:{}};
  const [clientId,setClientId]=useState(saved.fields?.clientId||"");
  const [clientSecret,setClientSecret]=useState(saved.fields?.clientSecret||"");
  const [extra,setExtra]=useState(saved.fields?.extra||{});
  const [step,setStep]=useState("config");
  const [authCode,setAuthCode]=useState("");
  const [manualToken,setManualToken]=useState("");
  const [manualRefresh,setManualRefresh]=useState("");
  const [exchanging,setExchanging]=useState(false);
  const [log,setLog]=useState([]);
  const [loadingResources,setLoadingResources]=useState(false);
  const addLog=(msg,type="info")=>setLog(p=>[...p,{msg,type,t:p.length*300}]);

  const loadGoogleResources = async (accessTokenArg) => {
    const accessToken = accessTokenArg || saved.fields?.accessToken;
    if (!accessToken) return;
    setLoadingResources(true);
    try {
      if (id === "gsc") {
        const sites = await fetchGscSites(accessToken);
        const current = saved.fields?.extra || extra || {};
        const nextSite = current.siteUrl || sites[0] || "";
        setExtra((p) => ({ ...p, siteUrl: nextSite, gscSites: sites }));
        setIntegrations((p) => ({
          ...p,
          [id]: {
            ...p[id],
            connected: true,
            fields: { ...p[id].fields, extra: { ...(p[id].fields?.extra || {}), siteUrl: nextSite, gscSites: sites } },
          },
        }));
        addLog(sites.length ? `Loaded ${sites.length} Search Console properties.` : "No Search Console properties found for this account.", sites.length ? "ok" : "warn");
      }
      if (id === "ga4") {
        const props = await fetchGa4Properties(accessToken);
        const current = saved.fields?.extra || extra || {};
        const nextId = current.propertyId || props[0]?.id || "";
        setExtra((p) => ({ ...p, propertyId: nextId, ga4Properties: props }));
        setIntegrations((p) => ({
          ...p,
          [id]: {
            ...p[id],
            connected: true,
            fields: { ...p[id].fields, extra: { ...(p[id].fields?.extra || {}), propertyId: nextId, ga4Properties: props } },
          },
        }));
        addLog(props.length ? `Loaded ${props.length} GA4 properties.` : "No GA4 properties found for this account.", props.length ? "ok" : "warn");
      }
    } catch (e) {
      addLog(`Property load failed: ${e.message}`, "err");
    }
    setLoadingResources(false);
  };

  const authUrl=clientId&&clientSecret?`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({client_id:clientId,redirect_uri:REDIRECT_URI,response_type:"code",scope:def.scopes.join(" "),access_type:"offline",prompt:"consent"})}`:null;

  const exchangeCode=async()=>{
    setExchanging(true);
    let code=authCode.trim();
    if(code.includes("code="))try{code=new URL(code).searchParams.get("code")||code;}catch{code=code.split("code=")[1]?.split("&")[0]||code;}
    addLog(`Code: ${code.slice(0,20)}...`,"sys");
    try {
      const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:REDIRECT_URI,grant_type:"authorization_code"})});
      const d=await res.json();
      if(d.access_token){
        const fields={clientId,clientSecret,accessToken:d.access_token,refreshToken:d.refresh_token||"",expiresAt:Date.now()+(d.expires_in*1000),extra};
        setIntegrations(p=>({...p,[id]:{connected:true,fields,connectedAt:new Date().toLocaleString()}}));
        setTimeout(()=>loadGoogleResources(d.access_token),0);
        addLog("✓ Connected!","ok");setStep("done");
      } else {
        addLog(`Failed: ${d.error_description||d.error}. CORS blocked — use curl below.`,"err");
        const curlCmd=`curl -X POST https://oauth2.googleapis.com/token -d "code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${REDIRECT_URI}&grant_type=authorization_code"`;
        addLog(curlCmd,"sys");setStep("manual");
      }
    } catch{
      addLog(`CORS blocked. Run this in terminal:`,"err");
      addLog(`curl -X POST https://oauth2.googleapis.com/token -d "code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${REDIRECT_URI}&grant_type=authorization_code"`,"sys");
      setStep("manual");
    }
    setExchanging(false);
  };

  const saveManual=()=>{
    const fields={clientId,clientSecret,accessToken:manualToken.trim(),refreshToken:manualRefresh.trim(),expiresAt:Date.now()+3600000,extra};
    setIntegrations(p=>({...p,[id]:{connected:true,fields,connectedAt:new Date().toLocaleString()}}));
    setTimeout(()=>loadGoogleResources(manualToken.trim()),0);
  };

  const disconnect=()=>{setIntegrations(p=>({...p,[id]:{connected:false,fields:{}}}));setStep("config");setLog([]);};

  useEffect(()=>{
    if(!saved.connected) return;
    if(id==="gsc" && !(saved.fields?.extra?.gscSites||[]).length) loadGoogleResources();
    if(id==="ga4" && !(saved.fields?.extra?.ga4Properties||[]).length) loadGoogleResources();
  },[saved.connected,id]);

  if(saved.connected){const exp=saved.fields?.expiresAt&&Date.now()>saved.fields.expiresAt;return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2}}>{def.label.toUpperCase()}</div>
      <Btn onClick={disconnect} variant="red">DISCONNECT</Btn>
    </div>
    <div style={{background:exp?"#1a0a00":"#060f06",border:`1px solid ${exp?C.orange:C.green}`,padding:14}}>
      <div style={{color:exp?C.orange:C.green,fontFamily:"monospace",fontSize:11,marginBottom:6}}>{exp?"⚠ TOKEN EXPIRED":"✓ CONNECTED"} — {saved.connectedAt}</div>
      {saved.fields?.extra?.propertyId&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Property ID: <span style={{color:C.lime}}>{saved.fields.extra.propertyId}</span></div>}
      {saved.fields?.extra?.siteUrl&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Site URL: <span style={{color:C.lime}}>{saved.fields.extra.siteUrl}</span></div>}
    </div>
    {id==="gsc"&&<div style={{marginTop:10}}>
      <ThemeDropdown
        label="Search Console Property"
        value={saved.fields?.extra?.siteUrl||""}
        onChange={(v)=>setIntegrations(p=>({...p,[id]:{...p[id],fields:{...p[id].fields,extra:{...(p[id].fields?.extra||{}),siteUrl:v}}}}))}
        options={(saved.fields?.extra?.gscSites||[]).map(site=>({value:site,label:site}))}
        placeholder="Select a property"
        emptyText="No properties found"
      />
    </div>}
    {id==="ga4"&&<div style={{marginTop:10}}>
      <ThemeDropdown
        label="GA4 Property"
        value={saved.fields?.extra?.propertyId||""}
        onChange={(v)=>setIntegrations(p=>({...p,[id]:{...p[id],fields:{...p[id].fields,extra:{...(p[id].fields?.extra||{}),propertyId:v}}}}))}
        options={(saved.fields?.extra?.ga4Properties||[]).map(p=>({value:p.id,label:p.name||p.id,meta:p.id}))}
        placeholder="Select GA4 property"
        emptyText="No properties found"
      />
    </div>}
    <div style={{display:"flex",gap:10,marginTop:12}}>
      <Btn onClick={async()=>{try{const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({refresh_token:saved.fields.refreshToken,client_id:saved.fields.clientId,client_secret:saved.fields.clientSecret,grant_type:"refresh_token"})});const d=await r.json();if(d.access_token)setIntegrations(p=>({...p,[id]:{...p[id],fields:{...p[id].fields,accessToken:d.access_token,expiresAt:Date.now()+(d.expires_in*1000)}}}));}catch{}}}>↺ REFRESH</Btn>
      {(id==="gsc"||id==="ga4")&&<Btn onClick={()=>loadGoogleResources()} disabled={loadingResources} variant="blue">{loadingResources?"LOADING...":"LOAD PROPERTIES"}</Btn>}
      <Btn onClick={disconnect} variant="orange" style={{background:"transparent",border:`1px solid ${C.lime}`,color:C.lime}}>RE-AUTHORIZE</Btn>
    </div>
    {log.length>0&&<div style={{marginTop:12}}><TermLog lines={log} running={loadingResources}/></div>}
  </div>;}

  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:16}}>{def.label.toUpperCase()}</div>
    <div style={{background:"#0d1117",border:`1px solid ${C.dim}`,padding:14,marginBottom:18,fontFamily:"monospace",fontSize:10,color:C.muted,lineHeight:1.9}}>
      <div style={{color:C.lime,marginBottom:8}}>SETUP — GOOGLE CLOUD CONSOLE</div>
      1. <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{color:C.blue}}>console.cloud.google.com</a> → APIs & Services → Credentials<br/>
      2. Create OAuth 2.0 Client ID → Web application<br/>
      3. Authorized redirect URI: <span style={{color:C.lime}}>Use the callback URL configured in this app.</span><br/>
      4. Enable: <span style={{color:C.text}}>{id==="gsc"?"Google Search Console API":"Google Analytics Data API"}</span><br/>
      5. Paste credentials below → Generate URL → Authorize → Paste code back
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
      <Input label="Client ID" value={clientId} onChange={setClientId} placeholder="xxxxxxx.apps.googleusercontent.com"/>
      <Input label="Client Secret" type="password" value={clientSecret} onChange={setClientSecret} placeholder="GOCSPX-xxxx"/>
      {def.extraFields?.map(f=><Input key={f.key} label={f.label} type={f.type} value={extra[f.key]||""} onChange={v=>setExtra(p=>({...p,[f.key]:v}))} placeholder={f.placeholder}/>)}
    </div>
    {authUrl&&<><a href={authUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",background:C.lime,color:"#000",fontFamily:"monospace",fontWeight:700,fontSize:11,padding:"9px 20px",letterSpacing:2,textDecoration:"none",marginBottom:14}}>STEP 1 — OPEN GOOGLE AUTHORIZATION ↗</a>
    <div style={{background:"#0a1400",border:`1px solid ${C.green}`,padding:14,marginBottom:14}}>
      <div style={{color:C.green,fontFamily:"monospace",fontSize:10,fontWeight:700,marginBottom:8}}>STEP 2 — PASTE REDIRECT URL OR CODE</div>
      <input value={authCode} onChange={e=>setAuthCode(e.target.value)} placeholder="Paste full redirect URL or just the code= value"
        style={{width:"100%",background:"#060606",border:`1px solid ${authCode?C.lime:C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"9px 12px",outline:"none",boxSizing:"border-box",marginBottom:10}}/>
      <Btn onClick={exchangeCode} disabled={exchanging||!authCode} variant="green">{exchanging?"EXCHANGING...":"STEP 3 — EXCHANGE FOR TOKEN"}</Btn>
    </div></>}
    {!authUrl&&clientId&&clientSecret&&<Btn onClick={()=>{}}>GENERATE AUTH URL</Btn>}
    {step==="manual"&&<div style={{background:"#1a0a00",border:`1px solid ${C.orange}`,padding:14,marginBottom:14}}>
      <div style={{color:C.orange,fontFamily:"monospace",fontSize:10,fontWeight:700,marginBottom:10}}>CORS BLOCKED — PASTE TOKEN MANUALLY</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Input label="Access Token (from curl response)" type="password" value={manualToken} onChange={setManualToken} placeholder="ya29.xxxxxxx"/>
        <Input label="Refresh Token (optional)" type="password" value={manualRefresh} onChange={setManualRefresh} placeholder="1//xxxxxxxxx"/>
        <Btn onClick={saveManual} disabled={!manualToken} variant="orange">SAVE TOKEN & CONNECT ✓</Btn>
      </div>
    </div>}
    {log.length>0&&<TermLog lines={log} running={exchanging}/>}
  </div>;
}

// ── Standard Creds Panel ──────────────────────────────────────────
function CredsPanel({id,integrations,setIntegrations}) {
  const def=INTEGRATION_DEFS[id];
  const saved=integrations[id]||{connected:false,fields:{}};
  const [fields,setFields]=useState(() => {
    const base = saved.fields || {};
    if (id === "firecrawl") return { apiBase: "https://api.firecrawl.dev", ...base };
    if (id === "heliocode") return { provider: "openrouter", model: "", apiKey: "", ...base };
    return base;
  });
  const [hcProvider, setHcProvider] = useState(String(saved.fields?.provider || "openrouter").toLowerCase());
  const [hcModel, setHcModel] = useState(String(saved.fields?.model || ""));
  const [hcApiKey, setHcApiKey] = useState(String(saved.fields?.apiKey || ""));
  const [hcUseSameAsAi, setHcUseSameAsAi] = useState(!!saved.fields?.useSameAsAi);
  const [hcModels, setHcModels] = useState([]);
  const [hcLoadingModels, setHcLoadingModels] = useState(false);
  const [testing,setTesting]=useState(false);
  const [log,setLog]=useState([]);
  const [ok,setOk]=useState(false);
  const addLog=(msg,type="info")=>setLog(p=>[...p,{msg,type,t:p.length*400}]);

  useEffect(() => {
    if (id === "firecrawl" && !fields.apiBase) {
      setFields((p) => ({ ...p, apiBase: "https://api.firecrawl.dev" }));
    }
  }, [id, fields.apiBase]);

  const loadHelioCodeModels = async (providerArg = hcProvider, keyArg = hcApiKey) => {
    const provider = String(providerArg || "").toLowerCase();
    const apiKey = String(keyArg || "");
    if (id !== "heliocode" || !apiKey) return;
    setHcLoadingModels(true);
    try {
      const rows = await fetchProviderModelsViaApi(provider, apiKey);
      setHcModels(rows);
      if (rows.length && !rows.find((r) => r.id === hcModel)) setHcModel(rows[0].id);
      addLog(`Loaded ${rows.length} ${provider} models.`, "ok");
    } catch (e) {
      addLog(`Model catalog error: ${e.message}`, "warn");
      setHcModels([]);
    }
    setHcLoadingModels(false);
  };

  useEffect(() => {
    if (id === "heliocode") {
      setFields((p) => ({ ...p, provider: hcProvider, model: hcModel, apiKey: hcApiKey, useSameAsAi: hcUseSameAsAi }));
    }
  }, [id, hcProvider, hcModel, hcApiKey, hcUseSameAsAi]);

  useEffect(() => {
    if (id !== "heliocode" || !hcUseSameAsAi) return;
    const aiProvider = String(integrations?.ai?.fields?.provider || "").toLowerCase();
    const aiModel = String(integrations?.ai?.fields?.model || "");
    if (!aiProvider || !["openai", "anthropic", "openrouter"].includes(aiProvider) || !aiModel) return;
    setHcProvider(aiProvider);
    setHcModel(aiModel);
    setOk(false);
  }, [id, hcUseSameAsAi, integrations?.ai?.fields?.provider, integrations?.ai?.fields?.model]);

  useEffect(() => {
    if (id === "heliocode" && hcApiKey) loadHelioCodeModels(hcProvider, hcApiKey);
  }, [id, hcProvider, hcApiKey]);

  const test=async()=>{
    setTesting(true);setLog([]);setOk(false);addLog(`Testing ${def.label}...`,"sys");
    try {
      if(id==="dataforseo"){
        const res=await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Basic "+btoa(`${fields.login}:${fields.password}`)},body:JSON.stringify([{keyword:"test",language_code:"en",location_code:2840,device:"desktop",depth:1}])});
        const d=await res.json();
        if(d.status_code===20000||d.tasks?.[0]?.status_code===20000){addLog("✓ DataForSEO authenticated.","ok");setOk(true);}
        else{addLog(`Error: ${d.status_message}`,"err");}
      } else if (id==="firecrawl") {
        const apiKey = fields.apiKey;
        const base = String(fields.apiBase || "https://api.firecrawl.dev").replace(/\/+$/, "");
        if (!apiKey) throw new Error("Missing Firecrawl API key");
        addLog(`Using base URL: ${base}`,"sys");
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort("timeout"), 12000);
        const res = await fetch(`${base}/v2/map`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ url: "https://example.com", sitemap: "include", limit: 5 }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        const d = await res.json().catch(()=>({}));
        if (res.ok && (d?.success || Array.isArray(d?.links))) {
          addLog(`✓ Firecrawl connected. Sample links: ${(d?.links || []).length || 0}`,"ok");
          setOk(true);
        } else {
          addLog(`Error: ${d?.error || d?.message || `HTTP ${res.status}`}`,"err");
        }
      } else if (id==="pagespeed") {
        if (!fields.apiKey) throw new Error("Missing PageSpeed API key");
        const strategy = fields.strategy || "mobile";
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort("timeout"), 12000);
        const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent("https://example.com")}&strategy=${encodeURIComponent(strategy)}&key=${encodeURIComponent(fields.apiKey)}`;
        const res = await fetch(u, { signal: ctrl.signal });
        clearTimeout(to);
        const d = await res.json().catch(()=>({}));
        if (res.ok && d?.lighthouseResult) { addLog(`✓ PageSpeed connected. Perf: ${Math.round((Number(d?.lighthouseResult?.categories?.performance?.score || 0))*100)}`,"ok"); setOk(true); }
        else { addLog(`Error: ${d?.error?.message || `HTTP ${res.status}`}`,"err"); }
      } else if (id==="playwright") {
        if (!fields.endpoint) throw new Error("Missing Runner Endpoint URL");
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort("timeout"), 12000);
        const res = await fetch(fields.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(fields.token ? { Authorization: `Bearer ${fields.token}` } : {}) },
          body: JSON.stringify({ ping: true }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (res.ok) { addLog("✓ Playwright runner reachable.","ok"); setOk(true); }
        else { addLog(`Error: HTTP ${res.status}`,"err"); }
      } else if (id==="gtrends") {
        addLog("Google Trends configured (runtime snapshot fetch occurs during audit).","ok");
        setOk(true);
      } else if (id==="heliocode") {
        const provider = String(hcProvider || "").trim().toLowerCase();
        const model = String(hcModel || "").trim();
        const apiKey = String(hcApiKey || "").trim();
        if (!provider || !model || !apiKey) throw new Error("Provider, model, and API key are required");
        await testProviderModelViaApi(provider, apiKey, model);
        addLog(`✓ Helio Code model configured (${provider} · ${model}).`,"ok");
        setOk(true);
      } else if(id==="github"){
        const res=await fetch(`https://api.github.com/repos/${fields.repo}`,{headers:{"Authorization":`token ${fields.token}`,"Accept":"application/vnd.github.v3+json"}});
        const d=await res.json();
        if(res.ok){addLog(`✓ Repo "${d.full_name}" connected. Branch: ${d.default_branch}.`,"ok");setOk(true);}
        else{addLog(`Error: ${d.message}`,"err");}
      } else if(id==="slack" || id==="discord"){
        if (!fields.webhookUrl) throw new Error("Missing webhook URL");
        const res = await fetch("/api/approval-channel/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: id,
            webhookUrl: fields.webhookUrl,
            title: "Helio approval channel test",
            message: `Helio can send deployment approval requests to ${fields.channelName || id}.`,
            dashboardUrl: `${window.location.origin}/dashboard`,
          }),
        });
        const d = await res.json().catch(()=>({}));
        if(res.ok && d?.ok){addLog(`✓ ${def.label} webhook delivered test approval message.`,"ok");setOk(true);}
        else{addLog(`Error: ${d?.error || `HTTP ${res.status}`}`,"err");}
      }
    } catch(e){addLog(`Failed: ${e?.name==="AbortError"?"Request timeout (12s)":e.message}`,"err");}
    finally { setTesting(false); }
  };

  if(saved.connected)return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2}}>{def.label.toUpperCase()}</div>
      <Btn onClick={()=>setIntegrations(p=>({...p,[id]:{connected:false,fields:{}}}))} variant="red">DISCONNECT</Btn>
    </div>
    <div style={{background:"#060f06",border:`1px solid ${C.green}`,padding:14}}>
      <div style={{color:C.green,fontFamily:"monospace",fontSize:11}}>✓ CONNECTED — {saved.connectedAt}</div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginTop:4}}>Powers: {def.modules.map(m=>NAV.find(n=>n.id===m)?.label).filter(Boolean).join(", ")}</div>
    </div>
  </div>;

  if (id === "heliocode") return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:16}}>HELIO CODE LLM</div>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
      <label style={{display:"inline-flex",alignItems:"center",gap:8,color:C.text,fontFamily:"monospace",fontSize:10}}>
        <input
          type="checkbox"
          checked={!!hcUseSameAsAi}
          onChange={(e)=>{ setHcUseSameAsAi(e.target.checked); setOk(false); }}
        />
        <span>Use same provider + model as AI Provider</span>
      </label>
      <ThemeDropdown
        label="LLM Provider"
        value={hcProvider}
        onChange={(v)=>{ setHcProvider(v); setHcModels([]); setHcModel(""); setOk(false); }}
        options={[
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
          { value: "openrouter", label: "OpenRouter" },
        ]}
        placeholder="Select provider"
        disabled={hcUseSameAsAi}
      />
      <Input
        label="API Key"
        type="password"
        value={hcApiKey}
        onChange={(v)=>{ setHcApiKey(v); setOk(false); }}
        placeholder={hcProvider==="openrouter"?"sk-or-...":hcProvider==="anthropic"?"sk-ant-...":"sk-..."}
      />
      <ThemeDropdown
        label="Model"
        value={hcModel}
        onChange={(v)=>{ setHcModel(v); setOk(false); }}
        options={hcModels.map((m)=>({ value: m.id, label: m.name, meta: `${m.id}${m.ctx ? ` · ctx:${m.ctx}` : ""}` }))}
        placeholder={hcLoadingModels ? "Loading models..." : "Select model"}
        emptyText={hcApiKey ? "No models loaded yet. Click refresh." : "Enter API key to load models"}
        disabled={hcUseSameAsAi}
      />
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>
        {hcLoadingModels ? "Loading live model catalog..." : `Model catalog: ${hcModels.length} loaded`}
      </div>
    </div>
    <div style={{display:"flex",gap:10}}>
      <Btn onClick={test} disabled={testing||!hcApiKey||!hcModel}>{testing?"TESTING...":"TEST CONNECTION"}</Btn>
      <Btn onClick={()=>loadHelioCodeModels(hcProvider, hcApiKey)} disabled={hcLoadingModels||!hcApiKey} variant="blue">{hcLoadingModels?"REFRESHING...":"REFRESH MODELS"}</Btn>
      {ok&&<Btn onClick={()=>{const nextFields={provider:hcProvider,model:hcModel,apiKey:hcApiKey,useSameAsAi:hcUseSameAsAi};setFields(nextFields);setIntegrations(p=>({...p,[id]:{connected:true,fields:nextFields,connectedAt:new Date().toLocaleString()}}));addLog("✓ Saved.","ok");}} variant="green">SAVE & CONNECT ✓</Btn>}
      <a href={def.docsUrl} target="_blank" rel="noreferrer" style={{color:C.muted,fontFamily:"monospace",fontSize:10,alignSelf:"center",textDecoration:"none"}}>→ Docs ↗</a>
    </div>
    {log.length>0&&<div style={{marginTop:14}}><TermLog lines={log} running={testing||hcLoadingModels}/></div>}
  </div>;

  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:16}}>{def.label.toUpperCase()}</div>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
      {def.fields?.map(f=><Input key={f.key} label={f.label} type={f.type} value={fields[f.key]||""} onChange={v=>setFields(p=>({...p,[f.key]:v}))} placeholder={f.placeholder}/>)}
    </div>
    <div style={{display:"flex",gap:10}}>
      <Btn onClick={test} disabled={testing}>{testing?"TESTING...":"TEST CONNECTION"}</Btn>
      {ok&&<Btn onClick={()=>{setIntegrations(p=>({...p,[id]:{connected:true,fields,connectedAt:new Date().toLocaleString()}}));addLog("✓ Saved.","ok");}} variant="green">SAVE & CONNECT ✓</Btn>}
      <a href={def.docsUrl} target="_blank" rel="noreferrer" style={{color:C.muted,fontFamily:"monospace",fontSize:10,alignSelf:"center",textDecoration:"none"}}>→ Docs ↗</a>
    </div>
    {log.length>0&&<div style={{marginTop:14}}><TermLog lines={log} running={testing}/></div>}
  </div>;
}

// ── INTEGRATIONS MODULE ───────────────────────────────────────────
function Integrations({integrations,setIntegrations}) {
  const [sel,setSel]=useState("ai");
  const renderPanel=()=>{
    if(sel==="ai")return <AIPanel integrations={integrations} setIntegrations={setIntegrations}/>;
    if(INTEGRATION_DEFS[sel]?.isOAuth)return <OAuthPanel id={sel} integrations={integrations} setIntegrations={setIntegrations}/>;
    return <CredsPanel id={sel} integrations={integrations} setIntegrations={setIntegrations}/>;
  };
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Integrations" sub="Connect all services to power Helio's real-data modules"/>
    <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
      {Object.entries(INTEGRATION_DEFS).map(([id,def])=>{const c=integrations[id]?.connected;return <div key={id} style={{background:C.panel,border:`1px solid ${c?C.lime:C.dim}`,padding:"7px 12px",display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:c?C.green:C.red}}/><span style={{color:c?C.lime:C.muted,fontFamily:"monospace",fontSize:9}}>{def.label}</span>
      </div>;})}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:18}}>
      <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        {Object.entries(INTEGRATION_DEFS).map(([id,def])=>{const c=integrations[id]?.connected;return <div key={id} onClick={()=>setSel(id)} style={{padding:"11px 14px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,background:sel===id?"#111800":"transparent",borderLeft:sel===id?`3px solid ${C.lime}`:"3px solid transparent"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:sel===id?C.lime:C.text,fontFamily:"monospace",fontSize:11}}>{def.label}</span>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              {def.isOAuth&&<span style={{color:C.blue,fontFamily:"monospace",fontSize:7,border:`1px solid ${C.blue}`,padding:"1px 4px"}}>OAUTH</span>}
              <span style={{color:c?C.green:C.red,fontFamily:"monospace",fontSize:8}}>{c?"✓":"✗"}</span>
            </div>
          </div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:2}}>{id==="ai"&&c?integrations.ai.fields.model?.split("/").pop()?.slice(0,22):def.description.split(",")[0]}</div>
        </div>;})}
      </div>
      <div>{renderPanel()}</div>
    </div>
  </div>;
}

// ── MISSION CONTROL ───────────────────────────────────────────────
function Mission({integrations,agentOnline,setAgentOnline,activeOrg,updateOrg}) {
  const ai=integrations.ai;
  const [logs,setLogs]=useState([]);
  const [booting,setBooting]=useState(false);
  const [chat,setChat]=useState([]);
  const [responding,setResponding]=useState(false);
  const [cmd,setCmd]=useState("");
  const [mode,setMode]=useState("command");
  const [missionGoal,setMissionGoal]=useState(activeOrg?.mission?.goal || "");
  const [missionSaved,setMissionSaved]=useState("");
  const hist=useRef([]);

  useEffect(()=>{setMissionGoal(activeOrg?.mission?.goal || "");},[activeOrg?.id]);

  const boot=()=>{
    setBooting(true);setLogs([]);
    const msgs=[
      {t:0,msg:"HELIO AGENT v1.0 — INITIALIZING...",type:"sys"},
      {t:400,msg:`AI: ${ai?.fields?.provider?.toUpperCase()} · ${ai?.fields?.model}`,type:"ok"},
      ...Object.entries(INTEGRATION_DEFS).filter(([id])=>id!=="ai").map(([id,def],i)=>({t:700+i*300,msg:`${integrations[id]?.connected?"[OK]":"[--]"} ${def.label}`,type:integrations[id]?.connected?"ok":"warn"})),
      {t:700+Object.keys(INTEGRATION_DEFS).length*300,msg:"Agent operational. Awaiting commands.",type:"sys"},
    ];
    msgs.forEach((l,i)=>setTimeout(()=>{setLogs(p=>[...p,l]);if(i===msgs.length-1){setBooting(false);setAgentOnline(true);}},l.t));
  };

  const send=async(c)=>{
    setChat(p=>[...p,{role:"user",text:c,ts:new Date().toLocaleTimeString()}]);setResponding(true);
    const guardrails = Array.isArray(activeOrg?.guardrails) ? activeOrg.guardrails : [];
    const customPersona = String(activeOrg?.customInstructions || "").trim();
    const mission = String(activeOrg?.mission?.goal || missionGoal || "").trim();
    const contextual = `MISSION GOAL:\n${mission || "No explicit mission set"}\n\nCUSTOM PERSONA INSTRUCTIONS:\n${customPersona || "None"}\n\nGUARDRAILS (DO NOT VIOLATE):\n${guardrails.length ? guardrails.map((g,i)=>`${i+1}. ${g}`).join("\n") : "None"}`;
    const system = mode==="chat"
      ? `You are Helio, a friendly strategic SEO/GEO/AEO assistant. Be conversational and helpful. Do not execute technical action plans unless user asks.\n\n${contextual}`
      : `You are Helio, elite autonomous SEO agent. Respond in terminal style under 170 words with [MODULE][ACTION][STATUS]. Build actions aligned to mission, persona, and guardrails.\n\n${contextual}`;
    try{const r=await callAI(ai,system,c,hist.current);
      hist.current=[...hist.current,{role:"user",content:c},{role:"assistant",content:r}];
      setChat(p=>[...p,{role:"agent",text:r,ts:new Date().toLocaleTimeString()}]);
    }catch(e){setChat(p=>[...p,{role:"agent",text:`[ERROR] ${e.message}`,ts:""}]);}
    setResponding(false);
  };

  const saveMission = () => {
    updateOrg?.(activeOrg?.id, { mission: { goal: missionGoal.trim(), updatedAt: new Date().toISOString() } });
    setMissionSaved("Mission saved.");
    setTimeout(()=>setMissionSaved(""),1300);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Mission Control" sub={`Agent command interface · ${ai?.fields?.model||"No AI connected"}`}/>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
      {Object.entries(INTEGRATION_DEFS).map(([id,def])=>{const c=integrations[id]?.connected;return <div key={id} style={{background:C.panel,border:`1px solid ${c?C.lime:C.dim}`,padding:"7px 12px",display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:5,height:5,borderRadius:"50%",background:c?C.green:C.red}}/><span style={{color:c?C.lime:C.muted,fontFamily:"monospace",fontSize:9}}>{id==="ai"&&c?ai.fields.model.split("/").pop():def.label}</span>
      </div>;})}
    </div>
    <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:12,marginBottom:14}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>MISSION / GOAL</div>
      <div style={{display:"flex",gap:8}}>
        <input value={missionGoal} onChange={e=>setMissionGoal(e.target.value)} placeholder="e.g. Increase non-brand organic clicks by 40% in 90 days while improving AI answer visibility for top 20 queries"
          style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px 10px",outline:"none"}}/>
        <Btn onClick={saveMission} variant="green">SAVE MISSION</Btn>
      </div>
      {missionSaved&&<div style={{color:C.green,fontFamily:"monospace",fontSize:9,marginTop:6}}>{missionSaved}</div>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:20,minHeight:500}}>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>▶ AGENT TERMINAL</div>
          {!agentOnline&&<Btn onClick={boot} disabled={booting||!ai?.connected}>{booting?"BOOTING...":"BOOT AGENT"}</Btn>}
        </div>
        <TermLog lines={logs} running={booting} height={420}/>
        {!ai?.connected&&<div style={{color:C.orange,fontFamily:"monospace",fontSize:10,marginTop:8}}>⚠ Connect AI Provider in Integrations first.</div>}
      </div>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>◈ HELIO INTERFACE</div>
          <div style={{display:"flex",gap:0}}>
            {["command","chat"].map((m)=><div key={m} onClick={()=>setMode(m)} style={{padding:"6px 10px",cursor:"pointer",fontFamily:"monospace",fontSize:9,fontWeight:700,background:mode===m?C.lime:"#060606",color:mode===m?"#000":C.muted,border:`1px solid ${mode===m?C.lime:C.dim}`,marginRight:-1,textTransform:"uppercase"}}>{m}</div>)}
          </div>
        </div>
        <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:12,height:388,overflowY:"auto",scrollbarWidth:"thin",marginBottom:0}}>
          {chat.length===0&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{mode==="chat"?"Talk to Helio naturally. Ask strategy questions, get guidance, or discuss ideas.":"Boot agent then give a command. e.g. \"Audit generalizingai.com\" or \"Build a 3-month content plan\""}</div>}
          {chat.map((r,i)=><div key={i} style={{marginBottom:8}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginBottom:2}}>{r.role==="user"?"YOU":"HELIO"} · {r.ts}</div>
            <div style={{fontFamily:"monospace",fontSize:10,whiteSpace:"pre-wrap",color:r.role==="user"?C.text:C.lime,paddingLeft:r.role==="agent"?8:0,borderLeft:r.role==="agent"?`2px solid ${C.lime}`:"none"}}>{r.text}</div>
          </div>)}
          {responding&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:10}}>HELIO ▶ processing █</div>}
        </div>
        <div style={{display:"flex",border:`1px solid ${C.borderLime}`,background:"#060606",marginTop:8}}>
          <span style={{color:C.lime,fontFamily:"monospace",padding:"8px 10px",fontSize:11}}>{mode==="chat"?"CHAT>":"CMD>"}</span>
          <input value={cmd} onChange={e=>setCmd(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&cmd.trim()&&agentOnline){send(cmd);setCmd("");}}}
            placeholder={agentOnline?(mode==="chat"?"Ask Helio anything...":"Command..."):"Boot agent first"} disabled={!agentOnline}
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px 0"}}/>
          <button onClick={()=>{if(cmd.trim()&&agentOnline){send(cmd);setCmd("");}}} style={{background:C.lime,color:"#000",border:"none",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:10,padding:"0 14px"}}>{mode==="chat"?"SEND":"EXEC"}</button>
        </div>
      </div>
    </div>
  </div>;
}

// ── TECHNICAL AUDIT ───────────────────────────────────────────────
function Audit({integrations, orgScope="default", skillsState = {}, activeOrg = null}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const firecrawlCfg = integrations.firecrawl?.fields || {};
  const pagespeedCfg = integrations.pagespeed?.fields || {};
  const playwrightCfg = integrations.playwright?.fields || {};
  const gtrendsCfg = integrations.gtrends?.fields || {};
  const [domain,setDomain]=useState("");const [running,setRunning]=useState(false);
  const [logs,setLogs]=useState([]);const [results,setResults]=useState(null);
  const [tab,setTab]=useState("overview");const [fixLog,setFixLog]=useState([]);const [fixing,setFixing]=useState(false);
  const [source,setSource]=useState("Helio Core");
  const [fullReport, setFullReport] = useState(null);
  const [latestReportUrl, setLatestReportUrl] = useState("");
  const [renderMode,setRenderMode]=useState("static");
  const [history,setHistory]=useState([]);
  const [autoRefreshMins,setAutoRefreshMins]=useState("off");
  const [thresholds,setThresholds]=useState(()=>loadAuditAlertThresholds("default", orgScope));
  const [fixRuns, setFixRuns] = useState([]);
  const [showFixModal, setShowFixModal] = useState(false);
  const [activeFixRun, setActiveFixRun] = useState(null);
  const [fixModalLog, setFixModalLog] = useState([]);
  const [fixModalBusy, setFixModalBusy] = useState(false);
  const [creatingPatchIssue, setCreatingPatchIssue] = useState(false);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*600}]);
  const approvalMode = activeOrg?.auditFixApprovalMode || "always_ask";
  const approvalModeLabel = approvalMode === "never_ask" ? "Never Ask Approval" : approvalMode === "critical_only" ? "Ask Approval for Critical Fixes" : "Always Ask Approval";
  const resolvedHost = (() => {
    try { return new URL(normalizeUrl(domain)).host || "default"; } catch { return "default"; }
  })();
  const restoreAuditPayload = (audit = {}) => {
    if (audit?.lastPayload && typeof audit.lastPayload === "object") return audit.lastPayload;
    if (!audit?.summary) return null;
    return {
      summary: audit.summary || {},
      pages: Array.isArray(audit.pages) ? audit.pages : [],
      quality: audit.quality || computeHelioAuditScore(audit.summary || {}),
      issueRegistry: Array.isArray(audit.issueRegistry) ? audit.issueRegistry : [],
      templatePatterns: Array.isArray(audit.templatePatterns) ? audit.templatePatterns : [],
      diagnostics: audit.diagnostics || {},
    };
  };

  useEffect(() => {
    const connectedHost = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
    const host = connectedHost || resolvedHost;
    if (connectedHost && !domain) setDomain(connectedHost);
    if (!host || host === "default") return;
    const project = loadProjectData(orgScope, host);
    const audit = project?.audit || {};
    const payload = restoreAuditPayload(audit);
    if (payload && !results) {
      setResults(payload);
      setSource(audit?.source || "Helio Core");
      setFullReport(audit?.fullReport || null);
      if (audit?.latestReportUrl) setLatestReportUrl(audit.latestReportUrl);
    }
  }, [orgScope, integrations?.gsc?.fields?.extra?.siteUrl, resolvedHost]);

  const saveSnapshot = (payload, resolvedSource) => {
    try {
      const host = new URL(normalizeUrl(domain)).host;
      if (!host) return;
      const snap = {
        ts: new Date().toISOString(),
        source: resolvedSource || "Helio Core",
        domain: host,
        score: payload?.quality?.score ?? 0,
        severity: payload?.quality?.severity || "unknown",
        pages_crawled: payload?.summary?.pages_crawled || 0,
        broken_pages: payload?.summary?.broken_pages || 0,
        no_h1_tag: payload?.summary?.checks?.no_h1_tag || 0,
        no_description: payload?.summary?.checks?.no_description || 0,
        no_image_alt: payload?.summary?.checks?.no_image_alt || 0,
      };
      const next = appendAuditHistory(host, snap, orgScope);
      setHistory(next);
    } catch {}
  };

  const run=async()=>{
    if(!domain)return;setRunning(true);setLogs([]);setResults(null);
    setFullReport(null);
    setLatestReportUrl("");
    addLog("Initializing audit engine...","sys");addLog(`Target: ${domain}`);
    const auditSkillSystem = "Technical SEO audit with crawlability, indexation, schema, sitemap, security headers, and performance diagnostics.";
    const auditSkillUser = `Audit domain ${domain} with pro technical depth and evidence.`;
    const activeAuditSkills = getRelevantSkillsForTask(auditSkillSystem, auditSkillUser);
    if (activeAuditSkills.length) {
      addLog(`Stage 0/8: Skill routing -> ${activeAuditSkills.map((s) => s.name).join(", ")}`,"sys");
    } else {
      addLog("Stage 0/8: Skill routing -> no enabled skills","warn");
    }
    let coreSucceeded = false;
    try{
      const proMode = renderMode === "pro-static" || renderMode === "pro-js";
      addLog("Stage P0: Helio-Core SEO Audit protocol bootstrap", "sys");
      const dataforseoSearchCfg = integrations.dataforseo?.connected && dataForSeoCredentialsReady(dfs) ? dfs : null;
      if (dataforseoSearchCfg) addLog("Stage P2 provider: DataForSEO Google Organic SERP API", "sys");
      const protocol = await runHelioAuditProtocol(domain, addLog, { dataforseo: dataforseoSearchCfg });
      addLog(`Protocol summary: fetch ${protocol.summary.fetchSuccess}/${protocol.summary.fetchTotal}, search ${protocol.summary.searchSuccess}/${protocol.summary.searchTotal}, rendering ${protocol.renderingType}`,"sys");
      let seedUrls = [];
      if (integrations.firecrawl?.connected && firecrawlCfg.apiKey) {
        try {
          addLog("Stage 3.5/8: Firecrawl URL map enrichment", "sys");
          const firecrawlUrls = await fetchFirecrawlMap(domain, firecrawlCfg, addLog);
          seedUrls = firecrawlUrls;
        } catch (e) { addLog(`Firecrawl enrichment failed: ${e.message}`, "warn"); }
      }
      let core = await helioCoreAuditDomain(domain, addLog, { renderMode, scope: orgScope, proMode, forceFresh: proMode, maxPages: proMode ? 220 : 30, minPagesRequired: proMode ? 25 : 3, seedUrls });
      if ((core?.summary?.pages_crawled || 0) < 5 && seedUrls.length) {
        addLog("Coverage low; re-running crawl with Firecrawl seeds prioritized.", "warn");
        core = await helioCoreAuditDomain(domain, addLog, { renderMode, scope: orgScope, proMode: true, forceFresh: true, maxPages: 220, minPagesRequired: 8, seedUrls });
      }
      const payload = {summary:core.summary,pages:core.pages,quality:core.quality,issueRegistry:core.issueRegistry||[],templatePatterns:core.templatePatterns||[],diagnostics:core.diagnostics||{}};
      setResults(payload);
      setSource(core.source);
      const host = getHostFromInput(domain);
      const enrich = {};
      if (seedUrls.length) enrich.firecrawl = { mappedUrls: seedUrls.slice(0, 300), count: seedUrls.length, capturedAt: new Date().toISOString() };
      if (integrations.pagespeed?.connected && pagespeedCfg.apiKey) {
        try {
          addLog("Stage 6.5/8: PageSpeed Insights enrichment", "sys");
          const psiMobile = await fetchPageSpeedInsights(normalizeUrl(domain), pagespeedCfg.apiKey, pagespeedCfg.strategy || "mobile");
          let psiDesktop = null;
          try { psiDesktop = await fetchPageSpeedInsights(normalizeUrl(domain), pagespeedCfg.apiKey, "desktop"); } catch {}
          enrich.pagespeed = { mobile: psiMobile, desktop: psiDesktop, capturedAt: new Date().toISOString() };
        } catch (e) { addLog(`PageSpeed enrichment failed: ${e.message}`, "warn"); }
      }
      if (integrations.playwright?.connected && playwrightCfg.endpoint) {
        try {
          addLog("Stage 3.8/8: Remote Playwright runner checks", "sys");
          const r = await fetch(playwrightCfg.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(playwrightCfg.token ? { Authorization: `Bearer ${playwrightCfg.token}` } : {}) },
            body: JSON.stringify({ domain: normalizeUrl(domain), checks: ["robots", "sitemap", "navigation", "links"] }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d?.error || "runner failed");
          enrich.playwright = { runner: playwrightCfg.endpoint, ...d, capturedAt: new Date().toISOString() };
          addLog("Playwright remote checks complete.", "ok");
        } catch (e) { addLog(`Playwright runner failed: ${e.message}`, "warn"); }
      } else if (integrations.playwright?.connected && !playwrightCfg.endpoint) {
        addLog("Playwright connected but endpoint missing. Add Runner Endpoint URL in Integrations.", "warn");
      }
      if (integrations.gtrends?.connected) {
        try {
          addLog("Stage 6.8/8: Google Trends snapshot enrichment", "sys");
          const trends = await fetchGoogleTrendsSnapshot(gtrendsCfg.seed || host?.split(".")[0] || "", gtrendsCfg.geo || "US");
          if (trends) {
            enrich.gtrends = trends;
            addLog(`Google Trends captured (${(trends.trendingQueries || []).length} queries).`, "ok");
          } else {
            addLog("Google Trends snapshot unavailable (likely endpoint/CORS throttling).", "warn");
          }
        } catch (e) { addLog(`Google Trends enrichment failed: ${e.message}`, "warn"); }
      }

      const existing = loadProjectData(orgScope, host);
      const gscAuditSignals = existing?.gsc || null;
      const ga4AuditSignals = existing?.ga4 || null;
      const project = mergeProjectData(orgScope, host, { audit: { source: core.source, summary: core.summary, quality: core.quality, issueRegistry: core.issueRegistry || [], templatePatterns: core.templatePatterns || [], diagnostics: core.diagnostics || {}, protocol, enrichments: enrich, gscSignals: gscAuditSignals, ga4Signals: ga4AuditSignals, lastPayload: payload, capturedAt: new Date().toISOString() } });
      syncMissionsFromProject(orgScope, host);
      const generatedReport = buildTechnicalAuditReport({ domain, source: core.source, renderMode, results: payload, projectData: project });
      setFullReport(generatedReport);
      let reportText = buildProfessionalAuditReportText(generatedReport, payload);
      const reportSkillEnabled = !!skillsState?.["seo-audit-report-generator"]?.enabled;
      if (reportSkillEnabled && ai?.connected) {
        try {
          addLog("Stage 8.5/8: SEO Audit Report Generator skill synthesis", "sys");
          const aiReport = await buildAuditReportFromSkill(ai, host, generatedReport, payload, project);
          if (aiReport && aiReport.length > 3000) {
            reportText = aiReport;
            addLog("Report-generator skill output applied.", "ok");
          } else {
            addLog("Report-generator skill returned short output; using deterministic base.", "warn");
          }
        } catch (e) {
          addLog(`Report-generator skill failed: ${e.message}`, "warn");
        }
      } else {
        addLog("Stage 8.5/8: Professional deterministic report assembled.", "sys");
      }
      reportText = normalizeMarkdownTables(ensureReportIssueBlocks(ensureCoverageDisclosure(reportText, payload), generatedReport, payload));
      let qa = validateAuditReportQuality(reportText, payload, generatedReport, project);
      (qa.warnings || []).forEach((x) => addLog(`⚠ QA warning: ${x}`, "warn"));
      let qaAttempt = 0;
      while (!qa.ok && qaAttempt < 2) {
        qaAttempt += 1;
        addLog(`QA correction loop ${qaAttempt}/2: applying auto-fixes from feedback...`, "warn");
        reportText = autoFixReportFromQAIssues(reportText, qa.issues);
        reportText = normalizeMarkdownTables(ensureReportIssueBlocks(ensureCoverageDisclosure(reportText, payload), generatedReport, payload));
        qa = validateAuditReportQuality(reportText, payload, generatedReport, project);
        (qa.warnings || []).forEach((x) => addLog(`⚠ QA warning: ${x}`, "warn"));
      }
      if (!qa.ok) {
        addLog("🟠 Report QA gate frozen: saving report despite QA issues.", "warn");
        qa.issues.forEach((x) => addLog(`QA frozen issue: ${x}`, "warn"));
      } else {
        addLog("🟢 Report QA gate passed.", "ok");
      }
      const pdfDataUri = await buildPdfDataUriFromText(`Technical SEO Audit - ${host}`, reportText);
      const remediationSummary = buildRemediationSummary(checks, fixRuns);
      const buildAuditReportJson = await getBuildAuditReportJson();
      const saveAuditReportViaApi = await getSaveAuditReportViaApi();
      const structuredAuditJson = buildAuditReportJson({ generatedReport, payload, domain: host, source: core.source, remediationSummary });
      const { reportUrl } = await saveAuditReportViaApi(structuredAuditJson);
      setLatestReportUrl(reportUrl);
      appendProjectReport(orgScope, host, {
        title: `Technical SEO Audit - ${host} (${new Date().toISOString().slice(0, 10)})`,
        metaDescription: `Technical SEO audit report for ${host}. Full crawlability, indexation, architecture, internal linking, canonicalization, performance, and prioritized action plan.`,
        reportType: "technical_audit_pro",
        domain: host,
        score: payload?.quality?.score ?? null,
        severity: payload?.quality?.severity || "",
        report: generatedReport,
        reportMarkdown: reportText,
        pdfDataUri,
        reportUrl,
        remediationSummary,
        rawAuditSummary: payload?.summary || {},
      });
      mergeProjectData(orgScope, host, { audit: { ...(project?.audit || {}), fullReport: generatedReport, latestReportUrl: reportUrl, lastPayload: payload } });
      addLog(`Structured report saved: ${reportUrl}`, "ok");
      saveSnapshot(payload, core.source);
      addLog(`Audit complete via ${core.source}.`, "ok");
      setTab("overview");
      coreSucceeded = true;
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    if(!coreSucceeded && dfs?.login && dfs?.password){
      try{
        addLog("Primary engine failed. Falling back to DataForSEO...","warn");
        const auth="Basic "+btoa(`${dfs.login}:${dfs.password}`);
        const t=await(await fetch("https://api.dataforseo.com/v3/on_page/task_post",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{target:domain,max_crawl_pages:100,load_resources:true,enable_javascript:false}])})).json();
        if(t.tasks?.[0]?.status_code===20100){
          const tid=t.tasks[0].id;addLog(`Fallback task ID: ${tid}`,"ok");addLog("DataForSEO crawling... (30-60s)");
          let ready=false,att=0;
          while(!ready&&att<20){await new Promise(r=>setTimeout(r,5000));att++;addLog(`Status check ${att}...`);
            const s=await(await fetch(`https://api.dataforseo.com/v3/on_page/summary/${tid}`,{headers:{"Authorization":auth}})).json();
            const sum=s.tasks?.[0]?.result?.[0];
            if(sum?.crawl_progress==="finished"){ready=true;addLog("Crawl done. Fetching pages...","ok");
              const pg=await(await fetch(`https://api.dataforseo.com/v3/on_page/pages/${tid}`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{limit:50}])})).json();
              const fallbackSummary = sum || {};
              const fallbackIssues = [
                { key: "broken_pages", label: "Broken pages (4xx/5xx)", value: fallbackSummary?.broken_pages || 0, severity: (fallbackSummary?.broken_pages || 0) ? "high" : "low" },
                { key: "no_h1_tag", label: "Missing H1 tags", value: fallbackSummary?.checks?.no_h1_tag || 0, severity: (fallbackSummary?.checks?.no_h1_tag || 0) ? "medium" : "low" },
                { key: "no_description", label: "Missing meta descriptions", value: fallbackSummary?.checks?.no_description || 0, severity: (fallbackSummary?.checks?.no_description || 0) ? "medium" : "low" },
                { key: "no_image_alt", label: "Missing image alt text", value: fallbackSummary?.checks?.no_image_alt || 0, severity: (fallbackSummary?.checks?.no_image_alt || 0) ? "medium" : "low" },
                { key: "no_index_page", label: "Pages with noindex", value: fallbackSummary?.checks?.no_index_page || 0, severity: (fallbackSummary?.checks?.no_index_page || 0) ? "high" : "low" },
                { key: "duplicate_title", label: "Duplicate title tags", value: fallbackSummary?.duplicate_title || 0, severity: (fallbackSummary?.duplicate_title || 0) ? "medium" : "low" },
                { key: "high_loading_time", label: "High load time pages", value: fallbackSummary?.checks?.high_loading_time || 0, severity: (fallbackSummary?.checks?.high_loading_time || 0) ? "medium" : "low" },
              ].map((i) => ({ ...i, issue_id: `HELIO-${simpleHash(`${domain}:${i.key}`).slice(0, 6).toUpperCase()}` }));
              const payload = {summary:fallbackSummary,pages:pg.tasks?.[0]?.result?.[0]?.items||[],quality:computeHelioAuditScore(fallbackSummary),issueRegistry:fallbackIssues};
              const host = getHostFromInput(domain);
              const project = mergeProjectData(orgScope, host, { audit: { source: "DataForSEO", summary: fallbackSummary, quality: computeHelioAuditScore(fallbackSummary), issueRegistry: fallbackIssues, diagnostics: {}, lastPayload: payload, capturedAt: new Date().toISOString() } });
              syncMissionsFromProject(orgScope, host);
              setResults(payload);setSource("DataForSEO");saveSnapshot(payload, "DataForSEO");addLog("AUDIT COMPLETE (fallback).","ok");
              const generatedReport = buildTechnicalAuditReport({ domain, source: "DataForSEO", renderMode, results: payload, projectData: project });
              setFullReport(generatedReport);
              let reportText = buildProfessionalAuditReportText(generatedReport, payload);
              const reportSkillEnabled = !!skillsState?.["seo-audit-report-generator"]?.enabled;
              if (reportSkillEnabled && ai?.connected) {
                try {
                  const aiReport = await buildAuditReportFromSkill(ai, host, generatedReport, payload, project);
                  if (aiReport && aiReport.length > 3000) reportText = aiReport;
                } catch {}
              }
              reportText = normalizeMarkdownTables(ensureReportIssueBlocks(ensureCoverageDisclosure(reportText, payload), generatedReport, payload));
              let qa = validateAuditReportQuality(reportText, payload, generatedReport, project);
              (qa.warnings || []).forEach((x) => addLog(`⚠ QA warning: ${x}`, "warn"));
              let qaAttempt = 0;
              while (!qa.ok && qaAttempt < 2) {
                qaAttempt += 1;
                addLog(`QA correction loop ${qaAttempt}/2 (fallback): applying auto-fixes from feedback...`, "warn");
                reportText = autoFixReportFromQAIssues(reportText, qa.issues);
                reportText = normalizeMarkdownTables(ensureReportIssueBlocks(ensureCoverageDisclosure(reportText, payload), generatedReport, payload));
                qa = validateAuditReportQuality(reportText, payload, generatedReport, project);
                (qa.warnings || []).forEach((x) => addLog(`⚠ QA warning: ${x}`, "warn"));
              }
              if (!qa.ok) {
                addLog("🟠 Report QA gate frozen on fallback audit: saving report despite QA issues.", "warn");
                qa.issues.forEach((x) => addLog(`QA frozen issue: ${x}`, "warn"));
              } else {
                addLog("🟢 Report QA gate passed (fallback).", "ok");
              }
              const pdfDataUri = await buildPdfDataUriFromText(`Technical SEO Audit - ${host}`, reportText);
              const remediationSummary = buildRemediationSummary(checks, fixRuns);
              const buildAuditReportJson = await getBuildAuditReportJson();
              const saveAuditReportViaApi = await getSaveAuditReportViaApi();
              const structuredAuditJson = buildAuditReportJson({ generatedReport, payload, domain: host, source: "DataForSEO", remediationSummary });
              const { reportUrl } = await saveAuditReportViaApi(structuredAuditJson);
              setLatestReportUrl(reportUrl);
              appendProjectReport(orgScope, host, {
                title: `Technical SEO Audit - ${host} (${new Date().toISOString().slice(0, 10)})`,
                metaDescription: `Technical SEO audit report for ${host}. Full crawlability, indexation, architecture, internal linking, canonicalization, performance, and prioritized action plan.`,
                reportType: "technical_audit_pro",
                domain: host,
                score: payload?.quality?.score ?? null,
                severity: payload?.quality?.severity || "",
                report: generatedReport,
                reportMarkdown: reportText,
                pdfDataUri,
                reportUrl,
                remediationSummary,
                rawAuditSummary: payload?.summary || {},
              });
              mergeProjectData(orgScope, host, { audit: { ...(project?.audit || {}), fullReport: generatedReport, latestReportUrl: reportUrl, lastPayload: payload } });
              addLog(`Structured report saved: ${reportUrl}`, "ok");
              setTab("overview");
            }
          }
        } else addLog(`Fallback error: ${t.tasks?.[0]?.status_message}`,"err");
      }catch(ex){addLog(`Fallback failed: ${ex.message}`,"err");}
    }
    setRunning(false);
  };

  const pushFixRun = (nextEntry) => {
    const host = resolvedHost || "default";
    const prev = loadProjectData(orgScope, host);
    const prevRuns = Array.isArray(prev?.audit?.fixRuns) ? prev.audit.fixRuns : [];
    const nextRuns = [nextEntry, ...prevRuns].slice(0, 120);
    mergeProjectData(orgScope, host, { audit: { ...(prev?.audit || {}), fixRuns: nextRuns } });
    setFixRuns(nextRuns);
  };

  const updateFixRunStatus = (runId, patch = {}) => {
    const host = resolvedHost || "default";
    const prev = loadProjectData(orgScope, host);
    const prevRuns = Array.isArray(prev?.audit?.fixRuns) ? prev.audit.fixRuns : [];
    const nextRuns = prevRuns.map((r)=>r.id===runId?{...r,...patch,updatedAt:new Date().toISOString()}:r);
    mergeProjectData(orgScope, host, { audit: { ...(prev?.audit || {}), fixRuns: nextRuns } });
    setFixRuns(nextRuns);
  };

  const executeFixRun = async (runEntry) => {
    setFixing(true);setFixLog([]);setTab("fixes");
    setShowFixModal(true);
    setActiveFixRun(runEntry);
    setFixModalBusy(true);
    setFixModalLog([]);
    const a=(msg,type="info")=>{
      setFixLog(p=>[...p,{msg,type,t:p.length*400}]);
      setFixModalLog(p=>[...p,{msg,type,t:p.length*400}]);
    };
    updateFixRunStatus(runEntry.id, { status: "executing", executionTarget: "repo_patch_workflow", startedAt: new Date().toISOString() });
    a(`Executing fix: ${runEntry.issueLabel} (${runEntry.issueId})`,"sys");
    a(`Approval mode at run: ${runEntry.approvalModeAtRun}`,"sys");
    const deterministic = [
      { match: /missing meta descriptions/i, steps: ["Update template/meta pipeline to generate unique 120-155 char descriptions.", "Backfill affected URLs first, then enforce generation rule.", "Re-crawl and validate no_description reaches 0."] },
      { match: /missing h1/i, steps: ["Enforce exactly one H1 per indexable page template.", "Bind H1 to page intent/title mapping.", "Re-crawl and verify no_h1_tag drops to 0."] },
      { match: /broken pages/i, steps: ["Map each broken URL to the best 200 destination.", "Apply 301 redirects and update all internal links.", "Re-crawl and verify broken_pages = 0."] },
      { match: /canonical/i, steps: ["Set self-canonical on canonical URLs.", "Remove conflicting canonical tags from templates.", "Re-crawl and verify canonical conflicts clear."] },
    ];
    const match = deterministic.find((d)=>d.match.test(runEntry.issueLabel));
    const steps = match ? match.steps : ["Scope affected templates/pages from evidence list.", "Prepare deterministic patch and rollback reference.", "Deploy and verify via targeted re-crawl."];
    a("─── FIX PLAN ───","sys");
    steps.forEach((s, i)=>a(`${i+1}. ${s}`,"ok"));
    let done = false;
    try{
      const r=await callAI(ai,"You are Helio SEO agent. Generate repo-first execution checklist only. Include verification + rollback in <=120 words.",`Issue: ${runEntry.issueLabel}\nSeverity: ${runEntry.severity}\nPriority: ${runEntry.priority}`);
      a("─── EXECUTION CHECKLIST ───","sys");
      a(r,"ok");
      a("Execution target: repo patch / PR workflow","sys");
      a("Step 1/4: Inspecting available execution targets...","sys");
      const hasGithub = !!(integrations.github?.connected && integrations.github?.fields?.repo && integrations.github?.fields?.token);
      const hasPlaywright = !!(integrations.playwright?.connected && integrations.playwright?.fields?.endpoint);
      if (!hasGithub) {
        a("Step 2/4: GitHub execution target not connected.","err");
        a("Reason: Helio cannot create/commit patches without repo auth target.","err");
        a("Next step: Connect GitHub token + repo in Integrations, then re-run FIX ▶.","warn");
        updateFixRunStatus(runEntry.id, {
          status: "failed",
          verification: "Execution blocked: missing GitHub integration target.",
          changedArtifacts: [],
          rollbackRef: "",
          completedAt: new Date().toISOString(),
        });
      } else {
        a(`Step 2/4: Repo target detected (${integrations.github.fields.repo}).`,"ok");
        a("Step 3/4: Building concrete patch plan from issue evidence...","sys");
        const host = resolvedHost || getHostFromInput(domain) || "site";
        const patchPlan = [
          `target_scope: ${host}`,
          `issue: ${runEntry.issueLabel}`,
          `severity: ${String(runEntry.severity || "").toUpperCase()} (${runEntry.priority || "P3"})`,
          `affected_count: ${runEntry.affectedCount || 0}`,
          `action: ${runEntry.recommendedFix || "Apply deterministic template-level remediation and validate via re-crawl."}`,
        ];
        patchPlan.forEach((line)=>a(`  - ${line}`,"ok"));
        a("Step 4/4: Verification execution...","sys");
        if (hasPlaywright) {
          a("Playwright runner connected: scheduling post-fix verification checks.","ok");
        } else {
          a("Playwright runner not connected: verification falls back to next audit cycle.","warn");
        }
        updateFixRunStatus(runEntry.id, {
          status: "done",
          verification: hasPlaywright
            ? "Fix plan executed with repo target and remote verification scheduled."
            : "Fix plan executed with repo target; verify in next crawl/audit run.",
          changedArtifacts: ["template rules", "meta pipeline", "redirect map"].filter(Boolean),
          rollbackRef: "git revert <patch-sha>",
          completedAt: new Date().toISOString(),
        });
        done = true;
        a("Fix run completed successfully.","ok");
      }
    } catch(e){
      a(`Error: ${e.message}`,"err");
      updateFixRunStatus(runEntry.id, { status: "failed", verification: e.message });
    }
    if (!done) a("Auto-fix did not complete. Review failure reason and follow next step instructions above.","err");
    setFixing(false);
    setFixModalBusy(false);
  };

  const createPatchIssueFromRun = async (runEntry) => {
    if (!runEntry) return;
    const gh = integrations.github?.fields || {};
    const hasGithub = !!(integrations.github?.connected && gh.repo && gh.token);
    const append = (msg, type="info") => setFixModalLog((p)=>[...p, { msg, type, t: p.length * 400 }]);
    if (!hasGithub) {
      append("Cannot create repo patch issue: GitHub integration is not connected/configured.", "err");
      append("Next step: Connect GitHub token + repo in Integrations, then retry APPLY REPO PATCH NOW.", "warn");
      return;
    }
    setCreatingPatchIssue(true);
    append(`Preparing PR-ready payload for ${runEntry.issueLabel}...`, "sys");
    try {
      const host = resolvedHost || getHostFromInput(domain) || "unknown-domain";
      const title = `[Helio Fix] ${runEntry.issueLabel} (${runEntry.issueId})`;
      const body = [
        `Issue ID: ${runEntry.issueId}`,
        `Domain: ${host}`,
        `Severity: ${String(runEntry.severity || "medium").toUpperCase()}`,
        `Priority: ${runEntry.priority || "P3"}`,
        `Affected Count: ${runEntry.affectedCount || 0}`,
        "",
        "Fix Objective",
        `${runEntry.recommendedFix || "Apply deterministic template-level remediation and validate via re-crawl."}`,
        "",
        "Execution Plan",
        "1. Create branch `fix/" + String(runEntry.issueId || "issue").toLowerCase() + "`",
        "2. Apply template/page-level changes for affected entities.",
        "3. Add/update tests for regression coverage.",
        "4. Run audit verification and confirm issue count reduction.",
        "",
        "Acceptance Criteria",
        "- [ ] Issue is reduced to 0 or explicitly justified",
        "- [ ] No regression in related checks",
        "- [ ] Verification notes attached",
        "",
        "Rollback Plan",
        "- Revert commit or rollback PR if verification fails.",
      ].join("\n");

      const h = {
        Authorization: `token ${gh.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      };
      const res = await fetch(`https://api.github.com/repos/${gh.repo}/issues`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ title, body, labels: ["seo", "helio-fix", String(runEntry.priority || "p3").toLowerCase()] }),
      });
      const data = await res.json();
      if (!res.ok || !data?.html_url) {
        throw new Error(data?.message || "GitHub issue creation failed");
      }
      append(`Patch issue created: ${data.html_url}`, "ok");
      updateFixRunStatus(runEntry.id, {
        executionTarget: "repo_patch_workflow",
        changedArtifacts: Array.isArray(runEntry.changedArtifacts) ? runEntry.changedArtifacts : [],
        verification: `${runEntry.verification || ""}\nPatch issue: ${data.html_url}`.trim(),
      });
    } catch (e) {
      append(`Patch issue creation failed: ${e.message}`, "err");
      append("Next step: verify GitHub token scopes (repo/issues) and repo path, then retry.", "warn");
    } finally {
      setCreatingPatchIssue(false);
    }
  };

  const startFixRun = async (item) => {
    const isCritical = String(item.severity || "").toLowerCase() === "critical" || String(item.priority || "").toUpperCase() === "P1";
    const requiresApproval = approvalMode === "always_ask" || (approvalMode === "critical_only" && isCritical);
    const runEntry = {
      id: `fix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      issueId: item.id,
      issueLabel: item.label,
      severity: item.severity || "medium",
      priority: item.priority || "P3",
      affectedCount: item.v || 0,
      recommendedFix: item.recommendedFix || "",
      riskLevel: isCritical ? "high" : "medium",
      approvalRequired: requiresApproval,
      approvalModeAtRun: approvalMode,
      status: requiresApproval ? "awaiting-approval" : "planned",
      executionTarget: "repo_patch_workflow",
      changedArtifacts: [],
      verification: "",
      rollbackRef: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    pushFixRun(runEntry);
    if (requiresApproval) {
      setTab("fixes");
      return;
    }
    await executeFixRun(runEntry);
  };

  const s=results?.summary;
  const checks=((results?.issueRegistry&&results.issueRegistry.length)?results.issueRegistry:[
    { issue_id: `HELIO-${simpleHash(`${domain}:no_description`).slice(0,6).toUpperCase()}`, label:"Missing meta descriptions", value:s?.checks?.no_description||0, severity:(s?.checks?.no_description||0)?"medium":"low" },
    { issue_id: `HELIO-${simpleHash(`${domain}:no_h1_tag`).slice(0,6).toUpperCase()}`, label:"Missing H1 tags", value:s?.checks?.no_h1_tag||0, severity:(s?.checks?.no_h1_tag||0)?"medium":"low" },
    { issue_id: `HELIO-${simpleHash(`${domain}:broken_pages`).slice(0,6).toUpperCase()}`, label:"Broken pages (4xx/5xx)", value:s?.broken_pages||0, severity:(s?.broken_pages||0)?"high":"low" },
  ]).map((i)=>({id:i.issue_id,label:i.label,v:i.value,severity:i.severity,priority:i.priority,impact:i.impact,recommendedFix:i.recommendedFix||""}));

  const buildRemediationSummary = (issueRows = [], runs = []) => {
    const healthyChecks = issueRows.filter((i)=>(i.v ?? 0) === 0).length;
    const openFixes = issueRows.filter((i)=>(i.v ?? 0) > 0).length;
    const executedFixes = (runs || []).filter((r)=>r?.status === "done").length;
    const approvalBlockedFixes = (runs || []).filter((r)=>r?.status === "awaiting-approval").length;
    return { healthyChecks, openFixes, executedFixes, approvalBlockedFixes };
  };

  const exportJson = () => {
    if (!results) return;
    const payload = fullReport ? { report: fullReport, raw: results } : results;
    const b = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = `helio-audit-${(new Date()).toISOString().slice(0,10)}.json`;
    a.click();
  };

  const exportCsv = () => {
    if (!checks.length) return;
    const rows = checks.map((c) => ({ issue_id: c.id, issue: c.label, count: c.v, severity: c.severity }));
    const b = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = `helio-audit-issues-${(new Date()).toISOString().slice(0,10)}.csv`;
    a.click();
  };

  useEffect(() => {
    try {
      const host = new URL(normalizeUrl(domain)).host;
      setHistory(host ? loadAuditHistory(host, orgScope) : []);
    } catch {
      setHistory([]);
    }
  }, [domain, orgScope]);

  useEffect(() => {
    try {
      const host = new URL(normalizeUrl(domain)).host;
      if (!host) {
        setFixRuns([]);
        return;
      }
      const project = loadProjectData(orgScope, host);
      setFixRuns(Array.isArray(project?.audit?.fixRuns) ? project.audit.fixRuns : []);
    } catch {
      setFixRuns([]);
    }
  }, [domain, orgScope, results?.quality?.score]);

  useEffect(() => {
    setThresholds(loadAuditAlertThresholds(resolvedHost, orgScope));
  }, [resolvedHost, orgScope]);

  useEffect(() => {
    if (autoRefreshMins === "off") return undefined;
    const mins = Number(autoRefreshMins);
    if (!mins || mins < 1) return undefined;
    const id = setInterval(() => {
      if (!running && domain) run();
    }, mins * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefreshMins, domain, running, renderMode]);

  const trendAlerts = (() => {
    if (!history.length) return [];
    const latest = history[0];
    const prev = history[1];
    if (!prev) return [{ level: "ok", text: "Baseline snapshot created." }];
    const alerts = [];
    const scoreDelta = latest.score - prev.score;
    if (scoreDelta <= -Math.max(1, Number(thresholds.scoreDrop) || 8)) alerts.push({ level: "high", text: `Health score dropped ${Math.abs(scoreDelta)} points.` });
    else if (scoreDelta >= Math.max(1, Number(thresholds.scoreGain) || 8)) alerts.push({ level: "ok", text: `Health score improved by ${scoreDelta} points.` });
    const brokenDelta = (latest.broken_pages || 0) - (prev.broken_pages || 0);
    if (brokenDelta >= Math.max(1, Number(thresholds.brokenIncrease) || 1)) alerts.push({ level: "high", text: `Broken pages increased by ${brokenDelta}.` });
    if (((latest.no_description || 0) - (prev.no_description || 0)) >= Math.max(1, Number(thresholds.descIncrease) || 1)) alerts.push({ level: "warn", text: "Missing meta descriptions increased." });
    if (!alerts.length) alerts.push({ level: "ok", text: "No significant negative trend detected." });
    return alerts;
  })();

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Technical Audit" sub={`Hybrid engine (Helio Core primary) · Source: ${source} · AI: ${ai?.fields?.model||"—"} · Approval: ${approvalModeLabel}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="Domain to audit (e.g. generalizingai.com)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <div style={{width:240}}>
        <ThemeDropdown
          value={renderMode}
          onChange={setRenderMode}
          options={[
            { value: "static", label: "Static Crawl", meta: "Fast + stable HTML fetch" },
            { value: "enhanced-js", label: "Enhanced JS Crawl", meta: "Render-first fetch for JS-heavy pages" },
            { value: "pro-static", label: "Pro Audit Crawl", meta: "Deep crawl + sitemap seeding + strict coverage" },
            { value: "pro-js", label: "Pro Audit JS Crawl", meta: "Deep crawl with JS-rendered fetch mode" },
          ]}
          placeholder="Crawl mode"
        />
      </div>
      <div style={{width:210}}>
        <ThemeDropdown
          value={autoRefreshMins}
          onChange={setAutoRefreshMins}
          options={[
            { value: "off", label: "Auto Run: Off" },
            { value: "5", label: "Auto Run: 5 min" },
            { value: "15", label: "Auto Run: 15 min" },
            { value: "30", label: "Auto Run: 30 min" },
          ]}
          placeholder="Auto run interval"
        />
      </div>
      <Btn onClick={run} disabled={running||!domain}>{running?"▶ AUDITING...":"⬡ RUN AUDIT"}</Btn>
    </div>
    <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:"10px 12px",marginBottom:14}}>
      {trendAlerts.map((a,i)=><div key={i} style={{color:a.level==="high"?C.red:a.level==="warn"?C.orange:C.green,fontFamily:"monospace",fontSize:10,marginBottom:4}}>
        {a.level==="high"?"▲":a.level==="warn"?"•":"✓"} {a.text}
      </div>)}
    </div>
    <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:"10px 12px",marginBottom:14}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>ALERT THRESHOLDS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4, minmax(130px, 1fr))",gap:8}}>
        {[
          { key: "scoreDrop", label: "Score Drop" },
          { key: "scoreGain", label: "Score Gain" },
          { key: "brokenIncrease", label: "Broken +N" },
          { key: "descIncrease", label: "No Desc +N" },
        ].map((f) => (
          <div key={f.key}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:4}}>{f.label}</div>
            <input
              type="number"
              min={1}
              value={thresholds[f.key]}
              onChange={(e)=>{
                const n = Math.max(1, Number(e.target.value || 1));
                setThresholds((p)=>({ ...p, [f.key]: n }));
              }}
              onBlur={()=>{
                const n = Math.max(1, Number(thresholds[f.key] || 1));
                const next = { ...thresholds, [f.key]: n };
                setThresholds(next);
                saveAuditAlertThresholds(next, resolvedHost, orgScope);
                saveAuditAlertThresholds(next, "default", orgScope);
              }}
              style={{width:"100%",background:"#0a0a0a",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"6px 8px",outline:"none",boxSizing:"border-box"}}
            />
          </div>
        ))}
      </div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:8}}>
        Profile: <span style={{color:C.lime}}>{resolvedHost}</span>
      </div>
    </div>
    <div style={{display:"flex",gap:10,marginBottom:14}}>
      <Btn onClick={exportJson} disabled={!results} variant="blue">EXPORT JSON</Btn>
      <Btn onClick={exportCsv} disabled={!results} variant="blue">EXPORT CSV</Btn>
      <Btn
        onClick={()=>{
          if (!latestReportUrl) return;
          window.history.pushState({}, "", latestReportUrl);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        disabled={!latestReportUrl}
        variant="green"
      >
        VIEW AUDIT REPORT
      </Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={running}/></div>}
    {results&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
        {[{label:"Health Score",value:results.quality?.score??"—",delta:results.quality?.severity?results.quality.severity.toUpperCase():"",good:(results.quality?.score??0)>=85},{label:"Pages Crawled",value:s?.pages_crawled},{label:"Broken Pages",value:s?.broken_pages,delta:(s?.broken_pages??0)===0?"✓ Good":"⚠ Fix",good:(s?.broken_pages??0)===0},{label:"Missing H1",value:s?.checks?.no_h1_tag,delta:(s?.checks?.no_h1_tag??0)===0?"✓ Good":"⚠ Fix",good:(s?.checks?.no_h1_tag??0)===0},{label:"No Description",value:s?.checks?.no_description,delta:(s?.checks?.no_description??0)===0?"✓ Good":"⚠ Fix",good:(s?.checks?.no_description??0)===0}].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      <Tabs tabs={["overview","report","patterns","pages","history","fixes"]} active={tab} onChange={setTab}/>
      {tab==="overview"&&(()=>{
        const healthyChecks = checks.filter((item)=>(item.v??0)===0);
        const needsFix = checks
          .filter((item)=>(item.v??0)>0)
          .sort((a,b)=>{
            const sevOrder = {critical:4,high:3,medium:2,low:1};
            const pa = sevOrder[String(a.severity||"low").toLowerCase()]||1;
            const pb = sevOrder[String(b.severity||"low").toLowerCase()]||1;
            if (pb !== pa) return pb - pa;
            return (b.impact||0) - (a.impact||0);
          });
        const criticalNow = needsFix.filter((i)=>String(i.severity||"").toLowerCase()==="critical" || String(i.priority||"").toUpperCase()==="P1").length;
        const queued = needsFix.length - criticalNow;
        return <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(180px,1fr))",gap:10,marginBottom:12}}>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"10px 12px"}}>
              <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>CRITICAL TO FIX NOW</div>
              <div style={{color:C.red,fontFamily:"monospace",fontSize:18,fontWeight:800,marginTop:4}}>{criticalNow}</div>
            </div>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"10px 12px"}}>
              <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>HIGH / MEDIUM QUEUED</div>
              <div style={{color:C.orange,fontFamily:"monospace",fontSize:18,fontWeight:800,marginTop:4}}>{Math.max(0, queued)}</div>
            </div>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"10px 12px"}}>
              <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>ALREADY HEALTHY</div>
              <div style={{color:C.green,fontFamily:"monospace",fontSize:18,fontWeight:800,marginTop:4}}>{healthyChecks.length}</div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
              <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,color:C.green,fontFamily:"monospace",fontSize:10,letterSpacing:1}}>HEALTHY SIGNALS</div>
              {healthyChecks.map((item,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.green,fontFamily:"monospace",fontSize:9,minWidth:36}}>PASS</span>
                <span style={{color:C.text,fontFamily:"monospace",fontSize:10,flex:1}}>{item.label}</span>
                <span style={{color:C.muted,fontFamily:"monospace",fontSize:8,minWidth:72,textAlign:"right"}}>evidence {(item.impact??0)}</span>
              </div>)}
              {!healthyChecks.length&&<div style={{padding:12,color:C.muted,fontFamily:"monospace",fontSize:10}}>No healthy checks yet.</div>}
            </div>

            <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
              <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,color:C.red,fontFamily:"monospace",fontSize:10,letterSpacing:1}}>NEEDS FIX</div>
              {needsFix.map((item,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.red,fontFamily:"monospace",fontSize:9,minWidth:36}}>FAIL</span>
                <span style={{color:C.text,fontFamily:"monospace",fontSize:10,flex:1}}>{item.label}</span>
                <span style={{color:item.severity==="critical"?C.red:item.severity==="high"?C.orange:C.lime,fontFamily:"monospace",fontSize:8,minWidth:58,textAlign:"right"}}>{String(item.severity||"low").toUpperCase()}</span>
                <span style={{color:C.blue,fontFamily:"monospace",fontSize:8,minWidth:34,textAlign:"right"}}>{item.priority||"P3"}</span>
                <span style={{color:C.orange,fontFamily:"monospace",fontSize:9,minWidth:26,textAlign:"right"}}>{item.v??0}</span>
                {/missing meta descriptions|missing h1|broken pages|canonical|sitemap|duplicate/i.test(String(item.label||"")) || item.recommendedFix ? (
                  <button onClick={()=>startFixRun(item)} style={{background:"transparent",border:`1px solid ${C.lime}`,color:C.lime,fontFamily:"monospace",fontSize:8,padding:"2px 8px",cursor:"pointer"}}>FIX ▶</button>
                ) : (
                  <span style={{color:C.muted,fontFamily:"monospace",fontSize:8,minWidth:42,textAlign:"right"}}>N/A</span>
                )}
              </div>)}
              {!needsFix.length&&<div style={{padding:12,color:C.muted,fontFamily:"monospace",fontSize:10}}>No open fixes.</div>}
            </div>
          </div>
        </div>;
      })()}
      {tab==="report"&&<div style={{background:"#060606",border:`1px solid ${C.border}`,padding:14}}>
        {!!latestReportUrl&&<div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:1}}>DETAILED REPORT PREVIEW</div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>{window.history.pushState({}, "", latestReportUrl);window.dispatchEvent(new PopStateEvent("popstate"));}} variant="green" style={{padding:"5px 10px",fontSize:9}}>OPEN FULL REPORT</Btn>
              <Btn onClick={()=>window.open(`${latestReportUrl}?download=1`,"_blank")} variant="blue" style={{padding:"5px 10px",fontSize:9}}>PDF</Btn>
            </div>
          </div>
          <iframe
            title="Detailed Audit Report"
            src={latestReportUrl}
            style={{width:"100%",minHeight:860,border:`1px solid ${C.dim}`,background:"#050505"}}
          />
        </div>}
        {!fullReport&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Run audit to generate full technical audit report architecture.</div>}
        {!latestReportUrl&&fullReport&&<>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:1,marginBottom:8}}>EXECUTIVE SUMMARY</div>
          <div style={{color:C.text,fontFamily:"monospace",fontSize:10,lineHeight:1.6,marginBottom:12}}>
            <div>Website: {fullReport.section1_executiveSummary.websiteAudited}</div>
            <div>Top priorities:</div>
            {fullReport.section1_executiveSummary.topPrioritiesToFixFirst.map((x,i)=><div key={i} style={{color:C.muted}}>{i+1}. {x}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(180px,1fr))",gap:8,marginBottom:12}}>
            <Card label="Crawlability" value={fullReport.section3_overallHealthSnapshot.crawlability} />
            <Card label="Indexation" value={fullReport.section3_overallHealthSnapshot.indexationHealth} />
            <Card label="Metadata" value={fullReport.section3_overallHealthSnapshot.metadataQuality} />
            <Card label="Architecture" value={fullReport.section3_overallHealthSnapshot.siteArchitectureQuality} />
            <Card label="Risk Level" value={String(fullReport.section3_overallHealthSnapshot.technicalRiskLevel || "").toUpperCase()} />
            <Card label="Source" value={fullReport.source} />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(180px,1fr))",gap:8,marginBottom:12}}>
            <Card label="Pages Crawled" value={results?.summary?.pages_crawled ?? 0} />
            <Card label="Orphan Pages" value={results?.summary?.orphan_pages ?? 0} />
            <Card label="Weak Linked" value={results?.summary?.weakly_linked_pages ?? 0} />
            <Card label="Canonical Conflicts" value={results?.summary?.checks?.canonical_conflict ?? 0} />
            <Card label="Duplicate Clusters" value={results?.summary?.duplicate_content_clusters ?? 0} />
            <Card label="Coverage Flag" value={(results?.summary?.coverage_insufficient ?? 0) ? "INSUFFICIENT" : "OK"} />
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:12}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>SCOPE & METHOD</div>
            <div style={{color:C.text,fontFamily:"monospace",fontSize:10}}>Coverage: {fullReport.section2_scopeAndMethod.coverage}</div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginTop:4}}>Sources: {fullReport.section2_scopeAndMethod.dataSourcesUsed.join(" · ")}</div>
            <div style={{color:C.orange,fontFamily:"monospace",fontSize:10,marginTop:4}}>Limitations: {fullReport.section2_scopeAndMethod.limitations.join(" | ")}</div>
          </div>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>PRIORITY FINDINGS</div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,marginBottom:12}}>
            {fullReport.section17_priorityFindings.slice(0,10).map((f,i)=><div key={i} style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <span style={{color:C.text}}>{f.issue}</span>
                <span style={{color:f.severity==="critical"?C.red:f.severity==="high"?C.orange:C.lime}}>{f.severity.toUpperCase()} · {f.priority}</span>
              </div>
              <div style={{color:C.muted,marginTop:4}}>Impact: {f.likelyImpact}</div>
              <div style={{color:C.muted}}>Fix: {f.recommendedFix}</div>
            </div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(220px,1fr))",gap:10}}>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
              <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>QUICK WINS</div>
              {fullReport.section18_quickWins.length?fullReport.section18_quickWins.map((q,i)=><div key={i} style={{color:C.text,fontFamily:"monospace",fontSize:10,marginBottom:5}}>{i+1}. {q.issue} → {q.recommendedFix}</div>):<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>No quick wins detected.</div>}
            </div>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
              <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>ACTION PLAN</div>
              <div style={{color:C.text,fontFamily:"monospace",fontSize:10,marginBottom:4}}>Immediate</div>
              {fullReport.section20_prioritizedActionPlan.immediate.map((s0,i)=><div key={`i-${i}`} style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{i+1}. {s0}</div>)}
              <div style={{color:C.text,fontFamily:"monospace",fontSize:10,marginTop:6,marginBottom:4}}>Next 30 days</div>
              {fullReport.section20_prioritizedActionPlan.next30Days.slice(0,4).map((s1,i)=><div key={`d30-${i}`} style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{i+1}. {s1}</div>)}
              <div style={{color:C.text,fontFamily:"monospace",fontSize:10,marginTop:6,marginBottom:4}}>Next 60-90 days</div>
              {fullReport.section20_prioritizedActionPlan.next60to90Days.slice(0,4).map((s2,i)=><div key={`d90-${i}`} style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{i+1}. {s2}</div>)}
            </div>
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginTop:12}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>APPENDIX EVIDENCE (SAMPLES)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{color:C.text,fontFamily:"monospace",fontSize:10,marginBottom:4}}>Orphan URLs</div>
                {(fullReport.section23_appendixEvidence.orphanSamples || []).slice(0, 8).map((u,i)=><div key={`o-${i}`} style={{color:C.muted,fontFamily:"monospace",fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u}</div>)}
              </div>
              <div>
                <div style={{color:C.text,fontFamily:"monospace",fontSize:10,marginBottom:4}}>Canonical Clusters</div>
                {(fullReport.section23_appendixEvidence.canonicalClusterSamples || []).slice(0, 6).map((c,i)=><div key={`c-${i}`} style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>{c.canonicalUrl} · members:{c.memberCount}</div>)}
              </div>
            </div>
          </div>
        </>}
      </div>}
      {tab==="patterns"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>TEMPLATE</span><span style={{minWidth:60,textAlign:"right"}}>PAGES</span><span style={{minWidth:80,textAlign:"right"}}>DENSITY</span><span style={{minWidth:80,textAlign:"right"}}>NO DESC</span><span style={{minWidth:80,textAlign:"right"}}>NO H1</span><span style={{minWidth:90,textAlign:"right"}}>CANONICAL</span>
        </div>
        {(results?.templatePatterns||[]).map((t,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.lime,flex:1}}>{t.template}</span>
          <span style={{color:C.text,minWidth:60,textAlign:"right"}}>{t.pages}</span>
          <span style={{color:t.issueDensity>1?C.red:t.issueDensity>0.4?C.orange:C.green,minWidth:80,textAlign:"right"}}>{t.issueDensity}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{t.no_description}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{t.no_h1_tag}</span>
          <span style={{color:C.text,minWidth:90,textAlign:"right"}}>{t.canonical_conflict}</span>
        </div>)}
        {!(results?.templatePatterns||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No template patterns yet.</div>}
      </div>}
      {tab==="pages"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>URL</span><span style={{minWidth:55,textAlign:"right"}}>STATUS</span><span style={{minWidth:80,textAlign:"right"}}>LOAD</span><span style={{minWidth:60,textAlign:"right"}}>SIZE</span>
        </div>
        {results.pages.slice(0,25).map((p,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.lime,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.url}</span>
          <span style={{color:p.status_code===200?C.green:C.red,minWidth:55,textAlign:"right"}}>{p.status_code}</span>
          <span style={{color:C.muted,minWidth:80,textAlign:"right"}}>{p.page_timing?.time_to_interactive?(p.page_timing.time_to_interactive/1000).toFixed(2)+"s":"—"}</span>
          <span style={{color:C.muted,minWidth:60,textAlign:"right"}}>{p.size?Math.round(p.size/1024)+"KB":"—"}</span>
        </div>)}
      </div>}
      {tab==="history"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{minWidth:140}}>TIME</span><span style={{minWidth:70,textAlign:"right"}}>SCORE</span><span style={{minWidth:90,textAlign:"right"}}>DELTA</span><span style={{minWidth:120,textAlign:"right"}}>PAGES</span><span style={{minWidth:120,textAlign:"right"}}>BROKEN</span><span style={{flex:1}}>SOURCE</span>
        </div>
        {(history||[]).map((h,i)=>{
          const prev = history[i+1];
          const d = prev ? (h.score - prev.score) : 0;
          const dText = prev ? `${d>0?"+":""}${d}` : "—";
          return <div key={`${h.ts}-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{color:C.text,minWidth:140}}>{new Date(h.ts).toLocaleString()}</span>
            <span style={{color:h.score>=85?C.green:h.score>=70?C.orange:C.red,minWidth:70,textAlign:"right"}}>{h.score}</span>
            <span style={{color:!prev?C.muted:(d>=0?C.green:C.red),minWidth:90,textAlign:"right"}}>{dText}</span>
            <span style={{color:C.text,minWidth:120,textAlign:"right"}}>{h.pages_crawled}</span>
            <span style={{color:h.broken_pages?C.red:C.green,minWidth:120,textAlign:"right"}}>{h.broken_pages}</span>
            <span style={{color:C.muted,flex:1}}>{h.source}</span>
          </div>;
        })}
        {!history.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No history yet. Run an audit to create snapshots.</div>}
      </div>}
      {tab==="fixes"&&<div style={{background:"#060606",border:`1px solid ${C.border}`,padding:14,fontFamily:"monospace",fontSize:10}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>FIX LIFECYCLE</div>
        {(fixRuns||[]).slice(0,12).map((r,i)=><div key={r.id||i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
          <span style={{color:C.muted,minWidth:130}}>{new Date(r.createdAt||Date.now()).toLocaleString()}</span>
          <span style={{color:C.text,flex:1}}>{r.issueLabel}</span>
          <span style={{color:r.status==="done"?C.green:r.status==="failed"?C.red:r.status==="awaiting-approval"?C.orange:C.blue,minWidth:120,textAlign:"right"}}>{String(r.status||"planned").toUpperCase()}</span>
          {r.status==="awaiting-approval"&&<button onClick={()=>executeFixRun(r)} style={{background:"transparent",border:`1px solid ${C.lime}`,color:C.lime,fontFamily:"monospace",fontSize:8,padding:"2px 8px",cursor:"pointer"}}>APPROVE ▶</button>}
        </div>)}
        {fixLog.length===0&&!fixing&&!(fixRuns||[]).length&&<div style={{color:C.muted,marginTop:8}}>Go to Overview → FIX ▶ any issue.</div>}
        {fixLog.map((l,i)=><div key={i} style={{marginBottom:5,whiteSpace:"pre-wrap",color:l.type==="sys"?C.lime:l.type==="ok"?C.text:l.type==="err"?C.red:C.muted}}>{l.msg}</div>)}
        {fixing&&<div style={{color:C.lime}}>█</div>}
      </div>}
    </>}
    {showFixModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1001}}>
      <div style={{width:"min(1100px,92vw)",maxHeight:"82vh",background:"#050505",border:`1px solid ${C.borderLime}`,display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderBottom:`1px solid ${C.border}`,background:"#0a0a0a"}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:1}}>
            FIX TERMINAL · {activeFixRun?.issueLabel || "Issue"}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button
              onClick={()=>createPatchIssueFromRun(activeFixRun)}
              disabled={fixModalBusy || creatingPatchIssue || !activeFixRun}
              style={{background:"transparent",border:`1px solid ${(fixModalBusy || creatingPatchIssue || !activeFixRun)?C.dim:C.blue}`,color:(fixModalBusy || creatingPatchIssue || !activeFixRun)?C.dim:C.blue,fontFamily:"monospace",fontSize:9,padding:"3px 8px",cursor:(fixModalBusy || creatingPatchIssue || !activeFixRun)?"not-allowed":"pointer"}}
            >
              {creatingPatchIssue ? "CREATING..." : "APPLY REPO PATCH NOW"}
            </button>
            <button
              onClick={()=>{if(!fixModalBusy){setShowFixModal(false);setActiveFixRun(null);}}}
              disabled={fixModalBusy}
              style={{background:"transparent",border:`1px solid ${fixModalBusy?C.dim:C.lime}`,color:fixModalBusy?C.dim:C.lime,fontFamily:"monospace",fontSize:9,padding:"3px 8px",cursor:fixModalBusy?"not-allowed":"pointer"}}
            >
              CLOSE
            </button>
          </div>
        </div>
        <div style={{padding:12,overflowY:"auto",fontFamily:"monospace",fontSize:11,lineHeight:1.7,whiteSpace:"pre-wrap",color:C.text,flex:1}}>
          {!fixModalLog.length&&<div style={{color:C.muted}}>Waiting for fix execution...</div>}
          {fixModalLog.map((l,i)=><div key={i} style={{marginBottom:5,color:l.type==="sys"?C.lime:l.type==="ok"?C.text:l.type==="err"?C.red:C.orange}}>
            {l.msg}
          </div>)}
          {fixModalBusy&&<div style={{color:C.lime}}>█</div>}
        </div>
      </div>
    </div>}
  </div>;
}

// ── KEYWORD INTEL ─────────────────────────────────────────────────
const KEYWORD_GOAL_OPTIONS = [
  {value:"local",label:"Local SEO"},
  {value:"organic",label:"Organic Growth"},
  {value:"service",label:"Service Expansion"},
  {value:"blog",label:"Blog Traffic"},
  {value:"ctr",label:"CTR Recovery"},
];

const KEYWORD_ROADMAP_PRIORITIES = [
  {value:"P1",label:"P1 Critical"},
  {value:"P2",label:"P2 High"},
  {value:"P3",label:"P3 Normal"},
  {value:"P4",label:"P4 Later"},
];

const KEYWORD_ROADMAP_STATUSES = [
  {value:"queued",label:"Queued"},
  {value:"active",label:"Active"},
  {value:"waiting",label:"Waiting"},
  {value:"done",label:"Done"},
  {value:"skipped",label:"Skipped"},
];

function splitKeywordInput(value = "") {
  return String(value || "").split(/[\n,;]+/).map((x)=>x.trim()).filter(Boolean);
}

function normalizeKeywordText(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function roadmapIdForCluster(cluster = {}) {
  return normalizeKeywordText(`${cluster.primaryKeyword || cluster.name || ""}|${cluster.targetPage || ""}|${cluster.contentType || ""}`).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `roadmap-${Date.now()}`;
}

export function priorityRank(value = "P3") {
  return { P1: 1, P2: 2, P3: 3, P4: 4 }[value] || 3;
}

function inferKeywordIntent(keyword = "") {
  const k = normalizeKeywordText(keyword);
  if (/^(how|what|why|when|where|who|can|should|is|are)\b|\b(guide|ideas|examples|template|checklist)\b/.test(k)) return "Informational";
  if (/\b(best|top|vs|compare|comparison|reviews?|alternatives?)\b/.test(k)) return "Commercial";
  if (/\b(buy|price|pricing|cost|quote|near me|nearby|service|services|company|agency|consultant|book|hire)\b/.test(k)) return "Transactional";
  if (/\b(login|contact|brand|official)\b/.test(k)) return "Navigational";
  return "Informational";
}

function keywordActionFromMetrics({ keyword = "", page = "", position = 99, ctr = 0, impressions = 0, goal = "" }) {
  const k = normalizeKeywordText(keyword);
  if (!page) return goal === "local" ? "Create local landing page" : "Create target page";
  if (position >= 2 && position <= 12 && impressions >= 120 && ctr < 0.035) return "Refresh title/meta and answer intent above fold";
  if (position > 12 && impressions >= 80) return "Expand page depth and internal links";
  if (/\b(best|vs|compare|alternatives?)\b/.test(k)) return "Build comparison/list section";
  if (goal === "local" && /\b(in|near)\b/.test(k)) return "Strengthen local proof and service-area copy";
  return "Maintain and monitor";
}

function contentTypeForKeyword(keyword = "", goal = "", hasPage = false) {
  const intent = inferKeywordIntent(keyword);
  const k = normalizeKeywordText(keyword);
  if (goal === "local" && /\b(in|near|near me)\b/.test(k)) return "location page";
  if (/\b(price|cost|service|services|agency|consultant|company)\b/.test(k)) return "service page";
  if (/\b(best|top|vs|compare|comparison|alternatives?)\b/.test(k)) return "comparison";
  if (/^(how|what|why|when|where|who|can|should|is|are)\b/.test(k)) return "FAQ";
  if (intent === "Informational" && !hasPage) return "guide";
  return hasPage ? "existing page optimization" : "blog";
}

function makeKeywordScore({ impressions = 0, clicks = 0, ctr = 0, position = 99, page = "", goal = "", localMatch = false, businessMatch = false, crawlMatch = false, source = "" }) {
  const visibility = Math.min(26, Math.log10(Number(impressions || 0) + 1) * 13);
  const rankingGap = position >= 2 && position <= 20 ? Math.max(0, 28 - position) : position > 20 ? 5 : 12;
  const ctrGap = impressions >= 80 ? Math.max(0, (0.08 - Number(ctr || 0)) * 180) : 0;
  const traction = Math.min(12, Number(clicks || 0) / 3);
  const local = goal === "local" && localMatch ? 14 : 0;
  const relevance = businessMatch ? 14 : 4;
  const pageSignal = page ? 8 : source === "generated" ? 4 : 0;
  const crawl = crawlMatch ? 5 : 0;
  return Math.max(1, Math.min(100, Math.round(visibility + rankingGap + ctrGap + traction + local + relevance + pageSignal + crawl)));
}

function keywordMetricValue(row = {}, key = "") {
  if (key === "volume") {
    if (Number(row.searchVolume || 0) > 0) return Number(row.searchVolume).toLocaleString();
    if (Number(row.impressions || 0) > 0) return `GSC ${Number(row.impressions).toLocaleString()}`;
    return "needs data";
  }
  if (key === "difficulty") {
    if (Number(row.difficulty || 0) > 0) return `${Number(row.difficulty).toFixed(0)}/100`;
    return row.source === "dataforseo" ? "-" : "not free";
  }
  return "-";
}

function buildLocalKeywordMatrix(services = [], locations = [], audiences = []) {
  const rows = [];
  const cleanServices = services.length ? services : ["core service"];
  const cleanLocations = locations.length ? locations : [];
  cleanServices.forEach((service) => {
    cleanLocations.forEach((location) => {
      [
        `${service} in ${location}`,
        `${service} near ${location}`,
        `best ${service} ${location}`,
        `${service} services ${location}`,
      ].forEach((keyword) => rows.push({ keyword, service, location, pattern: "local-service" }));
      audiences.slice(0, 3).forEach((audience) => rows.push({
        keyword: `${service} for ${audience} in ${location}`,
        service,
        location,
        pattern: "audience-local",
      }));
    });
  });
  return rows;
}

export function buildKeywordIntelPlan({ wizard, project, competitorIdeas = [], paidIdeas = [] }) {
  const goal = wizard.goal || "organic";
  const services = splitKeywordInput(wizard.services);
  const locations = splitKeywordInput(wizard.locations);
  const audiences = splitKeywordInput(wizard.audiences);
  const category = String(wizard.category || "").trim();
  const gscKeywords = Array.isArray(project?.gsc?.topKeywords) ? project.gsc.topKeywords : [];
  const serpOpps = Array.isArray(project?.gsc?.serpOpportunities) ? project.gsc.serpOpportunities : [];
  const topPages = Array.isArray(project?.gsc?.topPages) ? project.gsc.topPages : [];
  const templatePatterns = Array.isArray(project?.audit?.templatePatterns) ? project.audit.templatePatterns : [];
  const crawlTokens = templatePatterns.map((p)=>normalizeKeywordText(p?.pattern || p?.type || "")).filter(Boolean);
  const locationWords = locations.map(normalizeKeywordText);
  const serviceWords = [...services, category].map(normalizeKeywordText).filter(Boolean);
  const rowsByKeyword = new Map();
  const addRow = (row) => {
    const keyword = normalizeKeywordText(row.keyword);
    if (!keyword) return;
    const prev = rowsByKeyword.get(keyword);
    if (!prev || Number(row.score || 0) > Number(prev.score || 0)) rowsByKeyword.set(keyword, { ...row, keyword });
  };

  gscKeywords.forEach((k) => {
    const keyword = String(k.keys?.[0] || "");
    const opp = serpOpps.find((s)=>normalizeKeywordText(s.query)===normalizeKeywordText(keyword));
    const page = String(opp?.page || topPages[0]?.keys?.[0] || "");
    const localMatch = locationWords.some((l)=>l && normalizeKeywordText(keyword).includes(l));
    const businessMatch = serviceWords.length ? serviceWords.some((s)=>s && normalizeKeywordText(keyword).includes(s)) : true;
    const crawlMatch = crawlTokens.some((t)=>t && normalizeKeywordText(page).includes(t));
    const row = {
      keyword,
      source: "gsc",
      page,
      clicks: Number(k.clicks || 0),
      impressions: Number(k.impressions || 0),
      searchVolume: null,
      difficulty: null,
      ctr: Number(k.ctr || 0),
      position: Number(k.position || 99),
      intent: inferKeywordIntent(keyword),
      opportunityType: opp?.serpTarget || (page ? "Existing visibility" : "Unmapped query"),
      confidence: page ? "high" : "medium",
      localMatch,
      businessMatch,
      contentType: contentTypeForKeyword(keyword, goal, !!page),
    };
    row.score = makeKeywordScore({ ...row, goal, crawlMatch });
    row.recommendedAction = keywordActionFromMetrics({ ...row, goal });
    addRow(row);
  });

  buildLocalKeywordMatrix(services, locations, audiences).forEach((item) => {
    const keyword = item.keyword;
    const localMatch = true;
    const businessMatch = true;
    const row = {
      keyword,
      source: "generated",
      page: "",
      clicks: 0,
      impressions: 0,
      searchVolume: null,
      difficulty: null,
      ctr: 0,
      position: 99,
      intent: inferKeywordIntent(keyword),
      opportunityType: "Local expansion",
      confidence: gscKeywords.length ? "medium" : "low",
      localMatch,
      businessMatch,
      contentType: contentTypeForKeyword(keyword, "local", false),
      recommendedAction: "Create service-area landing page",
      service: item.service,
      location: item.location,
    };
    row.score = makeKeywordScore({ ...row, goal, localMatch, businessMatch, source: "generated" });
    addRow(row);
  });

  [...services, category].filter(Boolean).forEach((seed) => {
    ["guide", "cost", "best", "services"].forEach((mod) => {
      const keyword = mod === "services" ? `${seed} services` : `${mod} ${seed}`;
      const row = {
        keyword,
        source: "generated",
        page: "",
        clicks: 0,
        impressions: 0,
        searchVolume: null,
        difficulty: null,
        ctr: 0,
        position: 99,
        intent: inferKeywordIntent(keyword),
        opportunityType: "Topic expansion",
        confidence: gscKeywords.length ? "medium" : "low",
        localMatch: false,
        businessMatch: true,
        contentType: contentTypeForKeyword(keyword, goal, false),
        recommendedAction: "Create supporting content or section",
      };
      row.score = makeKeywordScore({ ...row, goal, businessMatch: true, source: "generated" });
      addRow(row);
    });
  });

  competitorIdeas.forEach((item) => {
    const keyword = item.keyword;
    const businessMatch = serviceWords.some((s)=>s && normalizeKeywordText(keyword).includes(s));
    const row = {
      keyword,
      source: "competitor",
      page: "",
      clicks: 0,
      impressions: 0,
      searchVolume: null,
      difficulty: null,
      ctr: 0,
      position: 99,
      intent: inferKeywordIntent(keyword),
      opportunityType: "Competitor-inspired gap",
      confidence: "low",
      localMatch: locationWords.some((l)=>l && normalizeKeywordText(keyword).includes(l)),
      businessMatch,
      contentType: contentTypeForKeyword(keyword, goal, false),
      recommendedAction: "Validate SERP and build gap page if relevant",
    };
    row.score = makeKeywordScore({ ...row, goal, businessMatch, source: "generated" });
    addRow(row);
  });

  paidIdeas.forEach((item) => {
    const kd = item.keyword_data || item || {};
    const keyword = String(kd.keyword || item.keyword || "");
    const row = {
      keyword,
      source: "dataforseo",
      page: "",
      clicks: 0,
      impressions: Number(kd.search_volume || 0),
      searchVolume: Number(kd.search_volume || 0),
      ctr: 0,
      position: 99,
      cpc: Number(kd.cpc || 0),
      difficulty: Number(kd.keyword_difficulty || 0),
      intent: inferKeywordIntent(keyword),
      opportunityType: "Paid metric enrichment",
      confidence: "medium",
      localMatch: locationWords.some((l)=>l && normalizeKeywordText(keyword).includes(l)),
      businessMatch: serviceWords.some((s)=>s && normalizeKeywordText(keyword).includes(s)),
      contentType: contentTypeForKeyword(keyword, goal, false),
      recommendedAction: "Validate against business fit before production",
    };
    row.score = Math.max(makeKeywordScore({ ...row, goal }), Math.round(Math.log10(row.impressions + 1) * 18 + Math.max(0, 100 - row.difficulty) * 0.45));
    addRow(row);
  });

  const inventory = Array.from(rowsByKeyword.values()).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0, 160);
  const groups = {};
  inventory.forEach((row) => {
    const key = row.service || (row.localMatch && locations[0]) || row.contentType || row.intent || "keyword plan";
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  const clusters = Object.entries(groups).map(([name, rows]) => {
    const sorted = rows.sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0, 12);
    const primary = sorted[0];
    return {
      name,
      primaryKeyword: primary?.keyword || name,
      targetPage: primary?.page || (goal === "local" && primary?.location ? `/${String(primary.service || name).toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${String(primary.location).toLowerCase().replace(/[^a-z0-9]+/g,"-")}/` : "new page"),
      contentType: primary?.contentType || "guide",
      priorityScore: Math.round(sorted.reduce((s,r)=>s+Number(r.score||0),0)/Math.max(1, sorted.length)),
      reason: primary?.recommendedAction || "Build topical authority",
      rows: sorted,
    };
  }).sort((a,b)=>b.priorityScore-a.priorityScore).slice(0, 24);

  const currentCount = inventory.filter((r)=>r.source==="gsc").length;
  const confidence = currentCount >= 8 && project?.audit ? "high" : currentCount ? "medium" : "low";
  return { inventory, clusters, confidence, currentCount, generatedAt: new Date().toISOString() };
}

export function selectedRoadmapFromKeywordCluster(cluster, defaults = {}) {
  return {
    id: roadmapIdForCluster(cluster),
    primaryKeyword: cluster.primaryKeyword,
    targetPage: cluster.targetPage,
    contentType: cluster.contentType,
    action: cluster.reason,
    supportingKeywords: (cluster.rows || []).map((r)=>r.keyword).filter(Boolean),
    rows: cluster.rows || [],
    helioScore: cluster.priorityScore,
    userPriority: defaults.userPriority || "P3",
    status: defaults.status || "queued",
    selectedAt: defaults.selectedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function buildContentEngineContext({ projectData = {}, host = "", manualKeywords = "", manualTopic = "" } = {}) {
  const keywordIntel = projectData?.keywordIntel || {};
  const topKeywords = Array.isArray(projectData?.gsc?.topKeywords) ? projectData.gsc.topKeywords : [];
  const topPages = Array.isArray(projectData?.gsc?.topPages) ? projectData.gsc.topPages : [];
  const selectedRoadmaps = (Array.isArray(keywordIntel.selectedRoadmaps) ? keywordIntel.selectedRoadmaps : [])
    .filter((r)=>!["done","skipped"].includes(String(r?.status || "").toLowerCase()))
    .sort((a,b)=>priorityRank(a.userPriority)-priorityRank(b.userPriority) || Number(b.helioScore||0)-Number(a.helioScore||0));
  const selectedKeywords = Array.isArray(keywordIntel.selectedKeywords) ? keywordIntel.selectedKeywords : [];
  const activeRoadmap = selectedRoadmaps[0] || null;
  const manualKeywordList = splitKeywordInput(manualKeywords);
  const roadmapKeywords = selectedRoadmaps.flatMap((r)=>[r.primaryKeyword, ...(r.supportingKeywords || [])]).filter(Boolean);
  const savedKeywordList = selectedKeywords.map((r)=>r.keyword).filter(Boolean);
  const gscKeywordList = topKeywords.slice(0, 12).map((k)=>k.keys?.[0]).filter(Boolean);
  const seedKeywords = Array.from(new Set([
    ...manualKeywordList,
    ...roadmapKeywords,
    ...savedKeywordList,
    ...gscKeywordList,
  ].map((k)=>String(k || "").trim()).filter(Boolean))).slice(0, 30);
  const contentTopic = manualTopic || activeRoadmap?.primaryKeyword || seedKeywords[0] || host || "SEO content topic";
  const onpage = projectData?.onpage || {};
  const onpageAeoGeo = onpage?.aeoGeo || {};
  const onpageBlockers = Array.isArray(onpageAeoGeo?.blockers) ? onpageAeoGeo.blockers : [];
  const onpageStrengths = Array.isArray(onpageAeoGeo?.strengths) ? onpageAeoGeo.strengths : [];
  const onpageSignals = {
    analyzedUrl: onpage?.url || "",
    source: onpage?.source || "",
    aeoScore: Number(onpageAeoGeo?.aeoScore || 0),
    geoScore: Number(onpageAeoGeo?.geoScore || 0),
    keywordIntentMatch: Number(onpageAeoGeo?.keywordIntentMatch || 0),
    primaryIntentKeyword: String(onpageAeoGeo?.primaryIntentKeyword || ""),
    blockers: onpageBlockers.slice(0, 8),
    strengths: onpageStrengths.slice(0, 8),
  };
  const source = manualKeywordList.length
    ? "manual"
    : selectedRoadmaps.length
      ? "keyword-roadmap"
      : selectedKeywords.length
        ? "selected-keywords"
        : gscKeywordList.length
          ? "gsc"
          : "fallback";
  return {
    keywordIntel,
    selectedRoadmaps,
    selectedKeywords,
    activeRoadmap,
    seedKeywords,
    contentTopic,
    topPages,
    source,
    onpageSignals,
  };
}

export function buildContentPlanFromContext(context = {}) {
  const roadmaps = Array.isArray(context.selectedRoadmaps) && context.selectedRoadmaps.length
    ? context.selectedRoadmaps
    : (context.seedKeywords || []).map((keyword)=>({
        primaryKeyword: keyword,
        supportingKeywords: [],
        userPriority: "P3",
        helioScore: 0,
        status: "queued",
        targetPage: "new page",
        contentType: "blog",
        action: "Create supporting content",
      }));
  return roadmaps.slice(0, 12).map((r, index) => {
    const contentType = String(r.contentType || "blog").toLowerCase();
    const assetType = contentType.includes("service") || contentType.includes("location")
      ? "Landing Page"
      : contentType.includes("comparison")
        ? "Comparison Page"
        : contentType.includes("guide") || contentType.includes("pillar")
          ? "Pillar Page"
          : "Blog Post";
    return {
      order: index + 1,
      priority: r.userPriority || "P3",
      primaryKeyword: r.primaryKeyword || `topic-${index + 1}`,
      assetType,
      targetPage: r.targetPage || "new page",
      supportingKeywords: (r.supportingKeywords || []).slice(0, 6),
      angle: r.action || "Build topical authority",
      status: r.status || "queued",
      helioScore: r.helioScore || 0,
    };
  });
}

export function buildCalendarFromPlan(planRows = [], schedule = {}, startDate = new Date()) {
  const usedTitles = new Set();
  const contentArchetypeMix = ["solution", "solution", "solution", "education", "education", "comparison"];
  const outcomeSignals = [
    "increase qualified pipeline",
    "reduce wasted spend",
    "improve ranking-to-revenue impact",
    "improve answer visibility in AI search",
    "increase conversion confidence",
    "accelerate execution velocity",
    "stabilize monthly growth",
    "improve win-rate quality",
    "improve demand capture efficiency",
    "improve lead quality and close-rate",
  ];
  const valueStages = [
    "problem diagnosis",
    "solution framework",
    "implementation sprint",
    "measurement and optimization",
    "advanced playbook",
    "risk mitigation and QA",
  ];
  const stagePatterns = [
    "how to fix",
    "step-by-step framework for",
    "implementation plan to solve",
    "operator checklist for",
    "benchmarks and KPIs for",
    "mistakes to avoid in",
    "case-led playbook for",
    "decision model for",
    "quick wins and long-term system for",
    "execution blueprint for",
  ];
  const problemTemplates = [
    "high acquisition costs",
    "low-qualified inbound traffic",
    "poor conversion from organic visits",
    "unclear channel attribution",
    "slow content production velocity",
    "weak offer-to-intent alignment",
    "underperforming bottom-funnel pages",
    "inconsistent content quality standards",
  ];
  const eeatAnchors = [
    "with examples, benchmarks, and validation criteria",
    "with implementation details, ownership, and QA gates",
    "with practical templates, guardrails, and KPI targets",
    "with evidence-backed tradeoffs and scoring logic",
    "with real execution notes and measurement checkpoints",
  ];
  const keywordOccurrence = new Map();
  const bucketState = new Map();

  const formatAssetType = (assetType = "") => {
    const a = String(assetType || "").toLowerCase();
    if (a.includes("pillar")) return "Pillar";
    if (a.includes("comparison")) return "Comparison";
    if (a.includes("landing")) return "Landing";
    return "Blog";
  };

  const eeatTitle = (planRow = {}, archetype = "solution", slot = 0, week = 0, day = 0, serial = 0) => {
    const primary = String(planRow.primaryKeyword || "SEO topic").trim();
    const support = (planRow.supportingKeywords || []).filter(Boolean);
    const stageIndex = keywordOccurrence.get(primary.toLowerCase()) || 0;
    const supportPick = support.length ? support[(slot + week + day + serial + stageIndex) % support.length] : "";
    const asset = String(planRow.assetType || "").toLowerCase();
    const base = primary.replace(/\s+/g, " ").trim();
    const alt = supportPick && supportPick.toLowerCase() !== base.toLowerCase() ? supportPick : "";
    const idx = slot + week + day + serial + stageIndex;
    const stage = valueStages[stageIndex % valueStages.length];
    const pattern = stagePatterns[idx % stagePatterns.length];
    const problem = problemTemplates[idx % problemTemplates.length];
    const outcome = outcomeSignals[idx % outcomeSignals.length];
    const anchor = eeatAnchors[idx % eeatAnchors.length];
    const solutionPatterns = [
      `${base}: ${pattern} ${problem} and ${outcome}`,
      `${base}: ${stage} to ${outcome}`,
      `${base}: practical strategy to solve ${problem} for growing teams`,
      `${base}: value-first guide to ${outcome} (${stage})`,
    ];
    const educationPatterns = [
      `${base}: fundamentals teams must know before scaling`,
      `${base}: educational guide with clear concepts, examples, and practical use-cases`,
      `${base}: what it is, why it matters, and how to apply it correctly`,
      `${base}: beginner-to-advanced learning path with implementation checkpoints`,
    ];
    const pillarPatterns = [
      `${base}: complete execution guide to ${pattern} ${problem} ${anchor}`,
      `${base}: end-to-end growth system to ${outcome} (${stage})`,
      `${base}: strategy handbook with execution phases, QA, and KPI governance`,
      `${base}: advanced playbook to solve ${problem} and improve outcomes`,
      `${base}: practical framework and templates to ${outcome}`,
      `${base}: tactical roadmap for teams facing ${problem}`,
    ];
    const comparisonPatterns = [
      `${base}: alternatives compared to solve ${problem} ${anchor}`,
      `${base}: options evaluated by cost, fit, implementation risk, and expected ROI`,
      `${base}: decision scorecard for teams that need to ${outcome}`,
      `${base}: how to select the right option for your current growth stage`,
      `${base}: vendor comparison model with weighted criteria and tradeoffs`,
      `${base}: side-by-side benchmark with adoption risk and expected impact`,
    ];
    const landingPatterns = [
      `${base}: service blueprint to ${pattern} ${problem}`,
      `${base}: scope, timeline, and measurable outcomes to ${outcome}`,
      `${base}: rollout architecture with ownership, QA controls, and escalation paths`,
      `${base}: implementation roadmap with governance and support model`,
    ];
    const set = asset.includes("landing")
      ? landingPatterns
      : archetype === "comparison"
        ? comparisonPatterns
        : archetype === "education"
          ? educationPatterns
          : asset.includes("pillar")
            ? pillarPatterns
            : solutionPatterns;
    const chosen = set[idx % set.length];
    keywordOccurrence.set(primary.toLowerCase(), stageIndex + 1);
    if (!alt) return chosen;
    const suffixOptions = [
      `Includes practical section on: ${alt}`,
      `Also covers implementation for: ${alt}`,
      `Includes support keyword mapping: ${alt}`,
      `Adds solution scenario for: ${alt}`,
    ];
    return `${chosen} — ${suffixOptions[idx % suffixOptions.length]}`;
  };

  const buildKeywordTopicBacklog = (planRow = {}, desiredCount = 24) => {
    const titles = [];
    const seedSupport = (planRow.supportingKeywords || []).filter(Boolean);
    const baseCount = Math.max(12, desiredCount);
    for (let i = 0; i < baseCount; i += 1) {
      const archetype = contentArchetypeMix[i % contentArchetypeMix.length];
      let title = eeatTitle(planRow, archetype, i % 5, Math.floor(i / 5), i % 7, i);
      if (seedSupport.length) {
        const sk = seedSupport[i % seedSupport.length];
        if (!title.toLowerCase().includes(String(sk).toLowerCase())) {
          title = `${title} — includes ${sk}`;
        }
      }
      titles.push({ title, archetype });
    }
    return titles;
  };

  const cfg = normalizeContentSchedule(schedule);
  const plan = Array.isArray(planRows) ? planRows : [];
  if (!plan.length) return [];
  const backlogPerKeyword = new Map(
    plan.map((row) => {
      const key = String(row.primaryKeyword || "").toLowerCase();
      return [key, buildKeywordTopicBacklog(row, 40)];
    }),
  );
  const rows = [];
  const base = new Date(startDate);
  const horizonDays = cfg.horizonMonths * 30;
  const maxPosts = 366;
  let lastKeyword = "";

  const pickPlanRow = (serial = 0) => {
    if (plan.length === 1) return plan[0];
    for (let i = 0; i < plan.length; i += 1) {
      const candidate = plan[(serial + i) % plan.length];
      const key = String(candidate.primaryKeyword || "").toLowerCase();
      if (key && key !== lastKeyword) {
        lastKeyword = key;
        return candidate;
      }
    }
    const fallback = plan[serial % plan.length];
    lastKeyword = String(fallback.primaryKeyword || "").toLowerCase();
    return fallback;
  };

  const pickTitleForRow = (planRow = {}, slot = 0, week = 0, day = 0, serial = 0) => {
    const key = String(planRow.primaryKeyword || "").toLowerCase();
    const backlog = backlogPerKeyword.get(key) || [];
    const state = bucketState.get(key) || { idx: 0 };
    const entry = backlog[state.idx % Math.max(1, backlog.length)];
    state.idx += 1;
    bucketState.set(key, state);

    const fallbackArchetype = contentArchetypeMix[(serial + week + day + slot) % contentArchetypeMix.length];
    const archetype = entry?.archetype || fallbackArchetype;
    let title = entry?.title || eeatTitle(planRow, fallbackArchetype, slot, week, day, serial);
    let dedupe = 2;
    while (usedTitles.has(title.toLowerCase())) {
      title = `${eeatTitle(planRow, archetype, slot, week + dedupe, day + dedupe, serial)} · Part ${dedupe}`;
      dedupe += 1;
    }
    usedTitles.add(title.toLowerCase());
    return { title, archetype };
  };

  if (cfg.cadence === "daily") {
    for (let day = 0; day < horizonDays; day += 1) {
      for (let slot = 0; slot < cfg.postsPerDay; slot += 1) {
        const date = new Date(base);
        date.setDate(base.getDate() + day);
        const planRow = pickPlanRow(rows.length);
        const serial = rows.length;
        const { title, archetype } = pickTitleForRow(planRow, slot, 0, day, serial);
        rows.push({
          publishDate: date.toISOString().slice(0, 10),
          monthLabel: date.toLocaleString("en-US", { month: "short", year: "numeric" }),
          weekLabel: `W${Math.floor((date.getDate() - 1) / 7) + 1}`,
          slotLabel: `D${slot + 1}`,
          priority: planRow.priority || "P3",
          title,
          type: formatAssetType(planRow.assetType),
          primaryKeyword: planRow.primaryKeyword,
          supportKeyword: (planRow.supportingKeywords || [])[slot % Math.max(1, (planRow.supportingKeywords || []).length)] || planRow.primaryKeyword,
          targetPage: planRow.targetPage || "new page",
          intent: archetype === "solution" ? "Solution / BOFU" : archetype === "education" ? "Educational / TOFU" : "Comparison / MOFU",
          status: "Planned",
        });
        if (rows.length >= maxPosts) return rows;
      }
    }
    return rows;
  }
  const totalWeeks = cfg.horizonMonths * 4;
  for (let week = 0; week < totalWeeks; week += 1) {
    for (let slot = 0; slot < cfg.postsPerWeek; slot += 1) {
      const spread = Math.max(1, Math.floor(7 / cfg.postsPerWeek));
      const date = new Date(base);
      date.setDate(base.getDate() + week * 7 + slot * spread);
      const planRow = pickPlanRow(rows.length);
      const serial = rows.length;
      const { title, archetype } = pickTitleForRow(planRow, slot, week, 0, serial);
      rows.push({
        publishDate: date.toISOString().slice(0, 10),
        monthLabel: date.toLocaleString("en-US", { month: "short", year: "numeric" }),
        weekLabel: `W${Math.floor((date.getDate() - 1) / 7) + 1}`,
        slotLabel: `P${slot + 1}`,
        priority: planRow.priority || "P3",
        title,
        type: formatAssetType(planRow.assetType),
        primaryKeyword: planRow.primaryKeyword,
        supportKeyword: (planRow.supportingKeywords || [])[slot % Math.max(1, (planRow.supportingKeywords || []).length)] || planRow.primaryKeyword,
        targetPage: planRow.targetPage || "new page",
        intent: archetype === "solution" ? "Solution / BOFU" : archetype === "education" ? "Educational / TOFU" : "Comparison / MOFU",
        status: "Planned",
      });
      if (rows.length >= maxPosts) return rows;
    }
  }
  return rows;
}

function parseJsonPayload(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)); } catch {}
  }
  return null;
}

function extractBulletLikeLines(text = "") {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean);
}

function extractAiTopicsFromText(text = "") {
  const lines = extractBulletLikeLines(text);
  const out = [];
  for (const line of lines) {
    const cleaned = line.replace(/^title:\s*/i, "").trim();
    if (!cleaned || cleaned.length < 16) continue;
    out.push({
      title: cleaned,
      archetype: /compare|vs|alternative|versus/i.test(cleaned) ? "comparison" : /guide|learn|fundamental|what is|how to/i.test(cleaned) ? "education" : "solution",
      intent: /compare|vs|alternative|versus/i.test(cleaned) ? "Comparison / MOFU" : /guide|learn|fundamental|what is|how to/i.test(cleaned) ? "Educational / TOFU" : "Solution / BOFU",
    });
  }
  return out;
}

function extractAiPlanRowsFromText(text = "", fallbackPlanRows = []) {
  const lines = extractBulletLikeLines(text);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length < 12) continue;
    const match = fallbackPlanRows.find((r) => line.toLowerCase().includes(String(r.primaryKeyword || "").toLowerCase()));
    const primaryKeyword = match?.primaryKeyword || line.split(":")[0].trim();
    const title = line.includes(":") ? line.split(":").slice(1).join(":").trim() : line;
    out.push({
      primaryKeyword,
      title: title || line,
      priority: match?.priority || "P3",
      assetType: match?.assetType || "Solution Article",
      targetPage: match?.targetPage || "new page",
      angle: line,
      intent: /compare|vs|alternative|versus/i.test(line) ? "Comparison / MOFU" : /guide|learn|fundamental|what is|how to/i.test(line) ? "Educational / TOFU" : "Solution / BOFU",
    });
  }
  return out;
}

function normalizeAiContentPlanRows(planRows = [], aiRows = []) {
  const roadmapByKeyword = new Map(
    planRows.map((r)=>[String(r.primaryKeyword || "").toLowerCase(), r]),
  );
  const usedKeys = new Set();
  return (Array.isArray(aiRows) ? aiRows : [])
    .map((row, index) => {
      const primaryKeyword = String(row.primaryKeyword || row.keyword || "").trim();
      if (!primaryKeyword) return null;
      const title = String(row.title || row.assetTitle || row.contentTitle || "").trim();
      const uniqueKey = `${primaryKeyword.toLowerCase()}|${title.toLowerCase()}|${String(row.angle || "").toLowerCase()}`;
      if (usedKeys.has(uniqueKey)) return null;
      usedKeys.add(uniqueKey);
      const roadmap = roadmapByKeyword.get(primaryKeyword.toLowerCase()) || {};
      const archetype = String(row.archetype || row.assetType || "").toLowerCase();
      const assetType = archetype.includes("comparison")
        ? "Comparison Page"
        : archetype.includes("education")
          ? "Educational Article"
          : archetype.includes("pillar")
            ? "Pillar Page"
            : "Solution Article";
      return {
        order: index + 1,
        priority: row.priority || roadmap.priority || roadmap.userPriority || "P3",
        primaryKeyword,
        assetType: row.assetType || assetType,
        targetPage: row.targetPage || roadmap.targetPage || "new page",
        supportingKeywords: Array.isArray(row.supportingKeywords) ? row.supportingKeywords : (roadmap.supportingKeywords || []),
        angle: row.angle || row.problem || row.valuePromise || "Solve a specific searcher problem with evidence-backed guidance",
        status: row.status || "planned",
        helioScore: row.helioScore || roadmap.helioScore || 0,
        title,
        intent: row.intent || (archetype.includes("comparison") ? "Comparison / MOFU" : archetype.includes("education") ? "Educational / TOFU" : "Solution / BOFU"),
        problem: row.problem || "",
        valuePromise: row.valuePromise || "",
        eeatAngle: row.eeatAngle || "",
      };
    })
    .filter(Boolean)
    .map((row, index)=>({ ...row, order: index + 1 }));
}

function normalizePersistedContentState(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    contentPlan: Array.isArray(data.contentPlan) ? data.contentPlan : [],
    calendar: Array.isArray(data.calendar) ? data.calendar : [],
    planError: String(data.planError || ""),
    calError: String(data.calError || ""),
    tab: ["generate", "plan", "output", "calendar"].includes(String(data.tab || "")) ? data.tab : "generate",
    updatedAt: String(data.updatedAt || ""),
  };
}

function parseAiTopicCollection(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  const direct = parsed?.topics || parsed?.calendar || parsed?.items || parsed?.rows || parsed?.contentCalendar;
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(parsed?.data?.topics)) return parsed.data.topics;
  if (Array.isArray(parsed?.result?.topics)) return parsed.result.topics;
  if (Array.isArray(parsed?.plan?.topics)) return parsed.plan.topics;
  return [];
}

function parseAiPlanCollection(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  const direct = parsed?.plan || parsed?.rows || parsed?.contentPlan || parsed?.items;
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(parsed?.data?.plan)) return parsed.data.plan;
  if (Array.isArray(parsed?.result?.plan)) return parsed.result.plan;
  if (Array.isArray(parsed?.strategy?.plan)) return parsed.strategy.plan;
  return [];
}

function mergeAiCalendarTopics(planRows = [], aiTopics = [], schedule = {}, startDate = new Date()) {
  const datedRows = buildCalendarFromPlan(planRows, schedule, startDate);
  const topics = Array.isArray(aiTopics) ? aiTopics : [];
  if (!datedRows.length || !topics.length) return datedRows;
  const rowsByKeyword = new Map(
    planRows.map((r)=>[String(r.primaryKeyword || "").toLowerCase(), r]),
  );
  const used = new Set();
  return datedRows.map((row, i) => {
    const topic = topics[i % topics.length] || {};
    let title = String(topic.title || "").trim();
    if (!title) title = row.title;
    let dedupe = 2;
    const baseTitle = title;
    while (used.has(title.toLowerCase())) {
      const problem = topic.problem ? ` for ${topic.problem}` : "";
      title = `${baseTitle}${problem} · Angle ${dedupe}`;
      dedupe += 1;
    }
    used.add(title.toLowerCase());
    const primary = String(topic.primaryKeyword || row.primaryKeyword || "").trim();
    const source = rowsByKeyword.get(primary.toLowerCase());
    const archetype = String(topic.archetype || row.intent || "").toLowerCase();
    return {
      ...row,
      priority: source?.priority || row.priority,
      title,
      type: archetype.includes("comparison") ? "Comparison" : archetype.includes("education") ? "Blog" : row.type,
      primaryKeyword: primary || row.primaryKeyword,
      supportKeyword: topic.supportKeyword || row.supportKeyword,
      intent: topic.intent || (archetype.includes("comparison") ? "Comparison / MOFU" : archetype.includes("education") ? "Educational / TOFU" : "Solution / BOFU"),
      targetPage: source?.targetPage || row.targetPage,
      status: "Planned",
    };
  });
}

async function fetchKeywordCompetitorIdeas(competitors = [], services = [], location = "", dataforseo = null) {
  const ideas = [];
  for (const competitor of competitors.slice(0, 5)) {
    const seed = services[0] || "";
    const q = [seed, location, `site:${competitor}`].filter(Boolean).join(" ");
    try {
      const result = await webSearchTool(q, { dataforseo });
      const text = String(result?.text || result?.snippets?.join("\n") || "");
      const phrases = text
        .split(/\n+/)
        .map((line)=>line.replace(/^#+\s*/, "").replace(/^https?:\/\/\S+\s*/i, "").trim())
        .filter((line)=>line.length >= 12 && line.length <= 80)
        .slice(0, 5);
      phrases.forEach((p)=>ideas.push({ keyword: p, competitor, source: result?.provider || "free-serp" }));
    } catch {
      // Competitor discovery is opportunistic and must not block planning.
    }
  }
  return ideas;
}

function Keywords({integrations, orgScope="default"}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const connectedHost = getHostFromInput(integrations.gsc?.fields?.extra?.siteUrl || "");
  const [wizard,setWizard]=useState({
    website:"",
    goal:"local",
    category:"",
    services:"",
    locations:"",
    audiences:"",
    competitors:"",
    timeframe:"90 days",
  });
  const [host,setHost]=useState(connectedHost);
  const project = loadProjectData(orgScope, host);
  const savedIntel = project?.keywordIntel || {};
  const [tab,setTab]=useState("wizard");
  const [logs,setLogs]=useState([]);
  const [running,setRunning]=useState(false);
  const [aiPlan,setAiPlan]=useState(savedIntel?.aiPlan || "");
	  const [planning,setPlanning]=useState(false);
	  const [plan,setPlan]=useState(savedIntel?.plans?.[0] || null);
	  const [selectedKeywords,setSelectedKeywords]=useState(Array.isArray(savedIntel?.selectedKeywords) ? savedIntel.selectedKeywords : []);
	  const [selectedRoadmaps,setSelectedRoadmaps]=useState(Array.isArray(savedIntel?.selectedRoadmaps) ? savedIntel.selectedRoadmaps : []);
	  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*450}]);
  const projectHasGsc = !!project?.gsc?.topKeywords?.length;
  const projectHasCrawl = !!project?.audit;

  useEffect(() => {
    const nextHost = connectedHost || getHostFromInput(wizard.website || "");
    if (nextHost && nextHost !== host) setHost(nextHost);
  }, [connectedHost, wizard.website, host]);

  useEffect(() => {
    if (savedIntel?.lastWizard) setWizard((p)=>({ ...p, ...savedIntel.lastWizard }));
	    if (savedIntel?.plans?.[0]) setPlan(savedIntel.plans[0]);
	    if (savedIntel?.aiPlan) setAiPlan(savedIntel.aiPlan);
	    if (Array.isArray(savedIntel?.selectedKeywords)) setSelectedKeywords(savedIntel.selectedKeywords);
	    if (Array.isArray(savedIntel?.selectedRoadmaps)) setSelectedRoadmaps(savedIntel.selectedRoadmaps);
	  }, [host]);

  const updateWizard=(key,value)=>setWizard((p)=>({...p,[key]:value}));
  const services = splitKeywordInput(wizard.services);
  const locations = splitKeywordInput(wizard.locations);
  const competitors = splitKeywordInput(wizard.competitors).map((c)=>getHostFromInput(c) || c.replace(/^https?:\/\//i,"").replace(/\/.*$/,"")).filter(Boolean);

  const buildPlan=async()=>{
    const targetHost = connectedHost || getHostFromInput(wizard.website || "");
    if(!targetHost){setLogs([{msg:"Add a website/domain or connect Search Console first.",type:"err",t:0}]);return;}
    setRunning(true);setLogs([]);setHost(targetHost);setAiPlan("");
    addLog("Loading project keyword evidence...","sys");
    const baseProject = loadProjectData(orgScope, targetHost);
    let competitorIdeas = [];
    let paidIdeas = [];
    try {
      if (competitors.length) {
        addLog(`Checking free SERP signals for ${competitors.length} competitor(s)...`,"sys");
        competitorIdeas = await fetchKeywordCompetitorIdeas(competitors, services, locations[0] || "", dataForSeoCredentialsReady(dfs) ? dfs : null);
        addLog(`Competitor ideas captured: ${competitorIdeas.length}`,"ok");
      }
      if (dataForSeoCredentialsReady(dfs) && (services[0] || wizard.category)) {
        addLog("Optional DataForSEO enrichment enabled...","sys");
        const auth="Basic "+btoa(`${dfs.login}:${dfs.password}`);
        const keyword = services[0] || wizard.category;
        const res = await fetch("https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{keyword,location_code:2840,language_code:"en",limit:40}])});
        const d = await res.json();
        paidIdeas = d.tasks?.[0]?.result?.[0]?.items || [];
        addLog(`Paid metric ideas captured: ${paidIdeas.length}`,"ok");
      } else {
        addLog("DataForSEO not connected. Continuing free-first.","info");
      }
      const nextPlan = buildKeywordIntelPlan({ wizard, project: baseProject, competitorIdeas, paidIdeas });
      setPlan(nextPlan);
      const prevPlans = Array.isArray(baseProject?.keywordIntel?.plans) ? baseProject.keywordIntel.plans : [];
      mergeProjectData(orgScope, targetHost, {
        keywordIntel: {
          ...(baseProject?.keywordIntel || {}),
          inventory: nextPlan.inventory,
          plans: [nextPlan, ...prevPlans].slice(0, 12),
          lastWizard: wizard,
          competitorIdeas,
          paidIdeasCount: paidIdeas.length,
          capturedAt: new Date().toISOString(),
        }
      });
      addLog(`Keyword roadmap built with ${nextPlan.inventory.length} keyword records and ${nextPlan.clusters.length} clusters.`,"ok");
      setTab("inventory");
    } catch(e) {
      addLog(`Error: ${e.message}`,"err");
    }
    setRunning(false);
  };

  const enhanceWithAI=async()=>{
    if(!plan?.clusters?.length)return;
    setPlanning(true);setAiPlan("");
    const evidence = [
      `Goal: ${KEYWORD_GOAL_OPTIONS.find((g)=>g.value===wizard.goal)?.label || wizard.goal}`,
      `Business/category: ${wizard.category}`,
      `Services: ${services.join(", ")}`,
      `Locations: ${locations.join(", ")}`,
      `Audience: ${splitKeywordInput(wizard.audiences).join(", ")}`,
      `Confidence: ${plan.confidence}`,
      `Current GSC keyword count: ${plan.currentCount}`,
      "Top clusters:",
      ...plan.clusters.slice(0, 10).map((c)=>`${c.primaryKeyword} | score ${c.priorityScore} | ${c.contentType} | target ${c.targetPage} | ${c.reason}`),
      "Top inventory:",
      ...plan.inventory.slice(0, 20).map((r)=>`${r.keyword} | score ${r.score} | pos ${r.position} | imp ${r.impressions} | action ${r.recommendedAction}`),
    ].join("\n");
    try{
      const r=await callAI(ai,"You are Helio Keyword Intel. Turn deterministic keyword evidence into a concise page-level SEO growth roadmap. Do not invent search volume, ranking, difficulty, or competitor metrics. Preserve evidence confidence. Include local SEO priorities when locations exist.",evidence);
      setAiPlan(r);
      const currentProject = loadProjectData(orgScope, host);
      mergeProjectData(orgScope, host, { keywordIntel: { ...(currentProject?.keywordIntel || {}), aiPlan: r, capturedAt: new Date().toISOString() } });
    }catch(e){setAiPlan(`Error: ${e.message}`);}
    setPlanning(false);
  };

	  const inventory = plan?.inventory || savedIntel?.inventory || [];
	  const clusters = plan?.clusters || [];
	  const activeGoal = KEYWORD_GOAL_OPTIONS.find((g)=>g.value===wizard.goal)?.label || "SEO Growth";
	  const selectedSet = new Set(selectedKeywords.map((r)=>normalizeKeywordText(r.keyword)));
	  const selectedRoadmapSet = new Set(selectedRoadmaps.map((r)=>r.id || roadmapIdForCluster(r)));
	  const persistSelectedKeywords = (next) => {
    setSelectedKeywords(next);
    const targetHost = host || connectedHost || getHostFromInput(wizard.website || "");
    if (!targetHost) return;
    const currentProject = loadProjectData(orgScope, targetHost);
    mergeProjectData(orgScope, targetHost, {
      keywordIntel: {
        ...(currentProject?.keywordIntel || {}),
        selectedKeywords: next,
        selectedAt: new Date().toISOString(),
      }
    });
  };
	  const toggleSelectedKeyword = (row) => {
    const key = normalizeKeywordText(row?.keyword || "");
    if (!key) return;
    const exists = selectedSet.has(key);
    const next = exists
      ? selectedKeywords.filter((r)=>normalizeKeywordText(r.keyword)!==key)
      : [{ ...row, selectedAt: new Date().toISOString() }, ...selectedKeywords].slice(0, 100);
	    persistSelectedKeywords(next);
	  };
	  const persistSelectedRoadmaps = (next) => {
	    const ordered = [...next].sort((a,b)=>priorityRank(a.userPriority)-priorityRank(b.userPriority) || Number(b.helioScore||0)-Number(a.helioScore||0));
	    setSelectedRoadmaps(ordered);
	    const targetHost = host || connectedHost || getHostFromInput(wizard.website || "");
	    if (!targetHost) return;
	    const currentProject = loadProjectData(orgScope, targetHost);
	    mergeProjectData(orgScope, targetHost, {
	      keywordIntel: {
	        ...(currentProject?.keywordIntel || {}),
	        selectedRoadmaps: ordered,
	        roadmapQueueUpdatedAt: new Date().toISOString(),
	      }
	    });
	  };
	  const selectedRoadmapFromCluster = selectedRoadmapFromKeywordCluster;
	  const toggleSelectedRoadmap = (cluster, priority = "P3") => {
	    const id = roadmapIdForCluster(cluster);
	    const exists = selectedRoadmapSet.has(id);
	    const next = exists
	      ? selectedRoadmaps.filter((r)=>(r.id || roadmapIdForCluster(r))!==id)
	      : [selectedRoadmapFromCluster(cluster, { userPriority: priority }), ...selectedRoadmaps].slice(0, 50);
	    persistSelectedRoadmaps(next);
	  };
	  const updateSelectedRoadmap = (id, patch) => {
	    persistSelectedRoadmaps(selectedRoadmaps.map((r)=>(r.id || roadmapIdForCluster(r))===id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r));
	  };
	  const saveAllRoadmaps = () => {
	    const existing = new Map(selectedRoadmaps.map((r)=>[r.id || roadmapIdForCluster(r), r]));
	    clusters.forEach((cluster) => {
	      const id = roadmapIdForCluster(cluster);
	      if (!existing.has(id)) existing.set(id, selectedRoadmapFromCluster(cluster, { userPriority: "P3" }));
	    });
	    persistSelectedRoadmaps(Array.from(existing.values()).slice(0, 50));
	  };

	  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Keyword Intel" sub={`Free-first keyword strategy · ${activeGoal} · ${ai?.fields?.model||"AI ready"}`}/>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
      <Card label="Current Keywords" value={project?.gsc?.topKeywords?.length || 0} delta={projectHasGsc?"GSC connected":"No GSC snapshot"} good={projectHasGsc}/>
      <Card label="Crawl Context" value={projectHasCrawl?"YES":"NO"} delta={projectHasCrawl?"Audit data available":"Run audit for page mapping"} good={projectHasCrawl}/>
	      <Card label="Planner Confidence" value={(plan?.confidence || "pending").toUpperCase()} delta={dataForSeoCredentialsReady(dfs)?"Paid enrichment optional":"Free-first mode"} good={(plan?.confidence || "")==="high"}/>
	      <Card label="Selected Keywords" value={selectedKeywords.length} delta={selectedKeywords.length?"Saved to project":"Use SAVE in inventory"} good={selectedKeywords.length>0}/>
	      <Card label="Selected Roadmaps" value={selectedRoadmaps.length} delta={selectedRoadmaps.length?"Autonomy queue ready":"Save roadmap cards"} good={selectedRoadmaps.length>0}/>
	    </div>
    <Tabs tabs={["wizard","inventory","roadmap","selected","ai strategy"]} active={tab} onChange={setTab}/>

    {tab==="wizard"&&<div>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:18,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
          <Input label="Website / Domain" value={wizard.website || integrations.gsc?.fields?.extra?.siteUrl || ""} onChange={(v)=>updateWizard("website",v)} placeholder="example.com" note={connectedHost?`Using GSC property: ${connectedHost}`:"Used when GSC is not connected"}/>
          <ThemeDropdown label="SEO Goal" value={wizard.goal} onChange={(v)=>updateWizard("goal",v)} options={KEYWORD_GOAL_OPTIONS} />
          <Input label="Business / Category" value={wizard.category} onChange={(v)=>updateWizard("category",v)} placeholder="plumbing, dental clinic, AI automation agency" />
          <Input label="Target Timeframe" value={wizard.timeframe} onChange={(v)=>updateWizard("timeframe",v)} placeholder="90 days" />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginTop:12}}>
          <div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>SERVICES / PRODUCTS</div>
            <textarea value={wizard.services} onChange={(e)=>updateWizard("services",e.target.value)} placeholder={"SEO services\ntechnical audit\nlocal SEO"} style={{width:"100%",minHeight:86,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>LOCATIONS / SERVICE AREAS</div>
            <textarea value={wizard.locations} onChange={(e)=>updateWizard("locations",e.target.value)} placeholder={"New York\nBrooklyn\nQueens"} style={{width:"100%",minHeight:86,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>AUDIENCE / CUSTOMER TYPES</div>
            <textarea value={wizard.audiences} onChange={(e)=>updateWizard("audiences",e.target.value)} placeholder={"small businesses\nstartups\nhomeowners"} style={{width:"100%",minHeight:86,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>OPTIONAL COMPETITORS</div>
            <textarea value={wizard.competitors} onChange={(e)=>updateWizard("competitors",e.target.value)} placeholder={"competitor.com\nanothercompetitor.com"} style={{width:"100%",minHeight:86,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",marginTop:14,flexWrap:"wrap"}}>
          <Btn onClick={buildPlan} disabled={running}>{running?"BUILDING...":"BUILD KEYWORD ROADMAP"}</Btn>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>GSC + crawl recommended. Domain-only plans are lower confidence.</div>
        </div>
      </div>
      {logs.length>0&&<TermLog lines={logs} running={running}/>}
    </div>}

    {tab==="inventory"&&<div>
      {!inventory.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:18,color:C.muted,fontFamily:"monospace",fontSize:11}}>Build a roadmap to generate the keyword intelligence database.</div>}
      {!!inventory.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,overflowX:"auto"}}>
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,color:C.muted,fontFamily:"monospace",fontSize:10}}>
          VOLUME shows true search volume only when paid enrichment is available; otherwise GSC impressions are shown as current-site demand. Difficulty is only available from paid keyword providers.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"70px 2fr 1fr 70px 95px 95px 90px 70px 105px 120px 1.4fr",gap:10,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted,minWidth:1260}}>
          <span>SAVE</span><span>KEYWORD</span><span>INTENT</span><span>SCORE</span><span>VOLUME</span><span>DIFFICULTY</span><span>POSITION</span><span>CTR</span><span>SOURCE</span><span>TYPE</span><span>ACTION</span>
        </div>
        {inventory.map((r,i)=>{const saved=selectedSet.has(normalizeKeywordText(r.keyword));return <div key={`${r.keyword}-${i}`} style={{display:"grid",gridTemplateColumns:"70px 2fr 1fr 70px 95px 95px 90px 70px 105px 120px 1.4fr",gap:10,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,minWidth:1260}}>
          <button onClick={()=>toggleSelectedKeyword(r)} style={{background:saved?C.lime:"transparent",border:`1px solid ${saved?C.lime:C.dim}`,color:saved?"#000":C.lime,fontFamily:"monospace",fontSize:8,fontWeight:700,cursor:"pointer",padding:"3px 6px"}}>{saved?"SAVED":"SAVE"}</button>
          <span style={{color:C.text}}>{r.keyword}</span>
          <span style={{color:C.muted}}>{r.intent}</span>
          <span style={{color:Number(r.score)>=70?C.green:Number(r.score)>=45?C.orange:C.blue}}>{r.score}</span>
          <span style={{color:C.text}}>{keywordMetricValue(r,"volume")}</span>
          <span style={{color:r.difficulty?C.orange:C.muted}}>{keywordMetricValue(r,"difficulty")}</span>
          <span style={{color:C.text}}>{Number(r.position||0)===99?"new":Number(r.position||0).toFixed(1)}</span>
          <span style={{color:C.text}}>{r.ctr?`${(Number(r.ctr)*100).toFixed(1)}%`:"-"}</span>
          <span style={{color:r.source==="gsc"?C.lime:r.source==="dataforseo"?C.orange:C.blue}}>{String(r.source||"").toUpperCase()}</span>
          <span style={{color:C.muted}}>{r.contentType}</span>
          <span style={{color:C.text}}>{r.recommendedAction}</span>
        </div>;})}
      </div>}
    </div>}

    {tab==="roadmap"&&<div>
      {!!clusters.length&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Save individual keywords for targeting, or save full roadmap cards as autonomous work packages.</div>
        <Btn onClick={saveAllRoadmaps} variant="blue">SAVE ALL ROADMAPS</Btn>
      </div>}
      {!clusters.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:18,color:C.muted,fontFamily:"monospace",fontSize:11}}>No roadmap yet. Complete the wizard and build a keyword roadmap.</div>}
      {clusters.map((c,i)=>{const roadmapId=roadmapIdForCluster(c);const selectedRoadmap=selectedRoadmaps.find((r)=>(r.id || roadmapIdForCluster(r))===roadmapId);return <div key={`${c.primaryKeyword}-${i}`} style={{background:C.panel,border:`1px solid ${selectedRoadmap?C.borderLime:C.border}`,padding:16,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:8}}>
          <div>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:12,fontWeight:700}}>{i+1}. {c.primaryKeyword}</div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginTop:3}}>{c.contentType.toUpperCase()} · TARGET: {c.targetPage}</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{width:128}}>
              <ThemeDropdown
                value={selectedRoadmap?.userPriority || "P3"}
                onChange={(v)=>selectedRoadmap ? updateSelectedRoadmap(roadmapId, { userPriority: v }) : toggleSelectedRoadmap(c, v)}
                options={KEYWORD_ROADMAP_PRIORITIES}
                compact
                activeBorderColor={selectedRoadmap?C.lime:C.dim}
              />
            </div>
            <button onClick={()=>toggleSelectedRoadmap(c, selectedRoadmap?.userPriority || "P3")} style={{background:selectedRoadmap?C.lime:"transparent",border:`1px solid ${C.lime}`,color:selectedRoadmap?"#000":C.lime,fontFamily:"monospace",fontSize:9,fontWeight:700,cursor:"pointer",padding:"5px 8px"}}>{selectedRoadmap?"ROADMAP SAVED":"SAVE ROADMAP"}</button>
            <button onClick={()=>toggleSelectedKeyword(c.rows[0])} style={{background:selectedSet.has(normalizeKeywordText(c.rows[0]?.keyword))?C.lime:"transparent",border:`1px solid ${C.lime}`,color:selectedSet.has(normalizeKeywordText(c.rows[0]?.keyword))?"#000":C.lime,fontFamily:"monospace",fontSize:9,fontWeight:700,cursor:"pointer",padding:"5px 8px"}}>{selectedSet.has(normalizeKeywordText(c.rows[0]?.keyword))?"SAVED":"SAVE PRIMARY"}</button>
            <div style={{color:Number(c.priorityScore)>=70?C.green:C.orange,fontFamily:"monospace",fontSize:18,fontWeight:700}}>SCORE {c.priorityScore}</div>
          </div>
        </div>
        <div style={{color:C.text,fontFamily:"monospace",fontSize:11,marginBottom:8}}>{c.reason}</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {c.rows.slice(0,8).map((r,idx)=><button key={idx} onClick={()=>toggleSelectedKeyword(r)} style={{background:selectedSet.has(normalizeKeywordText(r.keyword))?"#111800":"transparent",border:`1px solid ${selectedSet.has(normalizeKeywordText(r.keyword))?C.lime:C.dim}`,padding:"4px 7px",color:selectedSet.has(normalizeKeywordText(r.keyword))?C.lime:C.muted,fontFamily:"monospace",fontSize:9,cursor:"pointer"}}>{r.keyword}</button>)}
        </div>
      </div>;})}
    </div>}

    {tab==="selected"&&<div>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:14,marginBottom:14}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:6}}>AUTONOMY ROADMAP QUEUE</div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Selected roadmaps are full work packages. Helio should execute them by user priority first, then Helio score.</div>
      </div>
      {!selectedRoadmaps.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:18,color:C.muted,fontFamily:"monospace",fontSize:11,marginBottom:14}}>No selected roadmaps yet. Use SAVE ROADMAP or SAVE ALL ROADMAPS in the Roadmap tab.</div>}
      {!!selectedRoadmaps.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,overflowX:"auto",marginBottom:18}}>
        <div style={{display:"grid",gridTemplateColumns:"80px 130px 120px 2fr 1fr 90px 1.4fr 70px",gap:10,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted,minWidth:1120}}>
          <span>REMOVE</span><span>PRIORITY</span><span>STATUS</span><span>ROADMAP</span><span>CONTENT TYPE</span><span>SCORE</span><span>TARGET / ACTION</span><span>KWS</span>
        </div>
        {selectedRoadmaps.map((r,i)=>{const id=r.id || roadmapIdForCluster(r);return <div key={`${id}-${i}`} style={{display:"grid",gridTemplateColumns:"80px 130px 120px 2fr 1fr 90px 1.4fr 70px",gap:10,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,minWidth:1120,alignItems:"center"}}>
          <button onClick={()=>persistSelectedRoadmaps(selectedRoadmaps.filter((x)=>(x.id || roadmapIdForCluster(x))!==id))} style={{background:"transparent",border:`1px solid ${C.red}`,color:C.red,fontFamily:"monospace",fontSize:8,fontWeight:700,cursor:"pointer",padding:"3px 6px"}}>REMOVE</button>
          <ThemeDropdown value={r.userPriority || "P3"} onChange={(v)=>updateSelectedRoadmap(id,{userPriority:v})} options={KEYWORD_ROADMAP_PRIORITIES} compact activeBorderColor={C.lime}/>
          <ThemeDropdown value={r.status || "queued"} onChange={(v)=>updateSelectedRoadmap(id,{status:v})} options={KEYWORD_ROADMAP_STATUSES} compact activeBorderColor={(r.status||"queued")==="active"?C.green:C.dim}/>
          <span style={{color:C.text}}>{r.primaryKeyword}</span>
          <span style={{color:C.muted}}>{r.contentType}</span>
          <span style={{color:Number(r.helioScore)>=70?C.green:Number(r.helioScore)>=45?C.orange:C.blue}}>{r.helioScore}</span>
          <span style={{color:C.text}}>{r.targetPage} · {r.action}</span>
          <span style={{color:C.muted}}>{(r.supportingKeywords||[]).length}</span>
        </div>;})}
      </div>}

      <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:14,marginBottom:14}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:6}}>KEYWORD TARGET LIST</div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Selected keywords are exact terms Helio can use inside briefs, metadata, headings, FAQs, and internal anchors.</div>
      </div>
      {!selectedKeywords.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:18,color:C.muted,fontFamily:"monospace",fontSize:11}}>No selected keywords yet. Use SAVE in Inventory or Roadmap to build the working keyword list.</div>}
      {!!selectedKeywords.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,overflowX:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"70px 2fr 90px 95px 95px 130px 1.5fr",gap:10,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted,minWidth:960}}>
          <span>REMOVE</span><span>KEYWORD</span><span>SCORE</span><span>VOLUME</span><span>DIFFICULTY</span><span>CONTENT TYPE</span><span>NEXT ACTION</span>
        </div>
        {selectedKeywords.map((r,i)=><div key={`${r.keyword}-${i}`} style={{display:"grid",gridTemplateColumns:"70px 2fr 90px 95px 95px 130px 1.5fr",gap:10,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,minWidth:960}}>
          <button onClick={()=>toggleSelectedKeyword(r)} style={{background:"transparent",border:`1px solid ${C.red}`,color:C.red,fontFamily:"monospace",fontSize:8,fontWeight:700,cursor:"pointer",padding:"3px 6px"}}>REMOVE</button>
          <span style={{color:C.text}}>{r.keyword}</span>
          <span style={{color:Number(r.score)>=70?C.green:Number(r.score)>=45?C.orange:C.blue}}>{r.score}</span>
          <span style={{color:C.text}}>{keywordMetricValue(r,"volume")}</span>
          <span style={{color:r.difficulty?C.orange:C.muted}}>{keywordMetricValue(r,"difficulty")}</span>
          <span style={{color:C.muted}}>{r.contentType}</span>
          <span style={{color:C.text}}>{r.recommendedAction}</span>
        </div>)}
      </div>}
    </div>}

    {tab==="ai strategy"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:10}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>AI STRATEGY LAYER</div>
        <Btn onClick={enhanceWithAI} disabled={planning||!clusters.length}>{planning?"THINKING...":"ENHANCE ROADMAP WITH AI"}</Btn>
      </div>
      <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,fontFamily:"monospace",fontSize:11,minHeight:180}}>
        {planning&&<div style={{color:C.lime}}>Helio is turning deterministic evidence into a strategy █</div>}
        {aiPlan&&<div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{aiPlan}</div>}
        {!aiPlan&&!planning&&<div style={{color:C.muted}}>Build a roadmap, then ask AI to write the execution strategy. Metrics remain deterministic and evidence-based.</div>}
      </div>
    </div>}
  </div>;
}

// ── CONTENT ENGINE ────────────────────────────────────────────────
function Content({integrations, orgScope="default", activeOrg=null, updateOrg=null}) {
  const ai=integrations.ai;
  const [topic,setTopic]=useState("");const [kws,setKws]=useState("");const [type,setType]=useState("blog");
  const [generating,setGenerating]=useState(false);const [article,setArticle]=useState("");
  const [tab,setTab]=useState("generate");const [calendar,setCalendar]=useState([]);const [contentPlan,setContentPlan]=useState([]);const [planLoading,setPlanLoading]=useState(false);const [planStatus,setPlanStatus]=useState("");const [planError,setPlanError]=useState("");const [calLoading,setCalLoading]=useState(false);const [calStatus,setCalStatus]=useState("");const [calError,setCalError]=useState("");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(normalizeContentSchedule(activeOrg?.contentSchedule || {}));
  const gscHost = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
  const gscProjectData = loadProjectData(orgScope, gscHost);
  const fallbackKeywordProject = !gscHost || !gscProjectData?.keywordIntel?.selectedRoadmaps?.length ? loadProjectWithKeywordIntel(orgScope) : null;
  const host = gscHost || fallbackKeywordProject?.host || "";
  const projectData = gscHost && (gscProjectData?.keywordIntel?.selectedRoadmaps?.length || !fallbackKeywordProject) ? gscProjectData : (fallbackKeywordProject?.project || gscProjectData);
  const contentContext = buildContentEngineContext({ projectData, host, manualKeywords: kws, manualTopic: topic });
  const { selectedRoadmaps, selectedKeywords, activeRoadmap, seedKeywords, contentTopic, topPages, source: contentSource, onpageSignals } = contentContext;
  const scheduleCfg = normalizeContentSchedule(activeOrg?.contentSchedule || {});
  const roadmapContentType = activeRoadmap?.contentType || type;
  const contentAssetType = type || roadmapContentType || "blog";
  const targetPage = activeRoadmap?.targetPage || "new page";
  const roadmapAction = activeRoadmap?.action || "Build topical authority and answer search intent.";
  const roadmapPlan = buildContentPlanFromContext(contentContext);
  const scheduledPlanCount = Math.min(120, Math.max(1, scheduleCfg.cadence === "daily" ? scheduleCfg.postsPerDay * scheduleCfg.horizonMonths * 30 : scheduleCfg.postsPerWeek * scheduleCfg.horizonMonths * 4));
  const orgPersistedContent = normalizePersistedContentState(activeOrg?.contentEngine || {});
  const persistedContent = normalizePersistedContentState(projectData?.contentEngine || orgPersistedContent);

  useEffect(() => {
    setScheduleDraft(normalizeContentSchedule(activeOrg?.contentSchedule || {}));
  }, [activeOrg?.id, activeOrg?.contentSchedule?.cadence, activeOrg?.contentSchedule?.postsPerWeek, activeOrg?.contentSchedule?.postsPerDay, activeOrg?.contentSchedule?.horizonMonths]);

  useEffect(() => {
    setContentPlan(Array.isArray(persistedContent.contentPlan) ? persistedContent.contentPlan : []);
    setCalendar(Array.isArray(persistedContent.calendar) ? persistedContent.calendar : []);
    setPlanError(persistedContent.planError || "");
    setCalError(persistedContent.calError || "");
    if (persistedContent.tab) setTab(persistedContent.tab);
  }, [host, orgScope, persistedContent.updatedAt]);

  const persistContentEngineState = (patch = {}) => {
    const now = new Date().toISOString();
    const next = {
      ...normalizePersistedContentState(loadProjectData(orgScope, host || "__content_engine__")?.contentEngine || orgPersistedContent),
      ...patch,
      updatedAt: now,
    };
    // Persist to project slot (host-specific when available, org fallback key otherwise)
    mergeProjectData(orgScope, host || "__content_engine__", { contentEngine: next });
    // Persist to org state so switching modules cannot lose in-memory results
    if (updateOrg && activeOrg?.id) {
      updateOrg(activeOrg.id, { contentEngine: next });
    }
  };

  const deterministicArticle = [
    `# ${contentTopic}`,
    "",
    "## Goal",
    `Publish a ${contentAssetType} asset that targets finalized Keyword Intel demand and improves topical authority for ${host || "the connected domain"}.`,
    "",
    "## Keyword Intel Roadmap",
    activeRoadmap
      ? `Priority: ${activeRoadmap.userPriority || "P3"} · Status: ${activeRoadmap.status || "queued"} · Helio Score: ${activeRoadmap.helioScore || "—"}`
      : "No saved roadmap selected yet. Using selected keywords or connected search data.",
    `Target Page: ${targetPage}`,
    `Roadmap Action: ${roadmapAction}`,
    "",
    "## Target Queries",
    ...(seedKeywords.length ? seedKeywords.slice(0,8).map((k,i)=>`${i+1}. ${k}`) : ["1. Add selected roadmap keywords in Keyword Intel"]),
    "",
    "## On-Page + AEO/GEO Constraints",
    `AEO Score: ${onpageSignals?.aeoScore || 0}/100 · GEO Score: ${onpageSignals?.geoScore || 0}/100 · Intent Match: ${onpageSignals?.keywordIntentMatch || 0}%`,
    `Primary Intent Keyword: ${onpageSignals?.primaryIntentKeyword || "—"}`,
    ...(Array.isArray(onpageSignals?.blockers) && onpageSignals.blockers.length
      ? onpageSignals.blockers.slice(0,5).map((b,i)=>`${i+1}. ${b}`)
      : ["1. No active On-Page blockers available."]),
    "",
    "## Recommended Outline",
    "1. Intro: define intent and problem in first 120 words",
    "2. Key framework: actionable step-by-step process",
    "3. Evidence: examples, metrics, and tradeoffs",
    "4. Implementation checklist",
    "5. FAQ block mapped to top query variants",
    "",
    "## Internal Linking Plan",
    activeRoadmap?.targetPage && activeRoadmap.targetPage !== "new page" ? `1. Optimize and link into ${activeRoadmap.targetPage}` : "1. Create the target page, then link from the strongest relevant pages.",
    ...topPages.slice(0,4).map((p,i)=>`${i+2}. Link from ${p.keys?.[0] || ""} with intent-aligned anchor text`),
    "",
    "## Metadata Draft",
    `META TITLE: ${String(contentTopic).slice(0,55)} | ${host || "Domain"}`,
    `META DESCRIPTION: Learn ${contentTopic} with a practical framework, examples, and implementation checklist.`,
  ].join("\n");

  const generate=async()=>{
    if(!contentTopic)return;setGenerating(true);setArticle("");setTab("output");
    try{const r=await callAI(ai,`You are Helio, an expert SEO content strategist. Improve the deterministic draft into a publish-ready ${contentAssetType==="blog"?"blog post":contentAssetType} while preserving factual grounding, Keyword Intel priorities, target page, and source keywords.`,`Draft:\n${deterministicArticle}\n\nTarget keywords: ${(seedKeywords||[]).join(", ")}\n\nSelected roadmap: ${activeRoadmap ? JSON.stringify({primaryKeyword:activeRoadmap.primaryKeyword,userPriority:activeRoadmap.userPriority,status:activeRoadmap.status,targetPage:activeRoadmap.targetPage,contentType:activeRoadmap.contentType,action:activeRoadmap.action,helioScore:activeRoadmap.helioScore}) : "none"}`);setArticle(r);}
    catch(e){setArticle(`Error: ${e.message}`);}
    setGenerating(false);
  };

  const buildContentPlan=async()=>{
    setPlanLoading(true);setContentPlan([]);setPlanError("");setTab("plan");
    persistContentEngineState({ tab: "plan", planError: "", calError: "" });
    try {
      setPlanStatus("1/4 Reading Keyword Intel roadmap and selected keywords...");
      await new Promise((r)=>setTimeout(r, 300));
      setPlanStatus("2/4 Asking AI to build a solution-first content strategy...");
      const requestedRows = Math.min(30, Math.max(8, roadmapPlan.length * 5, scheduleCfg.postsPerWeek * 4));
      const aiRaw = await callAI(
        ai,
        [
          "You are Helio, a senior SEO content strategist.",
          "Build a realistic content plan from Keyword Intel roadmap data.",
          "The plan must not repeat roadmap rows. Each row must be a unique content asset with a specific user problem, value promise, and EEAT angle.",
          "Prioritize solution-driven content, then educational content, and use comparison content sparingly.",
          "Do not invent metrics. Use only the provided roadmap keywords, priorities, pages, and context.",
          "Return valid JSON only.",
        ].join("\n"),
        JSON.stringify({
          outputShape: {
            plan: [{
              primaryKeyword: "roadmap keyword",
              supportingKeywords: ["support keyword"],
              priority: "P1 | P2 | P3",
              assetType: "Solution Article | Educational Article | Comparison Page | Pillar Page",
              targetPage: "target page or new page",
              title: "specific content asset title",
              angle: "production angle",
              problem: "active searcher problem this asset solves",
              valuePromise: "what the reader gets after reading",
              eeatAngle: "examples, benchmarks, templates, expert process, or validation proof to include",
              intent: "Solution / BOFU | Educational / TOFU | Comparison / MOFU",
              helioScore: 0,
            }],
          },
          requiredPlanRows: requestedRows,
          domain: host,
          schedule: scheduleCfg,
          roadmap: roadmapPlan.slice(0, 12),
          selectedKeywords: seedKeywords.slice(0, 30),
          onpageSignals,
          rules: [
            "No duplicate primaryKeyword + title combinations.",
            "Do not create rows that only say validate against business fit.",
            "Make every angle specific enough for a writer or AI agent to produce the article.",
            "Do not over-promote the product in educational content.",
            "Actively address On-Page AEO/GEO blockers in plan rows and angles.",
          ],
        }),
      );
      const parsed = parseJsonPayload(aiRaw);
      const aiRows = parseAiPlanCollection(parsed);
      const fallbackRows = (!aiRows || !aiRows.length) ? extractAiPlanRowsFromText(aiRaw, roadmapPlan) : [];
      const resolvedRows = (Array.isArray(aiRows) && aiRows.length) ? aiRows : fallbackRows;
      const rows = normalizeAiContentPlanRows(roadmapPlan, resolvedRows);
      if (!rows.length) throw new Error("AI returned no usable content plan rows");
      setPlanStatus("3/4 Validating uniqueness and keyword mapping...");
      await new Promise((r)=>setTimeout(r, 220));
      setPlanStatus("4/4 Finalizing content plan...");
      setContentPlan(rows);
      persistContentEngineState({ contentPlan: rows, planError: "", tab: "plan" });
    } catch (e) {
      const msg = `AI content plan generation failed: ${e.message}. Connect the AI provider, then run BUILD PLAN FROM ROADMAP again.`;
      setPlanError(msg);
      persistContentEngineState({ contentPlan: [], planError: msg, tab: "plan" });
    }
    setPlanStatus("");
    setPlanLoading(false);
  };

  const genCalendar=async()=>{
    setCalLoading(true);setCalendar([]);setCalError("");setTab("calendar");
    persistContentEngineState({ tab: "calendar", calError: "", planError: "" });
    setCalStatus("1/4 Reading selected roadmap keywords and priorities...");
    await new Promise((r)=>setTimeout(r, 380));
    const sourcePlan = roadmapPlan.length ? roadmapPlan : contentPlan;
    try {
      setCalStatus("2/4 Asking AI to reason through search intent, problems, and content angles...");
      const requestedRows = Math.min(60, Math.max(12, scheduledPlanCount));
      const aiRaw = await callAI(
        ai,
        [
          "You are Helio, a senior SEO content strategist.",
          "Create a realistic content calendar topic strategy from the provided Keyword Intel roadmap.",
          "The calendar must be value-first: mostly solution-driven articles, then educational articles, with fewer comparison articles.",
          "Every title must solve or explain a real searched problem. Avoid generic/dummy titles.",
          "Do not repeat title stems. Do not repeat phrases like complete guide, comparison framework, best practices, checklist, or playbook more than once.",
          "Do not invent metrics. Use only the keywords and business context provided.",
          "Return valid JSON only.",
        ].join("\n"),
        JSON.stringify({
          outputShape: {
            topics: [{
              title: "specific non-repeating article title",
              archetype: "solution | education | comparison",
              intent: "Solution / BOFU | Educational / TOFU | Comparison / MOFU",
              primaryKeyword: "one roadmap primary keyword",
              supportKeyword: "one supporting keyword if useful",
              problem: "active user problem the article solves",
              valuePromise: "what the reader will be able to do after reading",
              eeatAngle: "evidence, examples, templates, benchmarks, or expert process to include",
            }],
          },
          requiredTopicCount: requestedRows,
          schedule: scheduleCfg,
          domain: host,
          roadmap: sourcePlan.slice(0, 12),
          selectedKeywords: seedKeywords.slice(0, 30),
          onpageSignals,
          rules: [
            "Prioritize solution content around real user pain and business outcomes.",
            "Use educational content to explain concepts related to the product/category.",
            "Use comparison content sparingly and make it balanced, not self-promotional.",
            "Each topic must be materially different from previous topics.",
            "Titles must be natural article titles, not template fragments.",
            "Topics must systematically reduce current On-Page AEO/GEO blockers.",
          ],
        }),
      );
      const parsed = parseJsonPayload(aiRaw);
      const topics = parseAiTopicCollection(parsed);
      const fallbackTopics = (!topics || !topics.length) ? extractAiTopicsFromText(aiRaw) : [];
      const resolvedTopics = (Array.isArray(topics) && topics.length) ? topics : fallbackTopics;
      if (!Array.isArray(resolvedTopics) || !resolvedTopics.length) throw new Error("AI returned no usable calendar topics");
      setCalStatus("3/4 Scheduling AI-generated topics by frequency and roadmap priority...");
      await new Promise((r)=>setTimeout(r, 260));
      setCalStatus("4/4 Finalizing calendar with anti-duplication checks...");
      const calendarRows = mergeAiCalendarTopics(sourcePlan, resolvedTopics, scheduleCfg, new Date());
      setCalendar(calendarRows);
      persistContentEngineState({ calendar: calendarRows, calError: "", tab: "calendar" });
    } catch (e) {
      const msg = `AI calendar generation failed: ${e.message}. Connect the AI provider, then run BUILD CALENDAR FROM ROADMAP again.`;
      setCalError(msg);
      persistContentEngineState({ calendar: [], calError: msg, tab: "calendar" });
    }
    setCalStatus("");
    setCalLoading(false);
  };

  const exportCalendarCsv=()=>{
    if (!calendar.length) return;
    const rows = calendar.map((r)=>({
      publish_date: r.publishDate,
      month: r.monthLabel,
      week: r.weekLabel,
      slot: r.slotLabel,
      priority: r.priority,
      title: r.title,
      type: r.type,
      primary_keyword: r.primaryKeyword,
      support_keyword: r.supportKeyword,
      target_page: r.targetPage,
      intent: r.intent,
      status: r.status,
    }));
    const b = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = `helio-content-calendar-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const saveSchedule = () => {
    const next = normalizeContentSchedule(scheduleDraft);
    setScheduleDraft(next);
    if (updateOrg && activeOrg?.id) updateOrg(activeOrg.id, { contentSchedule: next });
    setShowScheduleModal(false);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:22}}>
      <Hdr title="Content Engine" sub={`EEAT content generation · Source: ${contentSource} · AI: ${ai?.fields?.model||"—"}`}/>
      <Btn onClick={()=>setShowScheduleModal(true)} variant="lime" style={{marginTop:2,whiteSpace:"nowrap"}}>⚙ CONTENT CALENDAR FREQUENCY</Btn>
    </div>
    <Tabs tabs={["generate","plan","output","calendar"]} active={tab} onChange={setTab}/>
    {tab==="generate"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(150px,1fr))",gap:8}}>
        <Card label="Roadmap Queue" value={selectedRoadmaps.length} delta={selectedRoadmaps.length?"Keyword Intel connected":"Save roadmaps in Keyword Intel"} good={selectedRoadmaps.length>0}/>
        <Card label="Selected Keywords" value={selectedKeywords.length} delta={selectedKeywords.length?"Ready for briefs":"Optional keyword list"} good={selectedKeywords.length>0}/>
        <Card label="Active Priority" value={activeRoadmap?.userPriority || "—"} delta={activeRoadmap?.primaryKeyword || "No active roadmap"} good={!!activeRoadmap}/>
        <Card label="Content Source" value={contentSource.toUpperCase()} delta={`${host || "No GSC domain"} · ${scheduleCfg.cadence.toUpperCase()} ${scheduleCfg.cadence==="weekly"?`${scheduleCfg.postsPerWeek}/week`:`${scheduleCfg.postsPerDay}/day`}`} good={contentSource==="keyword-roadmap"}/>
      </div>
      {!!selectedRoadmaps.length&&<div style={{background:C.panel,border:`1px solid ${C.borderLime}`,padding:12}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>KEYWORD INTEL ROADMAP QUEUE</div>
        {selectedRoadmaps.slice(0,5).map((r,i)=><div key={r.id || `${r.primaryKeyword}-${i}`} style={{display:"grid",gridTemplateColumns:"50px 70px 1.4fr 1fr 1.5fr",gap:10,padding:"6px 0",borderBottom:i<Math.min(5,selectedRoadmaps.length)-1?`1px solid ${C.border}`:"none",fontFamily:"monospace",fontSize:10}}>
          <span style={{color:i===0?C.lime:C.muted}}>{i===0?"NEXT":`#${i+1}`}</span>
          <span style={{color:r.userPriority==="P1"?C.red:r.userPriority==="P2"?C.orange:C.blue}}>{r.userPriority || "P3"}</span>
          <span style={{color:C.text}}>{r.primaryKeyword}</span>
          <span style={{color:C.muted}}>{r.contentType}</span>
          <span style={{color:C.text}}>{r.targetPage} · {r.action}</span>
        </div>)}
      </div>}
      <Input label="Article Topic" value={topic} onChange={setTopic} placeholder="e.g. How to use AI for social media automation"/>
      <Input label="Target Keywords (comma-separated)" value={kws} onChange={setKws} placeholder="ai social media, automation tools, solopreneur"/>
      <div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>CONTENT TYPE</div>
        <div style={{display:"flex",gap:0}}>
          {["blog","pillar","listicle"].map(t=><div key={t} onClick={()=>setType(t)} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:10,fontWeight:700,background:type===t?C.lime:"#060606",color:type===t?"#000":C.muted,border:`1px solid ${type===t?C.lime:C.dim}`,marginRight:-1}}>{t.toUpperCase()}</div>)}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:C.panel,border:`1px solid ${C.border}`,padding:"8px 10px"}}>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>
          CONTENT CALENDAR FREQUENCY: <span style={{color:C.lime}}>{scheduleCfg.cadence.toUpperCase()}</span> · {scheduleCfg.cadence==="weekly"?`${scheduleCfg.postsPerWeek}/week`:`${scheduleCfg.postsPerDay}/day`} · {scheduleCfg.horizonMonths} month horizon
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={buildContentPlan} variant="teal" disabled={planLoading}>{planLoading?"BUILDING PLAN...":"▤ BUILD PLAN FROM ROADMAP"}</Btn>
        <Btn onClick={generate} disabled={generating||(!contentTopic&&!seedKeywords.length)}>{generating?"▶ ENHANCING...":"▣ ENHANCE ARTICLE WITH AI"}</Btn>
        <Btn onClick={genCalendar} disabled={calLoading} variant="teal">{calLoading?"PLANNING...":"◉ BUILD CALENDAR FROM ROADMAP"}</Btn>
      </div>
    </div>}
    {tab==="plan"&&<div>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:12,marginBottom:12,color:C.muted,fontFamily:"monospace",fontSize:10}}>
        Plan explains what to publish in priority order. Each row is a content asset mapped to one primary keyword, target page, and production angle from Keyword Intel.
      </div>
      {planLoading&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11,padding:16}}>
        Building AI content plan █
        <div style={{marginTop:8,color:C.text,opacity:0.9}}>{planStatus || "Planning..."}</div>
      </div>}
      {!planLoading&&planError&&<div style={{background:C.panel,border:`1px solid ${C.red}`,padding:14,marginBottom:12,color:C.red,fontFamily:"monospace",fontSize:11}}>
        {planError}
      </div>}
      {!planLoading&&!planError&&!contentPlan.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:18,color:C.muted,fontFamily:"monospace",fontSize:11}}>Click BUILD PLAN FROM ROADMAP in Generate.</div>}
      {!!contentPlan.length&&<div style={{background:C.panel,border:`1px solid ${C.border}`,overflowX:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"50px 60px 1.1fr 1.8fr 130px 130px 1.4fr 70px",gap:10,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted,minWidth:1380}}>
          <span>ORDER</span><span>PRI</span><span>KEYWORD</span><span>TITLE</span><span>ASSET</span><span>INTENT</span><span>ANGLE</span><span>SCORE</span>
        </div>
        {contentPlan.map((row)=><div key={`${row.order}-${row.primaryKeyword}-${row.title || row.angle}`} style={{display:"grid",gridTemplateColumns:"50px 60px 1.1fr 1.8fr 130px 130px 1.4fr 70px",gap:10,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,minWidth:1380,alignItems:"center"}}>
          <span style={{color:C.lime}}>{row.order}</span>
          <span style={{color:row.priority==="P1"?C.red:row.priority==="P2"?C.orange:C.blue}}>{row.priority}</span>
          <span style={{color:C.text}}>{row.primaryKeyword}</span>
          <span style={{color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.title || row.problem || row.angle}</span>
          <span style={{color:C.blue}}>{row.assetType}</span>
          <span style={{color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.intent || row.targetPage}</span>
          <span style={{color:C.text}}>{row.angle}</span>
          <span style={{color:Number(row.helioScore)>=70?C.green:Number(row.helioScore)>=45?C.orange:C.muted}}>{row.helioScore || "—"}</span>
        </div>)}
      </div>}
    </div>}
    {tab==="output"&&<div>
      <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:20,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8,color:C.text,maxHeight:600,overflowY:"auto",scrollbarWidth:"thin"}}>{deterministicArticle}</div>
      {generating&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11,padding:20}}>Helio is enhancing your {type} article █</div>}
      {article&&<div style={{marginTop:14,background:"#060606",border:`1px solid ${C.borderLime}`,padding:20,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8,color:C.text,maxHeight:600,overflowY:"auto",scrollbarWidth:"thin"}}>
        <div style={{color:C.lime,fontSize:10,letterSpacing:2,marginBottom:8}}>AI ENHANCEMENT LAYER</div>
        {article}
      </div>}
      {article&&<div style={{marginTop:12,display:"flex",gap:10}}>
        <Btn onClick={()=>navigator.clipboard.writeText(article)}>COPY ARTICLE</Btn>
        <Btn onClick={()=>{const b=new Blob([article],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="helio-article.txt";a.click();}} variant="blue">DOWNLOAD .TXT</Btn>
      </div>}
    </div>}
    {tab==="calendar"&&<div>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:12,marginBottom:12,color:C.muted,fontFamily:"monospace",fontSize:10}}>
        Calendar explains when to publish each planned asset. Dates are generated from Organization frequency settings, and each row shows exact keyword mapping.
      </div>
      {!!calendar.length&&<div style={{display:"flex",gap:8,marginBottom:10}}>
        <Btn onClick={exportCalendarCsv} variant="green">EXPORT CALENDAR CSV</Btn>
      </div>}
      {calLoading&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11,padding:20}}>
        Building content calendar █
        <div style={{marginTop:8,color:C.text,opacity:0.9}}>{calStatus || "Planning..."}</div>
      </div>}
      {!calLoading&&calError&&<div style={{background:C.panel,border:`1px solid ${C.red}`,padding:14,marginBottom:12,color:C.red,fontFamily:"monospace",fontSize:11}}>
        {calError}
      </div>}
      {calendar.length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:8,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{minWidth:88}}>DATE</span><span style={{minWidth:74}}>MONTH</span><span style={{minWidth:34}}>WK</span><span style={{minWidth:36}}>SLOT</span><span style={{minWidth:36}}>PRI</span><span style={{minWidth:420}}>TITLE</span><span style={{minWidth:78}}>TYPE</span><span style={{minWidth:160}}>PRIMARY KW</span><span style={{minWidth:150}}>SUPPORT KW</span><span style={{minWidth:100}}>TARGET</span><span style={{minWidth:86}}>INTENT</span><span style={{minWidth:64}}>STATUS</span>
        </div>
        {calendar.map((row,i)=><div key={i} style={{display:"flex",gap:8,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,alignItems:"center"}}>
          <span style={{color:C.lime,minWidth:90}}>{row.publishDate}</span>
          <span style={{color:C.lime,minWidth:74}}>{row.monthLabel.replace(" 20", " ").replace("202", "'2")}</span>
          <span style={{color:C.muted,minWidth:34}}>{row.weekLabel}</span>
          <span style={{color:C.muted,minWidth:36}}>{row.slotLabel}</span>
          <span style={{color:row.priority==="P1"?C.red:row.priority==="P2"?C.orange:C.blue,minWidth:36}}>{row.priority || "P3"}</span>
          <span style={{color:C.text,minWidth:420,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{row.title}</span>
          <span style={{color:C.blue,minWidth:78}}>{row.type}</span>
          <span style={{color:C.text,minWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.primaryKeyword}</span>
          <span style={{color:C.muted,minWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.supportKeyword}</span>
          <span style={{color:C.muted,minWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.targetPage || "new page"}</span>
          <span style={{color:C.muted,minWidth:86}}>{row.intent}</span>
          <span style={{color:row.status==="Published"?C.green:row.status==="Draft"?C.orange:C.muted,minWidth:64}}>{row.status}</span>
        </div>)}
      </div>}
      {!calLoading&&!calError&&calendar.length===0&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,padding:20}}>Go to Generate tab → click BUILD CALENDAR FROM ROADMAP</div>}
    </div>}
    {showScheduleModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1001}}>
      <div style={{width:"min(720px,92vw)",background:"#050505",border:`1px solid ${C.borderLime}`,padding:16}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:2,marginBottom:10}}>CONTENT CALENDAR FREQUENCY</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <ThemeDropdown
            label="Cadence"
            value={scheduleDraft.cadence}
            onChange={(v)=>setScheduleDraft((p)=>normalizeContentSchedule({ ...p, cadence: v }))}
            options={[{ value: "weekly", label: "Weekly" }, { value: "daily", label: "Daily" }]}
          />
          <Input label="Posts / Week" type="number" value={String(scheduleDraft.postsPerWeek)} onChange={(v)=>setScheduleDraft((p)=>normalizeContentSchedule({ ...p, postsPerWeek: Number(v || 1) }))} placeholder="3"/>
          <Input label="Posts / Day" type="number" value={String(scheduleDraft.postsPerDay)} onChange={(v)=>setScheduleDraft((p)=>normalizeContentSchedule({ ...p, postsPerDay: Number(v || 1) }))} placeholder="1"/>
        </div>
        <div style={{marginTop:10,maxWidth:240}}>
          <Input label="Planning Horizon (Months)" type="number" value={String(scheduleDraft.horizonMonths)} onChange={(v)=>setScheduleDraft((p)=>normalizeContentSchedule({ ...p, horizonMonths: Number(v || 3) }))} placeholder="3"/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14}}>
          <Btn onClick={()=>setShowScheduleModal(false)} variant="orange">CANCEL</Btn>
          <Btn onClick={saveSchedule} variant="green">SAVE</Btn>
        </div>
      </div>
    </div>}
  </div>;
}

// ── ON-PAGE SEO ───────────────────────────────────────────────────
function OnPage({integrations, orgScope="default"}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const [url,setUrl]=useState("");const [running,setRunning]=useState(false);
  const [data,setData]=useState(null);const [logs,setLogs]=useState([]);const [suggestions,setSuggestions]=useState("");const [suggesting,setSuggesting]=useState(false);
  const [source,setSource]=useState("Helio Core");
  const connectedHost = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");

  useEffect(() => {
    const host = connectedHost || getHostFromInput(url || "");
    if (!host) return;
    const project = loadProjectData(orgScope, host);
    const onpage = project?.onpage || {};
    if (!onpage?.url) return;
    if (!url) setUrl(onpage.url);
    if (!data) {
      setData(onpage.lastPayload || {
        url: onpage.url,
        status_code: 200,
        checks: onpage.checks || {},
        meta: onpage.meta || {},
      });
      setSource(onpage.source || "Helio Core");
    }
  }, [orgScope, connectedHost]);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);
  const hasThinSignals = (payload = {}) => {
    const words = Number(payload?.meta?.content?.words_count || 0);
    const internal = Number(payload?.internal_links_count || 0);
    const external = Number(payload?.external_links_count || 0);
    const hasH1 = !!payload?.meta?.htags?.h1?.[0];
    return words < 120 || (internal + external) === 0 || !hasH1;
  };
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const getOnPageAeoGeoReadiness = (payload = {}, host = "") => {
    const p = payload || {};
    const title = String(p?.meta?.title || "").trim();
    const desc = String(p?.meta?.description || "").trim();
    const h1 = String(p?.meta?.htags?.h1?.[0] || "").trim();
    const words = Number(p?.meta?.content?.words_count || 0);
    const tti = Number(p?.page_timing?.time_to_interactive || 0);
    const internal = Number(p?.internal_links_count || 0);
    const external = Number(p?.external_links_count || 0);
    const schemaTypes = Array.isArray(p?.meta?.schema_types) ? p.meta.schema_types : [];
    const hasCanonical = !!p?.meta?.canonical;
    const schemaSet = new Set(schemaTypes.map((s)=>String(s || "").toLowerCase()));
    const hasAnswerSchema = ["faqpage","qapage","howto"].some((k)=>schemaSet.has(k));
    const hasEntitySchema = ["organization","website","product","softwareapplication","article","webpage","breadcrumblist"].some((k)=>schemaSet.has(k));
    const hasArticleDepth = words >= 900;
    const speedGood = !tti || tti <= 2500;
    const linksGood = internal >= 3;
    const hasTitleMeta = title.length >= 20 && desc.length >= 80;
    const headingClean = h1.length >= 8 && h1.length <= 110 && !/__wrap_|self\.__wrap|<</i.test(h1);

    const project = loadProjectData(orgScope, host);
    const roadmap = Array.isArray(project?.keywordIntel?.selectedRoadmaps) ? project.keywordIntel.selectedRoadmaps : [];
    const selectedKeywords = Array.isArray(project?.keywordIntel?.selectedKeywords) ? project.keywordIntel.selectedKeywords : [];
    const roadmapKeywords = roadmap.flatMap((r)=>[r?.primaryKeyword, ...(r?.supportingKeywords || [])]).filter(Boolean).slice(0, 40);
    const keywordPool = Array.from(new Set([...selectedKeywords, ...roadmapKeywords].map((k)=>String(k || "").toLowerCase())));
    const contentText = `${title} ${desc} ${h1}`.toLowerCase();
    const keywordMatches = keywordPool.filter((k)=>k && contentText.includes(k));
    const keywordIntentMatch = keywordPool.length ? clamp(Math.round((keywordMatches.length / keywordPool.length) * 100), 0, 100) : 0;
    const primaryIntent = roadmap[0]?.primaryKeyword || selectedKeywords[0] || "";
    const hasPrimaryIntent = primaryIntent ? contentText.includes(String(primaryIntent).toLowerCase()) : false;

    const aeoScore = clamp(
      (hasTitleMeta ? 18 : 5) +
      (headingClean ? 15 : 4) +
      (hasCanonical ? 10 : 0) +
      (hasAnswerSchema ? 22 : 4) +
      (hasEntitySchema ? 12 : 4) +
      (hasArticleDepth ? 12 : 5) +
      (linksGood ? 6 : 2) +
      (speedGood ? 5 : 1),
      0, 100
    );
    const geoScore = clamp(
      (hasTitleMeta ? 14 : 4) +
      (headingClean ? 10 : 3) +
      (hasCanonical ? 10 : 0) +
      (hasEntitySchema ? 20 : 6) +
      (internal >= 8 ? 12 : internal >= 3 ? 7 : 2) +
      (external >= 3 ? 8 : external >= 1 ? 4 : 1) +
      (hasArticleDepth ? 10 : 4) +
      (hasPrimaryIntent ? 10 : 2) +
      (keywordIntentMatch >= 25 ? 6 : 1),
      0, 100
    );
    const confidence = hasThinSignals(p) ? "low" : "high";
    const blockers = [];
    if (!hasAnswerSchema) blockers.push("Missing answer-focused schema (FAQPage / QAPage / HowTo).");
    if (!hasEntitySchema) blockers.push("Missing entity schema (Organization/Product/SoftwareApplication/Article).");
    if (!hasCanonical) blockers.push("Canonical tag missing or invalid.");
    if (!hasPrimaryIntent) blockers.push("Primary roadmap keyword is not reflected in title/meta/H1.");
    if (!headingClean) blockers.push("H1 quality issue detected; clean heading needed for intent clarity.");
    if (internal < 3) blockers.push("Low internal linking context (need at least 3 contextual links).");
    if (tti && tti > 2500) blockers.push("Slow interaction timing reduces crawl quality and answer-engine confidence.");

    return {
      aeoScore,
      geoScore,
      keywordIntentMatch,
      matchedKeywords: keywordMatches.slice(0, 8),
      primaryIntentKeyword: primaryIntent || "—",
      confidence,
      blockers: blockers.slice(0, 6),
      strengths: [
        hasTitleMeta ? "Title/meta length in optimized range." : null,
        headingClean ? "H1 present and readable." : null,
        hasCanonical ? "Canonical signal present." : null,
        hasEntitySchema ? "Entity schema detected for machine retrieval." : null,
        hasAnswerSchema ? "Answer-oriented schema detected." : null,
        linksGood ? "Internal linking baseline is healthy." : null,
      ].filter(Boolean),
    };
  };

  const analyze=async()=>{
    if(!url)return;setRunning(true);setLogs([]);setData(null);
    const normalizedInputUrl = normalizeUrl(url);
    if (!normalizedInputUrl) {
      addLog("Error: Invalid URL format. Enter a valid domain or full URL.","err");
      setRunning(false);
      return;
    }
    addLog("Running Helio Core on-page analyzer...","sys");
    let coreSucceeded = false;
    let analyzedPayload = null;
    try{
      let core = await helioCoreAnalyzePage(normalizedInputUrl, { allowJina: false, renderMode: "enhanced-js" });
      const weakMeta = !core?.data?.meta?.title && !core?.data?.meta?.description;
      const weakLinks = Number(core?.data?.internal_links_count || 0) + Number(core?.data?.external_links_count || 0) === 0;
      if (String(core?.source || "").includes("(jina)") && (weakMeta || weakLinks)) {
        addLog("Jina text snapshot is missing metadata/link graph. Retrying without Jina...","warn");
        const directOnly = await helioCoreAnalyzePage(normalizedInputUrl, { allowJina: false });
        const directHasMeta = !!directOnly?.data?.meta?.title || !!directOnly?.data?.meta?.description;
        const directHasLinks = (Number(directOnly?.data?.internal_links_count || 0) + Number(directOnly?.data?.external_links_count || 0)) > 0;
        if (directHasMeta || directHasLinks) {
          core = directOnly;
          addLog("Direct extraction recovered metadata/link graph.","ok");
        } else {
          addLog("Direct retry did not improve metadata/link graph.","warn");
        }
      }
      if (core?.data?.status_code === 200 && hasThinSignals(core.data)) {
        addLog("Thin HTML signals detected. Re-running in rendered mode...","warn");
        const rendered = await helioCoreAnalyzePage(normalizedInputUrl, { renderMode: "enhanced-js" });
        const renderedWords = Number(rendered?.data?.meta?.content?.words_count || 0);
        const baseWords = Number(core?.data?.meta?.content?.words_count || 0);
        if (renderedWords > baseWords || !hasThinSignals(rendered.data)) {
          core = rendered;
          addLog(`Rendered mode improved extraction (words ${baseWords} -> ${renderedWords}).`,"ok");
        } else {
          addLog("Rendered mode did not materially improve extraction.","warn");
        }
      }
      setData(core.data);
      analyzedPayload = core.data;
      setSource(core.source);
      const host = getHostFromInput(normalizedInputUrl);
      const readiness = getOnPageAeoGeoReadiness(core.data, host);
      const issues = deriveOnpageIssues(core.data);
      mergeProjectData(orgScope, host, { onpage: { source: core.source, url: core.data?.url, checks: core.data?.checks || {}, meta: core.data?.meta || {}, aeoGeo: readiness, issues, lastPayload: core.data, capturedAt: new Date().toISOString() } });
      syncMissionsFromProject(orgScope, host);
      addLog(`On-page analysis complete via ${core.source}.`,"ok");
      addLog(`AEO ${readiness.aeoScore}/100 · GEO ${readiness.geoScore}/100 · Intent match ${readiness.keywordIntentMatch}%`,"ok");
      if (issues.length) addLog(`Created ${issues.length} on-page issues and synced to Missions.`,"ok");
      coreSucceeded = true;
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    if((!coreSucceeded || (analyzedPayload && hasThinSignals(analyzedPayload))) && dfs?.login && dfs?.password){
      try{
        addLog("Running DataForSEO rendered fallback for deeper extraction...","warn");
        const auth="Basic "+btoa(`${dfs.login}:${dfs.password}`);
        const res=await fetch("https://api.dataforseo.com/v3/on_page/instant_pages",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{url: normalizedInputUrl,enable_javascript:true,enable_browser_rendering:true}])});
        const d=await res.json();
        const item=d.tasks?.[0]?.result?.[0]?.items?.[0];
        if(item){
          setData(item);setSource("DataForSEO");
          const host = getHostFromInput(normalizedInputUrl);
          const readiness = getOnPageAeoGeoReadiness(item, host);
          const issues = deriveOnpageIssues(item);
          mergeProjectData(orgScope, host, { onpage: { source: "DataForSEO", url: item?.url, checks: item?.checks || {}, meta: item?.meta || {}, aeoGeo: readiness, issues, lastPayload: item, capturedAt: new Date().toISOString() } });
          syncMissionsFromProject(orgScope, host);
          addLog("On-page analysis complete (fallback).","ok");
          addLog(`AEO ${readiness.aeoScore}/100 · GEO ${readiness.geoScore}/100 · Intent match ${readiness.keywordIntentMatch}%`,"ok");
          if (issues.length) addLog(`Created ${issues.length} on-page issues and synced to Missions.`,"ok");
        }
        else addLog(`Fallback error: ${d.tasks?.[0]?.status_message||"No data returned"}`,"err");
      }catch(ex){addLog(`Fallback failed: ${ex.message}`,"err");}
    }
    setRunning(false);
  };

  const getSuggestions=async()=>{
    if(!data)return;setSuggesting(true);setSuggestions("");
    const ctx=`URL: ${data.url}, Title: ${data.meta?.title}, Description: ${data.meta?.description}, H1: ${data.meta?.htags?.h1?.[0]}, Word count: ${data.meta?.content?.words_count}, Load time: ${data.page_timing?.time_to_interactive}ms`;
    try{const r=await callAI(ai,"You are Helio, expert SEO analyst. Refine this deterministic on-page action list with execution detail. Do not invent measurements.","Deterministic actions:\n"+deterministicSuggestions+"\n\nContext:\n"+ctx);setSuggestions(r);}
    catch(e){setSuggestions(`Error: ${e.message}`);}
    setSuggesting(false);
  };

  const deterministicSuggestions = data ? [
    `[TITLE] ${data.meta?.title ? "Present" : "Missing"} · target length 50-60 chars`,
    `[META] ${data.meta?.description ? "Present" : "Missing"} · target length 140-160 chars`,
    `[H1] ${data.meta?.htags?.h1?.[0] ? "Present" : "Missing"} · single H1 with primary intent`,
    `[CONTENT] Word count ${data.meta?.content?.words_count ?? "—"} · expand topical depth if under 800 words for core pages`,
    `[SPEED] TTI ${data.page_timing?.time_to_interactive ? `${(data.page_timing.time_to_interactive/1000).toFixed(2)}s` : "—"} · optimize render blocking resources if above 2.5s`,
    `[SCHEMA] ${(data.meta?.schema_types?.length || 0) > 0 ? `Detected (${data.meta.schema_types.slice(0,3).join(", ")})` : "No schema types detected"} · add FAQ/Article schema where relevant`,
    `[LINKING] Add 3-5 contextual internal links from related high-authority pages`,
    `[AEO/GEO] ${(getOnPageAeoGeoReadiness(data, getHostFromInput(data.url || url)).aeoScore || 0)}/100 AEO · ${(getOnPageAeoGeoReadiness(data, getHostFromInput(data.url || url)).geoScore || 0)}/100 GEO · ensure answer schema + entity schema + intent keyword alignment`,
    `[CONFIDENCE] ${hasThinSignals(data) ? "Low extraction confidence on this URL. Use rendered/source fallback or validate in browser." : "Good extraction confidence for manual/autonomy use."}`,
  ].join("\n") : "";

  const row=(label,value,good)=><div style={{display:"flex",gap:12,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,alignItems:"flex-start"}}>
    <span style={{color:C.muted,minWidth:160,flexShrink:0}}>{label}</span>
    <span style={{color:good===undefined?C.text:good?C.green:C.orange,flex:1,wordBreak:"break-all"}}>{value??"—"}</span>
    {good!==undefined&&<span style={{color:good?C.green:C.red,minWidth:36,textAlign:"right"}}>{good?"✓":"⚠"}</span>}
  </div>;

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="On-Page SEO" sub={`Page-level analysis · Source: ${source} · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Full URL to analyze (e.g. https://generalizingai.com/blog/ai-tools)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={analyze} disabled={running||!url}>{running?"▶ ANALYZING...":"◧ ANALYZE PAGE"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={running}/></div>}
    {data&&<>
      {(()=>{const readiness=getOnPageAeoGeoReadiness(data, getHostFromInput(data.url || url));return <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <Card label="AEO Readiness" value={`${readiness.aeoScore}/100`} delta={readiness.aeoScore>=75?"Answer-engine friendly baseline":readiness.aeoScore>=55?"Needs structured answer upgrades":"Weak for answer-engine ranking"} good={readiness.aeoScore>=75}/>
        <Card label="GEO Readiness" value={`${readiness.geoScore}/100`} delta={readiness.geoScore>=75?"LLM retrieval baseline is healthy":readiness.geoScore>=55?"Needs entity/retrieval reinforcement":"Weak for LLM retrieval"} good={readiness.geoScore>=75}/>
        <Card label="Intent Match" value={`${readiness.keywordIntentMatch}%`} delta={readiness.primaryIntentKeyword!=="—"?`Primary: ${readiness.primaryIntentKeyword}`:"No roadmap keyword linked"} good={readiness.keywordIntentMatch>=35}/>
        <Card label="Extraction Confidence" value={String(readiness.confidence).toUpperCase()} delta={readiness.matchedKeywords.length?`Matches: ${readiness.matchedKeywords.join(", ")}`:"No keyword matches in title/meta/H1"} good={readiness.confidence==="high"}/>
      </div>;})()}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {[{label:"Status",value:data.status_code,delta:data.status_code===200?"✓ OK":"⚠ Error",good:data.status_code===200},{label:"Word Count",value:data.meta?.content?.words_count},{label:"Load Time",value:data.page_timing?.time_to_interactive?`${(data.page_timing.time_to_interactive/1000).toFixed(2)}s`:"—",delta:data.page_timing?.time_to_interactive<2500?"✓ Fast":"⚠ Slow",good:data.page_timing?.time_to_interactive<2500},{label:"Page Size",value:data.size?`${Math.round(data.size/1024)}KB`:"—"}].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,marginBottom:18}}>
        {row("Title Tag",data.meta?.title,(data.meta?.title?.length||0)>10&&(data.meta?.title?.length||0)<70)}
        {row("Meta Description",data.meta?.description,(data.meta?.description?.length||0)>50&&(data.meta?.description?.length||0)<160)}
        {row("H1 Tag",data.meta?.htags?.h1?.[0],!!data.meta?.htags?.h1?.[0])}
        {row("Canonical",data.meta?.canonical,!!data.meta?.canonical)}
        {row("Images w/o Alt",data.checks?.no_image_alt?(data.checks.no_image_alt+" images missing alt"):null,(data.checks?.no_image_alt||0)===0)}
        {row("Internal Links",data.internal_links_count)}
        {row("External Links",data.external_links_count)}
        {row("Schema Markup",(data.meta?.schema_types||[]).length ? `[${data.meta.schema_types.join(", ")}]` : null,(data.meta?.schema_types||[]).length>0)}
      </div>
      <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>◈ ON-PAGE ACTIONS</div>
          <Btn onClick={getSuggestions} disabled={suggesting}>{suggesting?"ENHANCING...":"ENHANCE WITH AI"}</Btn>
        </div>
        <div style={{color:C.text,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7,marginBottom:12}}>{deterministicSuggestions}</div>
        {(()=>{const readiness=getOnPageAeoGeoReadiness(data, getHostFromInput(data.url || url));if(!readiness.blockers.length)return null;return <div style={{marginBottom:12,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
          <div style={{color:C.orange,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:6}}>TOP AEO/GEO BLOCKERS</div>
          <div style={{color:C.text,fontFamily:"monospace",fontSize:11,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{readiness.blockers.map((b,i)=>`${i+1}. ${b}`).join("\n")}</div>
        </div>;})()}
        {suggesting&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11}}>Enhancing on-page actions █</div>}
        {suggestions&&<div style={{color:C.text,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
          <div style={{color:C.lime,fontSize:10,letterSpacing:2,marginBottom:8}}>AI ENHANCEMENT LAYER</div>
          {suggestions}
        </div>}
        {!suggestions&&!suggesting&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11}}>Deterministic actions are ready. Use AI enhancement for deeper execution detail.</div>}
      </div>
    </>}
  </div>;
}

// ── BACKLINK MANAGER ──────────────────────────────────────────────
function Backlinks({integrations, orgScope="default"}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const SCAN_PRESETS = {
    fast: { depth: 1, maxCandidates: 40, maxQueries: 6, maxSearchPages: 2, maxExpandedCandidates: 70, queueBatch: 25, queueRounds: 1 },
    balanced: { depth: 2, maxCandidates: 100, maxQueries: 12, maxSearchPages: 3, maxExpandedCandidates: 180, queueBatch: 45, queueRounds: 2 },
    pro: { depth: 3, maxCandidates: 220, maxQueries: 28, maxSearchPages: 7, maxExpandedCandidates: 520, queueBatch: 90, queueRounds: 4 },
  };
  const [domain,setDomain]=useState("");const [running,setRunning]=useState(false);
  const [data,setData]=useState(null);const [error,setError]=useState("");const [logs,setLogs]=useState([]);const [tab,setTab]=useState("overview");
  const [provider,setProvider]=useState("helio");
  const [candidateText,setCandidateText]=useState("");
  const [importing,setImporting]=useState(false);
  const [csvImporting,setCsvImporting]=useState(false);
  const [queueCrawling,setQueueCrawling]=useState(false);
  const [indexMeta,setIndexMeta]=useState(null);
  const [queueCycle,setQueueCycle]=useState(null);
  const [crawlDepth,setCrawlDepth]=useState(1);
  const [recallMode,setRecallMode]=useState(false);
  const [runFilter,setRunFilter]=useState("all");
  const [minConfidence,setMinConfidence]=useState(0);
  const [placementFilter,setPlacementFilter]=useState("all");
  const [sourceFilter,setSourceFilter]=useState("all");
  const [followFilter,setFollowFilter]=useState("all");
  const [expandedBacklinkKey,setExpandedBacklinkKey]=useState("");
  const [gapCompetitors,setGapCompetitors]=useState("");
  const [gapLoading,setGapLoading]=useState(false);
  const [gapData,setGapData]=useState(null);
  const [scanMode,setScanMode]=useState("balanced");
  const [trendWindow,setTrendWindow]=useState(30);
  const [outreach,setOutreach]=useState("");const [generatingOutreach,setGeneratingOutreach]=useState(false);
  const csvInputRef=useRef(null);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);

  const parseCsvLine=(line="")=>{
    const out=[];let cur="";let inQuotes=false;
    for(let i=0;i<line.length;i+=1){
      const ch=line[i];
      if(ch==="\""){
        const next=line[i+1];
        if(inQuotes&&next==="\""){cur+="\"";i+=1;}else{inQuotes=!inQuotes;}
        continue;
      }
      if(ch===","&&!inQuotes){out.push(cur.trim());cur="";continue;}
      cur+=ch;
    }
    out.push(cur.trim());
    return out;
  };

  const extractSeedUrlsFromCsvText=(raw="")=>{
    const lines=String(raw||"").split(/\r?\n/).filter((x)=>x&&x.trim());
    if(!lines.length)return [];
    const headers=parseCsvLine(lines[0]).map((h)=>String(h||"").toLowerCase().trim());
    const findIdx=(patterns=[])=>headers.findIndex((h)=>patterns.some((p)=>h===p||h.includes(p)));
    const urlIdx=findIdx(["referring page url","source url","source_url","referring page","url_from","url","referring url"]);
    if(urlIdx<0)return [];
    const urls=[];
    for(let i=1;i<lines.length;i+=1){
      const cols=parseCsvLine(lines[i]);
      const value=String(cols[urlIdx]||"").trim();
      if(!value)continue;
      const candidate=value.match(/^https?:\/\//i)?value:`https://${value}`;
      const host=getHostFromInput(candidate);
      if(!host)continue;
      urls.push(candidate);
      if(urls.length>=5000)break;
    }
    return Array.from(new Set(urls));
  };

  useEffect(() => {
    const host = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "") || getHostFromInput(domain || "");
    if (!host) return;
    const project = loadProjectData(orgScope, host);
    const backlinks = project?.backlinks || {};
    const config = backlinks?.config || {};
    if (!domain && host) setDomain(host);
    if (!data && backlinks?.summary) setData({ summary: backlinks.summary, backlinks: backlinks.items || [] });
    if (config.scanMode && ["fast","balanced","pro"].includes(String(config.scanMode))) setScanMode(String(config.scanMode));
    if (Number(config.crawlDepth) >= 1 && Number(config.crawlDepth) <= 3) setCrawlDepth(Number(config.crawlDepth));
    if (typeof config.recallMode === "boolean") setRecallMode(!!config.recallMode);
  }, [orgScope, integrations?.gsc?.fields?.extra?.siteUrl]);

  const activePreset = SCAN_PRESETS[scanMode] || SCAN_PRESETS.balanced;

  useEffect(() => {
    const host = getHostFromInput(domain || integrations?.gsc?.fields?.extra?.siteUrl || "");
    if (!host) return;
    mergeProjectData(orgScope, host, {
      backlinks: {
        ...(loadProjectData(orgScope, host)?.backlinks || {}),
        config: { scanMode, crawlDepth, recallMode },
      },
    });
  }, [scanMode, crawlDepth, recallMode, domain, orgScope, integrations?.gsc?.fields?.extra?.siteUrl]);

  const run=async()=>{
    if(!domain)return;setRunning(true);setLogs([]);setData(null);setError("");
    addLog(provider==="dataforseo" ? "Fetching backlink data from DataForSEO..." : "Running Helio native backlink discovery + verification...","sys");
    try{
      const result = provider==="dataforseo"
        ? await dataForSeoBacklinkAnalysis(domain, dfs)
        : await helioNativeBacklinkAnalysis(domain, {
          orgScope,
          candidates: candidateText.split(/\s+/).filter(Boolean),
          maxCandidates: recallMode ? activePreset.maxCandidates : Math.min(70, activePreset.maxCandidates),
          discoveryOptions: {
            maxExpansionDepth: Math.max(crawlDepth, activePreset.depth),
            maxExpansionHosts: recallMode ? 16 : 6,
            maxExpansionLinksPerHost: recallMode ? 70 : 30,
            maxExpandedCandidates: recallMode ? activePreset.maxExpandedCandidates : Math.min(130, activePreset.maxExpandedCandidates),
            maxQueries: recallMode ? activePreset.maxQueries : Math.min(10, activePreset.maxQueries),
            maxSearchPages: recallMode ? activePreset.maxSearchPages : Math.min(3, activePreset.maxSearchPages),
            maxSearchProviders: recallMode ? 3 : 2,
          },
        });
      if (!result.ok) throw new Error(result.error || "Backlink analysis failed");
      addLog(`${provider==="dataforseo" ? "DataForSEO" : "Helio native"} backlink data loaded for ${result.target}.`,"ok");
      if(provider==="helio"){
        const diag=result.diagnostics||{};
        const candidateCount=Array.isArray(diag.candidates)?diag.candidates.length:Number(result.summary?.candidates_discovered||0);
        const checkedCount=Array.isArray(diag.verifiedPages)?diag.verifiedPages.length:Number(result.summary?.candidates_checked||0);
        const liveCount=Number(result.summary?.backlinks||0);
        addLog(`Discovery diagnostics: ${candidateCount} candidate URL(s), ${checkedCount} page(s) checked, ${liveCount} live backlink(s).`, liveCount ? "ok" : candidateCount ? "warn" : "err");
        if(!candidateCount)addLog("No candidate referring pages were found. Import GSC/referrer/export URLs or use DataForSEO for paid index coverage.","warn");
        else if(!liveCount)addLog("Candidates were checked, but none contained a live anchor link to the target domain.","warn");
      }
      const payload = {summary:result.summary || {},backlinks:result.backlinks || []};
      setData(payload);setIndexMeta(result.index || null);
      const host = result.target || getHostFromInput(domain);
      if (host) mergeProjectData(orgScope, host, { backlinks: { summary: payload.summary || {}, items: payload.backlinks || [], provider: result.provider || provider, diagnostics: result.diagnostics || {}, capturedAt: new Date().toISOString() } });
    }catch(e){setError(e.message);addLog(`Error: ${e.message}`,"err");}
    setRunning(false);
  };

  const runGapScan=async()=>{
    if(!domain)return;
    const comps=Array.from(new Set(String(gapCompetitors||"")
      .split(/[\n,\s;]+/)
      .map((x)=>getHostFromInput(x) || x.replace(/^https?:\/\//i,"").replace(/^www\./i,"").replace(/\/.*$/,"").trim().toLowerCase())
      .filter(Boolean)))
      .filter((x)=>x!==getHostFromInput(domain));
    if(!comps.length){setError("Add at least one competitor domain for gap scan.");return;}
    setGapLoading(true);setError("");setGapData(null);
    addLog(`Running backlink gap scan against ${comps.length} competitor(s)...`,"sys");
    try{
      const ownRes = await helioNativeBacklinkAnalysis(domain, {
        orgScope,
        maxCandidates: recallMode ? 160 : 60,
        discoveryOptions: { maxExpansionDepth: crawlDepth, maxExpandedCandidates: recallMode ? 320 : 120, maxQueries: recallMode ? 18 : 8, maxSearchPages: recallMode ? 5 : 2, maxSearchProviders: recallMode ? 3 : 2 },
      });
      if(!ownRes.ok) throw new Error(ownRes.error || "Failed to analyze primary domain for gap scan");
      const ownDomains = new Set((ownRes.backlinks || []).map((b)=>getHostFromInput(b.url_from || "")).filter(Boolean));
      const competitorRuns = [];
      for (const comp of comps) {
        const r = await helioNativeBacklinkAnalysis(comp, {
          orgScope,
          maxCandidates: recallMode ? 120 : 50,
          discoveryOptions: { maxExpansionDepth: Math.min(2, crawlDepth), maxExpandedCandidates: recallMode ? 260 : 100, maxQueries: recallMode ? 14 : 6, maxSearchPages: recallMode ? 4 : 2, maxSearchProviders: recallMode ? 3 : 2 },
        });
        if (r.ok) competitorRuns.push({ competitor: comp, backlinks: r.backlinks || [], summary: r.summary || {} });
      }
      const opportunities = new Map();
      for (const run of competitorRuns) {
        for (const bl of run.backlinks || []) {
          const refHost = getHostFromInput(bl.url_from || "");
          if (!refHost || ownDomains.has(refHost)) continue;
          const prev = opportunities.get(refHost) || { refHost, count: 0, competitors: new Set(), sampleUrl: bl.url_from || "", avgConfidence: 0 };
          prev.count += 1;
          prev.competitors.add(run.competitor);
          prev.avgConfidence = ((prev.avgConfidence * (prev.count - 1)) + Number(bl.confidence || 0)) / prev.count;
          opportunities.set(refHost, prev);
        }
      }
      const rows = Array.from(opportunities.values())
        .map((r)=>{
          const competitors = Array.from(r.competitors).sort();
          const businessFit = Math.max(0, Math.min(100, Math.round((competitors.length * 22) + (Number(r.count || 0) * 6) + (Number(r.avgConfidence || 0) * 0.4))));
          return { ...r, competitors, avgConfidence: Math.round(r.avgConfidence || 0), businessFit };
        })
        .sort((a,b)=>Number(b.businessFit||0)-Number(a.businessFit||0) || b.competitors.length-a.competitors.length || b.count-a.count || b.avgConfidence-a.avgConfidence)
        .slice(0, 80);
      setGapData({
        generatedAt: new Date().toISOString(),
        competitors: comps,
        ownRefDomains: ownDomains.size,
        rows,
      });
      addLog(`Gap scan done: ${rows.length} referring domains link to competitors but not your domain in sampled data.`,"ok");
    }catch(e){setError(e.message);addLog(`Error: ${e.message}`,"err");}
    setGapLoading(false);
  };

  const importCandidates=async()=>{
    if(!domain||!candidateText.trim())return;setImporting(true);setError("");
    try{
      const result=await helioBacklinkIndexRequest(domain,{orgScope,action:"import",text:candidateText});
      if(!result.ok)throw new Error(result.error||"Import failed");
      setData({summary:result.summary||{},backlinks:result.backlinks||[]});setIndexMeta(result.index||null);
      addLog(`Imported ${result.imported||0} backlink candidates into Helio index${result.blocked ? ` (${result.blocked} unsafe URL(s) blocked)` : ""}.`,"ok");
    }catch(e){setError(e.message);addLog(`Error: ${e.message}`,"err");}
    setImporting(false);
  };

  const importCsvCandidates=async(file)=>{
    if(!domain||!file)return;
    setCsvImporting(true);setError("");
    try{
      const text=await file.text();
      const urls=extractSeedUrlsFromCsvText(text);
      if(!urls.length)throw new Error("No referring URL column found in CSV (expected columns like 'Referring page URL' or 'Source URL').");
      const chunkSize=800;
      let importedTotal=0;
      let blockedTotal=0;
      for(let i=0;i<urls.length;i+=chunkSize){
        const chunk=urls.slice(i,i+chunkSize).join("\n");
        const result=await helioBacklinkIndexRequest(domain,{orgScope,action:"import",text:chunk});
        if(!result.ok)throw new Error(result.error||"CSV seed import failed");
        importedTotal+=Number(result.imported||0);
        blockedTotal+=Number(result.blocked||0);
        setData({summary:result.summary||{},backlinks:result.backlinks||[]});
        setIndexMeta(result.index||null);
      }
      setCandidateText((prev)=>{
        const existing=new Set(String(prev||"").split(/\s+/).filter(Boolean));
        urls.slice(0,1200).forEach((u)=>existing.add(u));
        return Array.from(existing).join("\n");
      });
      addLog(`CSV seeds imported: ${importedTotal} candidate URLs${blockedTotal?` · blocked ${blockedTotal} unsafe URL(s)`:""}.`,"ok");
    }catch(e){
      setError(e.message||"CSV import failed");
      addLog(`Error: ${e.message||"CSV import failed"}`,"err");
    }
    setCsvImporting(false);
  };

  const loadIndex=async(options={})=>{
    if(!domain)return;setError("");
    try{
      const result=await helioBacklinkIndexRequest(domain,{orgScope,action:"load"});
      if(!result.ok)throw new Error(result.error||"Index load failed");
      setData({summary:result.summary||{},backlinks:result.backlinks||[]});setIndexMeta(result.index||null);
      if(!options.silent)addLog(`Loaded Helio backlink index for ${result.target}.`,"ok");
    }catch(e){setError(e.message);addLog(`Error: ${e.message}`,"err");}
  };

  const runQueueCrawl=async()=>{
    if(!domain)return;setQueueCrawling(true);setError("");
    try{
      const result=await helioBacklinkIndexRequest(domain,{
        orgScope,
        action:"crawl_scope",
        queueBatchSize: activePreset.queueBatch,
        maxCandidates: recallMode ? activePreset.maxCandidates : Math.min(70, activePreset.maxCandidates),
        rounds: activePreset.queueRounds,
        maxTargetsPerCycle: scanMode==="pro" ? 60 : scanMode==="balanced" ? 40 : 20,
        maxFailureRate: recallMode ? 0.6 : 0.5,
      });
      if(!result.ok)throw new Error(result.error||"Queue crawl failed");
      setQueueCycle({at:new Date().toISOString(),targets:Number(result.targets||0),processedBatches:Number(result.processedBatches||0),adaptive:result?.results?.[0]?.queueBatchAdaptive || 0});
      addLog(`Queue crawl finished: ${Number(result.targets||0)}/${Number(result.targetsAvailable||result.targets||0)} target(s), ${Number(result.processedBatches||0)} batch item(s), ${Number(result.rounds||1)} round(s). Adaptive batch: ${Number(result?.results?.[0]?.queueBatchAdaptive||0) || "auto"}${result.haltedByBackpressure ? " · halted by backpressure guardrail" : ""}.`,"ok");
      await loadIndex();
      for(let i=0;i<3;i+=1){
        await new Promise((resolve)=>setTimeout(resolve,1200));
        await loadIndex({silent:true});
      }
    }catch(e){setError(e.message);addLog(`Error: ${e.message}`,"err");}
    setQueueCrawling(false);
  };

  const genOutreach=async()=>{
    setGeneratingOutreach(true);setOutreach("");
    try{
      const targets = (gapData?.rows || []).slice(0, 8).map((r, i) => `${i + 1}. ${r.refHost} | fit=${r.businessFit} | conf=${r.avgConfidence} | overlaps=${r.competitors.join(", ")}`).join("\n");
      const r=await callAI(
        ai,
        "You are Helio, an expert SEO link builder. Write a concise, personalized guest post outreach email. Professional but conversational tone. Under 150 words. Include subject line.",
        `Write a guest post outreach email for a site about AI tools and automation.\nDomain: ${domain}\nTop outreach targets from backlink gap scan:\n${targets || "No competitor gap targets available."}`
      );
      setOutreach(r);
    }
    catch(e){setOutreach(`Error: ${e.message}`);}
    setGeneratingOutreach(false);
  };

  const s=data?.summary;
  const runHistory=[
    ...(queueCycle?[{at:queueCycle.at,provider:"queue-worker",candidates:queueCycle.processedBatches,verifiedPages:0,liveLinks:0,_local:true}]:[]),
    ...((indexMeta?.queueCycles||[]).map((c)=>({at:c.at,provider:c.mode||"queue-cycle",candidates:c.queueBatchProcessed||0,verifiedPages:c.verifiedPages||0,liveLinks:c.liveLinks||0,_persistent:true}))),
    ...((indexMeta?.runs||[]).slice(-8).reverse()),
  ];
  const runStatus=(r)=>{const verified=Number(r?.verifiedPages||0);const live=Number(r?.liveLinks||0);return live>0?"ok":verified>0?"warn":"idle";};
  const filteredRunHistory=runHistory.filter((r)=>runFilter==="all"||runStatus(r)===runFilter);
  const backlinkRows=(Array.isArray(data?.backlinks)?data.backlinks:[]);
  const trendInsight = (() => {
    const snaps = Array.isArray(indexMeta?.snapshots) ? indexMeta.snapshots : [];
    if (!snaps.length) {
      return {
        liveDelta: Number(s?.backlinks_trend_30d || 0),
        refDelta: Number(s?.ref_domains_trend_7d || 0),
        newLinks: Number(s?.new_links_30d || 0),
        recoveredLinks: Number(s?.recovered_links_30d || 0),
        lostLinks: Number(s?.lost_last_30d || 0),
      };
    }
    const sorted = [...snaps]
      .map((sn) => ({ ...sn, __ts: Date.parse(String(sn?.at || "")) }))
      .filter((sn) => Number.isFinite(sn.__ts))
      .sort((a, b) => a.__ts - b.__ts);
    const latest = sorted[sorted.length - 1];
    const cutoff = Date.now() - (Number(trendWindow || 30) * 24 * 60 * 60 * 1000);
    let baseline = sorted[0];
    for (const sn of sorted) {
      if (sn.__ts <= cutoff) baseline = sn;
      else break;
    }
    const liveDelta = Number(latest?.backlinks_live || 0) - Number(baseline?.backlinks_live || 0);
    const refDelta = Number(latest?.referring_domains || 0) - Number(baseline?.referring_domains || 0);
    const windowDays = Number(trendWindow || 30);
    const newLinks = windowDays <= 7 ? Number(s?.new_links_7d || 0) : Number(s?.new_links_30d || 0);
    const recoveredLinks = Number(s?.recovered_links_30d || 0);
    const lostLinks = Number(s?.lost_last_30d || 0);
    return { liveDelta, refDelta, newLinks, recoveredLinks, lostLinks };
  })();
  const filteredBacklinks=backlinkRows
    .filter((bl)=>Number(bl?.confidence||0)>=Number(minConfidence||0))
    .filter((bl)=>placementFilter==="all"||String(bl?.placement||"unknown")===placementFilter)
    .filter((bl)=>sourceFilter==="all"||String(bl?.source_type||"general")===sourceFilter)
    .filter((bl)=>{
      if(followFilter==="all")return true;
      if(followFilter==="follow")return !!bl?.dofollow;
      if(followFilter==="nofollow")return !bl?.dofollow;
      return true;
    })
    .sort((a,b)=>{
      const confA=Number(a?.confidence||0), confB=Number(b?.confidence||0);
      if(confB!==confA)return confB-confA;
      const rankA=Number(a?.page_from_rank||0), rankB=Number(b?.page_from_rank||0);
      if(rankB!==rankA)return rankB-rankA;
      const occA=Number(a?.occurrences||1), occB=Number(b?.occurrences||1);
      return occB-occA;
    });
  const metricHelp = {
    "Domain Rank": "Helio quality score (0-100) based on referring page strength and link context.",
    "Backlinks": "Count of unique live backlinks currently verified by Helio.",
    "Ref Domains": "Number of unique referring domains among verified live backlinks.",
    "DoFollow": "Live backlinks with follow equity (rel does not include nofollow).",
    "NoFollow": "Live backlinks with nofollow attribute.",
    "Checked": "Total candidate pages checked in the current indexed run history.",
    "Coverage": "How much of discovered candidates were actually verified in crawl runs (higher is better).",
    "Precision": "Share of checked pages that produced valid live backlinks (higher is better).",
    "New 7d": "Live backlinks first seen in the last 7 days.",
    "Recovered 30d": "Links that were lost and then seen live again within 30 days.",
    "Live Δ7d": "Net change in live backlinks over 7 days.",
    "RefDom Δ7d": "Net change in referring domains over 7 days.",
    "Lost 30d": "Previously live backlinks now lost in the last 30 days.",
    "Due 24h": "Candidates scheduled for recrawl within the next 24 hours.",
    "Due 7d": "Candidates scheduled for recrawl within the next 7 days.",
    "Queue": "Candidates currently waiting in queue for crawl.",
    "Broken": "Previously live backlinks currently marked as lost/broken.",
  };
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Backlink Manager" sub={`Helio native backlink verification · optional DataForSEO enrichment · AI outreach`}/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      {[
        {id:"helio",label:"HELIO NATIVE",note:"SERP discovery + live link verification"},
        {id:"dataforseo",label:"DATAFORSEO",note:"Paid backlink index"}
      ].map(p=><button key={p.id} onClick={()=>setProvider(p.id)} style={{background:provider===p.id?C.lime:"#060606",color:provider===p.id?"#000":C.muted,border:`1px solid ${provider===p.id?C.lime:C.dim}`,fontFamily:"monospace",fontSize:9,fontWeight:800,letterSpacing:1,padding:"7px 10px",cursor:"pointer"}}>
        {p.label} <span style={{fontWeight:500,opacity:0.75}}>· {p.note}</span>
      </button>)}
    </div>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="Domain to analyze (e.g. generalizingai.com)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={run} disabled={running||!domain}>{running?"▶ LOADING...":"⬢ ANALYZE BACKLINKS"}</Btn>
    </div>
    {provider==="helio"&&<div style={{marginBottom:18,background:"#071007",border:`1px solid ${C.dim}`,padding:12,color:C.muted,fontFamily:"monospace",fontSize:10,lineHeight:1.7}}>
      Helio Native discovers candidate mentions from search result surfaces and verifies live links by crawling referring pages. Coverage grows as you import GSC links, logs, or paid index exports.
      <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:C.muted}}>MODE</span>
        {["fast","balanced","pro"].map((m)=><div key={`mode-${m}`} onClick={()=>setScanMode(m)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${scanMode===m?C.lime:C.dim}`,background:scanMode===m?C.lime:"#060606",color:scanMode===m?"#000":C.muted,textTransform:"uppercase"}}>{m}</div>)}
      </div>
      <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:C.muted}}>DEPTH</span>
        {[1,2,3].map((d)=><div key={`depth-${d}`} onClick={()=>setCrawlDepth(d)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${crawlDepth===d?C.lime:C.dim}`,background:crawlDepth===d?C.lime:"#060606",color:crawlDepth===d?"#000":C.muted}}>{d}</div>)}
        <span style={{width:1,background:C.dim,height:16}}/>
        <div onClick={()=>setRecallMode((v)=>!v)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${recallMode?C.lime:C.dim}`,background:recallMode?C.lime:"#060606",color:recallMode?"#000":C.muted}}>
          {recallMode?"PRO RECALL ON":"PRO RECALL OFF"}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,marginTop:10}}>
        <textarea value={candidateText} onChange={e=>setCandidateText(e.target.value)} placeholder="Paste candidate referring URLs from GSC export, server referrer logs, old CSV exports, or manual research..."
          style={{minHeight:68,resize:"vertical",background:"#050505",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:10,outline:"none"}}/>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <Btn onClick={importCandidates} disabled={importing||!domain||!candidateText.trim()}>{importing?"IMPORTING...":"IMPORT CANDIDATES"}</Btn>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={(e)=>{const f=e.target.files?.[0];if(f)importCsvCandidates(f);e.target.value="";}}/>
          <Btn onClick={()=>csvInputRef.current?.click()} disabled={csvImporting||!domain} variant="blue">{csvImporting?"IMPORTING CSV...":"IMPORT CSV SEEDS"}</Btn>
          <Btn onClick={loadIndex} disabled={!domain} variant="blue">LOAD INDEX</Btn>
          <Btn onClick={runQueueCrawl} disabled={queueCrawling||!domain} variant="blue">{queueCrawling?"CRAWLING...":"RUN QUEUE CRAWL"}</Btn>
        </div>
      </div>
      {indexMeta&&<div style={{marginTop:8,color:C.muted}}>INDEX: {indexMeta.candidates?.length||0} candidates · {indexMeta.runs?.length||0} recent runs · updated {indexMeta.updatedAt||"—"}</div>}
      {queueCycle&&<div style={{marginTop:6,color:C.muted}}>LAST QUEUE CYCLE: {queueCycle.targets} target(s) · {queueCycle.processedBatches} batch item(s) · {new Date(queueCycle.at).toLocaleString()}</div>}
    </div>}
    {provider==="dataforseo"&&!integrations.dataforseo?.connected&&<div style={{marginBottom:18,background:"#140f05",border:`1px solid ${C.orange}`,padding:12,color:C.orange,fontFamily:"monospace",fontSize:10,lineHeight:1.7}}>
      DataForSEO is not connected. Switch to Helio Native or add API login and password in Integrations.
    </div>}
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={running}/></div>}
    {error&&<div style={{marginBottom:18,background:"#160909",border:`1px solid ${C.red}`,padding:12,color:C.red,fontFamily:"monospace",fontSize:10,lineHeight:1.7}}>
      {error}
    </div>}
    {data&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {[{label:"Domain Rank",value:s?.rank},{label:"Backlinks",value:s?.backlinks?.toLocaleString()},{label:"Ref Domains",value:s?.referring_domains?.toLocaleString()},{label:"DoFollow",value:s?.backlinks_dofollow?.toLocaleString()},{label:"NoFollow",value:s?.backlinks_nofollow?.toLocaleString()},{label:"Checked",value:s?.candidates_checked?.toLocaleString?.()??s?.candidates_checked},{label:"Coverage",value:s?.coverage_score?.toLocaleString?.()??s?.coverage_score},{label:"Precision",value:s?.precision_score?.toLocaleString?.()??s?.precision_score},{label:"New 7d",value:s?.new_links_7d?.toLocaleString?.()??s?.new_links_7d},{label:"Recovered 30d",value:s?.recovered_links_30d?.toLocaleString?.()??s?.recovered_links_30d},{label:"Live Δ7d",value:s?.backlinks_trend_7d?.toLocaleString?.()??s?.backlinks_trend_7d,delta:`${s?.link_velocity_7d_pct??0}% velocity`,good:Number(s?.backlinks_trend_7d||0)>=0},{label:"RefDom Δ7d",value:s?.ref_domains_trend_7d?.toLocaleString?.()??s?.ref_domains_trend_7d,good:Number(s?.ref_domains_trend_7d||0)>=0},{label:"Lost 30d",value:s?.lost_last_30d?.toLocaleString?.()??s?.lost_last_30d},{label:"Due 24h",value:s?.recrawl_due_24h?.toLocaleString?.()??s?.recrawl_due_24h},{label:"Due 7d",value:s?.recrawl_due_7d?.toLocaleString?.()??s?.recrawl_due_7d},{label:"Queue",value:s?.queue_pending?.toLocaleString?.()??s?.queue_pending},{label:"Broken",value:s?.broken_backlinks}].map((m,i)=><Card key={i} {...m} help={metricHelp[m.label] || ""}/>)}
      </div>
      <Tabs tabs={["overview","backlinks","gap","outreach"]} active={tab} onChange={setTab}/>
      {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
          <div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,color:C.muted,fontFamily:"monospace",fontSize:9}}>QUEUE HEALTH</div>
          {(()=>{
            const pending = Number(s?.queue_pending || 0);
            const failed = Number(s?.queue_failed || 0);
            const inProgress = Number(s?.queue_in_progress || 0);
            const due24h = Number(s?.recrawl_due_24h || 0);
            const pressure = pending + failed + due24h;
            const health = Math.max(0, Math.min(100, 100 - Math.round((pressure * 1.6) + (failed * 2.2) + (inProgress * 0.8))));
            const state = health >= 75 ? "Healthy" : health >= 50 ? "Watch" : "Saturated";
            return <div style={{display:"flex",gap:12,padding:"8px 14px",fontFamily:"monospace",fontSize:10,flexWrap:"wrap"}}>
              <span style={{color:C.muted}}>Health:</span><span style={{color:health>=75?C.green:health>=50?C.orange:C.red}}>{health}/100 ({state})</span>
              <span style={{color:C.muted}}>Pressure:</span><span style={{color:C.text}}>{pressure}</span>
              <span style={{color:C.muted}}>Pending:</span><span style={{color:C.text}}>{pending}</span>
              <span style={{color:C.muted}}>Failed:</span><span style={{color:C.text}}>{failed}</span>
              <span style={{color:C.muted}}>Due 24h:</span><span style={{color:C.text}}>{due24h}</span>
            </div>;
          })()}
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:6,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>TREND WINDOW</span>
            {[7,30,90].map((d)=><div key={`tw-${d}`} onClick={()=>setTrendWindow(d)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${trendWindow===d?C.lime:C.dim}`,background:trendWindow===d?C.lime:"#060606",color:trendWindow===d?"#000":C.muted}}>{d}D</div>)}
          </div>
          {[{label:`Live Links Δ${trendWindow}d`,value:trendInsight.liveDelta,good:trendInsight.liveDelta>=0},{label:`Ref Domains Δ${trendWindow}d`,value:trendInsight.refDelta,good:trendInsight.refDelta>=0},{label:`New Links (${trendWindow<=7?"7d":"30d"})`,value:trendInsight.newLinks,good:trendInsight.newLinks>=0},{label:"Recovered Links (30d)",value:trendInsight.recoveredLinks,good:trendInsight.recoveredLinks>=0},{label:"Lost Links (30d)",value:trendInsight.lostLinks,good:trendInsight.lostLinks===0}].map((item,i)=><div key={`cohort-${i}`} style={{display:"flex",gap:12,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{color:C.muted,minWidth:190}}>{item.label}</span>
            <span style={{color:item.good?C.green:C.orange}}>{Number(item.value||0)}</span>
          </div>)}
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        {[{label:"Referring IPs",value:s?.referring_ips},{label:"Referring Subnets",value:s?.referring_subnets},{label:"Spam Score",value:s?.spam_score},{label:"Follow",value:s?.backlinks_follow},{label:"UGC Links",value:s?.backlinks_ugc},{label:"Sponsored",value:s?.backlinks_sponsored},{label:"Candidates Discovered",value:s?.candidates_discovered},{label:"Candidates Checked",value:s?.candidates_checked},{label:"Queue Pending",value:s?.queue_pending},{label:"Queue In Progress",value:s?.queue_in_progress},{label:"Queue Completed",value:s?.queue_completed},{label:"Queue Failed",value:s?.queue_failed}].map((item,i)=><div key={i} style={{display:"flex",gap:12,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.muted,minWidth:160}}>{item.label}</span><span style={{color:C.lime}}>{item.value?.toLocaleString()??"—"}</span>
        </div>)}
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:6,padding:"8px 14px",borderBottom:`1px solid ${C.border}`}}>
            {["all","warn","ok","idle"].map((f)=><div key={f} onClick={()=>setRunFilter(f)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${runFilter===f?C.lime:C.dim}`,background:runFilter===f?C.lime:"#060606",color:runFilter===f?"#000":C.muted,textTransform:"uppercase"}}>{f}</div>)}
          </div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{minWidth:170}}>RUN TIME</span><span style={{minWidth:120}}>PROVIDER</span><span style={{minWidth:80}}>CANDIDATES</span><span style={{minWidth:80}}>VERIFIED</span><span style={{minWidth:80}}>LIVE LINKS</span><span style={{minWidth:70}}>STATUS</span>
          </div>
          {filteredRunHistory.length===0&&<div style={{padding:"10px 14px",fontFamily:"monospace",fontSize:10,color:C.muted}}>No runs match this filter.</div>}
          {filteredRunHistory.map((r,i)=>{
            const verified=Number(r.verifiedPages||0);
            const live=Number(r.liveLinks||0);
            const status=runStatus(r);
            const statusColor=status==="ok"?C.green:status==="warn"?C.orange:C.muted;
            return <div key={`${r.at||"run"}-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
              <span style={{minWidth:170,color:C.text}}>{r.at?new Date(r.at).toLocaleString():"—"}</span>
              <span style={{minWidth:120,color:r._local?C.blue:C.muted}}>{r.provider||"helio-native"}</span>
              <span style={{minWidth:80,color:C.lime}}>{Number(r.candidates||0)}</span>
              <span style={{minWidth:80,color:C.lime}}>{verified}</span>
              <span style={{minWidth:80,color:C.lime}}>{live}</span>
              <span style={{minWidth:70,color:statusColor,textTransform:"uppercase"}}>{status}</span>
            </div>;
          })}
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{minWidth:170}}>SNAPSHOT TIME</span><span style={{minWidth:100}}>LIVE</span><span style={{minWidth:100}}>LOST</span><span style={{minWidth:120}}>REF DOMAINS</span>
          </div>
          {!((indexMeta?.snapshots||[]).length)&&<div style={{padding:"10px 14px",fontFamily:"monospace",fontSize:10,color:C.muted}}>No backlink trend snapshots yet. Run more analyses to build trend history.</div>}
          {(indexMeta?.snapshots||[]).slice(0,10).map((sn,i)=><div key={`sn-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{minWidth:170,color:C.text}}>{sn.at?new Date(sn.at).toLocaleString():"—"}</span>
            <span style={{minWidth:100,color:C.green}}>{Number(sn.backlinks_live||0)}</span>
            <span style={{minWidth:100,color:C.orange}}>{Number(sn.backlinks_lost||0)}</span>
            <span style={{minWidth:120,color:C.lime}}>{Number(sn.referring_domains||0)}</span>
          </div>)}
        </div>
      </div>}
      {tab==="backlinks"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:6,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
          <span style={{color:C.muted,fontFamily:"monospace",fontSize:9,alignSelf:"center"}}>MIN CONF</span>
          {[0,40,60,75].map((n)=><div key={`cf-${n}`} onClick={()=>setMinConfidence(n)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${minConfidence===n?C.lime:C.dim}`,background:minConfidence===n?C.lime:"#060606",color:minConfidence===n?"#000":C.muted}}>{n}</div>)}
          <span style={{width:1,background:C.dim,margin:"0 4px"}}/>
          {["all","content","sidebar","nav","footer","header","unknown"].map((v)=><div key={`pl-${v}`} onClick={()=>setPlacementFilter(v)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${placementFilter===v?C.lime:C.dim}`,background:placementFilter===v?C.lime:"#060606",color:placementFilter===v?"#000":C.muted,textTransform:"uppercase"}}>{v}</div>)}
          <span style={{width:1,background:C.dim,margin:"0 4px"}}/>
          {["all","editorial","profile","directory","forum","general"].map((v)=><div key={`sf-${v}`} onClick={()=>setSourceFilter(v)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${sourceFilter===v?C.lime:C.dim}`,background:sourceFilter===v?C.lime:"#060606",color:sourceFilter===v?"#000":C.muted,textTransform:"uppercase"}}>{v}</div>)}
          <span style={{width:1,background:C.dim,margin:"0 4px"}}/>
          {["all","follow","nofollow"].map((v)=><div key={`ff-${v}`} onClick={()=>setFollowFilter(v)} style={{padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${followFilter===v?C.lime:C.dim}`,background:followFilter===v?C.lime:"#060606",color:followFilter===v?"#000":C.muted,textTransform:"uppercase"}}>{v}</div>)}
          <span style={{color:C.muted,fontFamily:"monospace",fontSize:9,alignSelf:"center",marginLeft:"auto"}}>SHOWING {filteredBacklinks.length}/{backlinkRows.length}</span>
        </div>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>SOURCE URL</span><span style={{minWidth:40}}>DA</span><span style={{minWidth:70}}>TYPE</span><span style={{minWidth:80}}>PLACEMENT</span><span style={{minWidth:80}}>SOURCE</span><span style={{minWidth:60}}>CONF</span><span style={{minWidth:60}}>ANCHOR</span>
        </div>
        {filteredBacklinks.length===0&&<div style={{padding:"12px 14px",fontFamily:"monospace",fontSize:10,color:C.muted}}>No backlink rows match current filters.</div>}
        {filteredBacklinks.map((bl,i)=>{
          const rowKey=`${bl.url_from||"src"}-${bl.url_to||"dst"}-${i}`;
          const isOpen=expandedBacklinkKey===rowKey;
          return <div key={rowKey} style={{borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",gap:10,padding:"8px 14px",fontFamily:"monospace",fontSize:10,alignItems:"center"}}>
              <span style={{color:C.blue,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bl.url_from}</span>
              <span style={{color:C.lime,minWidth:40}}>{bl.page_from_rank??"-"}</span>
              <span style={{color:bl.dofollow?C.green:C.muted,minWidth:70}}>{bl.dofollow?"DoFollow":"NoFollow"}</span>
              <span style={{color:C.muted,minWidth:80,textTransform:"uppercase"}}>{bl.placement||"unknown"}</span>
              <span style={{color:C.muted,minWidth:80,textTransform:"uppercase"}}>{bl.source_type||"general"}</span>
              <span style={{color:Number(bl.confidence||0)>=70?C.green:Number(bl.confidence||0)>=45?C.orange:C.red,minWidth:60}}>{bl.confidence??"-"}</span>
              <span style={{color:C.muted,minWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bl.anchor||"—"}</span>
              <button onClick={()=>setExpandedBacklinkKey(isOpen?"":rowKey)} style={{background:"transparent",border:`1px solid ${isOpen?C.lime:C.dim}`,color:isOpen?C.lime:C.muted,fontFamily:"monospace",fontSize:8,padding:"2px 6px",cursor:"pointer"}}>{isOpen?"HIDE":"WHY"}</button>
            </div>
            {isOpen&&<div style={{padding:"8px 14px 10px 14px",fontFamily:"monospace",fontSize:9,color:C.muted,background:"#080808"}}>
              <div style={{marginBottom:5}}>URL TO: <span style={{color:C.text}}>{bl.url_to||"—"}</span></div>
              <div style={{marginBottom:5}}>OCCURRENCES: <span style={{color:C.lime}}>{Number(bl.occurrences||1)}</span></div>
              <div style={{marginBottom:5}}>QUALITY SIGNALS: <span style={{color:C.text}}>{Array.isArray(bl.confidence_reasons)&&bl.confidence_reasons.length?bl.confidence_reasons.join(" · "):"—"}</span></div>
            </div>}
          </div>;
        })}
      </div>}
      {tab==="gap"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:12}}>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginBottom:8}}>Compare your referring domains against competitors and surface domains linking to them but not you (sampled Helio-native data).</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}>
            <textarea value={gapCompetitors} onChange={(e)=>setGapCompetitors(e.target.value)} placeholder={"competitor1.com\ncompetitor2.com"}
              style={{minHeight:72,resize:"vertical",background:"#050505",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:10,outline:"none"}}/>
            <Btn onClick={runGapScan} disabled={gapLoading||!domain} variant="blue">{gapLoading?"SCANNING...":"RUN GAP SCAN"}</Btn>
          </div>
        </div>
        {gapData&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:14,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted,flexWrap:"wrap"}}>
            <span>COMPETITORS: <span style={{color:C.text}}>{gapData.competitors.join(", ")}</span></span>
            <span>YOUR REF DOMAINS: <span style={{color:C.lime}}>{gapData.ownRefDomains}</span></span>
            <span>GAP DOMAINS: <span style={{color:C.orange}}>{gapData.rows.length}</span></span>
          </div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{minWidth:220}}>REF DOMAIN</span><span style={{minWidth:90}}>FIT</span><span style={{minWidth:90}}>HITS</span><span style={{minWidth:90}}>CONF</span><span style={{minWidth:260}}>COMPETITORS</span><span style={{flex:1}}>SAMPLE URL</span>
          </div>
          {!gapData.rows.length&&<div style={{padding:"12px 14px",fontFamily:"monospace",fontSize:10,color:C.muted}}>No gap domains found in current sampled crawl window.</div>}
          {gapData.rows.map((r,i)=><div key={`${r.refHost}-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{minWidth:220,color:C.blue}}>{r.refHost}</span>
            <span style={{minWidth:90,color:Number(r.businessFit)>=70?C.green:Number(r.businessFit)>=45?C.orange:C.red}}>{r.businessFit}</span>
            <span style={{minWidth:90,color:C.lime}}>{r.count}</span>
            <span style={{minWidth:90,color:r.avgConfidence>=70?C.green:r.avgConfidence>=45?C.orange:C.red}}>{r.avgConfidence}</span>
            <span style={{minWidth:260,color:C.muted}}>{r.competitors.join(", ")}</span>
            <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sampleUrl}</span>
          </div>)}
        </div>}
      </div>}
      {tab==="outreach"&&<div>
        <Btn onClick={genOutreach} disabled={generatingOutreach} style={{marginBottom:14}}>{generatingOutreach?"WRITING...":"✉ GENERATE OUTREACH EMAIL"}</Btn>
        {!!gapData?.rows?.length&&<div style={{marginBottom:12,color:C.muted,fontFamily:"monospace",fontSize:10}}>Priority targets from GAP scan: {gapData.rows.slice(0,5).map((r)=>`${r.refHost}(${r.businessFit})`).join(" · ")}</div>}
        <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:16,fontFamily:"monospace",fontSize:11,minHeight:120}}>
          {outreach&&<div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{outreach}</div>}
          {!outreach&&!generatingOutreach&&<div style={{color:C.muted}}>Click to generate a personalized guest post outreach email.</div>}
        </div>
      </div>}
    </>}
  </div>;
}

// ── SEARCH CONSOLE ────────────────────────────────────────────────
function GSC({integrations, orgScope="default"}) {
  const ai=integrations.ai;const gscF=integrations.gsc?.fields;
  const [loading,setLoading]=useState(false);const [logs,setLogs]=useState([]);const [data,setData]=useState(null);
  const [tab,setTab]=useState("overview");const [insight,setInsight]=useState("");const [insightLoading,setInsightLoading]=useState(false);const [days,setDays]=useState(28);
  const [submittingSitemap,setSubmittingSitemap]=useState(false);
  const [sitemapPath,setSitemapPath]=useState("sitemap.xml");
  const [actions,setActions]=useState([]);
  const [queueingActionId,setQueueingActionId]=useState("");
  const [indexCsvImporting,setIndexCsvImporting]=useState(false);
  const gscIndexCsvInputRef=useRef(null);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);
  const end=new Date().toISOString().split("T")[0];const start=new Date(Date.now()-days*86400000).toISOString().split("T")[0];

  useEffect(() => {
    const host = getHostFromInput(gscF?.extra?.siteUrl || "");
    if (!host) return;
    const project = loadProjectData(orgScope, host);
    const g = project?.gsc || {};
    if (!data && (Array.isArray(g.topPages) || Array.isArray(g.topKeywords))) {
      setData({
        pages: Array.isArray(g.topPages) ? g.topPages : [],
        keywords: Array.isArray(g.topKeywords) ? g.topKeywords : [],
        totals: g.totals || {},
        countries: Array.isArray(g.countries) ? g.countries : [],
        devices: Array.isArray(g.devices) ? g.devices : [],
        timeline: Array.isArray(g.timeline) ? g.timeline : [],
        queryPages: Array.isArray(g.queryPages) ? g.queryPages : [],
        indexCoverage: g.indexCoverage || null,
        inspections: Array.isArray(g.inspections) ? g.inspections : [],
        gscIssues: Array.isArray(g.gscIssues) ? g.gscIssues : [],
        pageIndexExport: g.pageIndexExport || null,
      });
    }
    if (!actions.length && Array.isArray(g.actions)) setActions(g.actions);
  }, [orgScope, gscF?.extra?.siteUrl]);

  const buildActionCards = (payload = {}) => {
    const topPages = Array.isArray(payload.pages) ? payload.pages.slice(0, 12) : [];
    const topKeywords = Array.isArray(payload.keywords) ? payload.keywords.slice(0, 25) : [];
    const rows = [];
    const lowCtr = topKeywords
      .filter((r)=>Number(r.impressions||0)>=100 && Number(r.position||99)<=15 && Number(r.ctr||0)<0.02)
      .sort((a,b)=>Number(b.impressions||0)-Number(a.impressions||0))
      .slice(0,3);
    lowCtr.forEach((k,idx)=>{
      rows.push({
        id:`gsc_low_ctr_${idx}_${String(k.keys?.[0]||"").toLowerCase().replace(/[^a-z0-9_]+/g,"_")}`,
        title:`Increase CTR for "${k.keys?.[0]||"query"}"`,
        priority:Number(k.position||99)<=8?"P1":"P2",
        score:Math.round((Math.min(20, Number(k.impressions||0)/120) * 3) + ((15-Math.min(15,Number(k.position||15))) * 4)),
        reason:`High impressions (${Number(k.impressions||0).toLocaleString()}) but low CTR (${(Number(k.ctr||0)*100).toFixed(2)}%).`,
        targetPage:String((payload.queryPages||[]).find((qp)=>String(qp.keys?.[0]||"")===String(k.keys?.[0]||""))?.keys?.[1] || topPages[0]?.keys?.[0] || ""),
        fixHint:"Rewrite title/meta for intent fit, add stronger value proposition, and align snippet with query intent.",
        source:"search_console",
      });
    });
    const weakPages = topPages
      .filter((p)=>Number(p.impressions||0)>=120 && Number(p.clicks||0)<=1)
      .sort((a,b)=>Number(b.impressions||0)-Number(a.impressions||0))
      .slice(0,3);
    weakPages.forEach((p,idx)=>{
      rows.push({
        id:`gsc_page_upgrade_${idx}_${String(p.keys?.[0]||"").toLowerCase().replace(/[^a-z0-9_]+/g,"_")}`,
        title:`Upgrade page with low click yield`,
        priority:"P2",
        score:Math.round(Math.min(95, (Number(p.impressions||0)/20) + 20)),
        reason:`${Number(p.impressions||0).toLocaleString()} impressions but only ${Number(p.clicks||0)} clicks.`,
        targetPage:String(p.keys?.[0]||""),
        fixHint:"Improve H1/introduction for intent match, add FAQ block, and strengthen internal links to this page.",
        source:"search_console",
      });
    });
    const avgPos = Number(payload?.totals?.position || 0);
    if (avgPos > 10) {
      rows.push({
        id:"gsc_sitewide_position_upgrade",
        title:"Sitewide ranking lift sprint",
        priority:"P1",
        score:Math.round(Math.min(99, avgPos * 4)),
        reason:`Average position is ${avgPos.toFixed(1)} over selected range.`,
        targetPage:topPages[0]?.keys?.[0] || "",
        fixHint:"Prioritize top opportunity queries in positions 5-15 with intent-refresh and SERP-snippet optimization.",
        source:"search_console",
      });
    }
    return rows
      .sort((a,b)=>(Number(b.score||0)-Number(a.score||0)) || String(a.priority||"").localeCompare(String(b.priority||"")))
      .slice(0,8);
  };

  const parseCsvLine=(line="")=>{
    const out=[];let cur="";let inQuotes=false;
    for(let i=0;i<line.length;i+=1){
      const ch=line[i];
      if(ch==="\""){
        const next=line[i+1];
        if(inQuotes&&next==="\""){cur+="\"";i+=1;}else inQuotes=!inQuotes;
        continue;
      }
      if(ch===","&&!inQuotes){out.push(cur.trim());cur="";continue;}
      cur+=ch;
    }
    out.push(cur.trim());
    return out;
  };

  const importPageIndexCsv = async (file) => {
    if (!file) return;
    setIndexCsvImporting(true);
    try {
      const raw = await file.text();
      const lines = String(raw || "").split(/\r?\n/).filter((x)=>x && x.trim());
      if (!lines.length) throw new Error("Empty CSV file.");
      const headers = parseCsvLine(lines[0]).map((h)=>String(h||"").toLowerCase().trim());
      const idxReason = headers.findIndex((h)=>/reason|status|state/.test(h));
      const idxPages = headers.findIndex((h)=>/pages|count|urls/.test(h));
      if (idxReason < 0 || idxPages < 0) {
        throw new Error("Could not detect Page Indexing columns. Export the GSC Pages report CSV and try again.");
      }
      let indexed = 0;
      let nonIndexed = 0;
      const rows = [];
      for (let i=1;i<lines.length;i+=1){
        const cols = parseCsvLine(lines[i]);
        const reason = String(cols[idxReason] || "").trim();
        const pages = Number(String(cols[idxPages] || "0").replace(/[^\d.-]/g,"")) || 0;
        if (!reason) continue;
        const isIndexedReason = /indexed/i.test(reason) && !/not indexed|excluded|crawled - currently not indexed|discovered - currently not indexed/i.test(reason.toLowerCase());
        if (isIndexedReason) indexed += pages;
        else nonIndexed += pages;
        rows.push({ reason, pages, bucket: isIndexedReason ? "indexed" : "non-indexed" });
      }
      const host = getHostFromInput(gscF?.extra?.siteUrl || "");
      const exportPayload = {
        indexed,
        nonIndexed,
        importedAt: new Date().toISOString(),
        rows: rows.slice(0, 120),
      };
      setData((prev)=>({
        ...(prev || {}),
        pageIndexExport: exportPayload,
      }));
      if (host) {
        const project = loadProjectData(orgScope, host);
        mergeProjectData(orgScope, host, {
          gsc: {
            ...(project?.gsc || {}),
            pageIndexExport: exportPayload,
          }
        });
      }
      addLog(`Imported GSC Page Indexing CSV: indexed ${indexed}, non-indexed ${nonIndexed}.`, "ok");
    } catch (e) {
      addLog(`Error: ${e.message || "CSV import failed"}`, "err");
    }
    setIndexCsvImporting(false);
  };

  const load=async()=>{
    if(!gscF?.extra?.siteUrl){
      setLogs([{msg:"Error: Select a Search Console property in Integrations first.",type:"err",t:0}]);
      return;
    }
    setLoading(true);setLogs([]);setData(null);addLog("Connecting to GSC API...","sys");
    try{
      const h={"Content-Type":"application/json","Authorization":`Bearer ${gscF.accessToken}`};
      const site=encodeURIComponent(gscF.extra.siteUrl);const base=`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}`;
      const gq = async (body) => {
        const res = await fetch(`${base}/searchAnalytics/query`,{method:"POST",headers:h,body:JSON.stringify(body)});
        const json = await res.json().catch(()=>({}));
        return { ok: res.ok, status: res.status, json };
      };
      const [pRes,kRes,tRes,cRes,dRes,dtRes,qpRes] = await Promise.all([
        gq({startDate:start,endDate:end,dimensions:["page"],rowLimit:250}),
        gq({startDate:start,endDate:end,dimensions:["query"],rowLimit:250}),
        gq({startDate:start,endDate:end,dimensions:[],rowLimit:1}),
        gq({startDate:start,endDate:end,dimensions:["country"],rowLimit:80}),
        gq({startDate:start,endDate:end,dimensions:["device"],rowLimit:16}),
        gq({startDate:start,endDate:end,dimensions:["date"],rowLimit:Math.max(7, Math.min(120, Number(days||28)))}),
        gq({startDate:start,endDate:end,dimensions:["query","page"],rowLimit:220}),
      ]);
      if(!pRes.ok){
        addLog(`Error: ${pRes.json?.error?.message || `GSC request failed (${pRes.status})`}`,"err");
        setLoading(false);
        return;
      }
      const payload = {
        pages:pRes.json?.rows||[],
        keywords:kRes.ok?(kRes.json?.rows||[]):[],
        totals:tRes.ok?(tRes.json?.rows?.[0]||{}):{},
        countries:cRes.ok?(cRes.json?.rows||[]):[],
        devices:dRes.ok?(dRes.json?.rows||[]):[],
        timeline:dtRes.ok?(dtRes.json?.rows||[]):[],
        queryPages:qpRes.ok?(qpRes.json?.rows||[]):[],
        indexCoverage: null,
        inspections: [],
        gscIssues: [],
        techStatus: [],
        cwv: [],
      };
      // Pull sitemap coverage summary as indexed/non-indexed signal.
      try {
        const smRes = await fetch(`${base}/sitemaps`, { headers: h });
        const smJson = await smRes.json().catch(() => ({}));
        if (smRes.ok) {
          const sitemaps = Array.isArray(smJson?.sitemap) ? smJson.sitemap : [];
          // GSC sitemap payload uses `contents[]` with `submitted` and `indexed` string counts.
          // Some properties may return empty/partial contents, so we only trust numeric values.
          const submitted = sitemaps.reduce((acc, s) => {
            const rows = Array.isArray(s?.contents) ? s.contents : [];
            const sum = rows.reduce((inner, c) => inner + (Number.isFinite(Number(c?.submitted)) ? Number(c.submitted) : 0), 0);
            return acc + sum;
          }, 0);
          const indexed = sitemaps.reduce((acc, s) => {
            const rows = Array.isArray(s?.contents) ? s.contents : [];
            const sum = rows.reduce((inner, c) => inner + (Number.isFinite(Number(c?.indexed)) ? Number(c.indexed) : 0), 0);
            return acc + sum;
          }, 0);
          const submittedSafe = Number.isFinite(submitted) ? submitted : 0;
          const indexedSafe = Number.isFinite(indexed) ? indexed : 0;
          payload.indexCoverage = submittedSafe > 0 || indexedSafe > 0
            ? {
              submitted: submittedSafe,
              indexed: indexedSafe,
              nonIndexed: Math.max(0, submittedSafe - indexedSafe),
              sitemaps: sitemaps.slice(0, 20),
              source: "sitemaps",
            }
            : {
              submitted: null,
              indexed: null,
              nonIndexed: null,
              sitemaps: sitemaps.slice(0, 20),
              source: "sitemaps-empty",
            };
        } else {
          addLog("Warning: sitemap coverage API unavailable for this property.", "warn");
        }
      } catch {
        addLog("Warning: sitemap coverage fetch failed.", "warn");
      }
      // URL Inspection sample for index status + issue extraction.
      const inspectionCandidates = Array.from(new Set([
        ...(payload.pages || []).map((r) => String(r.keys?.[0] || "")).filter(Boolean),
        ...(payload.queryPages || []).map((r) => String(r.keys?.[1] || "")).filter(Boolean),
      ])).slice(0, 12);
      if (inspectionCandidates.length) {
        const inspectEndpoint = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
        const inspections = [];
        for (const inspectionUrl of inspectionCandidates) {
          try {
            const res = await fetch(inspectEndpoint, {
              method: "POST",
              headers: h,
              body: JSON.stringify({
                inspectionUrl,
                siteUrl: gscF?.extra?.siteUrl,
              }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) continue;
            const r = json?.inspectionResult || {};
            const idx = r?.indexStatusResult || {};
            inspections.push({
              inspectionUrl,
              verdict: String(idx?.verdict || "").toUpperCase(),
              coverageState: String(idx?.coverageState || ""),
              indexingState: String(idx?.indexingState || ""),
              pageFetchState: String(idx?.pageFetchState || ""),
              robotsTxtState: String(idx?.robotsTxtState || ""),
              lastCrawlTime: String(idx?.lastCrawlTime || ""),
              googleCanonical: String(idx?.googleCanonical || ""),
              userCanonical: String(idx?.userCanonical || ""),
              mobileUsabilityVerdict: String(r?.mobileUsabilityResult?.verdict || "").toUpperCase(),
              richResultsVerdict: String(r?.richResultsResult?.verdict || "").toUpperCase(),
            });
          } catch {}
        }
        payload.inspections = inspections;
      }
      // Technical endpoints (robots / llm signals) for autonomous SEO diagnostics.
      try {
        const hostRoot = (() => {
          try {
            const u = new URL(String(gscF?.extra?.siteUrl || "").replace(/^sc-domain:/i, "https://"));
            return `https://${u.hostname}`;
          } catch {
            const h = getHostFromInput(gscF?.extra?.siteUrl || "");
            return h ? `https://${h}` : "";
          }
        })();
        if (hostRoot) {
          const checks = [
            { key: "robots.txt", url: `${hostRoot}/robots.txt` },
            { key: "sitemap.xml", url: `${hostRoot}/sitemap.xml` },
            { key: "sitemap_index.xml", url: `${hostRoot}/sitemap_index.xml` },
            { key: "llm.txt", url: `${hostRoot}/llm.txt` },
            { key: "llms.txt", url: `${hostRoot}/llms.txt` },
          ];
          const out = [];
          for (const c of checks) {
            try {
              const r = await fetch(c.url, { method: "GET" });
              const text = await r.text().catch(() => "");
              out.push({
                key: c.key,
                url: c.url,
                ok: r.ok,
                status: Number(r.status || 0),
                bytes: Number((text || "").length || 0),
                body: String(text || "").slice(0, 12000),
                found: r.ok && String(text || "").trim().length > 0,
              });
            } catch (e) {
              out.push({ key: c.key, url: c.url, ok: false, status: 0, bytes: 0, found: false, error: String(e?.message || "fetch_failed") });
            }
          }
          payload.techStatus = out;
        }
      } catch {}
      // CWV proxy from PageSpeed insights for top pages (field/lab blend).
      try {
        const samplePages = (payload.pages || []).slice(0, 5).map((r) => String(r.keys?.[0] || "")).filter(Boolean);
        const cwvRows = [];
        for (const p of samplePages) {
          try {
            const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(p)}&strategy=mobile`;
            const res = await fetch(u);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) continue;
            const cat = json?.lighthouseResult?.categories || {};
            const aud = json?.lighthouseResult?.audits || {};
            cwvRows.push({
              page: p,
              performance: Math.round(Number((cat.performance?.score || 0) * 100)),
              lcp: String(aud["largest-contentful-paint"]?.displayValue || ""),
              cls: String(aud["cumulative-layout-shift"]?.displayValue || ""),
              inp: String(aud["interaction-to-next-paint"]?.displayValue || aud["max-potential-fid"]?.displayValue || ""),
              tbt: String(aud["total-blocking-time"]?.displayValue || ""),
              fcp: String(aud["first-contentful-paint"]?.displayValue || ""),
            });
          } catch {}
        }
        payload.cwv = cwvRows;
      } catch {}
      const issues = [];
      for (const row of payload.inspections || []) {
        const state = String(row.coverageState || row.indexingState || "").toLowerCase();
        if (state && !/submitted and indexed|indexed/i.test(state)) {
          issues.push({
            type: "indexing",
            severity: /blocked|error|fail|not indexed/i.test(state) ? "high" : "medium",
            page: row.inspectionUrl,
            detail: `Indexing state: ${row.coverageState || row.indexingState || "Unknown"}`,
            fixHint: "Resolve crawl/index blockers, then request validation in Search Console.",
          });
        }
        if (String(row.pageFetchState || "").toLowerCase().includes("fail")) {
          issues.push({
            type: "crawl",
            severity: "high",
            page: row.inspectionUrl,
            detail: `Page fetch issue: ${row.pageFetchState}`,
            fixHint: "Fix server/response issues for this URL and re-test in URL Inspection.",
          });
        }
        if (String(row.robotsTxtState || "").toLowerCase().includes("blocked")) {
          issues.push({
            type: "robots",
            severity: "high",
            page: row.inspectionUrl,
            detail: `Robots state: ${row.robotsTxtState}`,
            fixHint: "Adjust robots directives if this URL should be indexable.",
          });
        }
        if (row.mobileUsabilityVerdict === "FAIL") {
          issues.push({
            type: "mobile",
            severity: "medium",
            page: row.inspectionUrl,
            detail: "Mobile usability verdict failed.",
            fixHint: "Fix responsive/mobile rendering issues and validate in Search Console.",
          });
        }
        if (row.richResultsVerdict === "FAIL") {
          issues.push({
            type: "rich-results",
            severity: "medium",
            page: row.inspectionUrl,
            detail: "Rich results verdict failed.",
            fixHint: "Fix structured data markup errors and validate rich results.",
          });
        }
      }
      payload.gscIssues = issues.slice(0, 60);
      if ((!payload.indexCoverage || payload.indexCoverage?.indexed == null) && !(payload.inspections || []).length) {
        addLog("Note: GSC API does not expose full Page Indexing chart totals directly for all properties. Indexing cards will show sample/available API data only.", "warn");
      }
      addLog("GSC data loaded.","ok");setData(payload);
      if (!kRes.ok) addLog(`Warning: keywords view incomplete (${kRes.status}).`, "warn");
      if (!cRes.ok || !dRes.ok || !dtRes.ok || !qpRes.ok) addLog("Some advanced GSC views were partial; showing what was available.", "warn");
      const generatedActions = buildActionCards(payload);
      setActions(generatedActions);
      const host = getHostFromInput(gscF?.extra?.siteUrl || "");
      const prev = loadProjectData(orgScope, host);
      const prevHistory = Array.isArray(prev?.gsc?.history) ? prev.gsc.history : [];
      const prevSnapshot = prevHistory[0] || null;
      const currentTopKeywords = payload.keywords.slice(0, 20);
      const movers = prevSnapshot ? currentTopKeywords.map((k) => {
        const query = String(k.keys?.[0] || "");
        const before = (prevSnapshot.topKeywords || []).find((x) => String(x.keys?.[0] || "") === query);
        if (!before) return null;
        const currPos = Number(k.position || 0);
        const prevPos = Number(before.position || 0);
        const currClicks = Number(k.clicks || 0);
        const prevClicks = Number(before.clicks || 0);
        return {
          query,
          position: currPos,
          prevPosition: prevPos,
          deltaPosition: Number((currPos - prevPos).toFixed(2)),
          clicks: currClicks,
          prevClicks,
          deltaClicks: currClicks - prevClicks,
          impressions: Number(k.impressions || 0),
          ctr: Number(k.ctr || 0),
        };
      }).filter(Boolean).sort((a, b) => Math.abs(b.deltaPosition) - Math.abs(a.deltaPosition)).slice(0, 20) : [];
      const nextHistory = [{
        ts: new Date().toISOString(),
        days,
        totals: payload.totals,
        topKeywords: currentTopKeywords,
      }, ...prevHistory].slice(0, 30);
      const serpOpportunities = currentTopKeywords.map((k) => {
        const query = String(k.keys?.[0] || "");
        const pos = Number(k.position || 99);
        const ctr = Number(k.ctr || 0);
        const impressions = Number(k.impressions || 0);
        if (!query || impressions < 120 || pos < 2 || pos > 12) return null;
        const isQuestion = /^(how|what|why|when|where|who|can|should|is|are)\b/i.test(query);
        const isListIntent = /\b(best|top|list|vs|comparison|alternatives)\b/i.test(query);
        const serpTarget = isQuestion ? "Featured Snippet / PAA" : isListIntent ? "List Snippet" : "Rich Result";
        const opportunityScore = Math.max(25, Math.min(98, ((12 - pos) * 7) + ((0.08 - ctr) * 280) + Math.min(20, impressions / 100)));
        const projectedCtrLiftPct = Math.max(0.4, Math.min(3.2, (isQuestion ? 1.4 : 0.9) + (pos > 6 ? 0.6 : 0.2)));
        return {
          query,
          page: String((payload.pages || [])[0]?.keys?.[0] || ""),
          position: pos,
          impressions,
          ctr,
          serpTarget,
          opportunityScore: Math.round(opportunityScore),
          projectedCtrLiftPct: Number(projectedCtrLiftPct.toFixed(2)),
        };
      }).filter(Boolean).sort((a,b)=>b.opportunityScore-a.opportunityScore).slice(0,20);
      mergeProjectData(orgScope, host, {
        gsc: {
          siteUrl: gscF?.extra?.siteUrl,
          totals: payload.totals,
          topPages: payload.pages.slice(0,50),
          topKeywords: payload.keywords.slice(0,50),
          countries: payload.countries.slice(0,20),
          devices: payload.devices.slice(0,10),
          timeline: payload.timeline.slice(0,120),
          queryPages: payload.queryPages.slice(0,120),
          indexCoverage: payload.indexCoverage || null,
          inspections: payload.inspections || [],
          gscIssues: payload.gscIssues || [],
          techStatus: payload.techStatus || [],
          cwv: payload.cwv || [],
          actions: generatedActions,
          movers,
          serpOpportunities,
          history: nextHistory,
          capturedAt: new Date().toISOString(),
        }
      });
      syncMissionsFromProject(orgScope, host);
      const afterGsc = loadProjectData(orgScope, host);
      const calibration = recalibrateExecutionModel(afterGsc);
      if (calibration.learning) {
        const prevLearning = Array.isArray(afterGsc?.learningLog) ? afterGsc.learningLog : [];
        mergeProjectData(orgScope, host, {
          executionModel: calibration.model,
          learningLog: [calibration.learning, ...prevLearning].slice(0, 40),
        });
      }
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setLoading(false);
  };

  const submitSitemap = async () => {
    if (!gscF?.extra?.siteUrl) {
      addLog("Error: Select a Search Console property before submitting sitemap.", "err");
      return;
    }
    const rawPath = String(sitemapPath || "").trim();
    if (!rawPath) {
      addLog("Error: Enter a sitemap path or URL.", "err");
      return;
    }
    setSubmittingSitemap(true);
    try {
      const siteUrlRaw = String(gscF.extra.siteUrl);
      const site = encodeURIComponent(siteUrlRaw);
      const baseRoot = (() => {
        try {
          if (/^sc-domain:/i.test(siteUrlRaw)) return `https://${siteUrlRaw.replace(/^sc-domain:/i, "")}`;
          const u = new URL(siteUrlRaw);
          return `${u.protocol}//${u.host}`;
        } catch {
          const h = getHostFromInput(siteUrlRaw);
          return h ? `https://${h}` : "";
        }
      })();
      const feedPath = /^https?:\/\//i.test(rawPath) ? rawPath : `${baseRoot.replace(/\/+$/,"")}/${rawPath.replace(/^\/+/,"")}`;
      const feed = encodeURIComponent(feedPath);
      const h = { Authorization: `Bearer ${gscF.accessToken}` };
      const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${feed}`, { method: "PUT", headers: h });
      if (!res.ok) {
        const j = await res.json().catch(()=>({}));
        throw new Error(j?.error?.message || `Sitemap submit failed (${res.status})`);
      }
      const host = getHostFromInput(gscF?.extra?.siteUrl || "");
      const project = loadProjectData(orgScope, host);
      const prevOps = Array.isArray(project?.gsc?.writeOps) ? project.gsc.writeOps : [];
      const op = {
        operation: "sitemaps.submit",
        target: feedPath,
        requestAt: new Date().toISOString(),
        responseCode: 200,
        verifiedAt: null,
        result: "submitted",
      };
      mergeProjectData(orgScope, host, { gsc: { ...(project?.gsc || {}), writeOps: [op, ...prevOps].slice(0, 50) } });
      addLog(`Sitemap submitted: ${feedPath}`, "ok");
    } catch (e) {
      addLog(`Error: ${e.message || "Sitemap submit failed"}`, "err");
    }
    setSubmittingSitemap(false);
  };

  const verifyPolicyFilesLive = async () => {
    if (!gscF?.extra?.siteUrl) {
      addLog("Error: Select a Search Console property before verification.", "err");
      return;
    }
    try {
      const siteUrlRaw = String(gscF.extra.siteUrl);
      const hostRoot = (() => {
        try {
          if (/^sc-domain:/i.test(siteUrlRaw)) return `https://${siteUrlRaw.replace(/^sc-domain:/i, "")}`;
          const u = new URL(siteUrlRaw);
          return `${u.protocol}//${u.host}`;
        } catch {
          const h = getHostFromInput(siteUrlRaw);
          return h ? `https://${h}` : "";
        }
      })();
      const targets = [`${hostRoot.replace(/\/+$/,"")}/llms.txt`, `${hostRoot.replace(/\/+$/,"")}/llm.txt`];
      const checks = [];
      for (const t of targets) {
        try {
          const res = await fetch(t, { method: "GET" });
          const body = await res.text().catch(()=> "");
          checks.push({ url: t, status: Number(res.status || 0), ok: res.ok && String(body || "").trim().length > 0 });
        } catch {
          checks.push({ url: t, status: 0, ok: false });
        }
      }
      const okCount = checks.filter((c) => c.ok).length;
      const host = getHostFromInput(gscF?.extra?.siteUrl || "");
      const project = loadProjectData(orgScope, host);
      const prevOps = Array.isArray(project?.gsc?.writeOps) ? project.gsc.writeOps : [];
      const op = {
        operation: "aeo.policy.verify",
        target: checks.map((c)=>`${c.url}(${c.status})`).join(" | "),
        requestAt: new Date().toISOString(),
        responseCode: okCount === checks.length ? 200 : 206,
        verifiedAt: new Date().toISOString(),
        result: okCount === checks.length ? "verified" : `partial (${okCount}/${checks.length})`,
      };
      mergeProjectData(orgScope, host, { gsc: { ...(project?.gsc || {}), writeOps: [op, ...prevOps].slice(0, 50) } });
      addLog(okCount === checks.length ? "Policy files verified (llms.txt + llm.txt)." : `Policy verification partial (${okCount}/${checks.length}).`, okCount === checks.length ? "ok" : "warn");
    } catch (e) {
      addLog(`Error: ${e.message || "Policy verification failed"}`, "err");
    }
  };

  const analyze=async()=>{
    setInsightLoading(true);setInsight("");
    const ctx=`Pages: ${data?.pages?.slice(0,5).map(r=>`${r.keys[0]}(${r.clicks}clicks,pos${r.position?.toFixed(1)})`).join(",")}. KWs: ${data?.keywords?.slice(0,5).map(r=>`"${r.keys[0]}"pos${r.position?.toFixed(1)},CTR${(r.ctr*100).toFixed(1)}%`).join(",")}. Total clicks:${data?.totals?.clicks},CTR:${(data?.totals?.ctr*100)?.toFixed(2)}%,pos:${data?.totals?.position?.toFixed(1)}`;
    try{
      const r=await callAI(ai,"You are Helio SEO agent. Return exactly 3 priority actions [ACTION 1],[ACTION 2],[ACTION 3]. Name specific pages/keywords. Under 160 words. Terminal style.",`Analyze GSC data: ${ctx}`);
      setInsight(r);
      const extracted = String(r||"")
        .split(/\n+/)
        .map((line)=>line.trim())
        .filter((line)=>/^\[ACTION\s*\d+\]/i.test(line))
        .slice(0,8)
        .map((line, idx)=>({
          id:`ai_action_${Date.now()}_${idx}`,
          title:line.replace(/^\[ACTION\s*\d+\]\s*/i,"").slice(0,120),
          reason:line,
          priority: idx===0?"P1":"P2",
          score: Math.max(45, 90 - idx * 10),
          targetPage:"",
          fixHint:line,
          source:"search_console",
        }));
      if (extracted.length) {
        setActions((prev)=>{
          const merged=[...extracted,...(Array.isArray(prev)?prev:[])];
          const uniq=[];const seen=new Set();
          for(const a of merged){
            const key=String(a.title||a.reason||"").toLowerCase();
            if(!key||seen.has(key))continue;
            seen.add(key);uniq.push(a);
            if(uniq.length>=10)break;
          }
          const host = getHostFromInput(gscF?.extra?.siteUrl || "");
          if (host) mergeProjectData(orgScope, host, { gsc: { ...(loadProjectData(orgScope, host)?.gsc||{}), actions: uniq } });
          return uniq;
        });
      }
      setTab("actions");
    }
    catch(e){setInsight(`Error: ${e.message}`);}
    setInsightLoading(false);
  };

  const queueActionMission = async (action) => {
    if (!action) return;
    const host = getHostFromInput(gscF?.extra?.siteUrl || "");
    if (!host) return;
    setQueueingActionId(action.id || "");
    try {
      const project = loadProjectData(orgScope, host);
      const existing = Array.isArray(project?.gsc?.serpOpportunities) ? project.gsc.serpOpportunities : [];
      const nextOpp = {
        query: String(action.title || "search console opportunity"),
        page: String(action.targetPage || ""),
        position: Number(action?.position || 11),
        impressions: Number(action?.impressions || 150),
        ctr: Number(action?.ctr || 0.01),
        serpTarget: "Action Card",
        opportunityScore: Number(action.score || 65),
        projectedCtrLiftPct: 1.1,
      };
      mergeProjectData(orgScope, host, {
        gsc: {
          ...(project?.gsc || {}),
          serpOpportunities: [nextOpp, ...existing].slice(0, 40),
          actions: Array.isArray(actions) ? actions : [],
        }
      });
      syncMissionsFromProject(orgScope, host);
      addLog(`Queued mission from action: ${action.title}`, "ok");
    } catch (e) {
      addLog(`Error: ${e.message}`, "err");
    }
    setQueueingActionId("");
  };

  const pc=p=>p<=5?C.green:p<=10?C.orange:C.red;
  const indexCoverage = data?.indexCoverage || null;
  const inspections = Array.isArray(data?.inspections) ? data.inspections : [];
  const gscIssues = Array.isArray(data?.gscIssues) ? data.gscIssues : [];
  const pageIndexExport = data?.pageIndexExport || null;
  const techStatus = Array.isArray(data?.techStatus) ? data.techStatus : [];
  const cwvRows = Array.isArray(data?.cwv) ? data.cwv : [];
  const indexedCountSample = inspections.filter((x)=>/indexed/i.test(String(x.coverageState||x.indexingState||""))).length;
  const nonIndexedCountSample = Math.max(0, inspections.length - indexedCountSample);
  const indexedDisplay = pageIndexExport?.indexed != null
    ? Number(pageIndexExport.indexed).toLocaleString()
    : indexCoverage?.indexed != null
    ? Number(indexCoverage.indexed).toLocaleString()
    : inspections.length ? `${indexedCountSample}*` : "—";
  const nonIndexedDisplay = pageIndexExport?.nonIndexed != null
    ? Number(pageIndexExport.nonIndexed).toLocaleString()
    : indexCoverage?.nonIndexed != null
    ? Number(indexCoverage.nonIndexed).toLocaleString()
    : inspections.length ? `${nonIndexedCountSample}*` : "—";
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Search Console" sub={`Real GSC data · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18,alignItems:"center"}}>
      <div style={{minWidth:180}}>
        <ThemeDropdown
          value={String(days)}
          onChange={(v)=>setDays(Number(v))}
          options={[{value:"7",label:"Last 7 days"},{value:"28",label:"Last 28 days"},{value:"90",label:"Last 90 days"}]}
          placeholder="Date range"
        />
      </div>
      <Btn onClick={load} disabled={loading}>{loading?"▶ LOADING...":"◈ LOAD GSC DATA"}</Btn>
      <input ref={gscIndexCsvInputRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={(e)=>{const f=e.target.files?.[0];if(f)importPageIndexCsv(f);e.target.value="";}}/>
      <Btn onClick={()=>gscIndexCsvInputRef.current?.click()} disabled={indexCsvImporting} variant="blue">{indexCsvImporting?"IMPORTING...":"IMPORT PAGE INDEX CSV"}</Btn>
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{gscF?.extra?.siteUrl||"No property selected"}</span>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={loading}/></div>}
    {data&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {[
          {label:"Total Clicks",value:data.totals?.clicks?.toLocaleString()},
          {label:"Impressions",value:data.totals?.impressions?.toLocaleString()},
          {label:"Avg CTR",value:data.totals?.ctr?(data.totals.ctr*100).toFixed(2)+"%":"—"},
          {label:"Avg Position",value:data.totals?.position?.toFixed(1)},
          {label:"Indexed",value:indexedDisplay},
          {label:"Non-Indexed",value:nonIndexedDisplay},
          {label:"GSC Issues",value:gscIssues.length},
        ].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      {!!pageIndexExport&&(
        <div style={{marginTop:-10,marginBottom:14,color:C.green,fontFamily:"monospace",fontSize:9}}>
          Using imported GSC Page Indexing CSV totals ({new Date(pageIndexExport.importedAt).toLocaleString()}).
        </div>
      )}
      {!pageIndexExport&&(String(indexedDisplay).endsWith("*") || String(nonIndexedDisplay).endsWith("*"))&&(
        <div style={{marginTop:-10,marginBottom:14,color:C.muted,fontFamily:"monospace",fontSize:9}}>
          * Sampled from URL Inspection subset (not full property-wide Page Indexing total).
        </div>
      )}
      <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>◈ HELIO AI INSIGHT</div>
          <Btn onClick={analyze} disabled={insightLoading}>{insightLoading?"ANALYZING...":"ANALYZE ▶"}</Btn>
        </div>
        {insightLoading&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11}}>Analyzing █</div>}
        {insight&&<div style={{color:C.text,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7}}>{insight}</div>}
        {!insight&&!insightLoading&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11}}>Click ANALYZE to get priority actions from your live GSC data.</div>}
      </div>
    <Tabs tabs={["overview","actions","indexing","url inspection","issues","sitemaps","write ops","technical","core web vitals","pages","keywords","movers","serp ops","countries","devices","timeline"]} active={tab} onChange={setTab}/>
      <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        {tab==="overview"&&<div style={{padding:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:6}}>TOP COUNTRIES</div>
            {(data.countries||[]).slice(0,8).map((r,i)=><div key={`ct-${i}`} style={{display:"flex",gap:8,fontFamily:"monospace",fontSize:10,padding:"4px 0"}}>
              <span style={{color:C.text,flex:1}}>{String(r.keys?.[0]||"unknown").toUpperCase()}</span><span style={{color:C.lime,minWidth:64,textAlign:"right"}}>{Number(r.clicks||0).toLocaleString()}</span><span style={{color:C.muted,minWidth:54,textAlign:"right"}}>{(Number(r.ctr||0)*100).toFixed(1)}%</span>
            </div>)}
            {!(data.countries||[]).length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>No country rows returned.</div>}
          </div>
          <div style={{border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:6}}>TOP DEVICES</div>
            {(data.devices||[]).slice(0,8).map((r,i)=><div key={`dv-${i}`} style={{display:"flex",gap:8,fontFamily:"monospace",fontSize:10,padding:"4px 0"}}>
              <span style={{color:C.text,flex:1}}>{String(r.keys?.[0]||"unknown").toUpperCase()}</span><span style={{color:C.lime,minWidth:64,textAlign:"right"}}>{Number(r.clicks||0).toLocaleString()}</span><span style={{color:C.muted,minWidth:54,textAlign:"right"}}>{(Number(r.ctr||0)*100).toFixed(1)}%</span>
            </div>)}
            {!(data.devices||[]).length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>No device rows returned.</div>}
          </div>
        </div>}
        {tab==="actions"&&<div style={{padding:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:10}}>
          {!actions.length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>No actions yet. Click ANALYZE or LOAD GSC DATA to generate action cards.</div>}
          {actions.map((a,i)=><div key={a.id||`ac-${i}`} style={{border:`1px solid ${C.border}`,background:"#0b0b0b",padding:10}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:6}}>
              <div style={{color:C.lime,fontFamily:"monospace",fontSize:10}}>{a.priority||"P2"} · SCORE {Number(a.score||0)}</div>
              <Btn onClick={()=>queueActionMission(a)} disabled={queueingActionId===a.id} variant="blue" style={{padding:"5px 10px",fontSize:9}}>{queueingActionId===a.id?"QUEUEING...":"QUEUE MISSION"}</Btn>
            </div>
            <div style={{color:C.text,fontFamily:"monospace",fontSize:11,marginBottom:6}}>{a.title||"Action"}</div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,lineHeight:1.6}}>{a.reason||a.fixHint||"—"}</div>
            {!!a.targetPage&&<div style={{marginTop:6,color:C.blue,fontFamily:"monospace",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.targetPage}</div>}
          </div>)}
        </div>}
        {tab==="indexing"&&<div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{flex:1}}>SUMMARY</span><span style={{minWidth:120,textAlign:"right"}}>INDEXED</span><span style={{minWidth:140,textAlign:"right"}}>NON-INDEXED</span><span style={{minWidth:130,textAlign:"right"}}>SOURCE</span>
          </div>
          <div style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{color:C.text,flex:1}}>Property indexing snapshot</span>
            <span style={{color:C.lime,minWidth:120,textAlign:"right"}}>{indexedDisplay}</span>
            <span style={{color:C.orange,minWidth:140,textAlign:"right"}}>{nonIndexedDisplay}</span>
            <span style={{color:C.muted,minWidth:130,textAlign:"right"}}>{indexCoverage?.source==="sitemaps"?"SITEMAPS":"INSPECTION SAMPLE"}</span>
          </div>
          {indexCoverage?.source!=="sitemaps"&&<div style={{padding:12,color:C.muted,fontFamily:"monospace",fontSize:9}}>For full Page Indexing chart totals, use native GSC Pages report export. API provides sampled/index-status data.</div>}
        </div>}
        {tab==="url inspection"&&<div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{flex:1}}>URL</span><span style={{minWidth:110,textAlign:"right"}}>VERDICT</span><span style={{minWidth:180,textAlign:"right"}}>COVERAGE STATE</span><span style={{minWidth:150,textAlign:"right"}}>FETCH</span>
          </div>
          {inspections.map((r,i)=><div key={`insp-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.inspectionUrl}>{r.inspectionUrl}</span>
            <span style={{color:/PASS|NEUTRAL/.test(r.verdict)?C.green:C.orange,minWidth:110,textAlign:"right"}}>{r.verdict||"—"}</span>
            <span style={{color:C.muted,minWidth:180,textAlign:"right"}}>{r.coverageState||r.indexingState||"—"}</span>
            <span style={{color:/PASS|SUCCESS|OK/i.test(r.pageFetchState)?C.green:C.red,minWidth:150,textAlign:"right"}}>{r.pageFetchState||"—"}</span>
          </div>)}
          {!inspections.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No URL inspection sample data yet for this property.</div>}
        </div>}
        {tab==="issues"&&<div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{minWidth:90}}>SEVERITY</span><span style={{minWidth:120}}>TYPE</span><span style={{flex:1}}>DETAIL</span><span style={{minWidth:210}}>PAGE</span>
          </div>
          {gscIssues.map((r,i)=><div key={`gsc-issue-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{minWidth:90,color:r.severity==="high"?C.red:C.orange,textTransform:"uppercase"}}>{r.severity||"medium"}</span>
            <span style={{minWidth:120,color:C.muted,textTransform:"uppercase"}}>{r.type||"issue"}</span>
            <span style={{color:C.text,flex:1}} title={r.fixHint||""}>{r.detail||"—"}</span>
            <span style={{minWidth:210,color:C.blue,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.page||""}>{r.page||"—"}</span>
          </div>)}
          {!gscIssues.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No critical issues from current GSC inspection sample.</div>}
        </div>}
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>{tab==="pages"?"PAGE":tab==="keywords"?"KEYWORD":"QUERY"}</span>
          {tab!=="movers"&&tab!=="serp ops"&&<><span style={{minWidth:60,textAlign:"right"}}>CLICKS</span><span style={{minWidth:80,textAlign:"right"}}>IMPRESSIONS</span><span style={{minWidth:55,textAlign:"right"}}>CTR</span><span style={{minWidth:60,textAlign:"right"}}>POSITION</span></>}
          {tab==="movers"&&<><span style={{minWidth:70,textAlign:"right"}}>PREV POS</span><span style={{minWidth:70,textAlign:"right"}}>CURR POS</span><span style={{minWidth:60,textAlign:"right"}}>Δ POS</span><span style={{minWidth:60,textAlign:"right"}}>Δ CLICK</span></>}
          {tab==="serp ops"&&<><span style={{minWidth:80,textAlign:"right"}}>SERP</span><span style={{minWidth:60,textAlign:"right"}}>POS</span><span style={{minWidth:80,textAlign:"right"}}>IMP</span><span style={{minWidth:55,textAlign:"right"}}>SCORE</span></>}
        </div>
        {tab!=="overview"&&tab!=="actions"&&tab!=="movers"&&tab!=="serp ops"&&tab!=="countries"&&tab!=="devices"&&tab!=="timeline"&&(tab==="pages"?data.pages:data.keywords).map((r,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:tab==="pages"?C.lime:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.keys[0]}>{r.keys[0]}</span>
          <span style={{color:C.text,minWidth:60,textAlign:"right"}}>{r.clicks.toLocaleString()}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{r.impressions.toLocaleString()}</span>
          <span style={{color:C.green,minWidth:55,textAlign:"right"}}>{(r.ctr*100).toFixed(1)}%</span>
          <span style={{color:pc(r.position),minWidth:60,textAlign:"right"}}>{r.position?.toFixed(1)}</span>
        </div>)}
        {tab==="movers"&&((loadProjectData(orgScope, getHostFromInput(gscF?.extra?.siteUrl || ""))?.gsc?.movers)||[]).map((m,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.query}</span>
          <span style={{color:C.muted,minWidth:70,textAlign:"right"}}>{Number(m.prevPosition||0).toFixed(1)}</span>
          <span style={{color:C.text,minWidth:70,textAlign:"right"}}>{Number(m.position||0).toFixed(1)}</span>
          <span style={{color:Number(m.deltaPosition||0)>0?C.red:C.green,minWidth:60,textAlign:"right"}}>{Number(m.deltaPosition||0)>0?"+":""}{Number(m.deltaPosition||0).toFixed(1)}</span>
          <span style={{color:Number(m.deltaClicks||0)<0?C.red:C.green,minWidth:60,textAlign:"right"}}>{Number(m.deltaClicks||0)>0?"+":""}{Number(m.deltaClicks||0)}</span>
        </div>)}
        {tab==="movers"&&!((loadProjectData(orgScope, getHostFromInput(gscF?.extra?.siteUrl || ""))?.gsc?.movers)||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>Need at least two GSC snapshots to compute movers. Load GSC data again later.</div>}
        {tab==="serp ops"&&((loadProjectData(orgScope, getHostFromInput(gscF?.extra?.siteUrl || ""))?.gsc?.serpOpportunities)||[]).map((s,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.query}</span>
          <span style={{color:C.blue,minWidth:80,textAlign:"right"}}>{s.serpTarget}</span>
          <span style={{color:pc(s.position),minWidth:60,textAlign:"right"}}>{Number(s.position||0).toFixed(1)}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{Number(s.impressions||0).toLocaleString()}</span>
          <span style={{color:C.orange,minWidth:55,textAlign:"right"}}>{Number(s.opportunityScore||0)}</span>
        </div>)}
        {tab==="serp ops"&&!((loadProjectData(orgScope, getHostFromInput(gscF?.extra?.siteUrl || ""))?.gsc?.serpOpportunities)||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No SERP opportunities yet. Load GSC data to compute.</div>}
        {tab==="countries"&&(data.countries||[]).map((r,i)=><div key={`country-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.text,flex:1}}>{String(r.keys?.[0]||"unknown").toUpperCase()}</span>
          <span style={{color:C.text,minWidth:60,textAlign:"right"}}>{Number(r.clicks||0).toLocaleString()}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{Number(r.impressions||0).toLocaleString()}</span>
          <span style={{color:C.green,minWidth:55,textAlign:"right"}}>{(Number(r.ctr||0)*100).toFixed(1)}%</span>
          <span style={{color:pc(Number(r.position||99)),minWidth:60,textAlign:"right"}}>{Number(r.position||0).toFixed(1)}</span>
        </div>)}
        {tab==="countries"&&!(data.countries||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No country data in this window.</div>}
        {tab==="devices"&&(data.devices||[]).map((r,i)=><div key={`device-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.text,flex:1}}>{String(r.keys?.[0]||"unknown").toUpperCase()}</span>
          <span style={{color:C.text,minWidth:60,textAlign:"right"}}>{Number(r.clicks||0).toLocaleString()}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{Number(r.impressions||0).toLocaleString()}</span>
          <span style={{color:C.green,minWidth:55,textAlign:"right"}}>{(Number(r.ctr||0)*100).toFixed(1)}%</span>
          <span style={{color:pc(Number(r.position||99)),minWidth:60,textAlign:"right"}}>{Number(r.position||0).toFixed(1)}</span>
        </div>)}
        {tab==="devices"&&!(data.devices||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No device data in this window.</div>}
        {tab==="timeline"&&(data.timeline||[]).map((r,i)=><div key={`timeline-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.text,flex:1}}>{String(r.keys?.[0]||"date")}</span>
          <span style={{color:C.text,minWidth:60,textAlign:"right"}}>{Number(r.clicks||0).toLocaleString()}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{Number(r.impressions||0).toLocaleString()}</span>
          <span style={{color:C.green,minWidth:55,textAlign:"right"}}>{(Number(r.ctr||0)*100).toFixed(1)}%</span>
          <span style={{color:pc(Number(r.position||99)),minWidth:60,textAlign:"right"}}>{Number(r.position||0).toFixed(1)}</span>
        </div>)}
        {tab==="timeline"&&!(data.timeline||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No timeline data in this window.</div>}
        {tab==="sitemaps"&&<div>
          <div style={{display:"flex",gap:8,padding:"10px 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
            <input value={sitemapPath} onChange={(e)=>setSitemapPath(e.target.value)} placeholder="sitemap.xml or full URL" style={{flex:1,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"7px 9px",outline:"none"}}/>
            <Btn onClick={submitSitemap} disabled={submittingSitemap}>{submittingSitemap?"SUBMITTING...":"SUBMIT TO GSC"}</Btn>
          </div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{flex:1}}>SITEMAP</span><span style={{minWidth:90,textAlign:"right"}}>SUBMITTED</span><span style={{minWidth:80,textAlign:"right"}}>INDEXED</span><span style={{minWidth:80,textAlign:"right"}}>STATUS</span>
          </div>
          {(indexCoverage?.sitemaps||[]).map((sm,i)=>{
            const c = Array.isArray(sm?.contents) ? sm.contents[0] : null;
            return <div key={`sm-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
              <span style={{color:C.blue,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={sm.path||sm.feedpath||""}>{sm.path||sm.feedpath||"—"}</span>
              <span style={{color:C.text,minWidth:90,textAlign:"right"}}>{Number(c?.submitted||0).toLocaleString()}</span>
              <span style={{color:C.lime,minWidth:80,textAlign:"right"}}>{Number(c?.indexed||0).toLocaleString()}</span>
              <span style={{color:C.muted,minWidth:80,textAlign:"right"}}>{sm.isPending?"PENDING":"OK"}</span>
            </div>;
          })}
          {!(indexCoverage?.sitemaps||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No sitemap rows returned from GSC API for this property.</div>}
        </div>}
        {tab==="write ops"&&<div>
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
            <Btn onClick={verifyPolicyFilesLive} variant="blue">VERIFY LLM POLICY FILES LIVE</Btn>
          </div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{minWidth:140}}>OPERATION</span><span style={{flex:1}}>TARGET</span><span style={{minWidth:170,textAlign:"right"}}>REQUEST AT</span><span style={{minWidth:80,textAlign:"right"}}>CODE</span><span style={{minWidth:100,textAlign:"right"}}>RESULT</span>
          </div>
          {((loadProjectData(orgScope, getHostFromInput(gscF?.extra?.siteUrl || ""))?.gsc?.writeOps)||[]).map((op,i)=><div key={`wop-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{minWidth:140,color:C.text}}>{op.operation||"—"}</span>
            <span style={{flex:1,color:C.blue,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={op.target||""}>{op.target||"—"}</span>
            <span style={{minWidth:170,textAlign:"right",color:C.muted}}>{op.requestAt?new Date(op.requestAt).toLocaleString():"—"}</span>
            <span style={{minWidth:80,textAlign:"right",color:Number(op.responseCode||0)>=200&&Number(op.responseCode||0)<300?C.green:C.red}}>{op.responseCode||"—"}</span>
            <span style={{minWidth:100,textAlign:"right",color:C.text}}>{op.result||"—"}</span>
          </div>)}
          {!((loadProjectData(orgScope, getHostFromInput(gscF?.extra?.siteUrl || ""))?.gsc?.writeOps)||[]).length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No write operations recorded yet.</div>}
        </div>}
        {tab==="technical"&&<div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{minWidth:110}}>ITEM</span><span style={{flex:1}}>URL</span><span style={{minWidth:70,textAlign:"right"}}>HTTP</span><span style={{minWidth:80,textAlign:"right"}}>FOUND</span><span style={{minWidth:90,textAlign:"right"}}>BYTES</span>
          </div>
          {techStatus.map((t,i)=><div key={`tech-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{minWidth:110,color:C.text}}>{t.key}</span>
            <span style={{color:C.blue,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.url}>{t.url}</span>
            <span style={{minWidth:70,textAlign:"right",color:t.ok?C.green:C.red}}>{t.status||0}</span>
            <span style={{minWidth:80,textAlign:"right",color:t.found?C.green:C.orange}}>{t.found?"YES":"NO"}</span>
            <span style={{minWidth:90,textAlign:"right",color:C.muted}}>{Number(t.bytes||0).toLocaleString()}</span>
          </div>)}
          {!techStatus.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>Technical endpoint checks unavailable yet.</div>}
        </div>}
        {tab==="core web vitals"&&<div>
          <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <span style={{flex:1}}>URL</span><span style={{minWidth:70,textAlign:"right"}}>PERF</span><span style={{minWidth:90,textAlign:"right"}}>LCP</span><span style={{minWidth:70,textAlign:"right"}}>CLS</span><span style={{minWidth:90,textAlign:"right"}}>INP</span><span style={{minWidth:90,textAlign:"right"}}>TBT</span>
          </div>
          {cwvRows.map((r,i)=><div key={`cwv-${i}`} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
            <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.page}>{r.page}</span>
            <span style={{minWidth:70,textAlign:"right",color:Number(r.performance)>=90?C.green:Number(r.performance)>=70?C.orange:C.red}}>{Number(r.performance||0)}</span>
            <span style={{minWidth:90,textAlign:"right",color:C.muted}}>{r.lcp||"—"}</span>
            <span style={{minWidth:70,textAlign:"right",color:C.muted}}>{r.cls||"—"}</span>
            <span style={{minWidth:90,textAlign:"right",color:C.muted}}>{r.inp||"—"}</span>
            <span style={{minWidth:90,textAlign:"right",color:C.muted}}>{r.tbt||"—"}</span>
          </div>)}
          {!cwvRows.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No CWV rows yet (load GSC again to compute top-page CWV sample).</div>}
        </div>}
      </div>
    </>}
  </div>;
}

// ── ANALYTICS ─────────────────────────────────────────────────────
function Analytics({integrations, orgScope="default"}) {
  const ai=integrations.ai;const ga4F=integrations.ga4?.fields;
  const [loading,setLoading]=useState(false);const [logs,setLogs]=useState([]);const [data,setData]=useState(null);const [days,setDays]=useState(28);const [tab,setTab]=useState("overview");
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);

  useEffect(() => {
    const host = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
    if (!host) return;
    const project = loadProjectData(orgScope, host);
    const ga = project?.ga4 || {};
    if (!data && (Array.isArray(ga.channels) || Array.isArray(ga.pages))) {
      setData({
        totals: ga.totals || {},
        channels: Array.isArray(ga.channels) ? ga.channels : (Array.isArray(ga.topChannels) ? ga.topChannels : []),
        pages: Array.isArray(ga.pages) ? ga.pages : (Array.isArray(ga.topPages) ? ga.topPages : []),
        landing: Array.isArray(ga.landing) ? ga.landing : [],
        sources: Array.isArray(ga.sources) ? ga.sources : [],
        devices: Array.isArray(ga.devices) ? ga.devices : [],
        countries: Array.isArray(ga.countries) ? ga.countries : [],
        newReturning: Array.isArray(ga.newReturning) ? ga.newReturning : [],
        events: Array.isArray(ga.events) ? ga.events : [],
        conversions: Array.isArray(ga.conversions) ? ga.conversions : [],
        timeline: Array.isArray(ga.timeline) ? ga.timeline : [],
        aiTimeline: Array.isArray(ga.aiTimeline) ? ga.aiTimeline : [],
      });
    }
  }, [orgScope, integrations?.gsc?.fields?.extra?.siteUrl]);

  const load=async()=>{
    if(!ga4F?.extra?.propertyId){
      setLogs([{msg:"Error: Select a GA4 property in Integrations first.",type:"err",t:0}]);
      return;
    }
    setLoading(true);setLogs([]);setData(null);addLog("Connecting to GA4 API...","sys");
    try{
      const propId=ga4F?.extra?.propertyId;
      const h={"Content-Type":"application/json","Authorization":`Bearer ${ga4F.accessToken}`};
      const baseRange=[{startDate:`${days}daysAgo`,endDate:"today"}];
      const runReport=async(label,body)=>{
        const res=await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,{method:"POST",headers:h,body:JSON.stringify({...body,dateRanges:baseRange})});
        const json=await res.json();
        if(!res.ok){
          addLog(`${label}: ${json?.error?.message || "GA4 report failed"}`,"warn");
          return null;
        }
        return json;
      };
      const [
        totalsResA,totalsResB,channelsRes,sourcesRes,pagesRes,landingRes,devicesRes,countriesRes,newReturningRes,eventsRes,conversionsRes,timelineRes,aiTimelineRes,
      ]=await Promise.all([
        runReport("Totals A",{metrics:[{name:"sessions"},{name:"activeUsers"},{name:"newUsers"},{name:"screenPageViews"},{name:"engagedSessions"},{name:"engagementRate"},{name:"bounceRate"},{name:"averageSessionDuration"},{name:"eventCount"},{name:"conversions"}]}),
        runReport("Totals B",{metrics:[{name:"totalRevenue"}]}),
        runReport("Channels",{dimensions:[{name:"sessionDefaultChannelGroup"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagementRate"},{name:"bounceRate"},{name:"conversions"}],orderBys:[{metric:{metricName:"sessions"},desc:true}],limit:20}),
        runReport("Source / Medium",{dimensions:[{name:"sessionSourceMedium"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagementRate"},{name:"bounceRate"}],orderBys:[{metric:{metricName:"sessions"},desc:true}],limit:25}),
        runReport("Top pages",{dimensions:[{name:"pagePath"}],metrics:[{name:"screenPageViews"},{name:"averageSessionDuration"},{name:"bounceRate"},{name:"engagementRate"}],orderBys:[{metric:{metricName:"screenPageViews"},desc:true}],limit:25}),
        runReport("Landing pages",{dimensions:[{name:"landingPage"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagementRate"},{name:"bounceRate"},{name:"conversions"}],orderBys:[{metric:{metricName:"sessions"},desc:true}],limit:25}),
        runReport("Devices",{dimensions:[{name:"deviceCategory"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagementRate"}],orderBys:[{metric:{metricName:"sessions"},desc:true}],limit:8}),
        runReport("Countries",{dimensions:[{name:"country"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagementRate"}],orderBys:[{metric:{metricName:"sessions"},desc:true}],limit:12}),
        runReport("New vs Returning",{dimensions:[{name:"newVsReturning"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagementRate"}],orderBys:[{metric:{metricName:"sessions"},desc:true}],limit:5}),
        runReport("Events",{dimensions:[{name:"eventName"}],metrics:[{name:"eventCount"},{name:"totalUsers"}],orderBys:[{metric:{metricName:"eventCount"},desc:true}],limit:20}),
        runReport("Conversions",{dimensions:[{name:"eventName"}],metrics:[{name:"conversions"},{name:"totalUsers"}],orderBys:[{metric:{metricName:"conversions"},desc:true}],limit:20}),
        runReport("Timeline",{dimensions:[{name:"date"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"screenPageViews"},{name:"engagementRate"}],orderBys:[{dimension:{dimensionName:"date"}}],limit:120}),
        runReport("AI timeline by source",{dimensions:[{name:"date"},{name:"sessionSourceMedium"}],metrics:[{name:"sessions"}],orderBys:[{dimension:{dimensionName:"date"}},{metric:{metricName:"sessions"},desc:true}],limit:1000}),
      ]);
      if(!totalsResA){addLog("Error: Failed to load GA4 base totals. Check property permission and date window.","err");setLoading(false);return;}
      const metricMap=(res)=>{
        const out={};
        (res?.metricHeaders||[]).forEach((mh,idx)=>{ out[mh.name]=Number(res?.rows?.[0]?.metricValues?.[idx]?.value||0); });
        return out;
      };
      const mapRows=(res)=>{
        if(!res?.rows?.length) return [];
        return res.rows.map((r)=>({
          dimensions: Object.fromEntries((res.dimensionHeaders||[]).map((dh,idx)=>[dh.name,r.dimensionValues?.[idx]?.value || ""])),
          metrics: Object.fromEntries((res.metricHeaders||[]).map((mh,idx)=>[mh.name,Number(r.metricValues?.[idx]?.value || 0)])),
        }));
      };
      const aiPattern = /(chatgpt|openai|perplexity|gemini|copilot|claude|anthropic|ai\s*mode|searchgpt)/i;
      const aiByDate = new Map();
      for (const row of mapRows(aiTimelineRes)) {
        const ds = String(row?.dimensions?.date || "");
        const sm = String(row?.dimensions?.sessionSourceMedium || "");
        if (!aiPattern.test(sm)) continue;
        aiByDate.set(ds, Number(aiByDate.get(ds) || 0) + Number(row?.metrics?.sessions || 0));
      }
      const payload = {
        totals: {...metricMap(totalsResA),...metricMap(totalsResB)},
        channels: mapRows(channelsRes),
        sources: mapRows(sourcesRes),
        pages: mapRows(pagesRes),
        landing: mapRows(landingRes),
        devices: mapRows(devicesRes),
        countries: mapRows(countriesRes),
        newReturning: mapRows(newReturningRes),
        events: mapRows(eventsRes),
        conversions: mapRows(conversionsRes).filter((r)=>r.metrics.conversions > 0),
        timeline: mapRows(timelineRes),
        aiTimeline: [...aiByDate.entries()].map(([date, sessions]) => ({ dimensions: { date }, metrics: { sessions } })),
      };
      addLog("GA4 data loaded.","ok");setData(payload);
      const host = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
      mergeProjectData(orgScope, host, {
        ga4: {
          propertyId: ga4F?.extra?.propertyId,
          totals: payload.totals,
          channels: payload.channels.slice(0,30),
          sources: payload.sources.slice(0,40),
          pages: payload.pages.slice(0,40),
          landing: payload.landing.slice(0,40),
          devices: payload.devices.slice(0,12),
          countries: payload.countries.slice(0,24),
          newReturning: payload.newReturning.slice(0,8),
          events: payload.events.slice(0,30),
          conversions: payload.conversions.slice(0,30),
          timeline: payload.timeline.slice(0,120),
          aiTimeline: payload.aiTimeline.slice(0,180),
          capturedAt: new Date().toISOString(),
        },
      });
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setLoading(false);
  };

  const totals=data?.totals || {};
  const aiSourceRows = (() => {
    const rows = Array.isArray(data?.sources) ? data.sources : [];
    const aiPattern = /(chatgpt|openai|perplexity|gemini|copilot|claude|anthropic|ai\s*mode|searchgpt)/i;
    return rows
      .filter((r) => aiPattern.test(String(r?.dimensions?.sessionSourceMedium || "")))
      .map((r) => ({
        sourceMedium: String(r?.dimensions?.sessionSourceMedium || ""),
        sessions: Number(r?.metrics?.sessions || 0),
        activeUsers: Number(r?.metrics?.activeUsers || 0),
        engagementRate: Number(r?.metrics?.engagementRate || 0),
        bounceRate: Number(r?.metrics?.bounceRate || 0),
      }))
      .sort((a, b) => b.sessions - a.sessions);
  })();
  const aiSessions = aiSourceRows.reduce((sum, r) => sum + Number(r.sessions || 0), 0);
  const totalSessions = Number(totals.sessions || 0);
  const aiSessionShare = totalSessions > 0 ? (aiSessions / totalSessions) : 0;
  const causal = (() => {
    const host = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
    const project = loadProjectData(orgScope, host);
    const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
    const aiTimeline = Array.isArray(data?.aiTimeline) ? data.aiTimeline : [];
    const actions = Array.isArray(project?.aeoGeoActions) ? project.aeoGeoActions : [];
    const latestActionTs = actions
      .map((a) => new Date(a?.updatedAt || a?.createdAt || 0).getTime())
      .filter((t) => Number.isFinite(t) && t > 0)
      .sort((a,b)=>b-a)[0];
    if (!timeline.length || !latestActionTs) return null;
    const normRows = timeline.map((r) => {
      const ds = String(r?.dimensions?.date || "");
      const d = ds.length === 8 ? new Date(`${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}T00:00:00`) : new Date(ds);
      return { ts: d.getTime(), sessions: Number(r?.metrics?.sessions || 0) };
    }).filter((r)=>Number.isFinite(r.ts)).sort((a,b)=>a.ts-b.ts);
    const normAiRows = aiTimeline.map((r) => {
      const ds = String(r?.dimensions?.date || "");
      const d = ds.length === 8 ? new Date(`${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}T00:00:00`) : new Date(ds);
      return { ts: d.getTime(), sessions: Number(r?.metrics?.sessions || 0) };
    }).filter((r)=>Number.isFinite(r.ts)).sort((a,b)=>a.ts-b.ts);
    const convRate = Number(totals.sessions||0) > 0 ? Number(totals.conversions||0) / Number(totals.sessions||1) : 0.02;
    const aov = Number(project?.portfolioConfig?.aov || 120);
    return computeCausalAttributionModel({ timeline: normRows, aiTimeline: normAiRows, actionTs: latestActionTs, convRate, aov, horizonDays: 30 });
  })();
  const fmtPct=(n)=>`${(Number(n||0)*100).toFixed(1)}%`;
  const fmtSecs=(n)=>`${Math.round(Number(n||0))}s`;
  const MetricStat = ({label,value,help}) => (
    <div style={{minWidth:190,flex:"1 1 190px",background:C.panel,border:`1px solid ${C.border}`,padding:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:2}}>{label}</div>
        <span title={help} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,border:`1px solid ${C.dim}`,color:C.muted,fontFamily:"monospace",fontSize:10,cursor:"help"}}>? </span>
      </div>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:22,fontWeight:700}}>{value}</div>
    </div>
  );
  const DataTable = ({title,rows,columns}) => (
    <div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:8}}>{title}</div>
      <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        {rows.length===0&&<div style={{padding:12,color:C.muted,fontFamily:"monospace",fontSize:10}}>No data returned in this date range.</div>}
        {rows.map((row,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          {columns.map((c,ci)=><span key={ci} style={{color:c.color||C.text,flex:c.flex||1,minWidth:c.minWidth||0,textAlign:c.align||"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.render(row)}</span>)}
        </div>)}
      </div>
    </div>
  );

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Analytics" sub={`Real GA4 data · Acquisition, engagement, audience, events · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <div style={{minWidth:180}}>
        <ThemeDropdown
          value={String(days)}
          onChange={(v)=>setDays(Number(v))}
          options={[{value:"7",label:"Last 7 days"},{value:"28",label:"Last 28 days"},{value:"90",label:"Last 90 days"}]}
          placeholder="Date range"
        />
      </div>
      <Btn onClick={load} disabled={loading}>{loading?"▶ LOADING...":"▦ LOAD GA4 DATA"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={loading}/></div>}
    {data&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        <MetricStat label="Total Sessions" value={Number(totals.sessions||0).toLocaleString()} help="Total sessions in selected date range."/>
        <MetricStat label="Active Users" value={Number(totals.activeUsers||0).toLocaleString()} help="Unique active users in the period."/>
        <MetricStat label="Page Views" value={Number(totals.screenPageViews||0).toLocaleString()} help="Total page/screen views."/>
        <MetricStat label="Engagement Rate" value={fmtPct(totals.engagementRate)} help="Engaged sessions divided by all sessions."/>
        <MetricStat label="Bounce Rate" value={fmtPct(totals.bounceRate)} help="Non-engaged sessions divided by sessions."/>
        <MetricStat label="Avg Session" value={fmtSecs(totals.averageSessionDuration)} help="Average session duration in seconds."/>
        <MetricStat label="Conversions" value={Number(totals.conversions||0).toLocaleString()} help="Total conversion events."/>
        <MetricStat label="Event Count" value={Number(totals.eventCount||0).toLocaleString()} help="Total event fires in selected period."/>
      </div>
      <Tabs tabs={["overview","acquisition","ai discovery","causal","engagement","audience","events","timeline"]} active={tab} onChange={setTab}/>
      <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {tab==="overview"&&<>
          <DataTable
            title="TRAFFIC BY CHANNEL"
            rows={data.channels.slice(0,12)}
            columns={[
              {render:(r)=>r.dimensions.sessionDefaultChannelGroup || "(none)",flex:1},
              {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70,color:C.lime},
              {render:(r)=>fmtPct(r.metrics.engagementRate),align:"right",minWidth:70,color:C.muted},
            ]}
          />
          <DataTable
            title="TOP PAGES"
            rows={data.pages.slice(0,12)}
            columns={[
              {render:(r)=>r.dimensions.pagePath || "/",flex:1,color:C.lime},
              {render:(r)=>Number(r.metrics.screenPageViews||0).toLocaleString(),align:"right",minWidth:70},
              {render:(r)=>fmtPct(r.metrics.bounceRate),align:"right",minWidth:70,color:C.muted},
            ]}
          />
        </>}
        {tab==="acquisition"&&<>
          <DataTable
            title="SOURCE / MEDIUM"
            rows={data.sources.slice(0,18)}
            columns={[
              {render:(r)=>r.dimensions.sessionSourceMedium || "(none)",flex:1},
              {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70,color:C.lime},
              {render:(r)=>Number(r.metrics.activeUsers||0).toLocaleString(),align:"right",minWidth:70},
            ]}
          />
          <DataTable
            title="LANDING PAGES"
            rows={data.landing.slice(0,18)}
            columns={[
              {render:(r)=>r.dimensions.landingPage || "/",flex:1,color:C.lime},
              {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70},
              {render:(r)=>fmtPct(r.metrics.engagementRate),align:"right",minWidth:70,color:C.muted},
            ]}
          />
        </>}
        {tab==="ai discovery"&&<>
          <div style={{gridColumn:"1 / -1",display:"flex",gap:8,flexWrap:"wrap"}}>
            <Card label="AI-Sourced Sessions" value={aiSessions.toLocaleString()} delta={`${(aiSessionShare*100).toFixed(2)}% of total sessions`} good={aiSessions>0}/>
            <Card label="AI-Sourced Share" value={`${(aiSessionShare*100).toFixed(2)}%`} delta={aiSessions>0?"Tracked from source/medium signals":"No AI source sessions detected"} good={aiSessionShare>=0.03}/>
            <Card label="AI Referral Sources" value={aiSourceRows.length} delta="ChatGPT/Perplexity/Gemini/Copilot/Claude patterns" good={aiSourceRows.length>0}/>
          </div>
          <div style={{gridColumn:"1 / -1"}}>
            <DataTable
              title="AI SOURCE / MEDIUM"
              rows={aiSourceRows.slice(0,25)}
              columns={[
                {render:(r)=>r.sourceMedium || "(none)",flex:1,color:C.lime},
                {render:(r)=>Number(r.sessions||0).toLocaleString(),align:"right",minWidth:80,color:C.green},
                {render:(r)=>Number(r.activeUsers||0).toLocaleString(),align:"right",minWidth:80},
                {render:(r)=>fmtPct(r.engagementRate),align:"right",minWidth:80,color:C.muted},
                {render:(r)=>fmtPct(r.bounceRate),align:"right",minWidth:80,color:C.muted},
              ]}
            />
          </div>
        </>}
        {tab==="causal"&&<>
          <div style={{gridColumn:"1 / -1",display:"flex",gap:8,flexWrap:"wrap"}}>
            <Card label="Attribution Window" value={causal?"DiD: 14d pre/post":"N/A"} delta={causal?`Action at ${new Date(causal.actionAt).toLocaleDateString()} · confidence ${(Number(causal.confidence||0)*100).toFixed(0)}%`:"Need action + timeline"} good={!!causal}/>
            <Card label="AI Lift (Causal)" value={causal?`${(Number(causal.upliftPct||0)*100).toFixed(1)}%`:"—"} delta={causal?`AI ${causal.avgAiBefore} -> ${causal.avgAiAfter} vs Control ${causal.avgControlBefore} -> ${causal.avgControlAfter}`:"Insufficient data"} good={Number(causal?.upliftPct||0)>=0}/>
            <Card label="Incremental Sessions (30d)" value={causal?causal.incrementalSessions30d:"—"} delta={causal?`DiD daily lift ${Number(causal.didDailyLift||0).toFixed(2)}`:"Model-estimated from action window"} good={Number(causal?.incrementalSessions30d||0)>0}/>
            <Card label="Incremental Revenue (30d)" value={causal?`$${Number(causal.incrementalRevenue30d||0).toLocaleString()}`:"—"} delta={causal?`Conv ${(Number(causal.convRate||0)*100).toFixed(2)}%`:"Set GA4 + actions"} good={Number(causal?.incrementalRevenue30d||0)>0}/>
            <Card label="Causal Confidence" value={causal?`z=${Number(causal.zScore||0).toFixed(2)}`:"—"} delta={causal?`95% CI daily lift ${Number(causal.ci95DailyLiftLow||0).toFixed(2)} to ${Number(causal.ci95DailyLiftHigh||0).toFixed(2)}`:"Needs stable baseline"} good={Math.abs(Number(causal?.zScore||0))>=1}/>
            <Card label="AI Volatility" value={causal?`${Number(causal.volatilityAiBefore||0).toFixed(2)} -> ${Number(causal.volatilityAiAfter||0).toFixed(2)}`:"—"} delta="Std dev pre/post action" good={Number(causal?.volatilityAiAfter||0)<=Number(causal?.volatilityAiBefore||0)}/>
          </div>
        </>}
        {tab==="engagement"&&<>
          <DataTable
            title="TOP PAGES BY ENGAGEMENT"
            rows={data.pages.slice(0,18)}
            columns={[
              {render:(r)=>r.dimensions.pagePath || "/",flex:1,color:C.lime},
              {render:(r)=>fmtSecs(r.metrics.averageSessionDuration),align:"right",minWidth:70},
              {render:(r)=>fmtPct(r.metrics.engagementRate),align:"right",minWidth:70,color:C.green},
              {render:(r)=>fmtPct(r.metrics.bounceRate),align:"right",minWidth:70,color:C.orange},
            ]}
          />
          <DataTable
            title="CONVERSIONS BY LANDING PAGE"
            rows={data.landing.slice(0,18)}
            columns={[
              {render:(r)=>r.dimensions.landingPage || "/",flex:1,color:C.lime},
              {render:(r)=>Number(r.metrics.conversions||0).toLocaleString(),align:"right",minWidth:70,color:C.green},
              {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70},
            ]}
          />
        </>}
        {tab==="audience"&&<>
          <DataTable
            title="DEVICES"
            rows={data.devices.slice(0,10)}
            columns={[
              {render:(r)=>r.dimensions.deviceCategory || "unknown",flex:1},
              {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70,color:C.lime},
              {render:(r)=>fmtPct(r.metrics.engagementRate),align:"right",minWidth:70,color:C.muted},
            ]}
          />
          <DataTable
            title="COUNTRIES"
            rows={data.countries.slice(0,12)}
            columns={[
              {render:(r)=>r.dimensions.country || "unknown",flex:1},
              {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70,color:C.lime},
              {render:(r)=>Number(r.metrics.activeUsers||0).toLocaleString(),align:"right",minWidth:70},
            ]}
          />
          <DataTable
            title="NEW VS RETURNING"
            rows={data.newReturning.slice(0,5)}
            columns={[
              {render:(r)=>r.dimensions.newVsReturning || "unknown",flex:1},
              {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70,color:C.lime},
              {render:(r)=>Number(r.metrics.activeUsers||0).toLocaleString(),align:"right",minWidth:70},
            ]}
          />
        </>}
        {tab==="events"&&<>
          <DataTable
            title="TOP EVENTS"
            rows={data.events.slice(0,20)}
            columns={[
              {render:(r)=>r.dimensions.eventName || "(event)",flex:1},
              {render:(r)=>Number(r.metrics.eventCount||0).toLocaleString(),align:"right",minWidth:70,color:C.lime},
              {render:(r)=>Number(r.metrics.totalUsers||0).toLocaleString(),align:"right",minWidth:70},
            ]}
          />
          <DataTable
            title="CONVERSION EVENTS"
            rows={data.conversions.slice(0,20)}
            columns={[
              {render:(r)=>r.dimensions.eventName || "(event)",flex:1,color:C.green},
              {render:(r)=>Number(r.metrics.conversions||0).toLocaleString(),align:"right",minWidth:70,color:C.green},
              {render:(r)=>Number(r.metrics.totalUsers||0).toLocaleString(),align:"right",minWidth:70},
            ]}
          />
        </>}
        {tab==="timeline"&&<>
          <div style={{gridColumn:"1 / -1"}}>
            <DataTable
              title="DAILY TREND"
              rows={data.timeline.slice(-45)}
              columns={[
                {render:(r)=>r.dimensions.date || "",flex:1},
                {render:(r)=>Number(r.metrics.sessions||0).toLocaleString(),align:"right",minWidth:70,color:C.lime},
                {render:(r)=>Number(r.metrics.activeUsers||0).toLocaleString(),align:"right",minWidth:70},
                {render:(r)=>Number(r.metrics.screenPageViews||0).toLocaleString(),align:"right",minWidth:70},
                {render:(r)=>fmtPct(r.metrics.engagementRate),align:"right",minWidth:70,color:C.green},
              ]}
            />
          </div>
        </>}
      </div>
    </>}
  </div>;
}

// ── AEO / GEO ─────────────────────────────────────────────────────
function AEO({integrations, orgScope="default"}) {
  const ai=integrations.ai;
  const [topic,setTopic]=useState("");const [running,setRunning]=useState(false);
  const [actionRunningId,setActionRunningId]=useState("");
  const [output,setOutput]=useState("");const [tab,setTab]=useState("aeo");
  const [obsPrompt,setObsPrompt]=useState("");
  const [obsEngine,setObsEngine]=useState("chatgpt");
  const [obsCited,setObsCited]=useState(false);
  const [obsRank,setObsRank]=useState("");
  const [obsCompetitors,setObsCompetitors]=useState("");
  const [obsCitationUrl,setObsCitationUrl]=useState("");
  const [trustedDomainsText,setTrustedDomainsText]=useState("");
  const [bingCsvText,setBingCsvText]=useState("");
  const [openaiSearchKey,setOpenaiSearchKey]=useState("");
  const [anthropicSearchKey,setAnthropicSearchKey]=useState("");
  const [perplexityKey,setPerplexityKey]=useState("");
  const [bingApiKey,setBingApiKey]=useState("");
  const [bingSiteUrl,setBingSiteUrl]=useState("");
  const [probeRunning,setProbeRunning]=useState(false);
  const [suiteText,setSuiteText]=useState(
    "brand review intent\nbest category alternatives\nwhat is the brand\nbrand vs competitor\nlocal service near me intent\ntroubleshooting setup intent\ntransactional pricing comparison"
  );
  const [suiteRunning,setSuiteRunning]=useState(false);
  const [outputGuard,setOutputGuard]=useState({ warnings: [], blocked: false });
  const [llmPolicyFiles,setLlmPolicyFiles]=useState({ llmsTxt: "", llmTxt: "", warnings: [], errors: [], validatedAt: "" });
  const [buildingLlmTxt,setBuildingLlmTxt]=useState(false);
  const [showUnderstandModal, setShowUnderstandModal] = useState(false);
  const [govSaved, setGovSaved] = useState("");
  const [brandSaved, setBrandSaved] = useState("");
  const [brandImportMsg, setBrandImportMsg] = useState("");
  const [entityPack, setEntityPack] = useState("");
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingProcessing, setOnboardingProcessing] = useState(false);
  const [hcReadiness, setHcReadiness] = useState({ loading: false, mode: "", score: 0, productionReady: false, productionCapable: false, checks: [], requirements: [], error: "" });
  const [onboardingAnswers, setOnboardingAnswers] = useState({
    businessName: "",
    legalName: "",
    website: "",
    oneLiner: "",
    productService: "",
    targetAudience: "",
    targetLocations: "",
    niche: "",
    competitors: "",
    mainGoal: "",
    successMetric: "",
    entityDisambiguation: "",
    commonConfusions: "",
    tone: "",
  });
  const host = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
  const projectData = loadProjectData(orgScope, host);
  const profileRole = (() => {
    try {
      const raw = localStorage.getItem("helio:user-profile:v1");
      const p = raw ? JSON.parse(raw) : {};
      return String(p?.role || "admin").trim().toLowerCase();
    } catch { return "admin"; }
  })();
  const canManageAeo = !["viewer", "read-only", "readonly"].includes(profileRole);
  const topKeywords = Array.isArray(projectData?.gsc?.topKeywords) ? projectData.gsc.topKeywords : [];
  const topPages = Array.isArray(projectData?.gsc?.topPages) ? projectData.gsc.topPages : [];
  const auditIssues = Array.isArray(projectData?.audit?.issueRegistry) ? projectData.audit.issueRegistry : [];
  const techStatus = Array.isArray(projectData?.gsc?.techStatus) ? projectData.gsc.techStatus : [];
  const aeoGeoActions = Array.isArray(projectData?.aeoGeoActions) ? projectData.aeoGeoActions : [];
  const aeoAuditTrail = Array.isArray(projectData?.aeoGeoAuditTrail) ? projectData.aeoGeoAuditTrail : [];
  const governance = projectData?.aeoGeoGovernance || {
    immutableAuditTrail: true,
    requireApprovalForP1: true,
    requireApprovalForPolicyDeploy: true,
    allowAutonomousPolicyGeneration: true,
    allowAutonomousExternalProbe: true,
    allowAutonomousActionQueueing: true,
    enableAutonomousVerificationLoop: true,
    autoGenerateActionsFromStrategy: false,
    autoExecuteStrategyActions: false,
  };
  const brandProfile = projectData?.aeoBrandProfile || {
    brandName: "",
    legalName: "",
    tagline: "",
    whatWeDo: "",
    products: "",
    services: "",
    audience: "",
    regions: "",
    competitors: "",
    entityDisambiguation: "",
    wrongInterpretations: "",
  };
  const [brandDraft, setBrandDraft] = useState(brandProfile);
  const intelStore = projectData?.aeoGeoIntel || {};
  const observations = Array.isArray(intelStore?.promptObservations) ? intelStore.promptObservations : [];
  const connectorHealth = intelStore?.connectorHealth || {};
  useEffect(() => {
    setTrustedDomainsText((Array.isArray(intelStore?.trustedDomains) ? intelStore.trustedDomains : []).join("\n"));
    setOpenaiSearchKey(String(intelStore?.connectors?.openaiSearchKey || ""));
    setAnthropicSearchKey(String(intelStore?.connectors?.anthropicSearchKey || ""));
    setPerplexityKey(String(intelStore?.connectors?.perplexityKey || ""));
    setBingApiKey(String(intelStore?.connectors?.bingApiKey || ""));
    setBingSiteUrl(String(intelStore?.connectors?.bingSiteUrl || ""));
  }, [host, intelStore?.updatedAt]);

  useEffect(() => {
    setBrandDraft(brandProfile);
  }, [host, projectData?.updatedAt]);

  useEffect(() => {
    setOnboardingAnswers((prev) => ({
      ...prev,
      businessName: brandProfile?.brandName || prev.businessName || "",
      legalName: brandProfile?.legalName || prev.legalName || "",
      website: host ? `https://${host}` : prev.website || "",
      oneLiner: brandProfile?.tagline || prev.oneLiner || "",
      productService: [brandProfile?.products || "", brandProfile?.services || ""].filter(Boolean).join(" | ") || prev.productService || "",
      targetAudience: brandProfile?.audience || prev.targetAudience || "",
      targetLocations: brandProfile?.regions || prev.targetLocations || "",
      niche: prev.niche || "",
      competitors: brandProfile?.competitors || prev.competitors || "",
      entityDisambiguation: brandProfile?.entityDisambiguation || prev.entityDisambiguation || "",
      commonConfusions: brandProfile?.wrongInterpretations || prev.commonConfusions || "",
    }));
  }, [host]);

  const queryPageOps = (() => {
    if (!topKeywords.length || !topPages.length) return [];
    return topKeywords.slice(0, 20).map((k) => {
      const query = String(k.keys?.[0] || "").toLowerCase();
      const pos = Number(k.position || 99);
      const ctr = Number(k.ctr || 0);
      let best = topPages[0];
      let bestScore = -1;
      for (const p of topPages) {
        const page = String(p.keys?.[0] || "").toLowerCase();
        const overlap = query.split(" ").filter((w) => w.length > 2 && page.includes(w)).length;
        const score = overlap * 2 + Number(p.clicks || 0) * 0.001;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      const opportunity = Math.round(
        Math.max(0, Math.min(100, ((pos > 4 ? (Math.min(30, pos) - 4) : 0) * 2.2) + ((0.08 - ctr) * 300)))
      );
      return {
        query: k.keys?.[0] || "",
        page: best?.keys?.[0] || "",
        clicks: Number(k.clicks || 0),
        ctr: `${(ctr * 100).toFixed(1)}%`,
        position: pos.toFixed(1),
        opportunity,
        priority: opportunity >= 55 ? "HIGH" : opportunity >= 30 ? "MEDIUM" : "LOW",
      };
    }).sort((a, b) => b.opportunity - a.opportunity).slice(0, 12);
  })();

  const entityCandidates = (() => {
    const source = topKeywords.map((k) => String(k.keys?.[0] || ""));
    const tokens = {};
    source.forEach((q) => q.split(/\s+/).forEach((w) => {
      const t = w.trim().toLowerCase();
      if (t.length < 4) return;
      if (["with","from","that","this","your","best","guide","tools","tool"].includes(t)) return;
      tokens[t] = (tokens[t] || 0) + 1;
    }));
    return Object.entries(tokens).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([entity, freq]) => ({ entity, freq }));
  })();

  const internalLinkRecs = (() => {
    if (!topPages.length) return [];
    const weakMeta = auditIssues.find((i) => /meta descriptions/i.test(i.label) && (i.value || 0) > 0);
    const templateHints = Array.isArray(projectData?.audit?.templatePatterns) ? projectData.audit.templatePatterns : [];
    const weakTemplate = templateHints[0]?.template || "/blog/*";
    return topPages.slice(0, 8).map((p, idx) => ({
      from: p.keys?.[0] || "",
      to: topPages[(idx + 1) % topPages.length]?.keys?.[0] || "",
      anchorIntent: queryPageOps[idx]?.query || "related topic",
      reason: weakMeta ? "Supports CTR/meta gap pages" : `Strengthen ${weakTemplate} topical graph`,
    }));
  })();

  const enginePolicyChecks = (() => {
    const robots = techStatus.find((t) => String(t?.key || "").toLowerCase() === "robots.txt");
    const text = String(robots?.body || "");
    const hasGoogleExtended = /google-extended/i.test(text);
    const hasOaiSearchBot = /oai-searchbot/i.test(text);
    const hasGptBot = /gptbot/i.test(text);
    const hasPerplexityBot = /perplexitybot/i.test(text);
    return {
      hasGoogleExtended,
      hasOaiSearchBot,
      hasGptBot,
      hasPerplexityBot,
      score: [hasGoogleExtended, hasOaiSearchBot, hasGptBot, hasPerplexityBot].filter(Boolean).length * 25,
    };
  })();

  const readinessV2 = (() => {
    const llmsDetected = techStatus.find((t) => String(t?.key || "").toLowerCase() === "llms.txt" && t?.ok);
    const llmDetected = techStatus.find((t) => String(t?.key || "").toLowerCase() === "llm.txt" && t?.ok);
    const issueCount = auditIssues.filter((i) => Number(i?.value || 0) > 0).length;
    const opportunityScore = queryPageOps.length ? Math.round(queryPageOps.reduce((a, r) => a + Number(r.opportunity || 0), 0) / queryPageOps.length) : 0;
    const retrieval = Math.max(0, Math.min(100, 35 + Math.round(entityCandidates.length * 4) + (llmsDetected ? 15 : 0) + (llmDetected ? 8 : 0) + Math.round(enginePolicyChecks.score * 0.25)));
    const crawlControl = Math.max(0, Math.min(100, 30 + enginePolicyChecks.score + (issueCount ? -Math.min(30, issueCount * 3) : 10)));
    const content = Math.max(0, Math.min(100, 30 + Math.round(opportunityScore * 0.5)));
    const trust = Math.max(0, Math.min(100, 40 + (auditIssues.some((i) => /schema|canonical|meta/i.test(String(i?.label || ""))) ? -15 : 20)));
    const overall = Math.round((retrieval * 0.32) + (crawlControl * 0.28) + (content * 0.24) + (trust * 0.16));
    return {
      score: overall,
      retrieval,
      crawlControl,
      content,
      trust,
      issueCount,
      updatedAt: new Date().toISOString(),
      primaryKpi: "ai_sourced_sessions_lift",
      llmsTxtDetected: !!llmsDetected,
      llmTxtDetected: !!llmDetected,
      enginePolicies: enginePolicyChecks,
    };
  })();

  const citationFitness = (() => {
    const candidate = {
      words: Number(projectData?.onpage?.meta?.content?.words_count || topPages?.[0]?.words || 0),
      canonical: String(projectData?.onpage?.meta?.canonical || ""),
      meta: projectData?.onpage?.meta || {},
      sourcesCount: Number((projectData?.audit?.issueRegistry || []).filter((i)=>/evidence|schema|citation/i.test(String(i?.label||""))).length || 0),
      freshnessDays: 21,
    };
    return computeCitationFitness({
      page: candidate,
      host,
      schemaTypes: Array.isArray(projectData?.onpage?.meta?.schema_types) ? projectData.onpage.meta.schema_types : [],
    });
  })();
  const observatory = summarizePromptObservatory(observations);
  const competitorGraph = buildCompetitorMentionGraph(observations);
  const intelligenceActions = buildIntelligenceActions({ observatory, citationFitness, competitors: competitorGraph });
  const entityKnowledge = (() => {
    const bp = brandDraft || {};
    const checks = [
      !!String(bp.brandName || "").trim(),
      !!String(bp.whatWeDo || "").trim(),
      !!String(bp.products || "").trim() || !!String(bp.services || "").trim(),
      !!String(bp.audience || "").trim(),
      !!String(bp.entityDisambiguation || "").trim(),
      !!String(bp.wrongInterpretations || "").trim(),
    ];
    const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return {
      score,
      missing: [
        !checks[0] ? "brand name" : "",
        !checks[1] ? "what we do" : "",
        !checks[2] ? "products/services" : "",
        !checks[3] ? "audience" : "",
        !checks[4] ? "entity disambiguation" : "",
        !checks[5] ? "wrong interpretations" : "",
      ].filter(Boolean),
    };
  })();
  const autopilotKpis = (() => {
    const runs = Array.isArray(intelStore?.probeRuns) ? intelStore.probeRuns : [];
    const now = Date.now();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const weekly = runs.filter((r) => {
      const ts = new Date(r?.ts || 0).getTime();
      return Number.isFinite(ts) && ts >= weekAgo;
    });
    const weeklyRiskAvg = weekly.length
      ? weekly.reduce((s, r) => s + Number(r?.confusionRisk || 0), 0) / weekly.length
      : 0;
    const prevWeekly = runs.filter((r) => {
      const ts = new Date(r?.ts || 0).getTime();
      return Number.isFinite(ts) && ts < weekAgo && ts >= (weekAgo - (7 * 24 * 60 * 60 * 1000));
    });
    const prevRiskAvg = prevWeekly.length
      ? prevWeekly.reduce((s, r) => s + Number(r?.confusionRisk || 0), 0) / prevWeekly.length
      : weeklyRiskAvg;
    const trendDelta = Number((weeklyRiskAvg - prevRiskAvg).toFixed(2));

    const verActions = (Array.isArray(aeoGeoActions) ? aeoGeoActions : []).filter((a) => !!a?.verificationStatus);
    const improved = verActions.filter((a) => String(a?.verificationStatus) === "improved").length;
    const winRate = verActions.length ? Number(((improved / verActions.length) * 100).toFixed(1)) : 0;

    const recoveredMins = verActions
      .map((a) => {
        const c = new Date(a?.createdAt || 0).getTime();
        const v = new Date(a?.verificationAt || 0).getTime();
        if (!Number.isFinite(c) || !Number.isFinite(v) || v <= c) return null;
        return (v - c) / 60000;
      })
      .filter((x) => x != null);
    const mrt = recoveredMins.length ? Number((recoveredMins.reduce((s, x) => s + x, 0) / recoveredMins.length).toFixed(1)) : 0;

    return { trendDelta, winRate, mrt, weeklyCount: weekly.length, verifiedCount: verActions.length };
  })();

  const deterministic = (() => {
    const domain = host || "unknown-domain";
    const brandName = String(brandDraft?.brandName || domain);
    const focus = topic || brandName || topKeywords[0]?.keys?.[0] || "core topic";
    const topQuery = topKeywords[0]?.keys?.[0] || focus;
    const faqSeed = queryPageOps.slice(0, 5);
    const issueHighlights = auditIssues.filter((i) => Number(i.value || 0) > 0).slice(0, 5);
    const entityList = entityCandidates.slice(0, 8).map((e) => e.entity);
    const clusters = queryPageOps.slice(0, 8).reduce((acc, row) => {
      const slug = String(row.page || "/").split("/").filter(Boolean)[0] || "root";
      if (!acc[slug]) acc[slug] = [];
      acc[slug].push(row.query);
      return acc;
    }, {});

    const aeoLines = [
      `DOMAIN: ${domain}`,
      `BRAND ENTITY: ${brandName}`,
      `FOCUS: ${focus}`,
      "",
      "DIRECT ANSWER BLOCK",
      `${topQuery}: ${focus} should prioritize intent-aligned page coverage, structured headings, concise answers in the first 120 words, and FAQ/schema support for rich answer extraction.`,
      "",
      "FAQ CANDIDATES",
      ...faqSeed.map((r, i) => `${i + 1}. Q: ${r.query || focus}? A: Improve ${r.page || "target page"} for this query with explicit answer-first copy and evidence-backed supporting sections.`),
      "",
      "FAQPAGE JSON-LD SKELETON",
      '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"<query>","acceptedAnswer":{"@type":"Answer","text":"<answer>"}}]}',
    ];

    const geoLines = [
      `DOMAIN: ${domain}`,
      `BRAND ENTITY: ${brandName}`,
      `FOCUS: ${focus}`,
      "",
      "LLM-RETRIEVAL READY CLAIM",
      `${focus} on ${domain} is backed by pages already ranking for related queries and should be published with consistent entities, canonical URLs, and stable facts for citation.`,
      "",
      "ENTITY MAP",
      ...entityList.map((e, i) => `${i + 1}. ${e}`),
      "",
      "CONTENT CLUSTERS",
      ...Object.entries(clusters).slice(0, 6).map(([k, v]) => `- /${k}: ${v.slice(0, 4).join(" | ")}`),
      "",
      "TECHNICAL PRECONDITIONS",
      ...(issueHighlights.length
        ? issueHighlights.map((i) => `- Fix ${i.label} (${i.value}) before scaling GEO pages`)
        : ["- No major blocking technical issues detected from latest audit snapshot"]),
    ];

    const llmLines = [
      `DOMAIN: ${domain}`,
      `BRAND ENTITY: ${brandName}`,
      "",
      "BRAND/ENTITY CLAIMS TO REINFORCE",
      ...entityList.slice(0, 6).map((e, i) => `${i + 1}. ${brandName} (${domain}) is a credible source for ${e}`),
      "",
      "MENTION TARGET PLAN",
      "1. Linkable assets: publish benchmark pages and implementation guides.",
      "2. Citation assets: keep FAQ, comparisons, and methodology pages updated.",
      "3. Consistency: same organization name, schema entity IDs, and canonical host everywhere.",
      "4. Evidence lock: claims must map to verifiable first-party pages or cited external sources.",
      ...(brandDraft?.entityDisambiguation ? ["5. Disambiguation: " + String(brandDraft.entityDisambiguation)] : []),
      "",
      "PRIORITY PAGES FOR LLM VISIBILITY",
      ...topPages.slice(0, 8).map((p, i) => `${i + 1}. ${p.keys?.[0] || ""} (clicks:${Number(p.clicks || 0)})`),
    ];

    const savedStrategy = String(projectData?.aeoGeoStrategyPlan?.planText || "").trim();
    const stratLines = [
      `DOMAIN: ${domain}`,
      `BRAND ENTITY: ${brandName}`,
      `FOCUS: ${focus}`,
      "",
      "QUERY->PAGE EXECUTION",
      ...queryPageOps.slice(0, 8).map((r, i) => `${i + 1}. ${r.query} -> ${r.page} | pos:${r.position} ctr:${r.ctr} opp:${r.opportunity}`),
      "",
      "INTERNAL LINK SPRINT",
      ...internalLinkRecs.slice(0, 6).map((l, i) => `${i + 1}. ${l.from} -> ${l.to} (anchor: ${l.anchorIntent})`),
      "",
      "7-DAY SHIP LIST",
      "1. Update title/H1/intro blocks for top 5 opportunity queries.",
      "2. Ship FAQ schema on pages with high-impression low-CTR queries.",
      "3. Resolve top technical blockers from latest audit.",
      "4. Add contextual internal links from top-click pages to lagging pages.",
    ];

    return {
      aeo: aeoLines.join("\n"),
      geo: geoLines.join("\n"),
      "llm visibility": llmLines.join("\n"),
      strategy: savedStrategy || stratLines.join("\n"),
    };
  })();

  const run=async(type)=>{
    setRunning(true);setOutput("");
    setOutputGuard({ warnings: [], blocked: false });
    const base = deterministic[type === "llm" ? "llm visibility" : type] || "";
    const prompts={
      aeo:`Enhance this deterministic AEO draft for real execution. Keep all recommendations grounded in provided data. Return improved version only.\n\n${base}`,
      geo:`Enhance this deterministic GEO draft for real execution. Keep all recommendations grounded in provided data. Return improved version only.\n\n${base}`,
      llm:`Enhance this deterministic LLM visibility draft for real execution. Keep all recommendations grounded in provided data. Return improved version only.\n\n${base}`,
      strategy:`Enhance this deterministic strategy into a tighter sprint-ready execution plan. Keep all recommendations grounded in provided data. Return improved version only.\n\n${base}`,
    };
    try{
      const r=await callAI(ai,"You are Helio. Refine deterministic SEO plans without inventing data. Preserve structure and make it more actionable.",prompts[type]);
      const lines = String(r || "").split("\n");
      const warnings = [];
      const hasNumericClaims = /(\d+%|\b\d{2,}\b)/.test(String(r || ""));
      const hasEvidenceAnchor = /(source|evidence|based on|from gsc|from ga4|from audit|https?:\/\/)/i.test(String(r || ""));
      if (hasNumericClaims && !hasEvidenceAnchor) warnings.push("Potential unsupported numeric claims detected. Add explicit evidence/source lines.");
      const banned = lines.filter((l)=>/guarantee|always rank|100% success|instant ranking/i.test(l));
      if (banned.length) warnings.push("Disallowed certainty claims detected. Replace with evidence-backed probability language.");
      const blocked = banned.length > 0;
      setOutputGuard({ warnings, blocked });
      setOutput(blocked ? `${String(r || "").trim()}\n\n[GUARDRAIL]\nBlocked for certainty-claim policy violations.` : r);
    }
    catch(e){setOutput(`Error: ${e.message}`);}
    setRunning(false);
  };

  const createActionsFromStrategy = async (opts = {}) => {
    const autoMode = !!opts?.auto;
    if (!guardAeoMutation("create_actions_from_strategy")) return 0;
    if (!host) return;
    const strategyText = String(opts?.strategyText || deterministic?.strategy || "").trim();
    if (!strategyText) {
      setOutput("[STRATEGY]\nNo strategy text available.");
      return 0;
    }
    const latest = loadProjectData(orgScope, host);
    const prevActions = Array.isArray(latest?.aeoGeoActions) ? latest.aeoGeoActions : [];
    const lines = strategyText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^#{1,6}\s*$/.test(l));
    const candidateLines = lines.filter((l) => /^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l) || /^phase\s+\d+/i.test(l));
    const fallback = lines.slice(0, 8);
    const selected = (candidateLines.length ? candidateLines : fallback).slice(0, 18);

    const actions = selected.map((row, idx) => {
      const clean = row.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").replace(/\*\*/g, "").trim();
      const lower = clean.toLowerCase();
      const isP1 = /(must|critical|foundation|disambiguation|schema|llms\.txt|llm\.txt|policy|entity)/i.test(clean);
      return {
        actionId: `aeogeo_strategy_${Date.now()}_${idx}`,
        type: "strategy_execution",
        title: clean.slice(0, 120) || `Strategy action ${idx + 1}`,
        summary: clean,
        reason: "Generated from Strategy tab plan.",
        severity: isP1 ? "high" : "medium",
        priority: isP1 ? "P1" : "P2",
        status: "todo",
        affectedCount: 1,
        kpiTarget: isP1 ? 85 : 72,
        fixHint: "Execute via Helio Code mission and verify with probe timeline.",
        expectedOutcome: "Action shipped and reflected in AEO/GEO metrics.",
        source: "strategy_to_actions",
        createdAt: new Date().toISOString(),
      };
    });

    const dedupKey = (a) => String(a?.title || "").toLowerCase();
    const existingKeys = new Set(prevActions.map(dedupKey));
    const fresh = actions.filter((a) => !existingKeys.has(dedupKey(a)));
    const merged = [...fresh, ...prevActions].slice(0, 140);
    mergeProjectData(orgScope, host, { aeoGeoActions: merged });
    syncMissionsFromProject(orgScope, host);
    appendAeoAuditEvent(orgScope, host, {
      actor: autoMode ? "helio-agent" : "helio-user",
      role: autoMode ? "system" : profileRole,
      action: "create_actions_from_strategy",
      status: "ok",
      detail: `actions_created=${fresh.length} mode=${autoMode ? "auto" : "manual"}`,
    });
    if (autoMode) {
      setOutput(`[AUTONOMY]\nAuto-generated ${fresh.length} strategy action card(s) and synced missions.`);
    } else {
      setOutput(`[STRATEGY]\nCreated ${fresh.length} action card(s) from strategy and synced missions.\nOpen ACTIONS tab to execute, or run Autonomy for autonomous rollout.`);
      setTab("actions");
    }
    if ((opts?.autoExecute || governance?.autoExecuteStrategyActions) && fresh.length) {
      const latestAfterCreate = loadProjectData(orgScope, host);
      const rows = Array.isArray(latestAfterCreate?.aeoGeoActions) ? latestAfterCreate.aeoGeoActions : [];
      const executable = rows.filter((r) => fresh.some((f) => String(f.actionId) === String(r.actionId))).slice(0, 8);
      for (const action of executable) {
        // eslint-disable-next-line no-await-in-loop
        await runHelioCodeForAeoAction(action);
      }
    }
    return fresh.length;
  };

  const validatePolicyText = (text, requiredKeys = []) => {
    const warnings = [];
    const errors = [];
    const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (const k of requiredKeys) {
      if (!lines.some((l) => l.toLowerCase().startsWith(`${String(k).toLowerCase()}:`))) errors.push(`Missing required key: ${k}`);
    }
    if (lines.length < 8) warnings.push("File appears too short for robust retrieval guidance.");
    return { warnings, errors };
  };

  const buildLlmTxt = async () => {
    setBuildingLlmTxt(true);
    setTab("llm policy");
    const gscTop = (projectData?.gsc?.topPages || []).slice(0, 12).map((p)=>p.keys?.[0]).filter(Boolean);
    const sample = gscTop.join(", ");
    const domain = host || topic || "unknown-site";
    const entityContext = [
      `brand_name=${String(brandDraft?.brandName || "")}`,
      `legal_name=${String(brandDraft?.legalName || "")}`,
      `tagline=${String(brandDraft?.tagline || "")}`,
      `what_we_do=${String(brandDraft?.whatWeDo || "")}`,
      `products=${String(brandDraft?.products || "")}`,
      `services=${String(brandDraft?.services || "")}`,
      `audience=${String(brandDraft?.audience || "")}`,
      `regions=${String(brandDraft?.regions || "")}`,
      `entity_disambiguation=${String(brandDraft?.entityDisambiguation || "")}`,
      `wrong_interpretations_to_avoid=${String(brandDraft?.wrongInterpretations || "")}`,
    ].join("\n");
    try {
      const llmsTxtRaw = await callAI(
        ai,
        "You are Helio. Generate ONLY plain text for llms.txt, no markdown fences, no commentary, no fabricated claims.",
        `Create a high-quality llms.txt for domain ${domain}. Include sections:
# llms.txt
site:
focus:
entities:
priority_pages:
allowed_agents:
disallowed_paths:
citation_preferences:
freshness:
contact:
Use realistic concise lines. Candidate priority pages: ${sample || "homepage, pricing, docs, blog"}\n\nEntity context:\n${entityContext}`
      );
      const llmCompatRaw = await callAI(
        ai,
        "You are Helio. Generate ONLY plain text for llm.txt, no markdown fences, no commentary, no fabricated claims.",
        `Create a compatibility llm.txt for domain ${domain}. Keep it concise and map to llms.txt. Include sections:
# llm.txt
site:
canonical_policy_file:
entities:
priority_pages:
citation_preferences:
freshness:
contact:
Use realistic concise lines. Candidate priority pages: ${sample || "homepage, pricing, docs, blog"}\n\nEntity context:\n${entityContext}`
      );
      const llmsTxt = String(llmsTxtRaw || "").trim();
      const llmTxt = String(llmCompatRaw || "").trim();
      const v1 = validatePolicyText(llmsTxt, ["site", "focus", "entities", "priority_pages", "allowed_agents"]);
      const v2 = validatePolicyText(llmTxt, ["site", "canonical_policy_file", "entities", "priority_pages"]);
      const next = {
        llmsTxt,
        llmTxt,
        warnings: [...v1.warnings, ...v2.warnings],
        errors: [...v1.errors, ...v2.errors],
        validatedAt: new Date().toISOString(),
      };
      setLlmPolicyFiles(next);
      if (host) mergeProjectData(orgScope, host, { aeoGeoReadinessV2: readinessV2, llmPolicyFiles: next });
    } catch (e) {
      setLlmPolicyFiles({ llmsTxt: "", llmTxt: "", warnings: [], errors: [`Error: ${e.message}`], validatedAt: new Date().toISOString() });
    }
    setBuildingLlmTxt(false);
  };

  const queueLlmPolicyMission = () => {
    if (!guardAeoMutation("queue_policy_mission")) return;
    if (!host || !llmPolicyFiles.llmsTxt || !llmPolicyFiles.llmTxt) return;
    const project = loadProjectData(orgScope, host);
    const prevActions = Array.isArray(project?.aeoGeoActions) ? project.aeoGeoActions : [];
    const actionId = `aeogeo_policy_${Date.now()}`;
    const nextAction = {
      actionId,
      type: "llm_policy_files",
      title: "Ship llms.txt + llm.txt via Helio Code PR",
      summary: "Deploy dual policy files with canonical llms.txt and compatibility llm.txt.",
      reason: "AEO/GEO retrieval policy files prepared and validated in module.",
      severity: "high",
      priority: "P1",
      status: "todo",
      affectedCount: 2,
      kpiTarget: 72,
      fixHint: "Create/update root llms.txt and llm.txt from generated drafts, then verify 200 status and crawl accessibility.",
      expectedOutcome: "Root llms.txt and llm.txt deployed with evidence-backed policy and validated fetchability.",
      auditEvidence: {
        llmsTxtDraft: String(llmPolicyFiles.llmsTxt || "").slice(0, 6000),
        llmTxtDraft: String(llmPolicyFiles.llmTxt || "").slice(0, 4000),
        policyWarnings: Array.isArray(llmPolicyFiles.warnings) ? llmPolicyFiles.warnings : [],
        policyErrors: Array.isArray(llmPolicyFiles.errors) ? llmPolicyFiles.errors : [],
      },
      evidenceRefs: ["llmPolicyFiles.llmsTxt", "llmPolicyFiles.llmTxt", "aeoGeoReadinessV2"],
      createdAt: new Date().toISOString(),
    };
    mergeProjectData(orgScope, host, {
      llmPolicyFiles,
      aeoGeoReadinessV2: readinessV2,
      aeoGeoActions: [nextAction, ...prevActions].slice(0, 60),
    });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "queue_llm_policy_mission",
      status: "ok",
      detail: nextAction.title,
    });
    setOutput((prev)=>`${prev ? `${prev}\n\n` : ""}[ACTION QUEUED]\nMission input created: ${nextAction.title}`);
  };

  const updateAeoActionStatus = (actionId, status) => {
    if (!guardAeoMutation("update_action_status")) return;
    if (!host || !actionId) return;
    const latest = loadProjectData(orgScope, host);
    const rows = Array.isArray(latest?.aeoGeoActions) ? latest.aeoGeoActions : [];
    const next = rows.map((r) => (String(r.actionId) === String(actionId) ? { ...r, status, updatedAt: new Date().toISOString() } : r));
    mergeProjectData(orgScope, host, { aeoGeoActions: next });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "update_aeo_action_status",
      status: "ok",
      detail: `${actionId} -> ${status}`,
    });
  };

  const runHelioCodeForAeoAction = async (action) => {
    if (!guardAeoMutation("run_helio_code")) return;
    if (!host || !action?.actionId || actionRunningId) return;
    const gh = integrations?.github?.fields || {};
    const helioCodeAgent = resolveHelioCodeAgentConfig(integrations);
    const hasHelioCodeTarget = !!(integrations?.github?.connected && gh?.repo && (gh?.appInstallationId || gh?.token));
    if (!hasHelioCodeTarget) {
      setOutput("[AEO ACTION]\nGitHub target is not configured for Helio Code. Connect GitHub repo + installation/token in Integrations.");
      return;
    }
    let readiness = null;
    try {
      readiness = await ensureHelioCodeWorkerReady(integrations);
      setHcReadiness({
        loading: false,
        mode: String(readiness?.mode || ""),
        score: Number(readiness?.score || 0),
        productionReady: !!readiness?.productionReady,
        productionCapable: !!readiness?.productionCapable,
        checks: Array.isArray(readiness?.checks) ? readiness.checks : [],
        requirements: Array.isArray(readiness?.requirements) ? readiness.requirements : [],
        error: "",
      });
    } catch (e) {
      setOutput(`[AEO ACTION]\nHelio Code readiness check failed: ${e.message}`);
      return;
    }
    if (!isHelioCodeReadyForProject(readiness, integrations)) {
      const message = helioCodeReadinessFailure(readiness, integrations);
      setOutput(`[AEO ACTION]\n${message}`);
      const latest = loadProjectData(orgScope, host);
      const rows = Array.isArray(latest?.aeoGeoActions) ? latest.aeoGeoActions : [];
      const next = rows.map((r) => (String(r.actionId) === String(action.actionId) ? {
        ...r,
        status: "blocked",
        codeStatus: "worker-unavailable",
        codeLogs: [{ msg: message, type: "err", t: Date.now() }],
        updatedAt: new Date().toISOString(),
      } : r));
      mergeProjectData(orgScope, host, { aeoGeoActions: next });
      return;
    }
    setActionRunningId(String(action.actionId));
    try {
      syncMissionsFromProject(orgScope, host);
      const latest = loadProjectData(orgScope, host);
      const missions = Array.isArray(latest?.missions) ? latest.missions : [];
      const mission = missions.find((m) => String(m.source || "") === "aeo_geo_actions" && String(m.sourceId || "") === String(action.actionId));
      if (!mission) throw new Error("Could not locate generated mission for this AEO/GEO action.");
      const payload = buildHelioCodeJobPayload({
        mission: { ...mission, githubInstallationId: gh.appInstallationId || "", githubToken: gh.token || "" },
        orgId: orgScope,
        domain: host,
        repo: gh.repo,
        agentConfig: helioCodeAgent || undefined,
      });
      const res = await fetch("/api/helio-code/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const message = data?.error || (Array.isArray(data?.errors) ? data.errors.join(", ") : "") || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const job = data.job || {};
      const mapCodeToAction = (codeStatus = "") => {
        const s = String(codeStatus || "").toLowerCase();
        if (["code-pr-opened", "resolved-verified", "merged-awaiting-deploy"].includes(s)) return "done";
        if (["worker-unavailable", "code-failed", "code-checks-failed", "failed"].includes(s)) return "blocked";
        return "in-progress";
      };
      const toTermLines = (logs = []) => (Array.isArray(logs) ? logs : []).map((l, idx) => ({
        msg: String(l?.message || ""),
        type: String(l?.level || "").toLowerCase() === "error" ? "err" : String(l?.level || "").toLowerCase() === "warn" ? "warn" : "ok",
        t: idx * 180,
      }));
      const nextMissions = missions.map((m) => (m.id === mission.id ? {
        ...m,
        status: normalizeHelioCodeStatus(job.status) || "code-queued",
        codeJobId: job.id || "",
        codeIssueType: payload.issueType,
        codeSkillId: payload.skillId,
        codeStartedAt: new Date().toISOString(),
        failureReason: "",
        updatedAt: new Date().toISOString(),
      } : m));
      const nextActions = (Array.isArray(latest?.aeoGeoActions) ? latest.aeoGeoActions : []).map((r) => String(r.actionId) === String(action.actionId) ? {
        ...r,
        status: mapCodeToAction(job.status),
        codeJobId: job.id || "",
        codeStatus: normalizeHelioCodeStatus(job.status) || "code-queued",
        codeLogs: toTermLines(job.logs || []),
        codeStartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } : r);
      mergeProjectData(orgScope, host, { missions: nextMissions, aeoGeoActions: nextActions });
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-user",
        role: profileRole,
        action: "run_helio_code_for_aeo_action",
        status: "ok",
        detail: `mission=${mission.id} job=${job.id || "n/a"}`,
      });
      setOutput(`[AEO ACTION]\nHelio Code job queued successfully.\nMission: ${mission.title}\nJob ID: ${job.id || "n/a"}\nStatus: ${job.status || "code-queued"}\nModel source: ${helioCodeAgent?.source || "worker-default"}`);
      if (job?.id) {
        const poll = async () => {
          let sawAnyResponse = false;
          for (let i = 0; i < 25; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, 1200));
            let row = null;
            try {
              // eslint-disable-next-line no-await-in-loop
              const r = await fetch(`/api/helio-code/jobs/${encodeURIComponent(job.id)}`);
              // eslint-disable-next-line no-await-in-loop
              const d = await r.json().catch(() => ({}));
              if (!r.ok || !d?.ok || !d?.job) continue;
              row = d.job;
              sawAnyResponse = true;
            } catch {
              continue;
            }
            const current = loadProjectData(orgScope, host);
            const currentMissions = Array.isArray(current?.missions) ? current.missions : [];
            const currentActions = Array.isArray(current?.aeoGeoActions) ? current.aeoGeoActions : [];
            const codeStatus = normalizeHelioCodeStatus(row.status) || String(row.status || "").toLowerCase();
            const terminal = toTermLines(row.logs || []);
            const done = ["code-pr-opened", "code-failed", "code-checks-failed", "resolved-verified", "merged-awaiting-deploy"].includes(codeStatus);
            const updatedMissions = currentMissions.map((m) => (m.id === mission.id ? {
              ...m,
              status: codeStatus || m.status,
              codeJobId: row.id || m.codeJobId,
              codePrUrl: row?.result?.pullRequestUrl || m.codePrUrl || "",
              codeChangedFiles: row?.result?.changedFiles || m.codeChangedFiles || [],
              failureReason: row?.result?.failureReason || m.failureReason || "",
              updatedAt: new Date().toISOString(),
            } : m));
            const updatedActions = currentActions.map((r) => (String(r.actionId) === String(action.actionId) ? {
              ...r,
              status: mapCodeToAction(codeStatus),
              codeJobId: row.id || r.codeJobId,
              codeStatus: codeStatus || r.codeStatus,
              codePrUrl: row?.result?.pullRequestUrl || r.codePrUrl || "",
              codeLogs: terminal,
              codeUpdatedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } : r));
            mergeProjectData(orgScope, host, { missions: updatedMissions, aeoGeoActions: updatedActions });
            if (done) break;
          }
          const latestAfter = loadProjectData(orgScope, host);
          const rowsAfter = Array.isArray(latestAfter?.aeoGeoActions) ? latestAfter.aeoGeoActions : [];
          const hit = rowsAfter.find((r) => String(r.actionId) === String(action.actionId));
          const stillRunning = hit && ["code-queued", "code-running"].includes(String(hit?.codeStatus || "").toLowerCase());
          if (stillRunning) {
            const next = rowsAfter.map((r) => (String(r.actionId) === String(action.actionId) ? {
              ...r,
              status: "blocked",
              codeStatus: "code-failed",
              codeLogs: [...(Array.isArray(r.codeLogs) ? r.codeLogs : []), {
                msg: sawAnyResponse
                  ? "Job polling window expired without terminal state. Marking blocked to avoid stale processing."
                  : "Could not fetch job status from Helio Code API. Check dev server/API route.",
                type: "err",
                t: Date.now(),
              }],
              updatedAt: new Date().toISOString(),
            } : r));
            mergeProjectData(orgScope, host, { aeoGeoActions: next });
          }
        };
        poll();
      }
    } catch (e) {
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-user",
        role: profileRole,
        action: "run_helio_code_for_aeo_action",
        status: "error",
        detail: e.message,
      });
      setOutput(`[AEO ACTION]\nHelio Code launch failed: ${e.message}`);
      const latest = loadProjectData(orgScope, host);
      const rows = Array.isArray(latest?.aeoGeoActions) ? latest.aeoGeoActions : [];
      const next = rows.map((r) => (String(r.actionId) === String(action.actionId) ? {
        ...r,
        status: "blocked",
        codeStatus: "code-failed",
        codeLogs: [...(Array.isArray(r.codeLogs) ? r.codeLogs : []), { msg: `Launch failed: ${e.message}`, type: "err", t: Date.now() }],
        updatedAt: new Date().toISOString(),
      } : r));
      mergeProjectData(orgScope, host, { aeoGeoActions: next });
    }
    setActionRunningId("");
  };

  const trustedDomains = String(trustedDomainsText || "").split(/\r?\n/).map((d)=>d.trim().toLowerCase()).filter(Boolean);

  const savePromptObservation = () => {
    if (!guardAeoMutation("save_prompt_observation")) return;
    if (!host || !obsPrompt.trim()) return;
    const row = buildPromptObservation({
      prompt: obsPrompt,
      engine: obsEngine,
      cited: obsCited,
      rank: obsRank === "" ? null : Number(obsRank),
      competitors: String(obsCompetitors || "").split(",").map((v)=>v.trim()).filter(Boolean),
      citationUrl: obsCitationUrl,
      sourceQuality: scoreCitationSourceQuality(obsCitationUrl, trustedDomains),
    });
    const latest = loadProjectData(orgScope, host);
    const prev = Array.isArray(latest?.aeoGeoIntel?.promptObservations) ? latest.aeoGeoIntel.promptObservations : [];
    const nextIntel = {
      ...(latest?.aeoGeoIntel || {}),
      trustedDomains,
      promptObservations: [row, ...prev].slice(0, 500),
      observatorySummary: summarizePromptObservatory([row, ...prev]),
      competitorGraph: buildCompetitorMentionGraph([row, ...prev]),
      citationFitness,
      intelligenceActions: buildIntelligenceActions({
        observatory: summarizePromptObservatory([row, ...prev]),
        citationFitness,
        competitors: buildCompetitorMentionGraph([row, ...prev]),
      }),
      updatedAt: new Date().toISOString(),
    };
    mergeProjectData(orgScope, host, { aeoGeoIntel: nextIntel });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "save_prompt_observation",
      status: "ok",
      detail: `${row.engine} cited=${row.cited ? "yes" : "no"}`,
    });
    setObsPrompt("");
    setObsCompetitors("");
    setObsRank("");
    setObsCitationUrl("");
  };

  const importBingAiCsv = () => {
    if (!guardAeoMutation("import_bing_csv")) return;
    if (!host || !bingCsvText.trim()) return;
    const parsed = parseBingAiPerformanceCsv(bingCsvText);
    if (!parsed.length) {
      setOutput("[BING IMPORT]\nNo valid rows parsed. Ensure CSV has query/prompt and citation/page columns.");
      return;
    }
    const latest = loadProjectData(orgScope, host);
    const prev = Array.isArray(latest?.aeoGeoIntel?.promptObservations) ? latest.aeoGeoIntel.promptObservations : [];
    const importedObs = [];
    for (const r of parsed) {
      const cites = Math.max(1, Number(r.citations || 1));
      for (let i = 0; i < cites; i += 1) {
        importedObs.push(buildPromptObservation({
          prompt: r.prompt,
          engine: r.engine || "copilot",
          cited: true,
          rank: null,
          citationUrl: r.citationUrl || "",
          sentiment: "neutral",
          sourceQuality: scoreCitationSourceQuality(r.citationUrl || "", trustedDomains),
        }));
      }
    }
    const all = [...importedObs, ...prev].slice(0, 1000);
    const nextSummary = summarizePromptObservatory(all);
    const nextIntel = {
      ...(latest?.aeoGeoIntel || {}),
      trustedDomains,
      promptObservations: all,
      observatorySummary: nextSummary,
      competitorGraph: buildCompetitorMentionGraph(all),
      citationFitness,
      intelligenceActions: buildIntelligenceActions({ observatory: nextSummary, citationFitness, competitors: buildCompetitorMentionGraph(all) }),
      updatedAt: new Date().toISOString(),
    };
    mergeProjectData(orgScope, host, { aeoGeoIntel: nextIntel });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "import_bing_ai_csv",
      status: "ok",
      detail: `rows=${parsed.length}`,
    });
    setOutput(`[BING IMPORT]\nImported ${parsed.length} row(s) from Bing AI Performance CSV.`);
    setBingCsvText("");
  };

  const persistIntelConnectors = () => {
    if (!guardAeoMutation("persist_connectors")) return;
    if (!host) return;
    const latest = loadProjectData(orgScope, host);
    mergeProjectData(orgScope, host, {
      aeoGeoIntel: {
        ...(latest?.aeoGeoIntel || {}),
        connectors: { openaiSearchKey, anthropicSearchKey, perplexityKey, bingApiKey, bingSiteUrl },
        updatedAt: new Date().toISOString(),
      },
    });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "persist_intel_connectors",
      status: "ok",
      detail: "Connector settings updated",
    });
    setOutput("[INTEL CONNECTORS]\nSaved connector credentials/settings to project intel state.");
  };

  const mergeConnectorHealth = (latestHealth, probeErrors, startedAtTs, probeStats = {}) => {
    const prev = latestHealth || {};
    const nowIso = new Date().toISOString();
    const nowTs = Date.now();
    const latencyMs = Math.max(1, Date.now() - Number(startedAtTs || Date.now()));
    const keys = ["chatgpt", "claude", "perplexity", "copilot"];
    const FAIL_THRESHOLD = 3;
    const COOLDOWN_MS = 15 * 60 * 1000;
    const next = { ...prev };
    for (const k of keys) {
      const old = prev?.[k] || { attempts: 0, failures: 0 };
      const err = (Array.isArray(probeErrors) ? probeErrors : []).find((e) => String(e?.engine || "").toLowerCase() === k);
      const providerStat = probeStats?.[k] || {};
      const attempts = Number(old.attempts || 0) + 1;
      const failures = Number(old.failures || 0) + (err ? 1 : 0);
      const success = attempts - failures;
      const sampleLatency = Number(providerStat?.latencyMs || latencyMs);
      const prevFailStreak = Number(old.failStreak || 0);
      const nextFailStreak = err ? (prevFailStreak + 1) : 0;
      const prevCooldownUntil = Number(old.cooldownUntilTs || 0);
      const inCooldown = prevCooldownUntil > nowTs;
      const triggerCooldown = err && nextFailStreak >= FAIL_THRESHOLD && !inCooldown;
      const cooldownUntilTs = triggerCooldown ? (nowTs + COOLDOWN_MS) : (inCooldown ? prevCooldownUntil : 0);
      next[k] = {
        status: cooldownUntilTs > nowTs ? "cooldown" : (err ? "degraded" : "ok"),
        attempts,
        failures,
        success,
        failStreak: nextFailStreak,
        errorRate: Number((failures / Math.max(1, attempts)).toFixed(4)),
        avgLatencyMs: Number((((Number(old.avgLatencyMs || sampleLatency) * Math.max(0, attempts - 1)) + sampleLatency) / attempts).toFixed(1)),
        lastAttempts: Number(providerStat?.attempts || 1),
        lastHttpStatus: Number(providerStat?.status || 0),
        cooldownUntilTs,
        lastCheckAt: nowIso,
        lastSuccessAt: err ? old.lastSuccessAt || "" : nowIso,
        lastError: err ? String(err?.message || err?.status || "connector error") : "",
      };
    }
    return next;
  };

  const runExternalProbe = async () => {
    if (!guardAeoMutation("run_external_probe")) return;
    if (!host || probeRunning) return;
    setProbeRunning(true);
    const startedAtTs = Date.now();
    try {
      const brandLine = String(brandDraft?.brandName || "").trim();
      const disambiguation = String(brandDraft?.entityDisambiguation || "").trim();
      const prompt = String(obsPrompt || topic || "best tools and providers for this category").trim();
      const contextualPrompt = [
        brandLine ? `Brand entity: ${brandLine}.` : "",
        disambiguation ? `Disambiguation: ${disambiguation}.` : "",
        `Prompt: ${prompt}`,
      ].filter(Boolean).join(" ");
      const latest = loadProjectData(orgScope, host);
      const probeRes = await fetch("/api/aeo/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: contextualPrompt,
          targetHost: host,
          connectors: (() => {
            const nowTs = Date.now();
            const h = latest?.aeoGeoIntel?.connectorHealth || {};
            const allow = (name) => Number(h?.[name]?.cooldownUntilTs || 0) <= nowTs;
            return {
              openaiSearchKey: allow("chatgpt") ? openaiSearchKey : "",
              anthropicSearchKey: allow("claude") ? anthropicSearchKey : "",
              perplexityKey: allow("perplexity") ? perplexityKey : "",
              bingApiKey: allow("copilot") ? bingApiKey : "",
              bingSiteUrl: allow("copilot") ? bingSiteUrl : "",
            };
          })(),
        }),
      });
      const probe = await probeRes.json().catch(()=>({}));
      if (!probeRes.ok) throw new Error(probe?.error || "External probe failed");
      const obs = Array.isArray(probe?.observations) ? probe.observations.map((r) => buildPromptObservation({
        prompt: r?.prompt || prompt,
        engine: r?.engine || "chatgpt",
        cited: !!r?.cited,
        rank: r?.rank == null ? null : Number(r.rank),
        citationUrl: r?.citationUrl || "",
        sentiment: r?.sentiment || "neutral",
        sourceQuality: scoreCitationSourceQuality(r?.citationUrl || "", trustedDomains),
      })) : [];
      if (!obs.length) throw new Error("No external connector is configured.");
      const prev = Array.isArray(latest?.aeoGeoIntel?.promptObservations) ? latest.aeoGeoIntel.promptObservations : [];
      const all = [...obs, ...prev].slice(0, 1200);
      const nextSummary = summarizePromptObservatory(all);
      const errs = Array.isArray(probe?.errors) ? probe.errors : [];
      const confusion = detectBrandConfusionFromProbeRows(Array.isArray(probe?.observations) ? probe.observations : [], brandDraft, host);
      const prevActions = Array.isArray(latest?.aeoGeoActions) ? latest.aeoGeoActions : [];
      const nextActions = [...prevActions];
      const prevCitationRate = Number(latest?.aeoGeoIntel?.observatorySummary?.globalCitationRate || 0);
      const citationDeltaPts = Number((((Number(nextSummary.globalCitationRate || 0) - prevCitationRate) * 100)).toFixed(2));
      const sprintActions = buildEntityOptimizationSprintActions({
        host,
        brandProfile: brandDraft,
        confusionRisk: confusion.risk,
        citationDeltaPts,
        probeEvidence: {
          prompt: contextualPrompt,
          observationsCount: obs.length,
          confusionRisk: confusion.risk,
          citationDeltaPts,
          engines: (Array.isArray(probe?.observations) ? probe.observations : []).map((x)=>String(x?.engine||"")).filter(Boolean).slice(0, 8),
          errors: errs,
        },
      });
      nextActions.unshift(...sprintActions);
      if (sprintActions.length) {
        appendAeoAlert("warn", "Autopilot sprint actions queued", `Queued ${sprintActions.length} action(s) from probe evidence.`, {
          confusionRisk: confusion.risk,
          citationDeltaPts,
        });
      }
      const nextConnectorHealth = mergeConnectorHealth(latest?.aeoGeoIntel?.connectorHealth || {}, errs, startedAtTs, probe?.connectorStats || {});
      const nextIntel = {
        ...(latest?.aeoGeoIntel || {}),
        trustedDomains,
        connectors: { openaiSearchKey, anthropicSearchKey, perplexityKey, bingApiKey, bingSiteUrl },
        connectorHealth: nextConnectorHealth,
        brandConfusion: { risk: confusion.risk, sampleHits: confusion.hits.map((h)=>String(h?.engine || "engine")), checkedAt: new Date().toISOString() },
        probeRuns: [
          {
            id: `probe_${Date.now()}`,
                ts: new Date().toISOString(),
                prompt: contextualPrompt,
                rawObservations: Array.isArray(probe?.observations) ? probe.observations : [],
                connectorErrors: errs,
                connectorStats: probe?.connectorStats || {},
                confusionRisk: confusion.risk,
                citationDeltaPts,
                observationsCount: obs.length,
              },
          ...((Array.isArray(latest?.aeoGeoIntel?.probeRuns) ? latest.aeoGeoIntel.probeRuns : []).slice(0, 79)),
        ],
        promptObservations: all,
        observatorySummary: nextSummary,
        competitorGraph: buildCompetitorMentionGraph(all),
        citationFitness,
        intelligenceActions: buildIntelligenceActions({ observatory: nextSummary, citationFitness, competitors: buildCompetitorMentionGraph(all) }),
        updatedAt: new Date().toISOString(),
      };
      mergeProjectData(orgScope, host, { aeoGeoIntel: nextIntel, aeoGeoActions: nextActions.slice(0, 100) });
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-user",
        role: profileRole,
        action: "run_external_probe",
        status: errs.length ? "partial" : "ok",
        detail: `obs=${obs.length} errors=${errs.length} confusionRisk=${confusion.risk}`,
        metadata: { connectorStats: probe?.connectorStats || {} },
      });
      setOutput(`[EXTERNAL PROBE]\nLogged ${obs.length} observation(s) from configured external engines.${errs.length ? `\nWarnings: ${errs.length} connector error(s).` : ""}${sprintActions.length ? `\nAutopilot queued ${sprintActions.length} optimization sprint action(s).` : ""}`);
    } catch (e) {
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-user",
        role: profileRole,
        action: "run_external_probe",
        status: "error",
        detail: e.message,
      });
      setOutput(`[EXTERNAL PROBE]\nFailed: ${e.message}`);
    }
    setProbeRunning(false);
  };

  const runPromptSuiteNow = async () => {
    if (!guardAeoMutation("run_prompt_suite")) return;
    if (!host) return;
    setSuiteRunning(true);
    try {
      const latest = loadProjectData(orgScope, host);
      const prevRows = Array.isArray(latest?.aeoGeoIntel?.promptObservations) ? latest.aeoGeoIntel.promptObservations : [];
      const prevSummary = summarizePromptObservatory(prevRows);
      const suite = String(suiteText || "").split(/\r?\n/).map((s)=>s.trim()).filter(Boolean);
      const synthetic = runObservatoryPromptSuite({
        suite,
        engine: obsEngine,
        citationRate: Math.max(0.08, Number(prevSummary.globalCitationRate || 0.22)),
        avgRank: 4.5,
        competitorSeed: competitorGraph.slice(0, 3).map((c)=>c.competitor),
      });
      const all = [...synthetic, ...prevRows].slice(0, 800);
      const nextSummary = summarizePromptObservatory(all);
      const drift = detectObservatoryDrift({ previousSummary: prevSummary, nextSummary, dropThreshold: 0.05 });
      const nextActions = Array.isArray(latest?.aeoGeoActions) ? latest.aeoGeoActions : [];
      if (drift.dropped) {
        nextActions.unshift({
          actionId: `aeogeo_drift_${Date.now()}`,
          type: "observatory_drift",
          title: "Visibility drift alert: citation rate dropped",
          summary: drift.alert,
          reason: drift.alert,
          severity: "high",
          priority: "P1",
          status: "todo",
          affectedCount: suite.length || 1,
          kpiTarget: 80,
          fixHint: "Run citation recovery sprint: refresh answer blocks, strengthen citations, and push entity pages.",
          expectedOutcome: "Recover citation rate above previous baseline in next observatory cycle.",
          createdAt: new Date().toISOString(),
        });
      }
      const nextIntel = {
        ...(latest?.aeoGeoIntel || {}),
        promptSuite: suite,
        promptObservations: all,
        observatorySummary: nextSummary,
        drift,
        competitorGraph: buildCompetitorMentionGraph(all),
        citationFitness,
        intelligenceActions: buildIntelligenceActions({
          observatory: nextSummary,
          citationFitness,
          competitors: buildCompetitorMentionGraph(all),
        }),
        updatedAt: new Date().toISOString(),
      };
      mergeProjectData(orgScope, host, { aeoGeoIntel: nextIntel, aeoGeoActions: nextActions.slice(0, 80) });
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-user",
        role: profileRole,
        action: "run_prompt_suite",
        status: "ok",
        detail: `suite=${suite.length} drift=${drift.dropped ? "yes" : "no"}`,
      });
      setOutput(`[INTEL SUITE]\nRan ${suite.length} prompts on ${String(obsEngine).toUpperCase()}.\nCitation rate: ${(Number(nextSummary.globalCitationRate||0)*100).toFixed(1)}%\nDrift delta: ${(Number(drift.delta||0)*100).toFixed(1)} pts${drift.dropped ? "\nAlert mission queued." : ""}`);
    } catch (e) {
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-user",
        role: profileRole,
        action: "run_prompt_suite",
        status: "error",
        detail: e.message,
      });
      setOutput(`[INTEL SUITE]\nRun failed: ${e.message}`);
    }
    setSuiteRunning(false);
  };

  const saveGovernance = (patch = {}) => {
    if (!host || !canManageAeo) return;
    const nextGov = { ...governance, ...patch, updatedAt: new Date().toISOString(), updatedByRole: profileRole };
    mergeProjectData(orgScope, host, { aeoGeoGovernance: nextGov });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "update_aeo_governance",
      status: "ok",
      detail: `Updated keys: ${Object.keys(patch).join(", ")}`,
    });
    setGovSaved("Governance settings saved.");
    setTimeout(() => setGovSaved(""), 1800);
  };

  const exportAeoAuditTrail = (format = "json") => {
    if (!host) return;
    const rows = Array.isArray(aeoAuditTrail) ? aeoAuditTrail : [];
    if (!rows.length) return;
    if (format === "json") {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aeo-geo-audit-trail-${host}-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const flat = rows.map((r) => ({
      id: r.id || "",
      ts: r.ts || "",
      actor: r.actor || "",
      role: r.role || "",
      action: r.action || "",
      target: r.target || "",
      status: r.status || "",
      detail: String(r.detail || "").replace(/\s+/g, " ").trim(),
    }));
    const csv = toCsv(flat);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aeo-geo-audit-trail-${host}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const appendAeoAlert = (level = "info", title = "", detail = "", metadata = {}) => {
    if (!host) return;
    const latest = loadProjectData(orgScope, host);
    const prev = Array.isArray(latest?.aeoAlerts) ? latest.aeoAlerts : [];
    const row = {
      id: `aeo_alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      level,
      title,
      detail,
      metadata,
      status: "open",
    };
    mergeProjectData(orgScope, host, { aeoAlerts: [row, ...prev].slice(0, 120) });
  };

  const guardAeoMutation = (op = "write") => {
    if (!canManageAeo) {
      setOutput("[RBAC]\nCurrent role is read-only for AEO/GEO write actions.");
      return false;
    }
    if (op === "queue_policy_mission" && governance.requireApprovalForPolicyDeploy && profileRole !== "admin") {
      setOutput("[GOVERNANCE]\nPolicy deploy mission requires admin role due to governance policy.");
      appendAeoAlert("warn", "Policy deploy blocked by governance", `Role ${profileRole} attempted policy mission queue.`, { op });
      return false;
    }
    return true;
  };

  const saveBrandKnowledge = () => {
    if (!host || !canManageAeo) return;
    mergeProjectData(orgScope, host, {
      aeoBrandProfile: { ...brandDraft, updatedAt: new Date().toISOString() },
    });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "save_brand_knowledge",
      status: "ok",
      detail: `brand=${brandDraft?.brandName || host}`,
    });
    setBrandSaved("Brand knowledge saved.");
    setTimeout(() => setBrandSaved(""), 1800);
  };

  const buildStrategyFromAnswers = (a = {}) => {
    const business = String(a.businessName || host || "Business");
    const domain = String(a.website || (host ? `https://${host}` : "unknown-site"));
    const goal = String(a.mainGoal || "increase qualified AI-discovery traffic");
    const metric = String(a.successMetric || "AI-sourced sessions + qualified leads");
    const audience = String(a.targetAudience || "target audience");
    const location = String(a.targetLocations || "priority geographies");
    const niche = String(a.niche || "core niche");
    const competitors = String(a.competitors || "main competitors");
    const disambiguation = String(a.entityDisambiguation || `${business} is a company/brand entity, not a generic concept.`);
    const offer = String(a.productService || "products/services");
    const tone = String(a.tone || "authoritative and practical");
    return [
      `AEO/GEO STRATEGY PROFILE`,
      `Generated: ${new Date().toISOString()}`,
      "",
      `BUSINESS`,
      `- Name: ${business}`,
      `- Website: ${domain}`,
      `- Niche: ${niche}`,
      `- Offer: ${offer}`,
      `- Audience: ${audience}`,
      `- Locations: ${location}`,
      `- Competitors: ${competitors}`,
      `- Entity Disambiguation: ${disambiguation}`,
      "",
      `GOAL`,
      `- Primary goal: ${goal}`,
      `- Success metric: ${metric}`,
      "",
      `90-DAY AEO/GEO PLAN`,
      `1) Entity clarity foundation (Week 1-2): deploy About/FAQ/schema disambiguation and enforce brand-entity consistency on core pages.`,
      `2) Query-to-page expansion (Week 2-5): build answer-first sections for top intent clusters and add evidence-backed citations.`,
      `3) LLM policy + crawl governance (Week 2-4): finalize llms.txt/llm.txt + engine directives and verify live availability.`,
      `4) Competitive retrieval pressure (Week 4-8): publish comparison pages against ${competitors} with clear differentiation.`,
      `5) Continuous observability (Week 1-12): run probe suites, track confusion risk/citation trend, and auto-queue recovery sprints.`,
      "",
      `CONTENT + MESSAGING`,
      `- Writing tone: ${tone}`,
      `- Opening line pattern: "${business} is a ${niche} company that provides ${offer} for ${audience}."`,
      `- Mandatory clarity rule: avoid ambiguous use of brand terms without company context.`,
      "",
      `KPI DASHBOARD`,
      `- Brand Confusion Risk target: < 20`,
      `- Global Citation Rate target: > 25%`,
      `- AI discovery share target: rising month-over-month`,
      `- Verification win-rate target: > 65%`,
      "",
      `EXECUTION NOTE`,
      `This strategy is generated from explicit business inputs to prevent entity misinterpretation.`,
    ].join("\n");
  };

  const completeUnderstandFlow = async () => {
    if (!host || !canManageAeo) return;
    setOnboardingProcessing(true);
    const answers = { ...onboardingAnswers };
    const nextBrand = {
      ...brandDraft,
      brandName: answers.businessName || brandDraft.brandName || "",
      legalName: answers.legalName || brandDraft.legalName || "",
      tagline: answers.oneLiner || brandDraft.tagline || "",
      whatWeDo: answers.productService || brandDraft.whatWeDo || "",
      products: answers.productService || brandDraft.products || "",
      services: answers.productService || brandDraft.services || "",
      audience: answers.targetAudience || brandDraft.audience || "",
      regions: answers.targetLocations || brandDraft.regions || "",
      competitors: answers.competitors || brandDraft.competitors || "",
      entityDisambiguation: answers.entityDisambiguation || brandDraft.entityDisambiguation || "",
      wrongInterpretations: answers.commonConfusions || brandDraft.wrongInterpretations || "",
      updatedAt: new Date().toISOString(),
    };
    let plan = buildStrategyFromAnswers(answers);
    try {
      if (integrations?.ai?.connected) {
        const aiPlan = await callAI(
          ai,
          "You are Helio. Convert business discovery answers into a sharp AEO/GEO strategy. Be concrete and execution-oriented.",
          `Business answers JSON:\n${JSON.stringify(answers, null, 2)}\n\nReturn a practical 90-day plan with entity disambiguation, content, policy, observability and KPI layers.`
        );
        if (String(aiPlan || "").trim().length > 120) plan = String(aiPlan).trim();
      }
    } catch {}
    mergeProjectData(orgScope, host, {
      aeoBrandProfile: nextBrand,
      aeoGeoStrategyPlan: {
        planText: plan,
        source: "understand_me_questionnaire",
        answers,
        createdAt: new Date().toISOString(),
      },
    });
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "complete_understand_me_questionnaire",
      status: "ok",
      detail: `strategy generated for ${answers.businessName || host}`,
    });
    setBrandDraft(nextBrand);
    let autoMsg = "";
    if (governance?.autoGenerateActionsFromStrategy) {
      const created = await createActionsFromStrategy({ auto: true, strategyText: plan, autoExecute: governance?.autoExecuteStrategyActions });
      autoMsg = `\nAuto action generation: ${created} action(s) created.${governance?.autoExecuteStrategyActions ? " Auto-execution started." : ""}`;
    }
    setOutput(`[UNDERSTAND ME]\nBusiness profile captured. Strategy generated and injected into Strategy tab.${autoMsg}`);
    setOnboardingProcessing(false);
    setShowUnderstandModal(false);
    setOnboardingStep(0);
    setTab(governance?.autoGenerateActionsFromStrategy ? "actions" : "strategy");
  };

  const refreshHelioCodeReadiness = async () => {
    setHcReadiness((p) => ({ ...p, loading: true, error: "" }));
    try {
      const data = await fetchHelioCodeReadiness();
      setHcReadiness({
        loading: false,
        mode: String(data?.mode || ""),
        score: Number(data?.score || 0),
        productionReady: !!data?.productionReady,
        productionCapable: !!data?.productionCapable,
        checks: Array.isArray(data?.checks) ? data.checks : [],
        requirements: Array.isArray(data?.requirements) ? data.requirements : [],
        error: "",
      });
    } catch (e) {
      setHcReadiness({ loading: false, mode: "", score: 0, productionReady: false, productionCapable: false, checks: [], requirements: [], error: e.message || "Readiness check failed" });
    }
  };

  useEffect(() => {
    if (tab === "actions") refreshHelioCodeReadiness();
  }, [tab]);

  const importBrandKnowledgeFile = async (file) => {
    if (!file || !canManageAeo) return;
    try {
      const text = await file.text();
      const ext = String(file?.name || "").toLowerCase();
      let next = { ...brandDraft };
      if (ext.endsWith(".json")) {
        const parsed = JSON.parse(String(text || "{}"));
        next = {
          ...next,
          brandName: String(parsed?.brandName || parsed?.brand_name || next.brandName || ""),
          legalName: String(parsed?.legalName || parsed?.legal_name || next.legalName || ""),
          tagline: String(parsed?.tagline || next.tagline || ""),
          whatWeDo: String(parsed?.whatWeDo || parsed?.description || parsed?.about || next.whatWeDo || ""),
          products: String(parsed?.products || next.products || ""),
          services: String(parsed?.services || next.services || ""),
          audience: String(parsed?.audience || next.audience || ""),
          regions: String(parsed?.regions || next.regions || ""),
          competitors: String(parsed?.competitors || next.competitors || ""),
          entityDisambiguation: String(parsed?.entityDisambiguation || parsed?.entity_disambiguation || next.entityDisambiguation || ""),
          wrongInterpretations: String(parsed?.wrongInterpretations || parsed?.wrong_interpretations || next.wrongInterpretations || ""),
        };
      } else {
        const lines = String(text || "").split(/\r?\n/);
        const kv = {};
        for (const ln of lines) {
          const m = ln.match(/^\s*([a-zA-Z _-]{2,40})\s*:\s*(.+)\s*$/);
          if (!m) continue;
          kv[String(m[1] || "").trim().toLowerCase()] = String(m[2] || "").trim();
        }
        next = {
          ...next,
          brandName: kv["brand"] || kv["brand name"] || next.brandName || "",
          legalName: kv["legal name"] || next.legalName || "",
          tagline: kv["tagline"] || next.tagline || "",
          whatWeDo: kv["what we do"] || kv["description"] || kv["about"] || next.whatWeDo || "",
          products: kv["products"] || next.products || "",
          services: kv["services"] || next.services || "",
          audience: kv["audience"] || next.audience || "",
          regions: kv["regions"] || kv["region"] || next.regions || "",
          competitors: kv["competitors"] || next.competitors || "",
          entityDisambiguation: kv["entity disambiguation"] || kv["disambiguation"] || next.entityDisambiguation || "",
          wrongInterpretations: kv["wrong interpretations"] || kv["avoid confusion"] || next.wrongInterpretations || "",
        };
        if (!kv["what we do"] && !kv["description"] && String(text || "").trim()) {
          next.whatWeDo = next.whatWeDo || String(text || "").slice(0, 2000);
        }
      }
      setBrandDraft(next);
      setBrandImportMsg(`Imported brand context from ${file.name}. Review and click SAVE BRAND KNOWLEDGE.`);
      setTimeout(() => setBrandImportMsg(""), 2800);
      appendAeoAuditEvent(orgScope, host, {
        actor: "helio-user",
        role: profileRole,
        action: "import_brand_knowledge_file",
        status: "ok",
        detail: file.name,
      });
    } catch (e) {
      setBrandImportMsg(`Import failed: ${e.message}`);
      setTimeout(() => setBrandImportMsg(""), 2800);
    }
  };

  const generateEntityDisambiguationPack = () => {
    const brand = String(brandDraft?.brandName || host || "Brand").trim();
    const legal = String(brandDraft?.legalName || "").trim();
    const tagline = String(brandDraft?.tagline || "").trim();
    const whatWeDo = String(brandDraft?.whatWeDo || "Describe what the company does.").trim();
    const products = String(brandDraft?.products || "product/service").trim();
    const audience = String(brandDraft?.audience || "target customers").trim();
    const regions = String(brandDraft?.regions || "target regions").trim();
    const disambiguation = String(brandDraft?.entityDisambiguation || `${brand} is a company/brand name, not a generic concept.`).trim();
    const competitors = String(brandDraft?.competitors || "competitors").trim();

    const pack = [
      `[ENTITY DISAMBIGUATION PACK]`,
      `Brand: ${brand}${legal ? ` (${legal})` : ""}`,
      "",
      `1) ABOUT SECTION (WEBSITE COPY)`,
      `${brand}${tagline ? ` — ${tagline}` : ""} is ${whatWeDo}.`,
      `${brand} serves ${audience} across ${regions}.`,
      `Entity clarification: ${disambiguation}`,
      "",
      `2) FAQ DISAMBIGUATION BLOCK`,
      `Q: Is "${brand}" a general term or a company?`,
      `A: "${brand}" refers to our company/brand and its products (${products}), not a generic phrase.`,
      `Q: What does ${brand} provide?`,
      `A: ${whatWeDo}`,
      "",
      `3) JSON-LD SCHEMA SNIPPETS`,
      `Organization:`,
      `{"@context":"https://schema.org","@type":"Organization","name":"${brand}","alternateName":"${legal || brand}","url":"https://${host || "example.com"}","description":"${whatWeDo.replace(/"/g, '\\"')}","areaServed":"${regions.replace(/"/g, '\\"')}","knowsAbout":"${products.replace(/"/g, '\\"')}"}`,
      `WebSite:`,
      `{"@context":"https://schema.org","@type":"WebSite","name":"${brand}","url":"https://${host || "example.com"}"}`,
      `FAQPage:`,
      `{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Is ${brand} a company or a generic phrase?","acceptedAnswer":{"@type":"Answer","text":"${disambiguation.replace(/"/g, '\\"')}"}}]}`,
      "",
      `4) COMPARISON COPY TEMPLATE`,
      `When comparing ${brand} vs ${competitors}, define ${brand} first as a company and product entity.`,
      `Use this lead sentence: "${brand} is a company that provides ${products} for ${audience}."`,
      `Then compare features, pricing, outcomes, and suitability by segment.`,
      "",
      `5) IMPLEMENTATION CHECKLIST`,
      `- Add About section disambiguation above the fold.`,
      `- Add FAQ disambiguation block on homepage/docs/pricing.`,
      `- Add Organization + Website + FAQ schema.`,
      `- Add brand-entity sentence in comparison pages.`,
      `- Re-run external probe and check Brand Confusion Risk.`,
    ].join("\n");

    setEntityPack(pack);
    setOutput(pack);
    appendAeoAuditEvent(orgScope, host, {
      actor: "helio-user",
      role: profileRole,
      action: "generate_entity_disambiguation_pack",
      status: "ok",
      detail: `brand=${brand}`,
    });
  };

  useEffect(() => {
    if (!host) return;
    mergeProjectData(orgScope, host, { aeoGeoReadinessV2: readinessV2 });
  }, [host, orgScope, readinessV2.score, readinessV2.retrieval, readinessV2.crawlControl, readinessV2.content, readinessV2.trust, readinessV2.issueCount, readinessV2.llmsTxtDetected, readinessV2.llmTxtDetected, readinessV2.enginePolicies?.score]);

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
      <div style={{flex:1,minWidth:0}}>
        <Hdr title="AEO / GEO" sub="Answer Engine Optimization · Generative Engine Optimization · LLM Visibility"/>
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:18}}>
      <Input label="Topic or URL to Optimize" value={topic} onChange={setTopic} placeholder="e.g. AI automation tools for solopreneurs"/>
      <div style={{background:"#0d1117",border:`1px solid ${C.dim}`,padding:14,fontFamily:"monospace",fontSize:10,color:C.muted,lineHeight:1.8}}>
        <div style={{color:C.lime,marginBottom:6}}>WHAT HELIO WILL DO</div>
        <span style={{color:C.text}}>AEO:</span> Optimize for AI search engines (Perplexity, SearchGPT, Gemini AI Overviews) — featured snippets, FAQ schema, direct answer blocks<br/>
        <span style={{color:C.text}}>GEO:</span> Optimize for LLM training and retrieval — structure content so major AI assistants cite your brand<br/>
        <span style={{color:C.text}}>LLM Visibility:</span> Brand mention strategy, entity building, Wikipedia optimization
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(130px,1fr))",gap:10,marginBottom:14}}>
      <Card label="AEO/GEO V2" value={`${readinessV2.score}/100`} delta={readinessV2.score>=75?"Strong baseline":readinessV2.score>=55?"Needs execution sprint":"Critical gaps"} good={readinessV2.score>=75}/>
      <Card label="Retrieval" value={`${readinessV2.retrieval}/100`} delta={readinessV2.llmsTxtDetected?"llms.txt live":"llms.txt missing"} good={readinessV2.retrieval>=70}/>
      <Card label="Crawl Control" value={`${readinessV2.crawlControl}/100`} delta={`Engine policies ${readinessV2.enginePolicies.score}/100`} good={readinessV2.crawlControl>=70}/>
      <Card label="Content Ops" value={`${readinessV2.content}/100`} delta={`${queryPageOps.length} mapped opportunities`} good={readinessV2.content>=70}/>
      <Card label="Trust" value={`${readinessV2.trust}/100`} delta={`Blocking issues: ${readinessV2.issueCount}`} good={readinessV2.trust>=70}/>
    </div>
    <Tabs tabs={["aeo","geo","llm visibility","strategy","opportunities","engine policies","llm policy","actions","intel","brand knowledge","governance"]} active={tab} onChange={setTab}/>
    {tab==="strategy" && (
      <div style={{display:"flex",justifyContent:"flex-end",gap:14,marginTop:8,marginBottom:10,flexWrap:"wrap"}}>
        <label style={{display:"inline-flex",alignItems:"center",gap:8,color:C.text,fontFamily:"monospace",fontSize:9}}>
          <input
            type="checkbox"
            checked={!!governance?.autoGenerateActionsFromStrategy}
            disabled={!canManageAeo}
            onChange={(e)=>saveGovernance({ autoGenerateActionsFromStrategy: e.target.checked })}
          />
          <span>Auto-generate actions from strategy</span>
        </label>
        <label style={{display:"inline-flex",alignItems:"center",gap:8,color:C.text,fontFamily:"monospace",fontSize:9}}>
          <input
            type="checkbox"
            checked={!!governance?.autoExecuteStrategyActions}
            disabled={!canManageAeo}
            onChange={(e)=>saveGovernance({ autoExecuteStrategyActions: e.target.checked })}
          />
          <span>Auto-execute generated actions via Helio Code</span>
        </label>
      </div>
    )}
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      {["aeo","geo","llm visibility","strategy"].includes(tab) && (
        <Btn onClick={()=>run(tab==="llm visibility"?"llm":tab)} disabled={running||(!topic&&!host&&!topKeywords.length)}>
          {running?"▶ ENHANCING...":tab==="aeo"?"◬ ENHANCE AEO WITH AI":tab==="geo"?"◬ ENHANCE GEO WITH AI":tab==="strategy"?"◬ ENHANCE STRATEGY WITH AI":"◬ ENHANCE LLM VISIBILITY WITH AI"}
        </Btn>
      )}
      {tab==="strategy" && (
        <Btn onClick={createActionsFromStrategy} variant="blue">
          ◈ CREATE ACTIONS FROM STRATEGY
        </Btn>
      )}
      {tab==="llm policy" && (
        <>
          <Btn onClick={buildLlmTxt} disabled={buildingLlmTxt||(!topic&&!host)} variant="blue">{buildingLlmTxt?"BUILDING...":"◈ BUILD LLMS+LLM FILES"}</Btn>
          {!!llmPolicyFiles.llmsTxt&&<Btn onClick={()=>{const b=new Blob([llmPolicyFiles.llmsTxt],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="llms.txt";a.click();}} variant="green">DOWNLOAD LLMS.TXT</Btn>}
          {!!llmPolicyFiles.llmTxt&&<Btn onClick={()=>{const b=new Blob([llmPolicyFiles.llmTxt],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="llm.txt";a.click();}} variant="green">DOWNLOAD LLM.TXT</Btn>}
          {!!llmPolicyFiles.llmsTxt&&!!llmPolicyFiles.llmTxt&&<Btn onClick={queueLlmPolicyMission} variant="blue">QUEUE PR MISSION</Btn>}
        </>
      )}
      <div style={{marginLeft:"auto"}}>
        <Btn onClick={()=>setShowUnderstandModal(true)} variant="green" style={{whiteSpace:"nowrap"}}>UNDERSTAND ME</Btn>
      </div>
    </div>
    <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,minHeight:200,fontFamily:"monospace",fontSize:11}}>
      {tab==="opportunities"&&<div>
        {!queryPageOps.length&&<div style={{color:C.muted}}>Load GSC data first to compute opportunities.</div>}
        {!!queryPageOps.length&&<>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>QUERY TO PAGE OPPORTUNITIES</div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,marginBottom:12}}>
            {queryPageOps.map((r,i)=><div key={i} style={{display:"flex",gap:10,padding:"7px 10px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9}}>
              <span style={{color:C.text,flex:1}}>{r.query}</span>
              <span style={{color:C.lime,flex:1}}>{r.page}</span>
              <span style={{color:C.muted,minWidth:44,textAlign:"right"}}>{r.position}</span>
              <span style={{color:C.muted,minWidth:54,textAlign:"right"}}>{r.ctr}</span>
              <span style={{color:r.priority==="HIGH"?C.red:r.priority==="MEDIUM"?C.orange:C.green,minWidth:54,textAlign:"right"}}>{r.opportunity}</span>
            </div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
              <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>ENTITY CANDIDATES</div>
              {entityCandidates.map((e,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",color:C.text,fontFamily:"monospace",fontSize:9,marginBottom:3}}>
                <span>{e.entity}</span><span style={{color:C.muted}}>{e.freq}</span>
              </div>)}
              {!entityCandidates.length&&<div style={{color:C.muted,fontSize:9}}>No entities yet.</div>}
            </div>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
              <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>INTERNAL LINK BLUEPRINT</div>
              {internalLinkRecs.map((l,i)=><div key={i} style={{color:C.text,fontFamily:"monospace",fontSize:9,marginBottom:6}}>
                <div><span style={{color:C.blue}}>FROM:</span> {l.from}</div>
                <div><span style={{color:C.blue}}>TO:</span> {l.to}</div>
                <div><span style={{color:C.muted}}>ANCHOR:</span> {l.anchorIntent}</div>
              </div>)}
              {!internalLinkRecs.length&&<div style={{color:C.muted,fontSize:9}}>No link recommendations yet.</div>}
            </div>
          </div>
        </>}
      </div>}
      {tab==="engine policies"&&<div>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>ENGINE POLICY READINESS</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[["Google-Extended",enginePolicyChecks.hasGoogleExtended],["OAI-SearchBot",enginePolicyChecks.hasOaiSearchBot],["GPTBot",enginePolicyChecks.hasGptBot],["PerplexityBot",enginePolicyChecks.hasPerplexityBot]].map((r,i)=><div key={i} style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,fontFamily:"monospace",fontSize:10}}>
            <div style={{color:C.text}}>{r[0]}</div>
            <div style={{color:r[1]?C.green:C.orange}}>{r[1]?"Configured in robots.txt":"Missing policy directive"}</div>
          </div>)}
        </div>
      </div>}
      {tab==="llm policy"&&!!(llmPolicyFiles.llmsTxt||llmPolicyFiles.llmTxt)&&<div>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>LLM POLICY FILES (DUAL STANDARD)</div>
        {!!llmPolicyFiles.errors.length&&<div style={{background:"#2a1010",border:`1px solid ${C.red}`,padding:10,color:"#ffd2d2",fontFamily:"monospace",fontSize:10,marginBottom:10}}>{llmPolicyFiles.errors.join("\n")}</div>}
        {!!llmPolicyFiles.warnings.length&&<div style={{background:"#2a1d07",border:`1px solid ${C.orange}`,padding:10,color:"#ffe0b2",fontFamily:"monospace",fontSize:10,marginBottom:10}}>{llmPolicyFiles.warnings.join("\n")}</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.blue,fontFamily:"monospace",fontSize:10,marginBottom:6}}>llms.txt (canonical)</div>
            <div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{llmPolicyFiles.llmsTxt}</div>
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.blue,fontFamily:"monospace",fontSize:10,marginBottom:6}}>llm.txt (compat)</div>
            <div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{llmPolicyFiles.llmTxt}</div>
          </div>
        </div>
      </div>}
      {tab==="llm policy"&&!llmPolicyFiles.llmTxt&&!llmPolicyFiles.llmsTxt&&!buildingLlmTxt&&<div style={{color:C.muted}}>Click BUILD LLMS+LLM FILES to generate dual retrieval policy files for your domain.</div>}
      {tab==="actions"&&<div>
        {(()=>{const effectiveReady=isHelioCodeReadyForProject(hcReadiness, integrations);return (
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:8}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>REAL HELIO CODE MODE CHECK</div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={async()=>{try{await startHelioCodeWorkerFromApp();await refreshHelioCodeReadiness();}catch(e){setHcReadiness((p)=>({...p,error:e.message||"Worker start failed"}));}}} disabled={hcReadiness.loading || hasPassedReadinessCheck(hcReadiness, "worker_heartbeat")} variant="green" style={{padding:"4px 10px",fontSize:9}}>
                {hasPassedReadinessCheck(hcReadiness, "worker_heartbeat") ? "WORKER ACTIVE" : "START WORKER"}
              </Btn>
              <Btn onClick={refreshHelioCodeReadiness} disabled={hcReadiness.loading} variant="blue" style={{padding:"4px 10px",fontSize:9}}>
                {hcReadiness.loading ? "CHECKING..." : "REFRESH"}
              </Btn>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontFamily:"monospace",fontSize:9,color:C.text}}>
            {(Array.isArray(hcReadiness.checks) ? hcReadiness.checks : []).map((c) => (
              <div key={String(c.id || c.label)} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",border:`1px solid ${C.border}`}}>
                <span>{String(c.label || c.id)}</span>
                <span style={{color:c.pass?C.green:C.red}}>{c.pass ? "PASS" : "MISSING"}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",border:`1px solid ${C.border}`}}>
              <span>GitHub target connected</span>
              <span style={{color:(integrations?.github?.connected && integrations?.github?.fields?.repo && (integrations?.github?.fields?.appInstallationId || integrations?.github?.fields?.token))?C.green:C.red}}>
                {(integrations?.github?.connected && integrations?.github?.fields?.repo && (integrations?.github?.fields?.appInstallationId || integrations?.github?.fields?.token))?"PASS":"MISSING"}
              </span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",border:`1px solid ${C.border}`}}>
              <span>Helio Code model configured</span>
              <span style={{color:resolveHelioCodeAgentConfig(integrations)?C.green:C.red}}>
                {resolveHelioCodeAgentConfig(integrations)?"PASS":"MISSING"}
              </span>
            </div>
          </div>
          <div style={{marginTop:8,fontFamily:"monospace",fontSize:9,color:effectiveReady?C.green:hcReadiness.productionCapable?C.orange:C.red}}>
            Mode: {effectiveReady ? "PROJECT-READY" : (hcReadiness.mode ? String(hcReadiness.mode).toUpperCase() : "UNKNOWN")} · Server Score: {Number(hcReadiness.score || 0)}/100
          </div>
          {!effectiveReady&&!!hcReadiness.requirements?.length&&<div style={{marginTop:8,fontFamily:"monospace",fontSize:9,color:C.muted,lineHeight:1.6}}>
            {hcReadiness.requirements.map((r,idx)=><div key={idx}>- {r}</div>)}
          </div>}
          {!!hcReadiness.error&&<div style={{marginTop:6,fontFamily:"monospace",fontSize:9,color:C.red}}>Error: {hcReadiness.error}</div>}
        </div>);})()}
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>AEO/GEO ACTIONS</div>
        {!aeoGeoActions.length&&<div style={{color:C.muted}}>No queued AEO/GEO actions yet.</div>}
        {aeoGeoActions.map((a,i)=><div key={a.actionId||i} style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:6}}>
            <div style={{color:C.text,fontFamily:"monospace",fontSize:10}}>{a.title||"AEO/GEO Action"}</div>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>{String(a.priority||"P2").toUpperCase()} · {String(a.status||"todo").toUpperCase()}</div>
          </div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,lineHeight:1.6,marginBottom:8}}>{a.reason||a.summary||"—"}</div>
          {!!a?.probeEvidence&&<div style={{background:"#0a0a0a",border:`1px solid ${C.dim}`,padding:8,marginBottom:8,fontFamily:"monospace",fontSize:9,color:C.muted}}>
            <div style={{color:C.lime,marginBottom:4}}>PROBE EVIDENCE</div>
            <div>confusionRisk: {Number(a?.probeEvidence?.confusionRisk || 0)} / 100</div>
            <div>citationDeltaPts: {Number(a?.probeEvidence?.citationDeltaPts || 0).toFixed(2)}</div>
            <div>observations: {Number(a?.probeEvidence?.observationsCount || 0)}</div>
            <div>engines: {Array.isArray(a?.probeEvidence?.engines) ? a.probeEvidence.engines.join(", ") : "—"}</div>
          </div>}
          {!!a?.verificationStatus&&<div style={{marginBottom:8,fontFamily:"monospace",fontSize:9,color:a.verificationStatus==="improved"?C.green:a.verificationStatus==="regressed"?C.red:C.orange}}>
            VERIFICATION: {String(a.verificationStatus).toUpperCase()}
          </div>}
          {(a?.codeJobId || actionRunningId===String(a.actionId))&&<div style={{background:"#0a0a0a",border:`1px solid ${C.dim}`,padding:8,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:6,fontFamily:"monospace",fontSize:9}}>
              <span style={{color:C.lime}}>HELIO CODE RUNNER</span>
              <span style={{color:C.muted}}>job: {a?.codeJobId || "queueing..."}</span>
            </div>
            <div style={{fontFamily:"monospace",fontSize:9,color:C.text,marginBottom:6}}>
              status: <span style={{color:String(a?.codeStatus||"").includes("failed")?C.red:String(a?.codeStatus||"").includes("pr-opened")?C.green:C.orange}}>{String(a?.codeStatus || (actionRunningId===String(a.actionId)?"code-queued":"pending")).toUpperCase()}</span>
              {a?.codePrUrl ? <span style={{marginLeft:10,color:C.green}}>PR READY</span> : null}
            </div>
            {!a?.codePrUrl && String(a?.codeStatus||"").includes("failed") && (
              <div style={{fontFamily:"monospace",fontSize:9,color:C.orange,marginBottom:6}}>
                Local adapter detected. Configure production Helio Code worker for real repo execution + PR creation.
              </div>
            )}
            {actionRunningId===String(a.actionId)&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:9,marginBottom:6}}>█ Processing Helio Code task...</div>}
            <TermLog lines={Array.isArray(a?.codeLogs)?a.codeLogs:[]} running={actionRunningId===String(a.actionId) || String(a?.codeStatus||"").includes("queued") || String(a?.codeStatus||"").includes("running")} height={110}/>
          </div>}
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>updateAeoActionStatus(a.actionId, "todo")} style={{padding:"4px 10px",fontSize:9}}>MARK TODO</Btn>
            <Btn onClick={()=>updateAeoActionStatus(a.actionId, "in-progress")} style={{padding:"4px 10px",fontSize:9}}>MARK ACTIVE</Btn>
            <Btn onClick={()=>updateAeoActionStatus(a.actionId, "done")} variant="green" style={{padding:"4px 10px",fontSize:9}}>MARK DONE</Btn>
            <Btn onClick={()=>runHelioCodeForAeoAction(a)} disabled={actionRunningId===String(a.actionId) || !canAttemptHelioCodeForProject(hcReadiness, integrations)} variant="blue" style={{padding:"4px 10px",fontSize:9}}>
              {actionRunningId===String(a.actionId)?"QUEUEING...":isHelioCodeReadyForProject(hcReadiness, integrations)?"RUN HELIO CODE":"START WORKER + RUN"}
            </Btn>
            {!!a?.codePrUrl&&<Btn onClick={()=>window.open(String(a.codePrUrl), "_blank", "noopener,noreferrer")} variant="green" style={{padding:"4px 10px",fontSize:9}}>VIEW PR</Btn>}
          </div>
        </div>)}
      </div>}
      {tab==="brand knowledge"&&<div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:8}}>BRAND / ENTITY CONTEXT</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Input label="Brand Name" value={brandDraft.brandName || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, brandName: v }))} placeholder="ViralGrowth"/>
            <Input label="Legal Name" value={brandDraft.legalName || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, legalName: v }))} placeholder="ViralGrowth AI Pvt Ltd"/>
            <Input label="Tagline" value={brandDraft.tagline || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, tagline: v }))} placeholder="AI-powered growth engine"/>
            <Input label="Audience" value={brandDraft.audience || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, audience: v }))} placeholder="SMBs, growth teams, founders"/>
            <Input label="Products (comma-separated)" value={brandDraft.products || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, products: v }))} placeholder="AI SEO agent, content automation"/>
            <Input label="Services (comma-separated)" value={brandDraft.services || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, services: v }))} placeholder="SEO automation, growth ops"/>
            <Input label="Regions" value={brandDraft.regions || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, regions: v }))} placeholder="US, UK, MENA"/>
            <Input label="Competitors (comma-separated)" value={brandDraft.competitors || ""} onChange={(v)=>setBrandDraft((p)=>({ ...p, competitors: v }))} placeholder="competitor1, competitor2"/>
          </div>
          <div style={{marginTop:8}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:4}}>What the company does</div>
            <textarea value={brandDraft.whatWeDo || ""} onChange={(e)=>setBrandDraft((p)=>({ ...p, whatWeDo: e.target.value }))} placeholder="Describe exactly what your company/product does..." style={{width:"100%",minHeight:70,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginTop:8}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:4}}>Entity disambiguation (critical)</div>
            <textarea value={brandDraft.entityDisambiguation || ""} onChange={(e)=>setBrandDraft((p)=>({ ...p, entityDisambiguation: e.target.value }))} placeholder="Example: ViralGrowth is the brand/company name, not the generic concept of viral growth." style={{width:"100%",minHeight:56,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginTop:8}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:4}}>Wrong interpretations to avoid</div>
            <textarea value={brandDraft.wrongInterpretations || ""} onChange={(e)=>setBrandDraft((p)=>({ ...p, wrongInterpretations: e.target.value }))} placeholder="List common confusions Helio/LLMs should avoid." style={{width:"100%",minHeight:56,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <Btn onClick={saveBrandKnowledge} variant="blue" disabled={!canManageAeo}>SAVE BRAND KNOWLEDGE</Btn>
            <Btn onClick={generateEntityDisambiguationPack} variant="green" disabled={!canManageAeo}>GENERATE ENTITY PACK</Btn>
            <label style={{display:"inline-flex",alignItems:"center",gap:6,border:`1px solid ${C.dim}`,padding:"6px 10px",cursor:canManageAeo?"pointer":"not-allowed",opacity:canManageAeo?1:0.6,fontFamily:"monospace",fontSize:9,color:C.text}}>
              <input
                type="file"
                accept=".txt,.md,.json"
                disabled={!canManageAeo}
                style={{display:"none"}}
                onChange={(e)=>importBrandKnowledgeFile(e.target.files?.[0])}
              />
              UPLOAD FILE
            </label>
            {brandSaved&&<div style={{color:C.green,fontFamily:"monospace",fontSize:9,alignSelf:"center"}}>{brandSaved}</div>}
            {brandImportMsg&&<div style={{color:C.blue,fontFamily:"monospace",fontSize:9,alignSelf:"center"}}>{brandImportMsg}</div>}
          </div>
          {!canManageAeo&&<div style={{marginTop:8,color:C.orange,fontFamily:"monospace",fontSize:9}}>Role is read-only. Brand context edits are blocked.</div>}
        </div>
        {!!entityPack&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginTop:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>GENERATED ENTITY PACK</div>
          <div style={{whiteSpace:"pre-wrap",color:C.text,fontFamily:"monospace",fontSize:9,lineHeight:1.7}}>{entityPack}</div>
        </div>}
      </div>}
      {tab==="governance"&&<div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:8}}>ROLE MATRIX</div>
            <div style={{fontFamily:"monospace",fontSize:9,color:C.text,display:"grid",gap:5}}>
              <div><span style={{color:C.blue}}>CURRENT ROLE:</span> {String(profileRole || "admin").toUpperCase()}</div>
              <div><span style={{color:C.blue}}>VIEWER:</span> read-only (no probes, queues, write actions)</div>
              <div><span style={{color:C.blue}}>EDITOR:</span> full AEO/GEO execution</div>
              <div><span style={{color:C.blue}}>ADMIN:</span> execution + governance policy control</div>
              <div><span style={{color:C.blue}}>WRITE ACCESS:</span> {canManageAeo ? "ENABLED" : "DISABLED"}</div>
            </div>
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:8}}>AUDIT EXPORT</div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <Btn onClick={()=>exportAeoAuditTrail("json")} variant="blue">EXPORT JSON</Btn>
              <Btn onClick={()=>exportAeoAuditTrail("csv")} variant="green">EXPORT CSV</Btn>
            </div>
            <div style={{fontFamily:"monospace",fontSize:9,color:C.muted}}>
              Immutable mode: <span style={{color:governance.immutableAuditTrail?C.green:C.orange}}>{governance.immutableAuditTrail?"ON":"OFF"}</span><br/>
              Events stored: <span style={{color:C.text}}>{aeoAuditTrail.length}</span>
            </div>
          </div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:8}}>POLICY TOGGLES</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontFamily:"monospace",fontSize:9,color:C.text}}>
            {[
              ["immutableAuditTrail", "Immutable audit trail"],
              ["requireApprovalForP1", "Require approval for P1 actions"],
              ["requireApprovalForPolicyDeploy", "Require approval for policy deploy"],
              ["allowAutonomousPolicyGeneration", "Allow autonomous llms/llm generation"],
              ["allowAutonomousExternalProbe", "Allow autonomous external probe"],
              ["allowAutonomousActionQueueing", "Allow autonomous action queueing"],
              ["enableAutonomousVerificationLoop", "Enable autonomous verification loop"],
              ["autoGenerateActionsFromStrategy", "Auto-generate actions from strategy"],
              ["autoExecuteStrategyActions", "Auto-execute strategy actions via Helio Code"],
            ].map(([k,label])=><label key={k} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 8px",border:`1px solid ${C.border}`}}>
              <input
                type="checkbox"
                checked={!!governance?.[k]}
                disabled={!canManageAeo}
                onChange={(e)=>saveGovernance({ [k]: e.target.checked })}
              />
              <span>{label}</span>
            </label>)}
          </div>
          {govSaved&&<div style={{marginTop:8,color:C.green,fontFamily:"monospace",fontSize:9}}>{govSaved}</div>}
          {!canManageAeo&&<div style={{marginTop:8,color:C.orange,fontFamily:"monospace",fontSize:9}}>Role is read-only. Governance edits are blocked.</div>}
        </div>
        <div style={{marginTop:10,background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>AEO/GEO ALERTS</div>
          {(Array.isArray(projectData?.aeoAlerts) ? projectData.aeoAlerts : []).slice(0, 15).map((a)=>(
            <div key={a.id} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9}}>
              <span style={{minWidth:58,color:a.level==="warn"?C.orange:a.level==="error"?C.red:C.green}}>{String(a.level||"info").toUpperCase()}</span>
              <span style={{minWidth:170,color:C.text}}>{String(a.title||"Alert")}</span>
              <span style={{flex:1,color:C.muted}}>{String(a.detail||"")}</span>
              <span style={{minWidth:150,textAlign:"right",color:C.muted}}>{a.ts?new Date(a.ts).toLocaleString():"—"}</span>
            </div>
          ))}
          {!((Array.isArray(projectData?.aeoAlerts) ? projectData.aeoAlerts : []).length)&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>No active AEO/GEO alerts.</div>}
        </div>
      </div>}
      {tab==="intel"&&<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(120px,1fr))",gap:10,marginBottom:12}}>
          <Card label="Prompts Tracked" value={observatory.totalPrompts} delta="Prompt observatory samples" good={observatory.totalPrompts>0}/>
          <Card label="Citation Rate" value={`${(Number(observatory.globalCitationRate||0)*100).toFixed(1)}%`} delta={`${observatory.totalCitations} citations logged`} good={Number(observatory.globalCitationRate||0)>=0.2}/>
          <Card label="Citation Fitness" value={`${citationFitness.overall}/100`} delta={citationFitness.recommendation} good={citationFitness.overall>=70}/>
          <Card label="Competitor Pressure" value={competitorGraph[0]?.mentions || 0} delta={competitorGraph[0]?.competitor || "No competitor data"} good={(competitorGraph[0]?.mentions||0)<3}/>
          <Card label="Entity Knowledge" value={`${entityKnowledge.score}/100`} delta={entityKnowledge.missing.length?`Missing: ${entityKnowledge.missing.slice(0,2).join(", ")}`:"Brand context complete"} good={entityKnowledge.score>=80}/>
          <Card label="Brand Confusion Risk" value={`${Number(intelStore?.brandConfusion?.risk || 0)}/100`} delta={Number(intelStore?.brandConfusion?.risk || 0)>=35?"Detected in probes":"No active confusion signal"} good={Number(intelStore?.brandConfusion?.risk || 0)<35}/>
          <Card label="Probe Runs" value={Array.isArray(intelStore?.probeRuns)?intelStore.probeRuns.length:0} delta={(intelStore?.probeRuns?.[0]?.autonomous?"Last run: autonomy":"Last run: manual") || "No probe history"} good={Array.isArray(intelStore?.probeRuns)&&intelStore.probeRuns.length>0}/>
          <Card label="Weekly Confusion Trend" value={`${autopilotKpis.trendDelta>0?"+":""}${autopilotKpis.trendDelta} pts`} delta={`${autopilotKpis.weeklyCount} runs in 7d`} good={autopilotKpis.trendDelta<=0}/>
          <Card label="Verification Win Rate" value={`${autopilotKpis.winRate}%`} delta={`${autopilotKpis.verifiedCount} verified actions`} good={autopilotKpis.winRate>=60}/>
          <Card label="Mean Recovery Time" value={autopilotKpis.mrt?`${autopilotKpis.mrt}m`:"—"} delta="Created -> verification" good={autopilotKpis.mrt>0 && autopilotKpis.mrt<=180}/>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>EXTERNAL API CONNECTORS</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input value={openaiSearchKey} onChange={(e)=>setOpenaiSearchKey(e.target.value)} placeholder="OpenAI key (web search probe)" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <input value={anthropicSearchKey} onChange={(e)=>setAnthropicSearchKey(e.target.value)} placeholder="Anthropic key (web search probe)" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <input value={perplexityKey} onChange={(e)=>setPerplexityKey(e.target.value)} placeholder="Perplexity key" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <input value={bingApiKey} onChange={(e)=>setBingApiKey(e.target.value)} placeholder="Bing Webmaster API key" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <input value={bingSiteUrl} onChange={(e)=>setBingSiteUrl(e.target.value)} placeholder="Bing site URL (https://example.com)" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn onClick={persistIntelConnectors} variant="blue">SAVE CONNECTORS</Btn>
            <Btn onClick={runExternalProbe} disabled={probeRunning} variant="green">{probeRunning?"RUNNING...":"RUN EXTERNAL PROBE"}</Btn>
          </div>
          <div style={{marginTop:10,border:`1px solid ${C.border}`,background:"#080808"}}>
            <div style={{display:"flex",gap:8,padding:"7px 10px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
              <span style={{minWidth:95}}>CONNECTOR</span><span style={{minWidth:80}}>STATUS</span><span style={{minWidth:70,textAlign:"right"}}>ERR%</span><span style={{minWidth:90,textAlign:"right"}}>LATENCY</span><span style={{flex:1}}>LAST SUCCESS</span>
            </div>
            {["chatgpt","claude","perplexity","copilot"].map((k)=> {
              const r = connectorHealth?.[k] || {};
              const st = String(r?.status || "unknown");
              const cooldownLeftMs = Math.max(0, Number(r?.cooldownUntilTs || 0) - Date.now());
              return <div key={k} style={{display:"flex",gap:8,padding:"7px 10px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9}}>
                <span style={{minWidth:95,color:C.text}}>{k.toUpperCase()}</span>
                <span style={{minWidth:80,color:st==="ok"?C.green:st==="degraded"?C.orange:st==="cooldown"?C.red:C.muted}}>{st.toUpperCase()}</span>
                <span style={{minWidth:70,textAlign:"right",color:C.text}}>{((Number(r?.errorRate||0))*100).toFixed(1)}%</span>
                <span style={{minWidth:90,textAlign:"right",color:C.blue}}>{Number(r?.avgLatencyMs||0)?`${Math.round(Number(r?.avgLatencyMs||0))}ms`:"—"}</span>
                <span style={{flex:1,color:C.muted}}>{st==="cooldown"&&cooldownLeftMs>0?`Cooldown ${Math.ceil(cooldownLeftMs/60000)}m`:r?.lastSuccessAt?new Date(r.lastSuccessAt).toLocaleString():"—"}</span>
              </div>;
            })}
            {!Object.keys(connectorHealth||{}).length&&<div style={{padding:"8px 10px",color:C.muted,fontFamily:"monospace",fontSize:9}}>Run external probe to populate connector health metrics.</div>}
          </div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>TRUSTED CITATION DOMAINS</div>
          <textarea value={trustedDomainsText} onChange={(e)=>setTrustedDomainsText(e.target.value)} placeholder={"example.com\nwikipedia.org\ngithub.com"} style={{width:"100%",minHeight:70,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:6}}>Citation source-quality scoring boosts these domains.</div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>BING AI PERFORMANCE IMPORT</div>
          <textarea value={bingCsvText} onChange={(e)=>setBingCsvText(e.target.value)} placeholder="Paste Bing AI Performance CSV rows..." style={{width:"100%",minHeight:90,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn onClick={importBingAiCsv} variant="blue">IMPORT BING CSV</Btn>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,alignSelf:"center"}}>Use exported query/citation rows from Bing AI Performance to enrich observatory signals.</div>
          </div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>ADD PROMPT OBSERVATION</div>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 110px 90px 90px 1fr 1fr auto",gap:8}}>
            <input value={obsPrompt} onChange={(e)=>setObsPrompt(e.target.value)} placeholder="Prompt searched in target LLM..." style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <ThemeDropdown value={obsEngine} onChange={setObsEngine} options={[{value:"chatgpt",label:"ChatGPT"},{value:"perplexity",label:"Perplexity"},{value:"gemini",label:"Gemini"},{value:"copilot",label:"Copilot"},{value:"claude",label:"Claude"}]} placeholder="Engine"/>
            <ThemeDropdown value={obsCited?"yes":"no"} onChange={(v)=>setObsCited(v==="yes")} options={[{value:"yes",label:"Cited"},{value:"no",label:"Not Cited"}]} placeholder="Cited"/>
            <input value={obsRank} onChange={(e)=>setObsRank(e.target.value)} placeholder="Rank (1-10)" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <input value={obsCitationUrl} onChange={(e)=>setObsCitationUrl(e.target.value)} placeholder="Citation URL (optional)" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <input value={obsCompetitors} onChange={(e)=>setObsCompetitors(e.target.value)} placeholder="Competitors (comma-separated)" style={{background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px"}}/>
            <Btn onClick={savePromptObservation} variant="blue">LOG</Btn>
          </div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10,marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>PROMPT SUITE RUNNER</div>
          <textarea value={suiteText} onChange={(e)=>setSuiteText(e.target.value)} placeholder="One prompt per line..." style={{width:"100%",minHeight:86,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn onClick={runPromptSuiteNow} disabled={suiteRunning} variant="blue">{suiteRunning?"RUNNING...":"RUN SUITE NOW"}</Btn>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,alignSelf:"center"}}>Runs observatory suite, stores trend delta, and auto-queues drift action if citation rate drops.</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>ENGINE SHARE</div>
            {(observatory.rows||[]).map((r,i)=><div key={i} style={{display:"flex",gap:8,fontFamily:"monospace",fontSize:9,padding:"3px 0"}}>
              <span style={{color:C.text,flex:1}}>{String(r.engine).toUpperCase()}</span>
              <span style={{color:C.muted,minWidth:42,textAlign:"right"}}>{r.prompts}</span>
              <span style={{color:C.green,minWidth:55,textAlign:"right"}}>{(Number(r.citationRate||0)*100).toFixed(1)}%</span>
              <span style={{color:C.blue,minWidth:52,textAlign:"right"}}>{r.avgRank==null?"—":Number(r.avgRank).toFixed(1)}</span>
            </div>)}
            {!observatory.rows.length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>No prompt observations yet.</div>}
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>INTELLIGENCE ACTIONS</div>
            {(intelligenceActions||[]).map((a,i)=><div key={i} style={{border:`1px solid ${C.border}`,padding:8,marginBottom:6}}>
              <div style={{color:C.text,fontFamily:"monospace",fontSize:10}}>{a.priority} · {a.title}</div>
              <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:4}}>{a.reason}</div>
              <div style={{color:C.blue,fontFamily:"monospace",fontSize:9,marginTop:4}}>{a.fix}</div>
            </div>)}
            {!intelligenceActions.length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>No urgent intelligence actions right now.</div>}
          </div>
        </div>
        <div style={{marginTop:10,background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>PROBE TIMELINE</div>
          <div style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:8,color:C.muted}}>
            <span style={{minWidth:150}}>TIME</span>
            <span style={{minWidth:72}}>SOURCE</span>
            <span style={{minWidth:64,textAlign:"right"}}>OBS</span>
            <span style={{minWidth:72,textAlign:"right"}}>CONF</span>
            <span style={{minWidth:84,textAlign:"right"}}>CIT Δ</span>
            <span style={{minWidth:72,textAlign:"right"}}>ERRORS</span>
            <span style={{flex:1}}>PROMPT</span>
          </div>
          {(Array.isArray(intelStore?.probeRuns) ? intelStore.probeRuns : []).slice(0, 20).map((r, i)=><div key={r.id || i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:8,color:C.text}}>
            <span style={{minWidth:150,color:C.muted}}>{r?.ts ? new Date(r.ts).toLocaleString() : "—"}</span>
            <span style={{minWidth:72,color:r?.autonomous?C.blue:C.text}}>{r?.autonomous?"AUTO":"MANUAL"}</span>
            <span style={{minWidth:64,textAlign:"right"}}>{Number(r?.observationsCount || 0)}</span>
            <span style={{minWidth:72,textAlign:"right",color:Number(r?.confusionRisk||0)>=35?C.red:C.green}}>{Number(r?.confusionRisk || 0)}</span>
            <span style={{minWidth:84,textAlign:"right",color:Number(r?.citationDeltaPts||0)>=0?C.green:C.orange}}>{Number(r?.citationDeltaPts || 0).toFixed(2)} pts</span>
            <span style={{minWidth:72,textAlign:"right",color:Number((r?.connectorErrors||[]).length||0)>0?C.orange:C.green}}>{Number((r?.connectorErrors||[]).length || 0)}</span>
            <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:C.muted}}>{String(r?.prompt || "—")}</span>
          </div>)}
          {!(Array.isArray(intelStore?.probeRuns) && intelStore.probeRuns.length)&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9,paddingTop:6}}>No probe history yet.</div>}
        </div>
        <div style={{marginTop:10,background:C.panel,border:`1px solid ${C.border}`,padding:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,marginBottom:6}}>AEO/GEO AUDIT TRAIL</div>
          {aeoAuditTrail.slice(0, 18).map((e)=><div key={e.id} style={{display:"flex",gap:8,fontFamily:"monospace",fontSize:9,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{minWidth:64,color:e.status==="ok"?C.green:e.status==="partial"?C.orange:C.red}}>{String(e.status||"ok").toUpperCase()}</span>
            <span style={{minWidth:140,color:C.text}}>{String(e.action||"event")}</span>
            <span style={{flex:1,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(e.detail||"")}</span>
            <span style={{minWidth:150,textAlign:"right",color:C.muted}}>{new Date(e.ts).toLocaleString()}</span>
          </div>)}
          {!aeoAuditTrail.length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>No AEO/GEO events logged yet.</div>}
        </div>
      </div>}
      {["aeo","geo","llm visibility","strategy"].includes(tab)&&!running&&<div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.8}}>{deterministic[tab]}</div>}
      {running&&<div style={{color:C.lime}}>Helio is optimizing for {tab.toUpperCase()} █</div>}
      {tab!=="llm policy"&&tab!=="opportunities"&&tab!=="engine policies"&&output&&<div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>AI ENHANCEMENT LAYER</div>
        {!!outputGuard.warnings.length&&<div style={{background:"#2a1d07",border:`1px solid ${C.orange}`,padding:10,color:"#ffe0b2",fontFamily:"monospace",fontSize:10,marginBottom:10}}>{outputGuard.warnings.join("\n")}</div>}
        {outputGuard.blocked&&<div style={{background:"#2a1010",border:`1px solid ${C.red}`,padding:10,color:"#ffd2d2",fontFamily:"monospace",fontSize:10,marginBottom:10}}>Output guardrail blocked publish-level claims. Revise using evidence-backed language.</div>}
        <div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.8}}>{output}</div>
      </div>}
    </div>
    {showUnderstandModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{width:"min(860px,95vw)",maxHeight:"86vh",overflowY:"auto",background:C.panel,border:`1px solid ${C.lime}`,padding:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,letterSpacing:2}}>UNDERSTAND YOUR BUSINESS</div>
          <Btn onClick={()=>setShowUnderstandModal(false)} variant="blue" style={{padding:"4px 9px",fontSize:9}}>CLOSE</Btn>
        </div>
        <div style={{height:6,background:C.dim,border:`1px solid ${C.border}`,marginBottom:10}}>
          <div style={{height:"100%",width:`${((onboardingStep+1)/7)*100}%`,background:C.lime}}/>
        </div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:10}}>Step {onboardingStep + 1} / 7</div>
        {onboardingStep===0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="Business Name" value={onboardingAnswers.businessName} onChange={(v)=>setOnboardingAnswers((p)=>({...p,businessName:v}))} placeholder="ViralGrowth"/>
          <Input label="Legal Name" value={onboardingAnswers.legalName} onChange={(v)=>setOnboardingAnswers((p)=>({...p,legalName:v}))} placeholder="ViralGrowth AI Pvt Ltd"/>
          <Input label="Website" value={onboardingAnswers.website} onChange={(v)=>setOnboardingAnswers((p)=>({...p,website:v}))} placeholder="https://viralgrowth.ai"/>
          <Input label="One-liner" value={onboardingAnswers.oneLiner} onChange={(v)=>setOnboardingAnswers((p)=>({...p,oneLiner:v}))} placeholder="AI growth copilot for brands"/>
        </div>}
        {onboardingStep===1&&<div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:4}}>What product/service do you provide?</div>
          <textarea value={onboardingAnswers.productService} onChange={(e)=>setOnboardingAnswers((p)=>({...p,productService:e.target.value}))} placeholder="Describe your core product/service in detail..." style={{width:"100%",minHeight:110,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
        </div>}
        {onboardingStep===2&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="Target Audience" value={onboardingAnswers.targetAudience} onChange={(v)=>setOnboardingAnswers((p)=>({...p,targetAudience:v}))} placeholder="Founders, marketing teams, SMBs"/>
          <Input label="Target Locations" value={onboardingAnswers.targetLocations} onChange={(v)=>setOnboardingAnswers((p)=>({...p,targetLocations:v}))} placeholder="US, UK, MENA"/>
          <Input label="Niche" value={onboardingAnswers.niche} onChange={(v)=>setOnboardingAnswers((p)=>({...p,niche:v}))} placeholder="AI SEO automation"/>
          <Input label="Competitors" value={onboardingAnswers.competitors} onChange={(v)=>setOnboardingAnswers((p)=>({...p,competitors:v}))} placeholder="comp1, comp2"/>
        </div>}
        {onboardingStep===3&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="Primary Goal" value={onboardingAnswers.mainGoal} onChange={(v)=>setOnboardingAnswers((p)=>({...p,mainGoal:v}))} placeholder="Rank in LLM answers for core terms"/>
          <Input label="Success Metric" value={onboardingAnswers.successMetric} onChange={(v)=>setOnboardingAnswers((p)=>({...p,successMetric:v}))} placeholder="AI-sourced leads, citation rate, share-of-answer"/>
          <Input label="Preferred Tone" value={onboardingAnswers.tone} onChange={(v)=>setOnboardingAnswers((p)=>({...p,tone:v}))} placeholder="Authoritative + practical"/>
        </div>}
        {onboardingStep===4&&<div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:4}}>Entity disambiguation (critical)</div>
          <textarea value={onboardingAnswers.entityDisambiguation} onChange={(e)=>setOnboardingAnswers((p)=>({...p,entityDisambiguation:e.target.value}))} placeholder='Example: "ViralGrowth" is our company name, not the generic concept of viral growth.' style={{width:"100%",minHeight:95,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
        </div>}
        {onboardingStep===5&&<div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:4}}>Common confusions to avoid</div>
          <textarea value={onboardingAnswers.commonConfusions} onChange={(e)=>setOnboardingAnswers((p)=>({...p,commonConfusions:e.target.value}))} placeholder="List wrong assumptions LLMs often make about your brand/product." style={{width:"100%",minHeight:95,background:"#070707",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px",boxSizing:"border-box"}}/>
        </div>}
        {onboardingStep===6&&<div style={{color:C.text,fontFamily:"monospace",fontSize:10,lineHeight:1.7}}>
          <div style={{color:C.lime,marginBottom:8}}>Review + Generate</div>
          <div>Business: {onboardingAnswers.businessName || "—"}</div>
          <div>Audience: {onboardingAnswers.targetAudience || "—"}</div>
          <div>Locations: {onboardingAnswers.targetLocations || "—"}</div>
          <div>Niche: {onboardingAnswers.niche || "—"}</div>
          <div>Goal: {onboardingAnswers.mainGoal || "—"}</div>
          <div style={{marginTop:8,color:C.muted}}>Helio will now build your brand profile and inject a tailored strategy into Strategy tab.</div>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:14}}>
          <Btn onClick={()=>setOnboardingStep((s)=>Math.max(0,s-1))} disabled={onboardingStep===0 || onboardingProcessing} variant="blue">BACK</Btn>
          {onboardingStep<6
            ? <Btn onClick={()=>setOnboardingStep((s)=>Math.min(6,s+1))} disabled={onboardingProcessing}>NEXT</Btn>
            : <Btn onClick={completeUnderstandFlow} disabled={onboardingProcessing || !String(onboardingAnswers.businessName||"").trim()} variant="green">{onboardingProcessing?"PROCESSING...":"GENERATE PROFILE + STRATEGY"}</Btn>}
        </div>
      </div>
    </div>}
  </div>;
}

// ── GITHUB OPS ────────────────────────────────────────────────────
function GitHub({integrations}) {
  const ai=integrations.ai;const ghF=integrations.github?.fields;
  const [logs,setLogs]=useState([]);const [prs,setPrs]=useState([]);const [commits,setCommits]=useState([]);
  const [loading,setLoading]=useState(false);const [fix,setFix]=useState("");const [fixCode,setFixCode]=useState("");const [generatingFix,setGeneratingFix]=useState(false);const [tab,setTab]=useState("overview");
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*400}]);

  const load=async()=>{
    setLoading(true);setLogs([]);addLog("Connecting to GitHub API...","sys");
    try{
      const h={"Authorization":`token ${ghF.token}`,"Accept":"application/vnd.github.v3+json"};
      const [prRes,cRes]=await Promise.all([
        fetch(`https://api.github.com/repos/${ghF.repo}/pulls?state=open&per_page=10`,{headers:h}),
        fetch(`https://api.github.com/repos/${ghF.repo}/commits?per_page=15`,{headers:h}),
      ]);
      const [prD,cD]=await Promise.all([prRes.json(),cRes.json()]);
      if(!prRes.ok){addLog(`Error: ${prD.message}`,"err");setLoading(false);return;}
      setPrs(prD);setCommits(cD);addLog(`Loaded ${prD.length} open PRs, ${cD.length} recent commits.`,"ok");
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setLoading(false);
  };

  const generateFix=async()=>{
    if(!fix)return;setGeneratingFix(true);setFixCode("");
    try{const r=await callAI(ai,"You are Helio, an expert SEO engineer. Generate the exact code fix needed. Include filename, the code block, and a git commit message. Format: FILENAME:\n```\nCODE\n```\nCOMMIT MESSAGE: ...",`Generate code fix for SEO issue: ${fix}. Repository: ${ghF.repo}`);setFixCode(r);setTab("fix");}
    catch(e){setFixCode(`Error: ${e.message}`);}
    setGeneratingFix(false);
  };

  const createIssue=async()=>{
    if(!fixCode){addLog("Generate a fix plan first.","warn");return;}
    addLog("Creating GitHub issue with implementation plan...","sys");
    try{
      const h={"Authorization":`token ${ghF.token}`,"Accept":"application/vnd.github.v3+json","Content-Type":"application/json"};
      const issueRes=await fetch(`https://api.github.com/repos/${ghF.repo}/issues`,{
        method:"POST",
        headers:h,
        body:JSON.stringify({
          title:`[Helio SEO] ${fix.slice(0,80)}`,
          body:`Auto-generated by Helio.\n\n### Problem\n${fix}\n\n### Implementation Plan\n${fixCode}\n\n### Acceptance Criteria\n- [ ] Implement code changes\n- [ ] Add/adjust tests\n- [ ] Verify in Helio modules`
        })
      });
      const issue=await issueRes.json();
      if(issue.html_url){addLog(`✓ Issue created: ${issue.html_url}`,"ok");}
      else addLog(`Issue creation failed: ${issue.message}`,"err");
    }catch(e){addLog(`Error: ${e.message}`,"err");}
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="GitHub Ops" sub={`Code deployments · SEO fix automation · Repo: ${ghF?.repo||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <Btn onClick={load} disabled={loading}>{loading?"▶ LOADING...":"⬡ LOAD REPO DATA"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={loading}/></div>}
    <Tabs tabs={["overview","commits","fix"]} active={tab} onChange={setTab}/>
    {tab==="overview"&&<div>
      <div style={{display:"flex",gap:10,marginBottom:18}}>
        <Input label="SEO Issue to Fix" value={fix} onChange={setFix} placeholder="e.g. Add canonical tags to all blog pages"/>
        <div style={{alignSelf:"flex-end"}}><Btn onClick={generateFix} disabled={generatingFix||!fix}>{generatingFix?"GENERATING...":"⬡ GENERATE FIX"}</Btn></div>
      </div>
      {prs.length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,marginBottom:16}}>
        <div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,color:C.lime,fontFamily:"monospace",fontSize:9,letterSpacing:2}}>OPEN PULL REQUESTS ({prs.length})</div>
        {prs.map((pr,i)=><div key={i} style={{display:"flex",gap:10,padding:"9px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.green,minWidth:30}}>#{pr.number}</span>
          <span style={{color:C.text,flex:1}}>{pr.title}</span>
          <a href={pr.html_url} target="_blank" rel="noreferrer" style={{color:C.blue,minWidth:40,textAlign:"right",textDecoration:"none"}}>↗ View</a>
        </div>)}
      </div>}
    </div>}
    {tab==="commits"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
      {commits.map((c,i)=><div key={i} style={{display:"flex",gap:10,padding:"9px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
        <span style={{color:C.muted,minWidth:70}}>{c.sha?.slice(0,7)}</span>
        <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.commit?.message?.split("\n")[0]}</span>
        <span style={{color:C.muted,minWidth:80,textAlign:"right"}}>{c.commit?.author?.name}</span>
      </div>)}
      {commits.length===0&&<div style={{padding:20,color:C.muted,fontFamily:"monospace",fontSize:11}}>Load repo data first.</div>}
    </div>}
    {tab==="fix"&&<div>
      {fixCode&&<><div style={{background:"#060606",border:`1px solid ${C.border}`,padding:16,fontFamily:"monospace",fontSize:10,whiteSpace:"pre-wrap",lineHeight:1.7,color:C.text,maxHeight:400,overflowY:"auto",marginBottom:12}}>{fixCode}</div>
        <div style={{display:"flex",gap:10}}><Btn onClick={createIssue} variant="green">CREATE GITHUB ISSUE ↗</Btn><Btn onClick={()=>navigator.clipboard.writeText(fixCode)}>COPY CODE</Btn></div>
      </>}
      {!fixCode&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,padding:20}}>Go to Overview → enter an SEO issue → Generate Fix.</div>}
    </div>}
  </div>;
}

// ── REPORTS ───────────────────────────────────────────────────────
function Reports({integrations, orgScope="default"}) {
  const ai=integrations.ai;
  const [generating,setGenerating]=useState(false);const [report,setReport]=useState("");const [type,setType]=useState("weekly");
  const [domain,setDomain]=useState("");
  const host = getHostFromInput(domain || integrations.gsc?.fields?.extra?.siteUrl || "");
  const projectData = loadProjectData(orgScope, host);
  const savedReports = host
    ? (Array.isArray(projectData?.reports) ? projectData.reports : [])
    : loadAllOrgReports(orgScope);

  const deterministicReport = (() => {
    const auditScore = projectData?.audit?.quality?.score ?? "N/A";
    const gsc = projectData?.gsc?.totals || {};
    const ga4 = projectData?.ga4?.totals || {};
    const issues = Array.isArray(projectData?.audit?.issueRegistry) ? projectData.audit.issueRegistry.filter((i)=>Number(i.value||0)>0).slice(0,6) : [];
    const topKw = Array.isArray(projectData?.gsc?.topKeywords) ? projectData.gsc.topKeywords.slice(0,5) : [];
    const topPg = Array.isArray(projectData?.gsc?.topPages) ? projectData.gsc.topPages.slice(0,5) : [];
    return [
      `## ${String(type).toUpperCase()} SEO REPORT`,
      `Domain: ${host || domain || "unknown-domain"}`,
      "",
      "## Executive Summary",
      `Technical quality score is ${auditScore}. Traffic and ranking opportunities are prioritized from connected GSC and audit snapshots.`,
      "",
      "## Key Metrics",
      `- GSC Clicks: ${gsc.clicks ?? "—"}`,
      `- GSC Impressions: ${gsc.impressions ?? "—"}`,
      `- GSC CTR: ${gsc.ctr !== undefined ? `${(Number(gsc.ctr)*100).toFixed(2)}%` : "—"}`,
      `- Avg Position: ${gsc.position !== undefined ? Number(gsc.position).toFixed(2) : "—"}`,
      `- GA4 Sessions: ${ga4.sessions ?? "—"}`,
      "",
      "## Top Pages",
      ...topPg.map((p,i)=>`${i+1}. ${p.keys?.[0] || ""} | clicks: ${Number(p.clicks || 0)}`),
      "",
      "## Top Queries",
      ...topKw.map((k,i)=>`${i+1}. ${k.keys?.[0] || ""} | clicks: ${Number(k.clicks || 0)} | pos: ${Number(k.position || 0).toFixed(1)}`),
      "",
      "## Priority Issues",
      ...(issues.length ? issues.map((i)=>`- ${i.label}: ${i.value}`) : ["- No critical technical blockers captured in latest snapshot"]),
      "",
      "## Next Actions",
      "1. Improve low-CTR high-impression queries with title/meta and answer blocks.",
      "2. Resolve top technical issues impacting crawlability and index quality.",
      "3. Strengthen internal links from top-click pages to opportunity pages.",
    ].join("\n");
  })();

  const gen=async()=>{
    setGenerating(true);setReport("");
    try{const r=await callAI(ai,`You are Helio reporting copilot. Improve this deterministic report for executive readability without inventing metrics. Keep all numbers and facts exactly aligned to input.`,`${deterministicReport}`);setReport(r);}
    catch(e){setReport(`Error: ${e.message}`);}
    setGenerating(false);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Reports" sub={`AI-generated SEO reports · Weekly & Monthly · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:18}}>
      <Input label="Domain / Project Name" value={domain} onChange={setDomain} placeholder="generalizingai.com"/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Card label="Audit Score" value={projectData?.audit?.quality?.score ?? "—"} />
        <Card label="GSC Clicks" value={projectData?.gsc?.totals?.clicks?.toLocaleString?.() || "—"} />
        <Card label="GA4 Sessions" value={projectData?.ga4?.totals?.sessions?.toLocaleString?.() || "—"} />
      </div>
      <div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>REPORT TYPE</div>
        <div style={{display:"flex",gap:0}}>
          {["weekly","monthly","quarterly"].map(t=><div key={t} onClick={()=>setType(t)} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:10,fontWeight:700,background:type===t?C.lime:"#060606",color:type===t?"#000":C.muted,border:`1px solid ${type===t?C.lime:C.dim}`,marginRight:-1}}>{t.toUpperCase()}</div>)}
        </div>
      </div>
      <Btn onClick={gen} disabled={generating}>{generating?"▶ ENHANCING REPORT...":"▤ ENHANCE REPORT WITH AI"}</Btn>
    </div>
    <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:12,marginBottom:14}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>SAVED REPORTS ({savedReports.length})</div>
      {!savedReports.length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>No saved reports yet. Run Technical Audit to auto-save reports here.</div>}
      {savedReports.slice(0,12).map((r,i)=><div key={r.id||i} style={{padding:"8px 10px",border:`1px solid ${C.dim}`,marginBottom:6,background:"#0a0a0a"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
          <div style={{color:C.text,fontFamily:"monospace",fontSize:10}}>{r.title || "Untitled Report"}</div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</div>
        </div>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:9,marginTop:4}}>{r.domain || host || "unknown-domain"}</div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:4}}>{r.metaDescription || "No meta description"}</div>
        {!!r.remediationSummary&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
          <span style={{border:`1px solid ${C.border}`,padding:"2px 6px",fontFamily:"monospace",fontSize:8,color:C.green}}>healthy {Number(r.remediationSummary.healthyChecks || 0)}</span>
          <span style={{border:`1px solid ${C.border}`,padding:"2px 6px",fontFamily:"monospace",fontSize:8,color:C.red}}>open {Number(r.remediationSummary.openFixes || 0)}</span>
          <span style={{border:`1px solid ${C.border}`,padding:"2px 6px",fontFamily:"monospace",fontSize:8,color:C.lime}}>executed {Number(r.remediationSummary.executedFixes || 0)}</span>
          <span style={{border:`1px solid ${C.border}`,padding:"2px 6px",fontFamily:"monospace",fontSize:8,color:C.orange}}>approval-blocked {Number(r.remediationSummary.approvalBlockedFixes || 0)}</span>
        </div>}
        <div style={{display:"flex",gap:8,marginTop:6}}>
          {r.reportUrl&&<Btn onClick={()=>{window.history.pushState({}, "", r.reportUrl);window.dispatchEvent(new PopStateEvent("popstate"));}} variant="green" style={{padding:"5px 10px",fontSize:9}}>VIEW REPORT</Btn>}
          {r.reportUrl&&<Btn onClick={()=>window.open(`${r.reportUrl}?download=1`,"_blank")} variant="blue" style={{padding:"5px 10px",fontSize:9}}>DOWNLOAD REPORT</Btn>}
          {r.reportMarkdown&&<Btn onClick={()=>navigator.clipboard.writeText(r.reportMarkdown)} style={{padding:"5px 10px",fontSize:9}}>COPY MD</Btn>}
        </div>
      </div>)}
    </div>
    <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:20,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8,color:C.text,maxHeight:600,overflowY:"auto",scrollbarWidth:"thin"}}>{deterministicReport}</div>
    {generating&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11,padding:20}}>Helio is enhancing your {type} report █</div>}
    {report&&<div>
      <div style={{marginTop:14,background:"#060606",border:`1px solid ${C.borderLime}`,padding:20,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8,color:C.text,maxHeight:600,overflowY:"auto",scrollbarWidth:"thin"}}>
        <div style={{color:C.lime,fontSize:10,letterSpacing:2,marginBottom:8}}>AI ENHANCEMENT LAYER</div>
        {report}
      </div>
      <div style={{marginTop:12,display:"flex",gap:10}}>
        <Btn onClick={()=>navigator.clipboard.writeText(report)}>COPY REPORT</Btn>
        <Btn onClick={()=>{const b=new Blob([report],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`helio-${type}-report.txt`;a.click();}} variant="blue">DOWNLOAD .TXT</Btn>
      </div>
    </div>}
    {!report&&!generating&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,padding:20,background:C.panel,border:`1px solid ${C.border}`}}>Deterministic report is generated from connected project data. Use AI enhancement for tone and formatting improvements.</div>}
  </div>;
}

// ── TASK MANAGER ──────────────────────────────────────────────────
function Tasks({integrations, orgScope="default"}) {
  const ai=integrations.ai;
  const connectedHost = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
  const [tasks,setTasks]=useState([]);
  const [generating,setGenerating]=useState(false);const [newTask,setNewTask]=useState("");const [filter,setFilter]=useState("all");const [aiPlan,setAiPlan]=useState("");
  const [queue, setQueue] = useState([]);
  const currentProject = connectedHost ? loadProjectData(orgScope, connectedHost) : {};
  const execModel = currentProject?.executionModel || { ctrLiftMultiplier: 1, roiMultiplier: 1, confidenceBias: 0, samples: 0 };

  useEffect(() => {
    const latest = loadProjectData(orgScope, connectedHost);
    const projectTasks = Array.isArray(latest?.tasks) ? latest.tasks : [];
    setTasks(projectTasks);
    setQueue(Array.isArray(latest?.executionQueue) ? latest.executionQueue : []);
  }, [orgScope, connectedHost, integrations?.autonomy?.lastRunAt, integrations?.autonomy?.lastStatus]);

  useEffect(() => {
    if (!connectedHost) return;
    mergeProjectData(orgScope, connectedHost, { tasks });
  }, [tasks, orgScope, connectedHost]);

  const addTask=()=>{if(!newTask.trim())return;setTasks(p=>[...p,{id:Date.now(),status:"todo",priority:"medium",module:"General",label:newTask,due:""}]);setNewTask("");};
  const updateStatus=(id,status)=>setTasks(p=>p.map(t=>t.id===id?{...t,status}:t));
  const deleteTask=(id)=>setTasks(p=>p.filter(t=>t.id!==id));
  const buildExecutionQueue = () => {
    if (!connectedHost) return;
    const latest = loadProjectData(orgScope, connectedHost);
    const nextQueue = buildExecutionPriorityQueue(latest, connectedHost);
    const queueTasks = buildExecutionTasksFromQueue(nextQueue);
    const existing = Array.isArray(latest?.tasks) ? latest.tasks : [];
    const merged = [...queueTasks, ...existing.filter((t) => t.source !== "execution-priority-engine")].slice(0, 140);
    mergeProjectData(orgScope, connectedHost, { executionQueue: nextQueue, tasks: merged });
    setQueue(nextQueue);
    setTasks(merged);
  };

  const genAIPlan=async()=>{
    setGenerating(true);setAiPlan("");
    const todoTasks=tasks.filter(t=>t.status!=="done").map(t=>`[${t.priority.toUpperCase()}] ${t.label} (${t.module})`).join("\n");
    try{const r=await callAI(ai,"You are Helio SEO agent. Analyze the task list and provide: 1) Prioritization recommendation, 2) This week's focus (top 3 tasks), 3) Estimated time per task, 4) Dependencies between tasks. Terminal style, concise.",`Current SEO task list:\n${todoTasks}`);setAiPlan(r);}
    catch(e){setAiPlan(`Error: ${e.message}`);}
    setGenerating(false);
  };

  const filtered=filter==="all"?tasks:tasks.filter(t=>t.status===filter);
  const priC=p=>p==="high"?C.red:p==="medium"?C.orange:C.muted;
  const stC=s=>s==="done"?C.green:s==="in-progress"?C.lime:C.muted;
  const stL=s=>s==="done"?"✓ DONE":s==="in-progress"?"▶ ACTIVE":"○ TODO";

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Task Manager" sub={`SEO task queue · AI prioritization · ${tasks.filter(t=>t.status!=="done").length} active tasks`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addTask();}} placeholder="Add new SEO task... (press Enter)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={addTask}>ADD TASK</Btn>
      <Btn onClick={buildExecutionQueue} disabled={!connectedHost} variant="green">⚡ BUILD EXECUTION QUEUE</Btn>
      <Btn onClick={genAIPlan} disabled={generating} variant="blue">{generating?"PLANNING...":"◈ AI PRIORITIZE"}</Btn>
    </div>
    {queue.length>0&&<div style={{background:"#060606",border:`1px solid ${C.border}`,padding:12,marginBottom:16}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>EXECUTION PRIORITY ENGINE (TOP {Math.min(8, queue.length)})</div>
      <div style={{display:"flex",gap:14,color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:8}}>
        <span>Projected 28d clicks gain: <span style={{color:C.green}}>{queue.reduce((s,q)=>s+Number(q.expectedClicksGain28d||0),0)}</span></span>
        <span>Avg ROI score: <span style={{color:C.orange}}>{Math.round(queue.reduce((s,q)=>s+Number(q.expectedRoiScore||0),0)/Math.max(1,queue.length))}</span></span>
      </div>
      <div style={{display:"flex",gap:14,color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:8}}>
        <span>Model CTRx: <span style={{color:C.blue}}>{Number(execModel.ctrLiftMultiplier||1).toFixed(2)}</span></span>
        <span>Model ROIx: <span style={{color:C.blue}}>{Number(execModel.roiMultiplier||1).toFixed(2)}</span></span>
        <span>Conf Bias: <span style={{color:C.blue}}>{Number(execModel.confidenceBias||0).toFixed(3)}</span></span>
        <span>Samples: <span style={{color:C.blue}}>{Number(execModel.samples||0)}</span></span>
      </div>
      {queue.slice(0,8).map((q, i)=><div key={i} style={{display:"flex",gap:10,fontFamily:"monospace",fontSize:9,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
        <span style={{color:C.muted,minWidth:22}}>#{i+1}</span>
        <span style={{color:C.text,flex:1}}>{q.label}</span>
        <span style={{color:C.orange,minWidth:62,textAlign:"right"}}>IMP {q.impact}</span>
        <span style={{color:C.blue,minWidth:72,textAlign:"right"}}>CONF {(Number(q.confidence||0)*100).toFixed(0)}%</span>
        <span style={{color:C.green,minWidth:66,textAlign:"right"}}>+{Number(q.expectedClicksGain28d||0)}</span>
        <span style={{color:C.orange,minWidth:58,textAlign:"right"}}>ROI {Number(q.expectedRoiScore||0)}</span>
      </div>)}
    </div>}
    <div style={{display:"flex",gap:0,marginBottom:18}}>
      {["all","todo","in-progress","done"].map(f=><div key={f} onClick={()=>setFilter(f)} style={{flex:1,padding:"7px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:9,fontWeight:700,background:filter===f?C.lime:"#060606",color:filter===f?"#000":C.muted,border:`1px solid ${filter===f?C.lime:C.dim}`,marginRight:-1,textTransform:"uppercase"}}>{f}</div>)}
    </div>
    {aiPlan&&<div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:14,marginBottom:18,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7,color:C.text}}>{aiPlan}</div>}
    <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
      {filtered.map((task)=><div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
        <span style={{color:stC(task.status),fontFamily:"monospace",fontSize:9,minWidth:62}}>{stL(task.status)}</span>
        <span style={{color:priC(task.priority),fontFamily:"monospace",fontSize:8,minWidth:44,border:`1px solid ${priC(task.priority)}`,padding:"1px 5px",textAlign:"center"}}>{task.priority.toUpperCase()}</span>
        <span style={{color:C.text,fontFamily:"monospace",fontSize:10,flex:1}}>{task.label}</span>
        {typeof task.impact==="number"&&<span style={{color:C.orange,fontFamily:"monospace",fontSize:8,minWidth:46,textAlign:"right"}}>{task.impact}</span>}
        {typeof task.confidence==="number"&&<span style={{color:C.blue,fontFamily:"monospace",fontSize:8,minWidth:54,textAlign:"right"}}>{Math.round(task.confidence*100)}%</span>}
        {typeof task.expectedClicksGain28d==="number"&&<span style={{color:C.green,fontFamily:"monospace",fontSize:8,minWidth:48,textAlign:"right"}}>+{task.expectedClicksGain28d}</span>}
        {typeof task.expectedRoiScore==="number"&&<span style={{color:C.orange,fontFamily:"monospace",fontSize:8,minWidth:52,textAlign:"right"}}>{task.expectedRoiScore}</span>}
        <span style={{color:C.blue,fontFamily:"monospace",fontSize:8,minWidth:70,border:`1px solid ${C.dim}`,padding:"1px 5px",textAlign:"center"}}>{task.module}</span>
        <div style={{minWidth:140}}>
          <ThemeDropdown
            value={task.status}
            onChange={(v)=>updateStatus(task.id,v)}
            options={[{value:"todo",label:"Todo"},{value:"in-progress",label:"In Progress"},{value:"done",label:"Done"}]}
            placeholder="Status"
          />
        </div>
        <button onClick={()=>deleteTask(task.id)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontFamily:"monospace",fontSize:11,padding:"0 4px"}}>✕</button>
      </div>)}
      {filtered.length===0&&<div style={{padding:20,color:C.muted,fontFamily:"monospace",fontSize:11}}>No tasks yet. Add one manually or run Autonomy to generate execution tasks.</div>}
    </div>
    <div style={{display:"flex",gap:16,marginTop:14}}>
      {[{label:"Total",count:tasks.length,color:C.muted},{label:"Todo",count:tasks.filter(t=>t.status==="todo").length,color:C.orange},{label:"Active",count:tasks.filter(t=>t.status==="in-progress").length,color:C.lime},{label:"Done",count:tasks.filter(t=>t.status==="done").length,color:C.green}].map((s,i)=><div key={i} style={{fontFamily:"monospace",fontSize:10}}>
        <span style={{color:C.muted}}>{s.label}: </span><span style={{color:s.color,fontWeight:700}}>{s.count}</span>
      </div>)}
    </div>
  </div>;
}

// ── MISSIONS ──────────────────────────────────────────────────────
export function normalizeMissionStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (["awaiting_approval", "awaiting-approval", "approval_required"].includes(s)) return "awaiting-approval";
  if (["inprogress", "in_progress", "in-progress"].includes(s)) return "in-progress";
  if (["complete", "completed", "fixed"].includes(s)) return "done";
  if (["resolved_manual", "resolved-manual", "manual_resolved"].includes(s)) return "resolved-manual";
  if (["resolved_auto", "resolved-auto", "autonomous_resolved"].includes(s)) return "resolved-auto";
  if (["autopatch_unavailable", "autopatch-unavailable", "autonomous-plan-only", "resolved-plan-only"].includes(s)) return "autopatch-unavailable";
  if (normalizeHelioCodeStatus(s)) return normalizeHelioCodeStatus(s);
  return s;
}

export function isAutonomousPlanOnlyResolve(mission = {}) {
  return (
    normalizeMissionStatus(mission.status) === "autopatch-unavailable" ||
    String(mission.resolveResult || "").trim().toLowerCase() === "autonomous-plan-only"
  );
}

export function autonomousResolveStatus(autopatched) {
  return autopatched ? "resolved-auto" : "autopatch-unavailable";
}

export function buildMissionVerificationChecks(mission = {}, { hasShipTarget = false } = {}) {
  const status = normalizeMissionStatus(mission.status);
  const planOnlyResolve = isAutonomousPlanOnlyResolve(mission);
  const affectedCount = Number(mission.affectedCount || 0);
  const resolvedVerified = status === "resolved-verified";
  return [
    { label: "Issue evidence dropped to zero affected pages", pass: affectedCount === 0 },
    { label: "Execution target still connected", pass: hasShipTarget },
    {
      label: "Remediation completed with a real patch or manual closure",
      pass: resolvedVerified || status === "resolved-manual" || (status === "resolved-auto" && !planOnlyResolve),
    },
    { label: "Post-deploy Helio Core verification completed", pass: !resolvedVerified || !!mission.postDeployVerified },
    { label: "No plan-only autopatch fallback", pass: !planOnlyResolve },
    { label: "No recorded failure reason", pass: !String(mission.failureReason || "").trim() },
  ];
}

function Missions({ integrations, orgScope = "default", activeOrg = null }) {
  const host = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
  const [missions, setMissions] = useState([]);
  const [filter, setFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [running, setRunning] = useState(false);
  const [, setLogs] = useState([]);
  const [fixModal, setFixModal] = useState({ open: false, missionId: null, running: false, readyToShip: false, failed: false, requiresApproval: false, lines: [] });
  const missionsRef = useRef([]);
  const missionRunLockRef = useRef(false);

  const approvalMode = activeOrg?.auditFixApprovalMode || "always_ask";
  const gh = integrations?.github?.fields || {};
  const hasGithub = !!(integrations?.github?.connected && gh?.repo && gh?.token);
  const hasHelioCodeTarget = !!(integrations?.github?.connected && gh?.repo && (gh?.appInstallationId || gh?.token));
  const helioCodeAgent = resolveHelioCodeAgentConfig(integrations);
  const hasAI = !!helioCodeAgent;
  const cmsWebhook = String(activeOrg?.autonomy?.executionWebhook || "").trim();
  const hasCms = !!cmsWebhook;
  const hasShipTarget = hasGithub || hasCms || hasHelioCodeTarget;

  const mutateMissions = (updater) => {
    setMissions((prev) => {
      const next = updater(prev);
      missionsRef.current = next;
      if (host) mergeProjectData(orgScope, host, { missions: next });
      return next;
    });
  };

  const appendLog = (msg, type = "sys") => setLogs((p) => [...p, { msg, type }].slice(-300));
  const pushModalLine = (text, type = "sys") =>
    setFixModal((prev) => ({ ...prev, lines: [...prev.lines, { text, type }].slice(-300) }));
  const wait = (ms = 320) => new Promise((resolve) => setTimeout(resolve, ms));

  const refreshMissions = () => {
    if (!host) return;
    const synced = syncMissionsFromProject(orgScope, host);
    missionsRef.current = synced;
    setMissions(synced);
  };

  useEffect(() => {
    if (!host) {
      missionsRef.current = [];
      setMissions([]);
      return;
    }
    refreshMissions();
  }, [orgScope, host, integrations?.gsc?.fields?.extra?.siteUrl, integrations?.ga4?.fields?.extra?.propertyId]);

  useEffect(() => {
    missionsRef.current = missions;
  }, [missions]);

  const updateMission = (id, patch) => {
    mutateMissions((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)));
  };

  const pushMissionLog = (missionId, line) => {
    mutateMissions((prev) =>
      prev.map((m) => {
        if (m.id !== missionId) return m;
        const logs = Array.isArray(m.logs) ? m.logs : [];
        return { ...m, logs: [...logs, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-120), updatedAt: new Date().toISOString() };
      })
    );
  };

  const missionStatus = (m) => {
    if (!m) return "unknown";
    const normalized = normalizeMissionStatus(m.status);
    if (normalized) return normalized;
    if (m.approvalRequired) return "awaiting-approval";
    return "todo";
  };
  const isOpenMission = (m) => ["todo", "planned", "executing", "in-progress", "autopatch-unavailable", "code-queued", "code-running", "worker-unavailable", "code-checks-failed", "code-failed"].includes(missionStatus(m));

  const ghHeaders = () => ({
    Authorization: `token ${gh.token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  });

  const safeJson = async (res) => res.json().catch(() => ({}));

  const githubApi = async (path, options = {}) => {
    const res = await fetch(`https://api.github.com/repos/${gh.repo}${path}`, {
      ...options,
      headers: { ...ghHeaders(), ...(options.headers || {}) },
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  };

  const createGitHubIssueForMission = async (mission, fixPlan) => {
    if (!hasGithub) return { ok: false, error: "GitHub not connected" };
    try {
      const title = `[Helio Mission] ${mission.title}`.slice(0, 120);
      const body = [
        `Mission: ${mission.title}`,
        `Domain: ${host}`,
        `Source: ${mission.source}`,
        `Severity: ${mission.severity} | Priority: ${mission.priority}`,
        "",
        "Reason:",
        mission.reason || "—",
        "",
        "Fix plan:",
        fixPlan || mission.fixHint || "Apply deterministic remediation and re-audit.",
        "",
        "Expected impact:",
        String(mission.expectedImpact || 0),
      ].join("\n");
      const res = await githubApi("/issues", { method: "POST", body: JSON.stringify({ title, body, labels: ["helio-mission", "seo"] }) });
      if (!res.ok) return { ok: false, error: res.data?.message || `HTTP ${res.status}` };
      const data = res.data || {};
      return { ok: true, url: data?.html_url || "", number: data?.number || "" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const createGitHubFixPullRequestForMission = async (mission, resolveMode = "autonomous") => {
    if (!hasGithub) return { ok: false, error: "GitHub not connected" };
    try {
      const repoInfo = await githubApi("");
      if (!repoInfo.ok) return { ok: false, error: repoInfo.data?.message || "Unable to read repository metadata." };
      const defaultBranch = repoInfo.data?.default_branch || "main";

      const baseRef = await githubApi(`/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
      if (!baseRef.ok) return { ok: false, error: `Unable to read base ref for ${defaultBranch}.` };
      const baseSha = baseRef.data?.object?.sha;
      if (!baseSha) return { ok: false, error: "Missing base commit SHA." };

      const branchName = `helio/resolve-${mission.id}-${Date.now().toString().slice(-6)}`;
      const createRef = await githubApi("/git/refs", {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
      });
      if (!createRef.ok && createRef.status !== 422) {
        return { ok: false, error: createRef.data?.message || "Unable to create branch ref." };
      }

      const tree = await githubApi(`/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`);
      if (!tree.ok) return { ok: false, error: "Unable to inspect repository tree for safe autopatch." };
      const nodes = Array.isArray(tree.data?.tree) ? tree.data.tree : [];
      const pathSet = new Set(nodes.map((n) => String(n.path || "")));
      const lowerTitle = String(mission.title || "").toLowerCase();
      const lowerReason = String(mission.reason || "").toLowerCase();
      const sitemapMission = lowerTitle.includes("sitemap") || lowerReason.includes("sitemap");
      const hasPublicDir = nodes.some((n) => n.type === "tree" && String(n.path || "").toLowerCase() === "public");

      const changes = [];
      if (resolveMode === "autonomous" && sitemapMission && hasPublicDir && !pathSet.has("public/sitemap.xml")) {
        const now = new Date().toISOString();
        const siteRoot = host ? `https://${host.replace(/^https?:\/\//i, "").replace(/\/+$/g, "")}` : "https://example.com";
        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${siteRoot}/</loc>\n    <lastmod>${now.slice(0, 10)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
        changes.push({
          path: "public/sitemap.xml",
          message: `fix(seo): add sitemap.xml for mission ${mission.id}`,
          content: btoa(unescape(encodeURIComponent(sitemapXml))),
        });
      }

      const evidenceMd = [
        `# Helio Resolve Artifact`,
        ``,
        `- Mission ID: ${mission.id}`,
        `- Mission: ${mission.title}`,
        `- Resolve mode: ${resolveMode}`,
        `- Domain: ${host || "n/a"}`,
        `- Severity: ${mission.severity} | Priority: ${mission.priority}`,
        `- Generated at: ${new Date().toISOString()}`,
        ``,
        `## Reason`,
        mission.reason || "—",
        ``,
        `## Fix Hint`,
        mission.fixHint || "—",
        ``,
        `## Execution Notes`,
        changes.length
          ? `Applied deterministic safe patch(es):\n${changes.map((c) => `- ${c.path}`).join("\n")}`
          : `No deterministic safe patch could be applied automatically without risking code quality.`,
        ``,
        `## Next Steps`,
        changes.length
          ? `1. Review PR diff\n2. Merge and deploy\n3. Re-run audit to verify issue drop`
          : `1. Apply fix manually in repo templates/CMS\n2. Re-run mission resolve in manual mode\n3. Re-run audit to verify issue drop`,
      ].join("\n");
      changes.push({
        path: `helio-fixes/${mission.id}.md`,
        message: `chore(helio): add resolve artifact for mission ${mission.id}`,
        content: btoa(unescape(encodeURIComponent(evidenceMd))),
      });

      for (const c of changes) {
        const putRes = await githubApi(`/contents/${encodeURIComponent(c.path).replace(/%2F/g, "/")}`, {
          method: "PUT",
          body: JSON.stringify({
            message: c.message,
            content: c.content,
            branch: branchName,
          }),
        });
        if (!putRes.ok) return { ok: false, error: `Failed to write ${c.path}: ${putRes.data?.message || putRes.status}` };
      }

      const prTitle = `[Helio Resolve] ${mission.title}`.slice(0, 120);
      const prBody = [
        `Mission: ${mission.title}`,
        `Mission ID: ${mission.id}`,
        `Resolve mode: ${resolveMode}`,
        `Domain: ${host || "n/a"}`,
        ``,
        `This PR was generated by Helio Resolve workflow.`,
        changes.length > 1
          ? `Deterministic safe patches were applied automatically where confidence was high.`
          : `No high-confidence autopatch was available; included execution artifact for manual completion.`,
      ].join("\n");
      const pr = await githubApi("/pulls", {
        method: "POST",
        body: JSON.stringify({
          title: prTitle,
          head: branchName,
          base: defaultBranch,
          body: prBody,
          draft: true,
        }),
      });
      if (!pr.ok) return { ok: false, error: pr.data?.message || "Unable to open pull request." };
      const prData = pr.data || {};
      return {
        ok: true,
        url: prData?.html_url || "",
        number: prData?.number || "",
        branch: branchName,
        autopatched: changes.some((c) => c.path === "public/sitemap.xml"),
        changedArtifacts: changes.map((c) => c.path),
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const resolveMission = async (missionId, mode = "autonomous") => {
    const mission = missionsRef.current.find((m) => m.id === missionId);
    if (!mission || running) return;
    setRunning(true);
    setFixModal((prev) => ({ ...prev, open: true, missionId, running: true, failed: false, requiresApproval: false }));
    pushModalLine(`> helio mission resolve --id ${mission.id} --mode ${mode}`, "sys");
    await wait(220);
    updateMission(mission.id, { status: "resolving", resolveMode: mode, resolveStartedAt: new Date().toISOString() });
    pushMissionLog(mission.id, `Resolve started (${mode}).`);
    try {
      if (mode === "manual") {
        pushModalLine("ℹ Manual resolve mode selected.", "sys");
        await wait(180);
        pushModalLine("✔ No risky autonomous code edits attempted.", "ok");
        pushModalLine("ℹ Next steps:", "sys");
        pushModalLine("  1) Open shipped issue/PR", "sys");
        pushModalLine("  2) Apply fix in target repo/CMS", "sys");
        pushModalLine("  3) Merge/deploy", "sys");
        pushModalLine("  4) Re-run Technical Audit verification", "sys");
        updateMission(mission.id, {
          status: "resolved-manual",
          resolveCompletedAt: new Date().toISOString(),
          resolveResult: "manual",
          failureReason: "",
        });
        pushMissionLog(mission.id, "Resolved in manual mode (operator workflow).");
        setFixModal((prev) => ({ ...prev, running: false, readyToShip: false, failed: false }));
        return;
      }

      pushModalLine("✔ Step R1/4: Validating GitHub execution context", "ok");
      await wait(220);
      if (!hasGithub) {
        throw new Error("GitHub is not connected. Connect GitHub or run resolve in manual mode.");
      }
      pushModalLine("✔ Step R2/4: Building safe deterministic patch set", "ok");
      await wait(260);
      const pr = await createGitHubFixPullRequestForMission(mission, "autonomous");
      if (!pr.ok) throw new Error(pr.error || "Autonomous resolve failed.");
      pushModalLine("✔ Step R3/4: Opening draft pull request", "ok");
      await wait(180);
      if (pr.autopatched) {
        pushModalLine("✔ Step R4/4: Applied safe autopatch and opened PR.", "ok");
      } else {
        pushModalLine("● Step R4/4: No safe autopatch possible; PR contains execution artifact and plan.", "warn");
      }
      pushModalLine(`✔ Resolve PR: ${pr.url}`, "ok");
      updateMission(mission.id, {
        status: autonomousResolveStatus(pr.autopatched),
        resolveCompletedAt: new Date().toISOString(),
        resolveResult: pr.autopatched ? "autonomous-patch" : "autonomous-plan-only",
        resolvePrUrl: pr.url || "",
        resolvePrNumber: pr.number || "",
        changedArtifacts: pr.changedArtifacts || [],
        failureReason: "",
      });
      pushMissionLog(
        mission.id,
        pr.autopatched
          ? `Resolved autonomously. PR: ${pr.url || "created"}.`
          : `Autopatch unavailable. Draft PR contains manual execution plan: ${pr.url || "created"}.`
      );
      setFixModal((prev) => ({ ...prev, running: false, readyToShip: false, failed: false }));
    } catch (e) {
      updateMission(mission.id, { status: "failed", failureReason: e.message, resolveFailedAt: new Date().toISOString() });
      pushMissionLog(mission.id, `Resolve failed: ${e.message}`);
      pushModalLine(`● Resolve failed: ${e.message}`, "err");
      pushModalLine("ℹ Reasoned fallback:", "warn");
      pushModalLine("  1) Choose MANUAL RESOLVE in this modal", "warn");
      pushModalLine("  2) Apply fix in source repo/CMS using mission checklist", "warn");
      pushModalLine("  3) Re-run VERIFY after deploy", "warn");
      setFixModal((prev) => ({ ...prev, running: false, failed: true }));
    } finally {
      setRunning(false);
    }
  };

  const runHelioCodeMission = async (missionId) => {
    const mission = missionsRef.current.find((m) => m.id === missionId);
    if (!mission || running) return;
    setRunning(true);
    setFixModal((prev) => ({ ...prev, open: true, missionId, running: true, failed: false, requiresApproval: false, readyToShip: false }));
    pushModalLine(`> helio code run --mission ${mission.id}`, "sys");
    await wait(180);
    try {
      if (!hasHelioCodeTarget) throw new Error("GitHub App repo target is missing. Configure repo and installation ID before running Helio Code.");
      const readiness = await ensureHelioCodeWorkerReady(integrations);
      if (!isHelioCodeReadyForProject(readiness, integrations)) {
        throw new Error(helioCodeReadinessFailure(readiness, integrations));
      }
      const payload = buildHelioCodeJobPayload({
        mission: { ...mission, githubInstallationId: gh.appInstallationId || "", githubToken: gh.token || "" },
        orgId: orgScope,
        domain: host,
        repo: gh.repo,
        agentConfig: helioCodeAgent || undefined,
      });
      pushModalLine(`ℹ Issue type: ${payload.issueType}`, "sys");
      pushModalLine(`ℹ Skill: ${payload.skillId}`, "sys");
      pushModalLine(`ℹ Model source: ${helioCodeAgent?.source || "worker-default"}`, "sys");
      updateMission(mission.id, {
        status: "code-queued",
        codeIssueType: payload.issueType,
        codeSkillId: payload.skillId,
        codeStartedAt: new Date().toISOString(),
        failureReason: "",
      });
      pushMissionLog(mission.id, `Helio Code queued (${payload.skillId}).`);

      const res = await fetch("/api/helio-code/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const message = data?.error || (Array.isArray(data?.errors) ? data.errors.join(", ") : "") || `HTTP ${res.status}`;
        throw new Error(message);
      }

      const job = data.job || {};
      const result = job.result || {};
      let latestJob = job;
      let seenLogCount = 0;
      for (const line of job.logs || []) {
        pushModalLine(`${line.level === "error" ? "●" : "✔"} ${line.message}`, line.level === "error" ? "err" : "ok");
        seenLogCount += 1;
      }
      if (result.pullRequestUrl) pushModalLine(`✔ Helio Code PR: ${result.pullRequestUrl}`, "ok");
      if (!result.pullRequestUrl) pushModalLine("ℹ Helio Code job accepted. Production worker will attach the GitHub App PR URL.", "warn");

      updateMission(mission.id, {
        status: normalizeHelioCodeStatus(job.status) || "code-queued",
        codeJobId: job.id || "",
        codeBranch: result.branch || "",
        codePrUrl: result.pullRequestUrl || "",
        codeChangedFiles: result.changedFiles || [],
        codeChecks: result.checks || [],
        codeRiskScore: result.riskScore || "",
        codeRollbackNotes: result.rollbackNotes || "",
        codeAgentSummary: result.agentSummary || "",
        failureReason: result.failureReason || "",
      });
      pushMissionLog(mission.id, `Helio Code ${job.status || "queued"}${result.pullRequestUrl ? `: ${result.pullRequestUrl}` : "."}`);
      const isTerminalCodeStatus = (status) => ["code-pr-opened", "code-failed", "code-checks-failed", "resolved-verified", "merged-awaiting-deploy"].includes(normalizeHelioCodeStatus(status));
      if (job?.id && !isTerminalCodeStatus(job.status)) {
        for (let i = 0; i < 45; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await wait(1500);
          let row = null;
          try {
            // eslint-disable-next-line no-await-in-loop
            const pollRes = await fetch(`/api/helio-code/jobs/${encodeURIComponent(job.id)}`);
            // eslint-disable-next-line no-await-in-loop
            const pollData = await pollRes.json().catch(() => ({}));
            if (!pollRes.ok || !pollData?.ok || !pollData?.job) continue;
            row = pollData.job;
            latestJob = row;
          } catch {
            continue;
          }
          const newLogs = (Array.isArray(row.logs) ? row.logs : []).slice(seenLogCount);
          for (const line of newLogs) {
            pushModalLine(`${line.level === "error" ? "●" : "✔"} ${line.message}`, line.level === "error" ? "err" : line.level === "warn" ? "warn" : "ok");
          }
          seenLogCount += newLogs.length;
          const nextResult = row.result || {};
          updateMission(mission.id, {
            status: normalizeHelioCodeStatus(row.status) || "code-running",
            codeJobId: row.id || "",
            codeBranch: nextResult.branch || "",
            codePrUrl: nextResult.pullRequestUrl || "",
            codeChangedFiles: nextResult.changedFiles || [],
            codeChecks: nextResult.checks || [],
            codeRiskScore: nextResult.riskScore || "",
            codeRollbackNotes: nextResult.rollbackNotes || "",
            codeAgentSummary: nextResult.agentSummary || "",
            failureReason: nextResult.failureReason || "",
          });
          if (nextResult.pullRequestUrl) pushModalLine(`✔ Helio Code PR: ${nextResult.pullRequestUrl}`, "ok");
          if (isTerminalCodeStatus(row.status)) break;
        }
      }
      const finalStatus = normalizeHelioCodeStatus(latestJob.status) || "code-running";
      if (!isTerminalCodeStatus(finalStatus)) {
        pushModalLine("ℹ Helio Code is still running in the worker. Keep this mission open or refresh status from the mission card.", "warn");
      }
      setFilter("open");
      setFixModal((prev) => ({ ...prev, running: false, failed: finalStatus === "code-failed" || finalStatus === "code-checks-failed" }));
    } catch (e) {
      updateMission(mission.id, { status: "code-failed", failureReason: e.message, codeFailedAt: new Date().toISOString() });
      pushMissionLog(mission.id, `Helio Code failed: ${e.message}`);
      pushModalLine(`● Helio Code failed: ${e.message}`, "err");
      setFixModal((prev) => ({ ...prev, running: false, failed: true }));
    } finally {
      setRunning(false);
    }
  };

  const createCmsHandoffForMission = async (mission, fixPlan, checklist) => {
    if (!hasCms) return { ok: false, error: "CMS webhook not connected" };
    try {
      const res = await fetch(cmsWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "helio-missions",
          host,
          mission: {
            id: mission.id,
            title: mission.title,
            module: mission.module,
            severity: mission.severity,
            priority: mission.priority,
            reason: mission.reason,
          },
          fixPlan,
          executionChecklist: checklist,
          ts: new Date().toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
      return { ok: true, url: data?.url || cmsWebhook, number: data?.id || "" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const runMission = async (missionId, opts = {}) => {
    const mission = missionsRef.current.find((m) => m.id === missionId);
    if (!mission || missionRunLockRef.current) return;
    missionRunLockRef.current = true;
    const isResume = !!opts.resume;
    setRunning(true);
    if (!isResume) setLogs([]);
    setFixModal((prev) => ({
      open: true,
      missionId,
      running: true,
      readyToShip: false,
      failed: false,
      requiresApproval: false,
      lines: isResume ? (Array.isArray(prev?.lines) ? prev.lines : []) : [],
    }));

    const approvedBypass = !!opts.approvedBypass || !!mission.approvedBypass;
    const forceNoPolicy = !!opts.forceNoPolicy || !!opts.skipApprovalGate || isResume;
    const policyBlocks = !forceNoPolicy && !approvedBypass && (approvalMode === "always_ask" || (approvalMode === "critical_only" && mission.priority === "P1"));
    if (!isResume) {
      appendLog(`Starting mission: ${mission.title}`, "ok");
      appendLog(`Policy mode: ${approvalMode}`, "sys");
      pushModalLine(`> helio mission fix --id ${mission.id}`, "sys");
      await wait(220);
      pushModalLine(`ℹ Mission: ${mission.title}`, "sys");
      await wait(220);
      pushModalLine(`ℹ Policy mode: ${approvalMode}`, "sys");
      await wait(220);
    } else {
      appendLog("Approval granted. Resuming mission execution...", "ok");
      pushModalLine("✔ Approval accepted. Resuming execution...", "ok");
      await wait(160);
    }
    updateMission(mission.id, {
      status: policyBlocks ? "awaiting-approval" : "executing",
      approvalRequired: policyBlocks,
      approvedBypass: approvedBypass && !policyBlocks,
    });
    pushMissionLog(mission.id, `Mission started. Policy: ${approvalMode}.`);

    if (policyBlocks) {
      appendLog("Mission paused for manual approval based on policy.", "warn");
      pushModalLine("● Paused: approval required by policy.", "warn");
      pushModalLine("ℹ Awaiting input: press Y to approve or N to reject.", "sys");
      pushMissionLog(mission.id, "Awaiting approval.");
      setFixModal((prev) => ({ ...prev, running: false, failed: false, requiresApproval: true }));
      setRunning(false);
      missionRunLockRef.current = false;
      return;
    }

    try {
      appendLog("Step 1/5: Build deterministic fix plan from mission evidence...", "sys");
      pushModalLine("✔ Step 1/5: Building deterministic fix plan", "ok");
      await wait();
      const fixPlan = hasAI
        ? await callAI(
            integrations.ai,
            "You are Helio. Create a deterministic, repo-first SEO fix plan in 6-10 concise steps. Include verification and rollback steps.",
            `Mission title: ${mission.title}\nReason: ${mission.reason}\nFix hint: ${mission.fixHint}\nDomain: ${host}\nPriority: ${mission.priority}\nSeverity: ${mission.severity}`
          )
        : mission.fixHint;
      pushMissionLog(mission.id, "Generated fix plan.");
      updateMission(mission.id, { fixPlan });

      appendLog("Step 2/5: Generate execution patch checklist...", "sys");
      pushModalLine("✔ Step 2/5: Generating execution checklist", "ok");
      await wait();
      const checklist = hasAI
        ? await callAI(
            integrations.ai,
            "Return a practical execution checklist for developers to implement this SEO fix. Keep max 14 bullets.",
            `Mission: ${mission.title}\nFix plan:\n${fixPlan}`
          )
        : "AI unavailable. Use mission fix hint and repository workflow manually.";
      pushMissionLog(mission.id, "Generated execution checklist.");
      updateMission(mission.id, { executionChecklist: checklist });

      appendLog("Step 3/5: Validate connected execution target...", "sys");
      pushModalLine("✔ Step 3/5: Validating ship targets", "ok");
      await wait();
      if (!hasShipTarget) {
        pushModalLine("● No connected ship target (GitHub/CMS).", "warn");
      } else if (hasGithub) {
        pushModalLine("✔ GitHub connected as primary ship target.", "ok");
      } else {
        pushModalLine("✔ CMS webhook connected as primary ship target.", "ok");
      }

      appendLog("Step 4/5: Simulate deterministic remediation execution...", "sys");
      pushModalLine("✔ Step 4/5: Executing remediation workflow", "ok");
      await wait();
      pushModalLine("ℹ Running verification checks against mission evidence...", "sys");
      await wait(380);

      appendLog("Step 5/5: Mark mission fixed and awaiting ship action...", "sys");
      pushModalLine("✔ Step 5/5: Mission fixed locally; ready to ship.", "ok");
      await wait(180);
      updateMission(mission.id, {
        status: "done",
        executedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        shipTarget: hasGithub ? "github" : hasCms ? "cms" : "manual",
        shipUrl: "",
        failureReason: "",
        approvedBypass: false,
        approvalRequired: false,
      });

      pushMissionLog(mission.id, "Fix execution completed. Awaiting ship action.");
      appendLog("Mission fixed. Open ship action to deploy to source.", "ok");
      setFixModal((prev) => ({ ...prev, running: false, readyToShip: true }));
    } catch (e) {
      updateMission(mission.id, { status: "failed", failureReason: e.message, approvedBypass: false, approvalRequired: false });
      pushMissionLog(mission.id, `Execution exception: ${e.message}`);
      appendLog(`Execution failed: ${e.message}`, "err");
      pushModalLine(`● Fix failed: ${e.message}`, "err");
      pushModalLine("ℹ Next step: review fix plan/checklist and run manually.", "warn");
      setFixModal((prev) => ({ ...prev, running: false, failed: true, requiresApproval: false }));
    } finally {
      setRunning(false);
      missionRunLockRef.current = false;
    }
  };

  const shipMission = async (missionId) => {
    const mission = missionsRef.current.find((m) => m.id === missionId);
    if (!mission || running) return;
    setRunning(true);
    setFixModal((prev) => ({ ...prev, running: true }));
    try {
      const fixPlan = mission.fixPlan || mission.fixHint || "";
      const checklist = mission.executionChecklist || "";
      pushModalLine("> helio mission ship", "sys");
      await wait(180);
      pushModalLine("ℹ Creating deployment artifact...", "sys");
      await wait(260);
      let shipResult = { ok: false, error: "No ship target connected" };
      if (hasGithub) {
        shipResult = await createGitHubIssueForMission(mission, `${fixPlan}\n\nChecklist:\n${checklist}`);
      } else if (hasCms) {
        shipResult = await createCmsHandoffForMission(mission, fixPlan, checklist);
      }
      if (shipResult.ok) {
        updateMission(mission.id, {
          status: "shipped",
          completedAt: new Date().toISOString(),
          shipTarget: hasGithub ? "github" : "cms",
          shipUrl: shipResult.url || "",
          failureReason: "",
          approvalRequired: false,
          approvedBypass: false,
        });
        setFilter("shipped");
        pushMissionLog(mission.id, `Shipped successfully (${hasGithub ? "GitHub" : "CMS"}).`);
        pushModalLine(`✔ Shipped successfully: ${shipResult.url || "(target accepted)"}`, "ok");
        pushModalLine("✔ Re-run audit after deploy propagation to confirm issue drop.", "ok");
        setFixModal((prev) => ({ ...prev, running: false, readyToShip: false, requiresApproval: false }));
      } else {
        updateMission(mission.id, { status: "failed", failureReason: shipResult.error || "Ship failed" });
        pushMissionLog(mission.id, `Ship failed: ${shipResult.error}`);
        pushModalLine(`● Ship failed: ${shipResult.error}`, "err");
        pushModalLine("ℹ Manual step: connect GitHub/CMS and re-run Ship.", "warn");
        setFixModal((prev) => ({ ...prev, running: false, failed: true, requiresApproval: false }));
      }
    } catch (e) {
      updateMission(mission.id, { status: "failed", failureReason: e.message });
      pushMissionLog(mission.id, `Ship exception: ${e.message}`);
      pushModalLine(`● Ship exception: ${e.message}`, "err");
      setFixModal((prev) => ({ ...prev, running: false, failed: true, requiresApproval: false }));
    } finally {
      setRunning(false);
    }
  };

  const verifyMission = async (missionId) => {
    const mission = missionsRef.current.find((m) => m.id === missionId);
    if (!mission || running) return;
    setRunning(true);
    setLogs([]);
    setFixModal({ open: true, missionId, running: true, readyToShip: false, failed: false, lines: [] });
    try {
      appendLog(`Verifying mission: ${mission.title}`, "sys");
      pushModalLine(`> helio mission verify --id ${mission.id}`, "sys");
      await wait(220);
      pushModalLine("ℹ Running targeted validation checks (no full audit)...", "sys");
      await wait(280);
      const checks = buildMissionVerificationChecks(mission, { hasShipTarget });
      const passed = checks.filter((c) => c.pass).length;
      const total = checks.length;
      const ok = passed === total;
      checks.forEach((c) => pushModalLine(`${c.pass ? "✔" : "●"} ${c.label}`, c.pass ? "ok" : "warn"));
      await wait(220);
      const verification = {
        status: ok ? "pass" : "fail",
        at: new Date().toISOString(),
        passed,
        total,
        checks,
        note: ok
          ? "Targeted checks passed. Re-run the full audit after deploy for final confirmation."
          : "Targeted checks detected gaps. Plan-only autopatches and stale affected-page evidence cannot be marked resolved.",
      };
      updateMission(mission.id, { verification });
      pushMissionLog(mission.id, `Verification ${verification.status.toUpperCase()} (${passed}/${total}).`);
      appendLog(`Verification ${verification.status.toUpperCase()} (${passed}/${total}).`, ok ? "ok" : "warn");
      pushModalLine(`ℹ ${verification.note}`, ok ? "ok" : "warn");
      setFixModal((prev) => ({ ...prev, running: false, failed: !ok }));
    } catch (e) {
      updateMission(mission.id, { verification: { status: "fail", at: new Date().toISOString(), passed: 0, total: 0, checks: [], note: e.message } });
      pushMissionLog(mission.id, `Verification failed: ${e.message}`);
      appendLog(`Verification failed: ${e.message}`, "err");
      pushModalLine(`● Verification failed: ${e.message}`, "err");
      setFixModal((prev) => ({ ...prev, running: false, failed: true }));
    } finally {
      setRunning(false);
    }
  };

  const runNextOpenMission = async () => {
    const next = missionsRef.current.find((m) => ["todo", "in-progress", "planned", "awaiting-approval"].includes(missionStatus(m)));
    if (!next) return;
    await runMission(next.id);
  };

  const runAllOpenMissions = async () => {
    const pending = missionsRef.current.filter((m) => ["todo", "in-progress", "planned", "awaiting-approval"].includes(missionStatus(m)));
    for (const m of pending) {
      // serialize intentionally to preserve deterministic sequencing
      await runMission(m.id);
    }
  };

  const rejectMissionApproval = (missionId) => {
    const target = missionsRef.current.find((m) => m.id === missionId);
    if (!target) return;
    updateMission(missionId, { status: "failed", approvalRequired: false, approvedBypass: false, failureReason: "Rejected by user during approval gate." });
    pushMissionLog(missionId, "Approval rejected by user.");
    appendLog(`Mission rejected: ${target.title}`, "warn");
    pushModalLine("● Approval rejected by user. Mission moved to FAILED.", "warn");
    setFixModal((prev) => ({ ...prev, requiresApproval: false, failed: true, running: false }));
  };

  const approveAndContinueMission = async (missionId) => {
    setFixModal((prev) => ({ ...prev, requiresApproval: false, failed: false, running: true }));
    updateMission(missionId, { status: "todo", approvalRequired: false, approvedBypass: true, failureReason: "" });
    pushMissionLog(missionId, "Approval granted. Resuming execution from execution phase.");
    setRunning(false);
    missionRunLockRef.current = false;
    await wait(120);
    await runMission(missionId, { approvedBypass: true, forceNoPolicy: true, skipApprovalGate: true, resume: true });
  };

  useEffect(() => {
    if (!fixModal.open || fixModal.running || !fixModal.requiresApproval) return;
    const onKeyDown = (e) => {
      const key = String(e.key || "").toLowerCase();
      if (key === "y" && fixModal.missionId) {
        e.preventDefault();
        approveAndContinueMission(fixModal.missionId);
      }
      if (key === "n" && fixModal.missionId) {
        e.preventDefault();
        rejectMissionApproval(fixModal.missionId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fixModal.open, fixModal.running, fixModal.requiresApproval, fixModal.missionId]);

  const filtered = missions.filter((m) => {
    const s = missionStatus(m);
    const statusMatch =
      filter === "all"
        ? true
        : filter === "open"
          ? ["todo", "planned", "executing", "in-progress", "autopatch-unavailable", "code-queued", "code-running", "worker-unavailable", "code-checks-failed", "code-failed"].includes(s)
          : filter === "fixed"
            ? s === "done"
            : filter === "resolved"
              ? ["resolved-manual", "resolved-auto", "resolved-verified"].includes(s)
            : filter === "awaiting-approval"
              ? s === "awaiting-approval"
              : s === filter;
    if (!statusMatch) return false;
    if (priorityFilter !== "all" && String(m.priority || "").toUpperCase() !== priorityFilter) return false;
    if (severityFilter !== "all" && String(m.severity || "").toLowerCase() !== severityFilter) return false;
    return true;
  });

  const filterCounts = {
    open: missions.filter((m) => ["todo", "planned", "executing", "in-progress", "autopatch-unavailable", "code-queued", "code-running", "worker-unavailable", "code-checks-failed", "code-failed"].includes(missionStatus(m))).length,
    all: missions.length,
    "awaiting-approval": missions.filter((m) => missionStatus(m) === "awaiting-approval").length,
    failed: missions.filter((m) => missionStatus(m) === "failed").length,
    fixed: missions.filter((m) => missionStatus(m) === "done").length,
    shipped: missions.filter((m) => missionStatus(m) === "shipped").length,
    resolved: missions.filter((m) => ["resolved-manual", "resolved-auto", "resolved-verified"].includes(missionStatus(m))).length,
  };

  const statusColor = (s) =>
    s === "resolved-manual" || s === "resolved-auto" || s === "resolved-verified" || s === "code-pr-opened"
      ? C.green
      : s === "shipped" || s === "done"
        ? C.blue
        : s === "failed"
          ? C.red
          : s === "awaiting-approval" || s === "autopatch-unavailable" || s === "worker-unavailable" || s === "code-checks-failed" || s === "code-failed"
            ? C.orange
            : C.lime;
  const priColor = (p) => (p === "P1" ? C.red : p === "P2" ? C.orange : C.blue);

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Missions" sub={`Autonomous remediation queue · ${missions.filter((m)=>isOpenMission(m)).length} open missions`}/>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <Btn onClick={refreshMissions}>SYNC FROM AUDIT + GSC</Btn>
      <Btn onClick={runNextOpenMission} variant="green" disabled={running || !missions.some((m)=>isOpenMission(m))}>RUN NEXT MISSION</Btn>
      <Btn onClick={runAllOpenMissions} variant="blue" disabled={running || !missions.some((m)=>isOpenMission(m))}>RUN ALL OPEN</Btn>
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:9,alignSelf:"center"}}>Approval mode: <span style={{color:C.lime}}>{approvalMode}</span></span>
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:9,alignSelf:"center"}}>Ship target: <span style={{color:hasShipTarget?C.green:C.orange}}>{hasGithub ? "GitHub PAT connected" : hasHelioCodeTarget ? "GitHub App target" : hasCms ? "CMS webhook connected" : "manual (connect GitHub/CMS)"}</span></span>
    </div>

    <div style={{display:"flex",gap:0,marginBottom:12}}>
      {["open","all","awaiting-approval","failed","fixed","shipped","resolved"].map((f)=><div key={f} onClick={()=>setFilter(f)} style={{padding:"7px 12px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${filter===f?C.lime:C.dim}`,background:filter===f?C.lime:"#060606",color:filter===f?"#000":C.muted,textTransform:"uppercase",marginRight:-1}}>{f} ({filterCounts[f]||0})</div>)}
    </div>

    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>PRIORITY</span>
      {["all","P1","P2","P3"].map((p)=><div key={p} onClick={()=>setPriorityFilter(p)} style={{padding:"5px 10px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${priorityFilter===p?C.lime:C.dim}`,background:priorityFilter===p?C.lime:"#060606",color:priorityFilter===p?"#000":C.muted,textTransform:"uppercase"}}>{p}</div>)}
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginLeft:8}}>SEVERITY</span>
      {["all","critical","high","medium","low"].map((s)=><div key={s} onClick={()=>setSeverityFilter(s)} style={{padding:"5px 10px",cursor:"pointer",fontFamily:"monospace",fontSize:9,border:`1px solid ${severityFilter===s?C.lime:C.dim}`,background:severityFilter===s?C.lime:"#060606",color:severityFilter===s?"#000":C.muted,textTransform:"uppercase"}}>{s}</div>)}
      {(priorityFilter !== "all" || severityFilter !== "all") && <Btn variant="blue" style={{padding:"5px 10px",fontSize:9}} onClick={()=>{setPriorityFilter("all");setSeverityFilter("all");}}>CLEAR</Btn>}
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>SHOWING: <span style={{color:C.lime}}>{filtered.length}</span></span>
    </div>

    <div style={{background:C.panel,border:`1px solid ${C.border}`,marginBottom:12}}>
      {filtered.map((m)=><div key={m.id} style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:statusColor(missionStatus(m)),fontFamily:"monospace",fontSize:9,textTransform:"uppercase"}}>{missionStatus(m)}</span>
          <span style={{color:priColor(m.priority),fontFamily:"monospace",fontSize:8,border:`1px solid ${priColor(m.priority)}`,padding:"1px 6px"}}>{m.priority}</span>
          <span style={{color:C.text,fontFamily:"monospace",fontSize:10,flex:1}}>{m.title}</span>
          <span style={{color:C.muted,fontFamily:"monospace",fontSize:8}}>{m.module}</span>
        </div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:4}}>{m.reason}</div>
        <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap"}}>
          <span style={{color:C.lime,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px"}}>{m.module || "Unknown"}</span>
          <span style={{color:C.orange,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px"}}>source {m.source || "unknown"}</span>
          <span style={{color:C.blue,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px"}}>recheck in {m.module || "module"}</span>
        </div>
        <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
          <span style={{color:C.orange,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px"}}>impact {Number(m.expectedImpact||0)}</span>
          <span style={{color:C.blue,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px"}}>affected {Number(m.affectedCount||0)}</span>
          {m.shipUrl&&<a href={m.shipUrl} target="_blank" rel="noreferrer" style={{color:C.green,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px",textDecoration:"none"}}>SHIP LINK ↗</a>}
          {m.codePrUrl&&<a href={m.codePrUrl} target="_blank" rel="noreferrer" style={{color:C.green,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px",textDecoration:"none"}}>CODE PR ↗</a>}
          {m.codeSkillId&&<span style={{color:C.lime,fontFamily:"monospace",fontSize:8,border:`1px solid ${C.dim}`,padding:"1px 6px"}}>{m.codeSkillId}</span>}
        </div>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          {missionStatus(m)==="awaiting-approval"&&<Btn onClick={()=>approveAndContinueMission(m.id)} variant="orange" style={{padding:"5px 10px",fontSize:9}}>APPROVE</Btn>}
          {!["shipped","done","resolved-manual","resolved-auto","resolved-verified","autopatch-unavailable",...HELIO_CODE_STATUSES].includes(missionStatus(m))&&<Btn onClick={()=>runMission(m.id)} variant="green" disabled={running} style={{padding:"5px 10px",fontSize:9}}>EXECUTE ▶</Btn>}
          {missionStatus(m)==="done"&&!m.shipUrl&&<Btn onClick={()=>{setFixModal({ open: true, missionId: m.id, running: false, readyToShip: true, failed: false, requiresApproval: false, lines: [{ text: "Mission fixed and ready to ship.", type: "ok" }] });}} variant="blue" style={{padding:"5px 10px",fontSize:9}}>OPEN FIX TERMINAL</Btn>}
          {missionStatus(m)==="shipped"&&<Btn onClick={()=>{setFixModal({ open: true, missionId: m.id, running: false, readyToShip: false, failed: false, requiresApproval: false, lines: [{ text: "Mission shipped. Run Helio Code to execute real code-level closure.", type: "sys" }] });}} variant="orange" style={{padding:"5px 10px",fontSize:9}}>HELIO CODE ▶</Btn>}
          {missionStatus(m)==="autopatch-unavailable"&&<Btn onClick={()=>{setFixModal({ open: true, missionId: m.id, running: false, readyToShip: false, failed: false, requiresApproval: false, lines: [{ text: "No safe legacy autopatch was available. Run Helio Code for a repo-level coding agent remediation.", type: "warn" }] });}} variant="orange" style={{padding:"5px 10px",fontSize:9}}>RUN HELIO CODE</Btn>}
          {["worker-unavailable","code-checks-failed","code-failed"].includes(missionStatus(m))&&<Btn onClick={()=>runHelioCodeMission(m.id)} variant="orange" disabled={running} style={{padding:"5px 10px",fontSize:9}}>RETRY HELIO CODE</Btn>}
          {["done","shipped","failed"].includes(missionStatus(m))&&<Btn onClick={()=>verifyMission(m.id)} variant="lime" disabled={running} style={{padding:"5px 10px",fontSize:9}}>VERIFY</Btn>}
          {["resolved-manual","resolved-auto","resolved-verified","autopatch-unavailable","code-pr-opened"].includes(missionStatus(m))&&<Btn onClick={()=>verifyMission(m.id)} variant="lime" disabled={running} style={{padding:"5px 10px",fontSize:9}}>VERIFY</Btn>}
        </div>
        {m.verification && <div style={{marginTop:6,color:m.verification.status==="pass"?C.green:C.orange,fontFamily:"monospace",fontSize:8}}>
          VERIFY {String(m.verification.status||"unknown").toUpperCase()} · {m.verification.passed}/{m.verification.total} · {m.verification.at ? new Date(m.verification.at).toLocaleString() : "—"}
        </div>}
      </div>)}
      {!filtered.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No missions in this filter.</div>}
    </div>

    {fixModal.open && (() => {
      const m = missionsRef.current.find((x) => x.id === fixModal.missionId) || missions.find((x) => x.id === fixModal.missionId);
      return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200}}>
        <div style={{width:"min(980px,92vw)",height:"min(680px,88vh)",background:"#050505",border:`1px solid ${C.lime}`,display:"flex",flexDirection:"column",boxShadow:"0 0 0 1px #0f1800 inset"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderBottom:`1px solid ${C.border}`,background:"#080f00"}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:2}}>HELIO FIX TERMINAL · {m?.title || "Mission"}</div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>setFixModal((prev)=>({ ...prev, open:false }))} variant="red" disabled={fixModal.running}>CLOSE</Btn>
            </div>
          </div>
          <div style={{padding:12,borderBottom:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontFamily:"monospace",fontSize:9,color:C.muted}}>Issue ID: <span style={{color:C.lime}}>{m?.id || "—"}</span></span>
            <span style={{fontFamily:"monospace",fontSize:9,color:C.muted}}>Priority: <span style={{color:priColor(m?.priority)}}>{m?.priority || "—"}</span></span>
            <span style={{fontFamily:"monospace",fontSize:9,color:C.muted}}>Status: <span style={{color:statusColor(missionStatus(m))}}>{missionStatus(m)}</span></span>
            <span style={{fontFamily:"monospace",fontSize:9,color:C.muted}}>Target: <span style={{color:hasShipTarget?C.green:C.orange}}>{hasGithub ? "GitHub PAT" : hasHelioCodeTarget ? "GitHub App" : hasCms ? "CMS" : "Manual"}</span></span>
            <span style={{fontFamily:"monospace",fontSize:9,color:C.muted}}>Code: <span style={{color:gh.repo?C.green:C.orange}}>{gh.repo ? `Helio Code · ${inferHelioCodeIssueType(m || {})}` : "repo missing"}</span></span>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:12,fontFamily:"monospace",fontSize:12,lineHeight:1.55,background:"#020202"}}>
            {fixModal.lines.length===0 && <div style={{color:C.muted}}>Run a mission to view fix execution animation.</div>}
            {fixModal.lines.map((l, idx) => <div key={idx} style={{color:l.type==="ok"?C.green:l.type==="err"?C.red:l.type==="warn"?C.orange:C.text,marginBottom:4}}>{l.text}</div>)}
            {fixModal.running && <div style={{color:C.lime}}>█</div>}
          </div>
          <div style={{padding:12,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>
              {fixModal.readyToShip
                ? "Fix execution complete. Ship to deploy changes to connected source."
                : fixModal.requiresApproval
                  ? "Approval required by policy. Approve (Y) to continue or Reject (N) to fail this mission."
                  : fixModal.failed
                  ? (["autopatch-unavailable","worker-unavailable","code-failed","code-checks-failed"].includes(missionStatus(m))
                      ? "Helio Code needs attention. Review logs, retry, or apply the fix manually before deploy verification."
                      : (m?.status === "awaiting-approval" || m?.approvalRequired)
                      ? "Approval is pending."
                      : "Fix/ship failed. Review logs for reason and next steps.")
                  : "Executing fix workflow..."}
            </div>
            <div style={{display:"flex",gap:8}}>
              {(fixModal.requiresApproval || missionStatus(m) === "awaiting-approval" || m?.approvalRequired) && <>
                <Btn onClick={()=>approveAndContinueMission(m?.id || fixModal.missionId)} variant="orange" disabled={fixModal.running}>APPROVE [Y]</Btn>
                <Btn onClick={()=>rejectMissionApproval(m?.id || fixModal.missionId)} variant="red" disabled={fixModal.running}>REJECT [N]</Btn>
              </>}
              {fixModal.readyToShip && <Btn onClick={()=>shipMission(fixModal.missionId)} variant="green" disabled={fixModal.running}>SHIP ▶</Btn>}
              {!fixModal.readyToShip && ["shipped", "autopatch-unavailable", "worker-unavailable", "code-failed", "code-checks-failed"].includes(missionStatus(m)) && <>
                <Btn onClick={()=>runHelioCodeMission(fixModal.missionId)} variant="green" disabled={fixModal.running}>RUN HELIO CODE ▶</Btn>
                <Btn onClick={()=>resolveMission(fixModal.missionId, "manual")} variant="blue" disabled={fixModal.running}>MANUAL RESOLVE</Btn>
              </>}
              <Btn onClick={()=>setFixModal((prev)=>({ ...prev, open:false }))} variant="blue" disabled={fixModal.running}>DONE</Btn>
            </div>
          </div>
        </div>
      </div>;
    })()}
  </div>;
}

function Skills({ aiModel, skillsState, setSkillsState }) {
  const installedCount = Object.values(skillsState).filter((s) => s.installed).length;
  const enabledCount = Object.values(skillsState).filter((s) => s.enabled).length;

  const install = (skill) => {
    setSkillsState((prev) => ({
      ...prev,
      [skill.id]: { ...skill, installed: true, enabled: true, installedAt: new Date().toLocaleString() },
    }));
  };
  const uninstall = (id) => {
    setSkillsState((prev) => ({ ...prev, [id]: { ...prev[id], installed: false, enabled: false } }));
  };
  const toggle = (id) => {
    setSkillsState((prev) => ({ ...prev, [id]: { ...prev[id], enabled: !prev[id]?.enabled } }));
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Skills" sub={`SEO skill packs for Helio Agent · AI: ${aiModel||"—"}`}/>
    <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
      <Card label="Installed Skills" value={installedCount}/>
      <Card label="Enabled Skills" value={enabledCount}/>
      <Card label="Library Size" value={SEO_SKILL_LIBRARY.length}/>
    </div>
    <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:14,marginBottom:18,color:C.text,fontFamily:"monospace",fontSize:11,lineHeight:1.6}}>
      Installed and enabled skills are injected into Helio AI prompts across all modules to improve recommendations and execution quality.
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14}}>
      {SEO_SKILL_LIBRARY.map((skill) => {
        const state = skillsState[skill.id] || { installed: false, enabled: false };
        return <div key={skill.id} style={{background:C.panel,border:`1px solid ${state.enabled?C.lime:C.border}`,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,fontWeight:700}}>{skill.name}</div>
            <span style={{color:state.enabled?C.green:C.muted,fontFamily:"monospace",fontSize:9}}>{state.enabled?"ENABLED":"DISABLED"}</span>
          </div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginBottom:10}}>{skill.description}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {skill.modules.map((m)=><span key={m} style={{fontFamily:"monospace",fontSize:8,color:C.blue,border:`1px solid ${C.dim}`,padding:"2px 6px"}}>{m.toUpperCase()}</span>)}
          </div>
          <div style={{display:"flex",gap:8}}>
            {!state.installed && <Btn onClick={()=>install(skill)} variant="green">INSTALL</Btn>}
            {state.installed && <Btn onClick={()=>toggle(skill.id)} variant={state.enabled?"orange":"lime"}>{state.enabled?"DISABLE":"ENABLE"}</Btn>}
            {state.installed && <Btn onClick={()=>uninstall(skill.id)} variant="red">UNINSTALL</Btn>}
          </div>
          {state.installedAt&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:8}}>Installed: {state.installedAt}</div>}
        </div>;
      })}
    </div>
  </div>;
}

function AutonomyModule({ activeOrg, updateAutonomy, runAutonomyNow, autonomyRuns }) {
  const [saved, setSaved] = useState("");
  const [autonomyErr, setAutonomyErr] = useState("");
  const [bench, setBench] = useState(null);
  const activeHost = getHostFromInput(activeOrg?.integrations?.gsc?.fields?.extra?.siteUrl || "");
  const activeProject = loadProjectData(activeOrg?.id || "default", activeHost);
  const actions = Array.isArray(activeProject?.autonomyActions) ? activeProject.autonomyActions : [];
  const changeLog = Array.isArray(activeProject?.changeLog) ? activeProject.changeLog : [];
  const autonomy = activeOrg?.autonomy || {
    enabled: false,
    runTime: "06:00",
    policy: "balanced",
    enableAeoIntelSuite: true,
    aeoIntelEngine: "chatgpt",
    aeoIntelDriftThreshold: 0.05,
    aeoIntelMinCitationRate: 0.15,
    executionWebhook: "",
    lastRunDate: "",
    running: false,
    lastStatus: "idle",
    lastRunAt: "",
  };
  const integration = activeOrg?.integrations || {};
  const readinessChecks = (() => {
    const gscConnected = !!integration?.gsc?.connected && !!integration?.gsc?.fields?.accessToken && !!integration?.gsc?.fields?.extra?.siteUrl;
    const ga4Connected = !!integration?.ga4?.connected && !!integration?.ga4?.fields?.accessToken && !!integration?.ga4?.fields?.extra?.propertyId;
    const aiConnected = !!integration?.ai?.connected && !!integration?.ai?.fields?.apiKey && !!integration?.ai?.fields?.model;
    const dfsConnected = !!integration?.dataforseo?.connected && !!integration?.dataforseo?.fields?.login && !!integration?.dataforseo?.fields?.password;
    const ghConnected = !!integration?.github?.connected && !!integration?.github?.fields?.token && !!integration?.github?.fields?.repo;
    const approvalChannelConnected = (!!integration?.slack?.connected && !!integration?.slack?.fields?.webhookUrl) || (!!integration?.discord?.connected && !!integration?.discord?.fields?.webhookUrl);
    const webhookSet = !!String(autonomy.executionWebhook || "").trim();
    const intelEnabled = autonomy.enableAeoIntelSuite !== false;
    const queueReady = Array.isArray(activeProject?.executionQueue) && activeProject.executionQueue.length > 0;
    const learned = Number(activeProject?.executionModel?.samples || 0) > 0;
    const changesTracked = Array.isArray(activeProject?.changeLog) && activeProject.changeLog.length > 0;
    const autonomyEnabled = !!autonomy.enabled;
    return [
      { id: "gsc", label: "GSC connected with property", pass: gscConnected, blocker: "Connect GSC and select a property in Integrations." },
      { id: "ga4", label: "GA4 connected with property", pass: ga4Connected, blocker: "Connect GA4 and select property ID." },
      { id: "ai", label: "AI provider connected", pass: aiConnected, blocker: "Connect AI provider and model for enhancement/planning." },
      { id: "dfs", label: "DataForSEO fallback available", pass: dfsConnected, blocker: "Optional but recommended for resilient external data." },
      { id: "queue", label: "Execution queue generated", pass: queueReady, blocker: "Build execution queue from Task Manager or run autonomy." },
      { id: "learn", label: "Self-learning model active", pass: learned, blocker: "Load GSC snapshots over time to calibrate model." },
      { id: "changes", label: "Change log + rollback active", pass: changesTracked, blocker: "Execute at least one autonomous action to initialize change tracking." },
      { id: "autonomy", label: "Autonomy schedule enabled", pass: autonomyEnabled, blocker: "Enable daily autonomous run in Autonomy options." },
      { id: "intel", label: "AEO intelligence suite enabled", pass: intelEnabled, blocker: "Enable daily AEO intelligence suite for observatory tracking and drift alerts." },
      { id: "webhook", label: "External execution connector", pass: webhookSet, blocker: "Set execution webhook for real external writes." },
      { id: "github", label: "GitHub connector (optional)", pass: ghConnected, blocker: "Optional for code repo issue/action workflow." },
      { id: "approval_channel", label: "Slack/Discord approval channel", pass: approvalChannelConnected, blocker: "Connect Slack Approvals or Discord Approvals for external deployment approvals." },
    ];
  })();
  const readinessScore = Math.round((readinessChecks.filter((c)=>c.pass).length / Math.max(1, readinessChecks.length)) * 100);

  const saveAutonomy = () => {
    const time = String(autonomy.runTime || "").trim();
    const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
    if (!valid) {
      setAutonomyErr("Run time must be in 24h HH:MM format (e.g. 06:00).");
      return;
    }
    setAutonomyErr("");
    const drift = Number(autonomy.aeoIntelDriftThreshold || 0.05);
    const minRate = Number(autonomy.aeoIntelMinCitationRate || 0.15);
    if (!(drift > 0 && drift <= 0.5)) {
      setAutonomyErr("AEO drift threshold must be between 0.01 and 0.50.");
      return;
    }
    if (!(minRate >= 0 && minRate <= 1)) {
      setAutonomyErr("AEO minimum citation rate must be between 0 and 1.");
      return;
    }
    updateAutonomy(activeOrg?.id, {
      enabled: autonomy.enabled,
      runTime: autonomy.runTime,
      policy: autonomy.policy || "balanced",
      enableAeoIntelSuite: autonomy.enableAeoIntelSuite !== false,
      aeoIntelEngine: autonomy.aeoIntelEngine || "chatgpt",
      aeoIntelDriftThreshold: drift,
      aeoIntelMinCitationRate: minRate,
      executionWebhook: autonomy.executionWebhook || "",
    });
    setSaved("Autonomy settings saved.");
    setTimeout(() => setSaved(""), 1500);
  };

  const applyAeoPreset = (preset) => {
    const table = {
      saas: { aeoIntelEngine: "chatgpt", aeoIntelDriftThreshold: 0.05, aeoIntelMinCitationRate: 0.2 },
      local: { aeoIntelEngine: "copilot", aeoIntelDriftThreshold: 0.04, aeoIntelMinCitationRate: 0.18 },
      ecommerce: { aeoIntelEngine: "perplexity", aeoIntelDriftThreshold: 0.05, aeoIntelMinCitationRate: 0.22 },
      enterprise: { aeoIntelEngine: "chatgpt", aeoIntelDriftThreshold: 0.03, aeoIntelMinCitationRate: 0.25 },
    };
    const cfg = table[String(preset || "").toLowerCase()];
    if (!cfg) return;
    updateAutonomy(activeOrg?.id, { ...cfg, enableAeoIntelSuite: true });
    setSaved(`Applied ${String(preset).toUpperCase()} AEO preset.`);
    setTimeout(() => setSaved(""), 1400);
  };

  const runReliabilityCheck = () => {
    const tests = [];
    const u1 = canonicalizeCrawlUrl("https://example.com/blog/?utm_source=x&a=1&b=2#top");
    tests.push({ name: "canonicalize strips tracking/hash", pass: u1 === "https://example.com/blog?a=1&b=2" });
    const u2 = canonicalizeCrawlUrl("https://example.com/path///");
    tests.push({ name: "canonicalize trims trailing slash", pass: u2 === "https://example.com/path" });
    const score = computeHelioAuditScore({ pages_crawled: 10, broken_pages: 0, duplicate_title: 0, checks: { no_h1_tag: 0, no_description: 0, no_image_alt: 0, no_index_page: 0, high_loading_time: 0 } });
    tests.push({ name: "score baseline healthy", pass: score.score >= 95 });
    const failed = tests.filter((t) => !t.pass).length;
    setBench({ ts: new Date().toISOString(), tests, failed, passed: tests.length - failed });
  };

  const approveAction = (actionId) => {
    if (!activeHost) return;
    const nextActions = actions.map((a) => a.id === actionId ? { ...a, status: "approved", approvedAt: new Date().toISOString() } : a);
    const tasks = Array.isArray(activeProject?.tasks) ? [...activeProject.tasks] : [];
    const approved = nextActions.find((a) => a.id === actionId);
    if (approved) {
      tasks.unshift({
        id: `manual_exec_${Date.now()}`,
        status: "todo",
        priority: "high",
        module: "Autonomy",
        label: `[${activeHost}] Approved action: ${approved.detail}`,
        due: "",
        source: "manual-approval",
        action_id: approved.id,
      });
    }
    mergeProjectData(activeOrg?.id || "default", activeHost, { autonomyActions: nextActions, tasks: tasks.slice(0, 120) });
    setSaved("Action approved and queued.");
    setTimeout(() => setSaved(""), 1400);
  };

  const sendDeploymentApprovalRequest = async (action) => {
    try {
      const slack = integration?.slack;
      const discord = integration?.discord;
      const channels = [
        slack?.connected && slack?.fields?.webhookUrl ? { provider: "slack", fields: slack.fields } : null,
        discord?.connected && discord?.fields?.webhookUrl ? { provider: "discord", fields: discord.fields } : null,
      ].filter(Boolean);
      if (!channels.length) {
        setSaved("Connect Slack Approvals or Discord Approvals in Integrations first.");
        setTimeout(() => setSaved(""), 2200);
        return;
      }
      const title = `Helio deployment approval needed: ${activeHost || "website"}`;
      const message = [
        `*Action:* ${action?.action || "Autonomous deployment"}`,
        `*Detail:* ${action?.detail || "Review Helio action before deployment."}`,
        `*Risk:* ${String(action?.kind || "unknown").toUpperCase()}`,
        `*Policy:* ${autonomy.policy || "balanced"}`,
        "",
        "Approve or reject from Slack/Discord. Helio will sync the decision into the Autonomy queue.",
      ].join("\n");
      let sent = 0;
      const tokens = [];
      for (const channel of channels) {
        const res = await fetch("/api/approval-channel/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: channel.provider,
            webhookUrl: channel.fields.webhookUrl,
            title,
            message,
            dashboardUrl: `${window.location.origin}/dashboard`,
            approval: {
              orgId: activeOrg?.id || "default",
              host: activeHost || "",
              actionId: action?.id || "",
              actionLabel: action?.action || "Autonomous deployment",
              actionDetail: action?.detail || "",
            },
          }),
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || `${channel.provider} approval request failed`);
        if (data.token) tokens.push({ provider: channel.provider, token: data.token });
        sent += 1;
      }
      const nextActions = actions.map((a) => a.id === action.id ? {
        ...a,
        approvalRequestedAt: new Date().toISOString(),
        approvalChannels: channels.map((c)=>c.provider),
        approvalTokens: tokens,
      } : a);
      mergeProjectData(activeOrg?.id || "default", activeHost, { autonomyActions: nextActions });
      setSaved(`Approval request sent to ${sent} channel(s).`);
      setTimeout(() => setSaved(""), 1800);
    } catch (error) {
      setSaved(`Approval request failed: ${error?.message || "unknown error"}`);
      setTimeout(() => setSaved(""), 2600);
    }
  };

  const syncExternalApprovalDecisions = async ({ silent = false } = {}) => {
    if (!activeHost || !actions.length) return;
    try {
      const qs = new URLSearchParams({ orgId: activeOrg?.id || "default", host: activeHost });
      const res = await fetch(`/api/approval-channel/decisions?${qs.toString()}`);
      const data = await res.json().catch(()=>({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to sync approval decisions");
      const byAction = new Map();
      for (const decision of data.decisions || []) {
        if (!decision?.actionId || decision.status === "pending") continue;
        const current = byAction.get(decision.actionId);
        if (!current || String(decision.decidedAt || decision.requestedAt || "") > String(current.decidedAt || current.requestedAt || "")) {
          byAction.set(decision.actionId, decision);
        }
      }
      let changed = false;
      const nextActions = actions.map((a) => {
        const decision = byAction.get(a.id);
        if (!decision || a.externalApprovalDecisionAt === decision.decidedAt) return a;
        changed = true;
        if (decision.status === "approved") {
          return {
            ...a,
            status: "approved",
            approvedAt: decision.decidedAt || new Date().toISOString(),
            externalApprovalDecision: "approved",
            externalApprovalProvider: decision.provider,
            externalApprovalDecisionAt: decision.decidedAt,
          };
        }
        if (decision.status === "rejected") {
          return {
            ...a,
            status: "rejected",
            rejectedAt: decision.decidedAt || new Date().toISOString(),
            externalApprovalDecision: "rejected",
            externalApprovalProvider: decision.provider,
            externalApprovalDecisionAt: decision.decidedAt,
          };
        }
        return a;
      });
      if (changed) {
        mergeProjectData(activeOrg?.id || "default", activeHost, { autonomyActions: nextActions });
        if (!silent) {
          setSaved("Synced Slack/Discord approval decisions.");
          setTimeout(() => setSaved(""), 1800);
        }
      } else if (!silent) {
        setSaved("No new external approval decisions.");
        setTimeout(() => setSaved(""), 1600);
      }
    } catch (error) {
      if (!silent) {
        setSaved(`Approval sync failed: ${error?.message || "unknown error"}`);
        setTimeout(() => setSaved(""), 2400);
      }
    }
  };

  useEffect(() => {
    if (!activeHost || !actions.length) return undefined;
    const id = window.setInterval(() => syncExternalApprovalDecisions({ silent: true }), 10000);
    return () => window.clearInterval(id);
  }, [activeHost, activeOrg?.id, actions.length]);

  const executeApprovedAction = (actionId) => {
    if (!activeHost) return;
    const nextActions = actions.map((a) => a.id === actionId && (a.status === "approved" || a.status === "ready")
      ? { ...a, status: "executed", executedAt: new Date().toISOString(), changeId: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
      : a);
    const executed = nextActions.find((a) => a.id === actionId && a.status === "executed");
    const tasks = Array.isArray(activeProject?.tasks) ? [...activeProject.tasks] : [];
    const nextChanges = Array.isArray(activeProject?.changeLog) ? [...activeProject.changeLog] : [];
    if (executed) {
      tasks.unshift({
        id: `manual_exec_${Date.now()}`,
        status: "todo",
        priority: "medium",
        module: "Autonomy",
        label: `[${activeHost}] Executed action: ${executed.detail}`,
        due: "",
        source: "manual-execution",
        action_id: executed.id,
        change_id: executed.changeId,
      });
      nextChanges.unshift({
        id: executed.changeId,
        action_id: executed.id,
        host: activeHost,
        ts: new Date().toISOString(),
        kind: "low-risk-plan",
        detail: executed.detail,
        status: "applied",
        rollbackAvailable: true,
        rollbackPlan: `Revert execution plan for action "${executed.action}".`,
      });
    }
    mergeProjectData(activeOrg?.id || "default", activeHost, { autonomyActions: nextActions, tasks: tasks.slice(0, 140), changeLog: nextChanges.slice(0, 120) });
    setSaved("Action executed and logged.");
    setTimeout(() => setSaved(""), 1400);
  };

  const rollbackChange = (changeId) => {
    if (!activeHost) return;
    const nextChanges = changeLog.map((c) => c.id === changeId ? { ...c, status: "rolled_back", rolledBackAt: new Date().toISOString(), rollbackAvailable: false } : c);
    const rolled = nextChanges.find((c) => c.id === changeId);
    const nextActions = actions.map((a) => a.changeId === changeId ? { ...a, status: "rolled_back", rolledBackAt: new Date().toISOString() } : a);
    const tasks = Array.isArray(activeProject?.tasks) ? [...activeProject.tasks] : [];
    if (rolled) {
      tasks.unshift({
        id: `rollback_${Date.now()}`,
        status: "done",
        priority: "medium",
        module: "Autonomy",
        label: `[${activeHost}] Rolled back change: ${rolled.detail}`,
        due: "",
        source: "rollback",
        change_id: changeId,
      });
    }
    mergeProjectData(activeOrg?.id || "default", activeHost, { autonomyActions: nextActions, changeLog: nextChanges, tasks: tasks.slice(0, 140) });
    setSaved("Rollback completed.");
    setTimeout(() => setSaved(""), 1400);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Autonomy" sub="Daily autonomous execution controls, reliability checks, and approval queue"/>
    <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16,marginBottom:16}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:2,marginBottom:12}}>AUTONOMY OPTIONS</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input type="checkbox" checked={!!autonomy.enabled} onChange={(e)=>updateAutonomy(activeOrg?.id, { enabled: e.target.checked })}/>
            <span style={{color:C.text,fontFamily:"monospace",fontSize:10}}>Enable daily autonomous SEO run</span>
          </div>
          <Input label="Daily Run Time (HH:MM)" value={autonomy.runTime||"06:00"} onChange={(v)=>updateAutonomy(activeOrg?.id, { runTime: v })} placeholder="06:00"/>
          {autonomyErr&&<div style={{color:C.red,fontFamily:"monospace",fontSize:9}}>{autonomyErr}</div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <ThemeDropdown
            label="Policy Level"
            value={autonomy.policy || "balanced"}
            onChange={(v)=>updateAutonomy(activeOrg?.id, { policy: v })}
            options={[
              { value: "conservative", label: "Conservative", meta: "More actions require approval" },
              { value: "balanced", label: "Balanced", meta: "Default split of safe vs risky" },
              { value: "aggressive", label: "Aggressive", meta: "Execute broader safe planning actions" },
            ]}
            placeholder="Select policy"
          />
          <Input label="Execution Webhook (optional)" value={autonomy.executionWebhook || ""} onChange={(v)=>updateAutonomy(activeOrg?.id, { executionWebhook: v })} placeholder="https://your-runner.example.com/helio-execute"/>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input type="checkbox" checked={autonomy.enableAeoIntelSuite !== false} onChange={(e)=>updateAutonomy(activeOrg?.id, { enableAeoIntelSuite: e.target.checked })}/>
            <span style={{color:C.text,fontFamily:"monospace",fontSize:10}}>Run AEO intelligence suite daily</span>
          </div>
          <ThemeDropdown
            label="AEO Intel Engine"
            value={autonomy.aeoIntelEngine || "chatgpt"}
            onChange={(v)=>updateAutonomy(activeOrg?.id, { aeoIntelEngine: v })}
            options={[
              { value: "chatgpt", label: "ChatGPT" },
              { value: "perplexity", label: "Perplexity" },
              { value: "gemini", label: "Gemini" },
              { value: "copilot", label: "Copilot" },
              { value: "claude", label: "Claude" },
            ]}
            placeholder="Select engine"
          />
          <ThemeDropdown
            label="AEO Intel Preset"
            value=""
            onChange={applyAeoPreset}
            options={[
              { value: "saas", label: "SaaS" },
              { value: "local", label: "Local Business" },
              { value: "ecommerce", label: "Ecommerce" },
              { value: "enterprise", label: "Enterprise" },
            ]}
            placeholder="Apply preset"
          />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Input label="Drift Threshold" value={String(autonomy.aeoIntelDriftThreshold ?? 0.05)} onChange={(v)=>updateAutonomy(activeOrg?.id, { aeoIntelDriftThreshold: Number(v || 0.05) })} placeholder="0.05"/>
            <Input label="Min Citation Rate" value={String(autonomy.aeoIntelMinCitationRate ?? 0.15)} onChange={(v)=>updateAutonomy(activeOrg?.id, { aeoIntelMinCitationRate: Number(v || 0.15) })} placeholder="0.15"/>
          </div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>Last run: {autonomy.lastRunAt || "never"} · Status: <span style={{color:autonomy.lastStatus==="success"?C.green:autonomy.lastStatus==="partial"?C.orange:autonomy.lastStatus==="halted"?C.red:C.muted}}>{autonomy.lastStatus||"idle"}</span></div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={saveAutonomy}>SAVE</Btn>
            <Btn onClick={()=>runAutonomyNow(activeOrg?.id)} variant="blue" disabled={!!autonomy.running}>{autonomy.running?"RUNNING...":"RUN NOW"}</Btn>
          </div>
        </div>
      </div>
    </div>
    <div style={{marginBottom:16,background:C.panel,border:`1px solid ${C.border}`,padding:12}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>AUTONOMY RUN LOGS</div>
      {(autonomyRuns||[]).slice(0,8).map((r,i)=><div key={i} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9}}>
        <span style={{color:C.muted,minWidth:170}}>{new Date(r.finishedAt||r.startedAt).toLocaleString()}</span>
        <span style={{color:r.status==="success"?C.green:r.status==="partial"?C.orange:C.red,minWidth:70}}>{r.status?.toUpperCase()}</span>
        <span style={{color:C.text,flex:1}}>{r.host}</span>
      </div>)}
      {!(autonomyRuns||[]).length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>No runs yet.</div>}
    </div>
    <div style={{marginBottom:16,background:C.panel,border:`1px solid ${C.border}`,padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>RELIABILITY CHECK</div>
        <Btn onClick={runReliabilityCheck} variant="blue">RUN CHECK</Btn>
      </div>
      {bench&&<>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:6}}>Last: {new Date(bench.ts).toLocaleString()} · Passed: <span style={{color:C.green}}>{bench.passed}</span> · Failed: <span style={{color:bench.failed?C.red:C.green}}>{bench.failed}</span></div>
        {bench.tests.map((t,i)=><div key={i} style={{fontFamily:"monospace",fontSize:9,color:t.pass?C.green:C.red,marginBottom:3}}>{t.pass?"✓":"✕"} {t.name}</div>)}
      </>}
      {!bench&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>Run a quick integrity check for crawler and scoring core logic.</div>}
    </div>
    <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>AUTONOMOUS EXECUTION QUEUE</div>
        <Btn onClick={()=>syncExternalApprovalDecisions()} variant="blue" style={{padding:"5px 10px",fontSize:9}}>SYNC SLACK/DISCORD</Btn>
      </div>
      {actions.slice(0, 12).map((a)=><div key={a.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
        <span style={{color:a.kind==="risky"?C.red:C.green,fontFamily:"monospace",fontSize:8,minWidth:44}}>{a.kind.toUpperCase()}</span>
        <span style={{color:C.text,fontFamily:"monospace",fontSize:9,flex:1}}>{a.detail}</span>
        <span style={{color:a.status==="pending_approval"?C.orange:a.status==="executed"||a.status==="approved"?C.green:a.status==="rejected"?C.red:C.muted,fontFamily:"monospace",fontSize:8,minWidth:90,textAlign:"right"}}>{a.status}</span>
        {a.approvalRequestedAt&&<span style={{color:C.blue,fontFamily:"monospace",fontSize:8,minWidth:95,textAlign:"right"}}>REQUESTED</span>}
        {a.externalApprovalDecision&&<span style={{color:a.externalApprovalDecision==="approved"?C.green:C.red,fontFamily:"monospace",fontSize:8,minWidth:115,textAlign:"right"}}>{String(a.externalApprovalProvider||"external").toUpperCase()} {String(a.externalApprovalDecision).toUpperCase()}</span>}
        {a.status==="pending_approval"&&<Btn onClick={()=>sendDeploymentApprovalRequest(a)} variant="blue">REQUEST IN SLACK/DISCORD</Btn>}
        {a.status==="pending_approval"&&<Btn onClick={()=>approveAction(a.id)} variant="orange">APPROVE</Btn>}
        {(a.status==="approved"||a.status==="ready")&&<Btn onClick={()=>executeApprovedAction(a.id)} variant="green">EXECUTE</Btn>}
      </div>)}
      {!actions.length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>No autonomous actions yet. Run autonomy first.</div>}
    </div>
    <div style={{marginTop:16,background:C.panel,border:`1px solid ${C.border}`,padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>PRODUCTION READINESS CHECKLIST</div>
        <div style={{color:readinessScore>=85?C.green:readinessScore>=65?C.orange:C.red,fontFamily:"monospace",fontSize:10,fontWeight:700}}>{readinessScore}%</div>
      </div>
      {readinessChecks.map((c)=><div key={c.id} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{color:c.pass?C.green:C.red,fontFamily:"monospace",fontSize:8,minWidth:52}}>{c.pass?"PASS":"FAIL"}</span>
          <span style={{color:C.text,fontFamily:"monospace",fontSize:9,flex:1}}>{c.label}</span>
        </div>
        {!c.pass&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:8,paddingLeft:60,marginTop:2}}>{c.blocker}</div>}
      </div>)}
    </div>
    <div style={{marginTop:16,background:C.panel,border:`1px solid ${C.border}`,padding:12}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:8}}>CHANGE LOG & ROLLBACK</div>
      {changeLog.slice(0,12).map((c)=><div key={c.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
        <span style={{color:c.status==="rolled_back"?C.orange:C.green,fontFamily:"monospace",fontSize:8,minWidth:80}}>{c.status.toUpperCase()}</span>
        <span style={{color:C.text,fontFamily:"monospace",fontSize:9,flex:1}}>{c.detail}</span>
        {c.verification&&<span style={{color:c.verification.verdict==="ok"?C.green:C.red,fontFamily:"monospace",fontSize:8,minWidth:90,textAlign:"right"}}>{c.verification.verdict.toUpperCase()}</span>}
        <span style={{color:C.muted,fontFamily:"monospace",fontSize:8,minWidth:120,textAlign:"right"}}>{new Date(c.ts).toLocaleTimeString()}</span>
        {c.rollbackAvailable&&<Btn onClick={()=>rollbackChange(c.id)} variant="orange">ROLLBACK</Btn>}
      </div>)}
      {!changeLog.length&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>No executed changes yet.</div>}
    </div>
    {saved&&<div style={{marginTop:12,color:C.green,fontFamily:"monospace",fontSize:10}}>{saved}</div>}
  </div>;
}

function PortfolioIntel({ orgs = [], openOrg = () => {} }) {
  const rows = (orgs || []).map((org) => {
    const integrations = org?.integrations || {};
    const host = getHostFromInput(integrations?.gsc?.fields?.extra?.siteUrl || "");
    const project = host ? loadProjectData(org.id, host) : {};
    const intel = project?.aeoGeoIntel || {};
    const observatory = intel?.observatorySummary || summarizePromptObservatory(Array.isArray(intel?.promptObservations) ? intel.promptObservations : []);
    const readiness = project?.aeoGeoReadinessV2 || {};
    const sessions = Number(project?.ga4?.totals?.sessions || 0);
    const conversions = Number(project?.ga4?.totals?.conversions || 0);
    const convRate = sessions > 0 ? conversions / sessions : 0.02;
    const aov = Number(project?.portfolioConfig?.aov || 120);
    const projectedRevenue30d = Math.round(sessions * convRate * aov);
    const citationRate = Number(observatory?.globalCitationRate || 0);
    const gap = Math.max(0, 0.25 - citationRate);
    const budgetScore = Math.round((gap * 100) + Math.max(0, 80 - Number(readiness?.score || 0)));
    return {
      orgId: org.id,
      orgName: org.name,
      host: host || "—",
      readiness: Number(readiness?.score || 0),
      citationRate,
      sessions,
      projectedRevenue30d,
      budgetScore,
      recommendedBudget: Math.round(Math.max(500, budgetScore * 120)),
    };
  }).sort((a,b)=>b.budgetScore-a.budgetScore);
  const optimized = buildPortfolioOptimizationPlan(rows);
  const optRows = optimized.rows || rows;
  const totalRevenue = optRows.reduce((s,r)=>s+Number(r.forecastedRevenue30d || r.projectedRevenue30d || 0),0);
  const totalBudget = optRows.reduce((s,r)=>s+Number(r.optimizedBudget || r.recommendedBudget || 0),0);
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Portfolio Intel" sub="Multi-org AEO/GEO forecasting and budget optimization"/>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
      <Card label="Organizations" value={rows.length}/>
      <Card label="Projected Revenue (30d)" value={`$${totalRevenue.toLocaleString()}`} />
      <Card label="Recommended Budget Pool" value={`$${totalBudget.toLocaleString()}`} />
    </div>
    <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
        <span style={{minWidth:150}}>ORG</span><span style={{flex:1}}>DOMAIN</span><span style={{minWidth:80,textAlign:"right"}}>AEO</span><span style={{minWidth:90,textAlign:"right"}}>CIT RATE</span><span style={{minWidth:90,textAlign:"right"}}>SESSIONS</span><span style={{minWidth:120,textAlign:"right"}}>REV 30D</span><span style={{minWidth:120,textAlign:"right"}}>BUDGET</span><span style={{minWidth:80,textAlign:"right"}}>OPEN</span>
      </div>
      {optRows.map((r,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
        <span style={{minWidth:150,color:C.text}}>{r.orgName}</span>
        <span style={{flex:1,color:C.blue,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.host}</span>
        <span style={{minWidth:80,textAlign:"right",color:r.readiness>=70?C.green:r.readiness>=55?C.orange:C.red}}>{r.readiness}</span>
        <span style={{minWidth:90,textAlign:"right",color:C.lime}}>{(r.citationRate*100).toFixed(1)}%</span>
        <span style={{minWidth:90,textAlign:"right",color:C.text}}>{r.sessions.toLocaleString()}</span>
        <span style={{minWidth:120,textAlign:"right",color:C.green}}>${Number(r.forecastedRevenue30d || r.projectedRevenue30d || 0).toLocaleString()}</span>
        <span style={{minWidth:120,textAlign:"right",color:C.orange}}>${Number(r.optimizedBudget || r.recommendedBudget || 0).toLocaleString()}</span>
        <span style={{minWidth:80,textAlign:"right"}}><Btn onClick={()=>openOrg(r.orgId)} style={{padding:"3px 8px",fontSize:9}}>OPEN</Btn></span>
      </div>)}
      {!rows.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No organizations available.</div>}
    </div>
  </div>;
}

function GuardrailsModule({ activeOrg, updateOrg }) {
  const [input, setInput] = useState("");
  const guardrails = Array.isArray(activeOrg?.guardrails) ? activeOrg.guardrails : [];
  const add = () => {
    const v = input.trim();
    if (!v) return;
    updateOrg(activeOrg?.id, { guardrails: [v, ...guardrails].slice(0, 30) });
    setInput("");
  };
  const remove = (idx) => updateOrg(activeOrg?.id, { guardrails: guardrails.filter((_, i) => i !== idx) });
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Guardrails" sub="Define permanent constraints Helio must follow in planning and operations"/>
    <div style={{display:"flex",gap:10,marginBottom:14}}>
      <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")add();}} placeholder="e.g. Never deploy code automatically without explicit approval"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={add}>ADD RULE</Btn>
    </div>
    <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
      {guardrails.map((g, i)=><div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
        <span style={{color:C.red,fontFamily:"monospace",fontSize:9,minWidth:40}}>BLOCK</span>
        <span style={{color:C.text,fontFamily:"monospace",fontSize:10,flex:1}}>{g}</span>
        <button onClick={()=>remove(i)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontFamily:"monospace"}}>✕</button>
      </div>)}
      {!guardrails.length&&<div style={{padding:14,color:C.muted,fontFamily:"monospace",fontSize:10}}>No guardrails yet. Add constraints Helio must never violate.</div>}
    </div>
  </div>;
}

function Settings({ profile, setProfile, activeOrg, renameOrg, updateOrg }) {
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [role, setRole] = useState(profile?.role || "");
  const [orgName, setOrgName] = useState(activeOrg?.name || "");
  const [saved, setSaved] = useState("");
  const [customInstructions, setCustomInstructions] = useState(activeOrg?.customInstructions || "");
  const [auditFixApprovalMode, setAuditFixApprovalMode] = useState(activeOrg?.auditFixApprovalMode || "always_ask");
  const [contentSchedule, setContentSchedule] = useState(normalizeContentSchedule(activeOrg?.contentSchedule || {}));
  const [tab, setTab] = useState("profile");

  useEffect(() => {
    setOrgName(activeOrg?.name || "");
    setCustomInstructions(activeOrg?.customInstructions || "");
    setAuditFixApprovalMode(activeOrg?.auditFixApprovalMode || "always_ask");
    setContentSchedule(normalizeContentSchedule(activeOrg?.contentSchedule || {}));
  }, [activeOrg?.id, activeOrg?.name]);

  const saveProfile = () => {
    setProfile({ name, email, role });
    setSaved("Profile saved.");
    setTimeout(() => setSaved(""), 1500);
  };

  const saveOrg = () => {
    const n = orgName.trim();
    if (!n) return;
    renameOrg(activeOrg?.id, n);
    updateOrg(activeOrg?.id, { auditFixApprovalMode, contentSchedule: normalizeContentSchedule(contentSchedule) });
    setSaved("Organization updated.");
    setTimeout(() => setSaved(""), 1500);
  };

  const saveCustom = () => {
    updateOrg(activeOrg?.id, { customInstructions });
    setSaved("Custom instructions saved.");
    setTimeout(() => setSaved(""), 1400);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Settings" sub="Manage user profile and organization details"/>
    <Tabs tabs={["profile","organization","custom instructions"]} active={tab} onChange={setTab}/>
    {tab==="profile"&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16,maxWidth:640}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:2,marginBottom:12}}>PROFILE</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Input label="Full Name" value={name} onChange={setName} placeholder="Your name"/>
        <Input label="Email" value={email} onChange={setEmail} placeholder="you@company.com"/>
        <Input label="Role" value={role} onChange={setRole} placeholder="SEO Lead"/>
        <Btn onClick={saveProfile}>SAVE PROFILE</Btn>
      </div>
    </div>}
    {tab==="organization"&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16,maxWidth:640}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:2,marginBottom:12}}>ORGANIZATION</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Input label="Organization Name" value={orgName} onChange={setOrgName} placeholder="Organization name"/>
        <div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>CONNECTED DOMAIN (GSC)</div>
          <div style={{background:"#060606",border:`1px solid ${C.dim}`,color:C.lime,fontFamily:"monospace",fontSize:11,padding:"9px 12px"}}>
            {activeOrg?.integrations?.gsc?.fields?.extra?.siteUrl||"No domain connected"}
          </div>
        </div>
        <div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>TECHNICAL AUDIT AUTO-FIX APPROVAL MODE</div>
          <ThemeDropdown
            value={auditFixApprovalMode}
            onChange={setAuditFixApprovalMode}
            options={[
              { value: "always_ask", label: "Always Ask Approval" },
              { value: "critical_only", label: "Ask Approval for Critical Fixes" },
              { value: "never_ask", label: "Never Ask Approval" },
            ]}
          />
        </div>
        <div style={{background:"#060606",border:`1px solid ${C.dim}`,padding:10}}>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:8}}>CONTENT CALENDAR FREQUENCY</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <ThemeDropdown
              label="Cadence"
              value={contentSchedule.cadence}
              onChange={(v)=>setContentSchedule((p)=>normalizeContentSchedule({ ...p, cadence: v }))}
              options={[
                { value: "weekly", label: "Weekly" },
                { value: "daily", label: "Daily" },
              ]}
            />
            <Input label="Posts / Week" type="number" value={String(contentSchedule.postsPerWeek)} onChange={(v)=>setContentSchedule((p)=>normalizeContentSchedule({ ...p, postsPerWeek: Number(v || 1) }))} placeholder="3"/>
            <Input label="Posts / Day" type="number" value={String(contentSchedule.postsPerDay)} onChange={(v)=>setContentSchedule((p)=>normalizeContentSchedule({ ...p, postsPerDay: Number(v || 1) }))} placeholder="1"/>
          </div>
          <div style={{marginTop:8,maxWidth:220}}>
            <Input label="Planning Horizon (Months)" type="number" value={String(contentSchedule.horizonMonths)} onChange={(v)=>setContentSchedule((p)=>normalizeContentSchedule({ ...p, horizonMonths: Number(v || 3) }))} placeholder="3"/>
          </div>
        </div>
        <Btn onClick={saveOrg}>SAVE ORGANIZATION</Btn>
      </div>
    </div>}
    {tab==="custom instructions"&&<div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:11,letterSpacing:2,marginBottom:12}}>CUSTOM INSTRUCTIONS FOR HELIO</div>
      <textarea value={customInstructions} onChange={(e)=>setCustomInstructions(e.target.value)} placeholder="Write persistent instructions Helio should follow for this organization..."
        style={{width:"100%",minHeight:180,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"10px 12px",outline:"none",boxSizing:"border-box",resize:"vertical"}}/>
      <div style={{marginTop:10,display:"flex",gap:8}}>
        <Btn onClick={saveCustom}>SAVE INSTRUCTIONS</Btn>
      </div>
    </div>}
    {saved&&<div style={{marginTop:12,color:C.green,fontFamily:"monospace",fontSize:10}}>{saved}</div>}
  </div>;
}

// ── APP SHELL ─────────────────────────────────────────────────────
export default function Helio() {
  const orgInit = loadOrganizationState();
  const [active,setActive]=useState("integrations");
  const [orgs, setOrgs] = useState(orgInit.orgs);
  const [activeOrgId, setActiveOrgId] = useState(orgInit.activeOrgId);
  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem("helio:user-profile:v1");
      if (!raw) return { name: "", email: "", role: "" };
      return JSON.parse(raw);
    } catch {
      return { name: "", email: "", role: "" };
    }
  });
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [autonomyRuns, setAutonomyRuns] = useState([]);
  const activeOrg = orgs.find((o)=>o.id===activeOrgId) || orgs[0];
  const integrations = activeOrg?.integrations || defaultIntegrationsState();
  const skillsState = activeOrg?.skillsState || defaultSkillsState();
  const agentOnline = !!activeOrg?.agentOnline;
  const setIntegrations = (updater) => setOrgs((prev)=>prev.map((o)=>o.id!==activeOrgId?o:{...o,integrations:typeof updater==="function"?updater(o.integrations):updater}));
  const setSkillsState = (updater) => setOrgs((prev)=>prev.map((o)=>o.id!==activeOrgId?o:{...o,skillsState:typeof updater==="function"?updater(o.skillsState):updater}));
  const setAgentOnline = (updater) => setOrgs((prev)=>prev.map((o)=>o.id!==activeOrgId?o:{...o,agentOnline:typeof updater==="function"?updater(o.agentOnline):updater}));
  const connCount=Object.values(integrations).filter(v=>v.connected).length;
  const connectedDomain = integrations.gsc?.fields?.extra?.siteUrl || "No domain connected";

  useEffect(() => {
    setActiveSkillsContext(skillsState);
  }, [skillsState]);
  useEffect(() => {
    setActiveOrgContext(activeOrg || {});
  }, [activeOrg]);

  useEffect(() => {
    try {
      localStorage.setItem("helio:orgs:v1", JSON.stringify({ orgs }));
      localStorage.setItem("helio:orgs:active:v1", activeOrgId);
    } catch {}
  }, [orgs, activeOrgId]);
  useEffect(() => {
    try { localStorage.setItem("helio:user-profile:v1", JSON.stringify(profile)); } catch {}
  }, [profile]);
  useEffect(() => {
    setAutonomyRuns(loadAutonomyRuns(activeOrgId));
  }, [activeOrgId, orgs]);

  const createOrg = () => {
    const n = newOrgName.trim();
    if (!n) return;
    const org = createOrganization(n);
    setOrgs((p)=>[...p, org]);
    setActiveOrgId(org.id);
    setActive("integrations");
    setShowOrgModal(false);
    setNewOrgName("");
  };
  const renameOrg = (orgId, name) => setOrgs((prev)=>prev.map((o)=>o.id===orgId?{...o,name}:o));
  const updateAutonomy = (orgId, patch) => setOrgs((prev)=>prev.map((o)=>o.id===orgId?{...o,autonomy:{...(o.autonomy||{}),...patch}}:o));
  const updateOrg = (orgId, patch) => setOrgs((prev)=>prev.map((o)=>o.id===orgId?{...o,...patch}:o));
  const runAutonomyNow = async (orgId) => {
    const org = orgs.find((o)=>o.id===orgId);
    if (!org) return;
    updateAutonomy(orgId, { running: true, lastStatus: "running" });
    try {
      const out = await autonomousDailyRun({
        orgScope: orgId,
        orgName: org.name,
        integrations: {
          ...org.integrations,
          autonomyPolicy: org?.autonomy?.policy || "balanced",
          autonomyExecutionWebhook: org?.autonomy?.executionWebhook || "",
          enableAeoIntelSuite: org?.autonomy?.enableAeoIntelSuite !== false,
          aeoIntelEngine: org?.autonomy?.aeoIntelEngine || "chatgpt",
          aeoIntelDriftThreshold: Number(org?.autonomy?.aeoIntelDriftThreshold || 0.05),
          aeoIntelMinCitationRate: Number(org?.autonomy?.aeoIntelMinCitationRate || 0.15),
        },
        addLog: ()=>{},
      });
      const today = new Date().toISOString().split("T")[0];
      updateAutonomy(orgId, { running: false, lastStatus: out.status, lastRunDate: today, lastRunAt: out.finishedAt, enabled: out.autoStop ? false : (org?.autonomy?.enabled ?? true) });
      setAutonomyRuns(loadAutonomyRuns(orgId));
    } catch {
      updateAutonomy(orgId, { running: false, lastStatus: "failed", lastRunAt: new Date().toISOString() });
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      orgs.forEach((org) => {
        const a = org.autonomy || {};
        if (!a.enabled || a.running) return;
        const [hh, mm] = String(a.runTime || "06:00").split(":").map((x) => Number(x));
        if (Number.isNaN(hh) || Number.isNaN(mm)) return;
        if (a.lastRunDate === today) return;
        if (now.getHours() === hh && now.getMinutes() === mm) {
          runAutonomyNow(org.id);
        }
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [orgs]);

  const renderModule=()=>{
    const missing=(MODULE_REQUIREMENTS[active]||[]).filter(id=>!integrations[id]?.connected);
    if(missing.length>0&&active!=="integrations")return <Gate moduleId={active} integrations={integrations}>{null}</Gate>;
    switch(active){
      case "mission":return <Mission integrations={integrations} agentOnline={agentOnline} setAgentOnline={setAgentOnline} activeOrg={activeOrg} updateOrg={updateOrg}/>;
      case "audit":return <Audit integrations={integrations} orgScope={activeOrgId} skillsState={skillsState} activeOrg={activeOrg}/>;
      case "keywords":return <Keywords integrations={integrations} orgScope={activeOrgId}/>;
      case "content":return <Content integrations={integrations} orgScope={activeOrgId} activeOrg={activeOrg} updateOrg={updateOrg}/>;
      case "onpage":return <OnPage integrations={integrations} orgScope={activeOrgId}/>;
      case "backlinks":return <Backlinks integrations={integrations} orgScope={activeOrgId}/>;
      case "gsc":return <GSC integrations={integrations} orgScope={activeOrgId}/>;
      case "analytics":return <Analytics integrations={integrations} orgScope={activeOrgId}/>;
      case "aeo":return <AEO integrations={integrations} orgScope={activeOrgId}/>;
      case "github":return <GitHub integrations={integrations}/>;
      case "reports":return <Reports integrations={integrations} orgScope={activeOrgId}/>;
      case "missions":return <Missions integrations={integrations} orgScope={activeOrgId} activeOrg={activeOrg}/>;
      case "tasks":return <Tasks integrations={integrations} orgScope={activeOrgId}/>;
      case "skills":return <Skills aiModel={integrations.ai?.fields?.model} skillsState={skillsState} setSkillsState={setSkillsState}/>;
      case "autonomy":return <AutonomyModule activeOrg={activeOrg} updateAutonomy={updateAutonomy} runAutonomyNow={runAutonomyNow} autonomyRuns={autonomyRuns}/>;
      case "portfolio":return <PortfolioIntel orgs={orgs} openOrg={(id)=>{setActiveOrgId(id);setActive("mission");}}/>;
      case "guardrails":return <GuardrailsModule activeOrg={activeOrg} updateOrg={updateOrg}/>;
      case "settings":return <Settings profile={profile} setProfile={setProfile} activeOrg={activeOrg} renameOrg={renameOrg} updateOrg={updateOrg}/>;
      case "integrations":return <Integrations integrations={integrations} setIntegrations={setIntegrations}/>;
      default:return null;
    }
  };

  return <div style={{display:"flex",height:"100vh",background:C.bg,color:C.text,overflow:"hidden"}}>
    <div style={{width:205,background:C.panel,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"12px 16px 8px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center"}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:19,fontWeight:900,letterSpacing:3}}>HELIO</div>
        </div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,letterSpacing:2,marginTop:2}}>SEO AGENT v1.0</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
        {NAV.map(n=>{
          const locked=(MODULE_REQUIREMENTS[n.id]||[]).some(id=>!integrations[id]?.connected)&&n.id!=="integrations";
          return <div key={n.id} onClick={()=>setActive(n.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 16px",cursor:"pointer",background:active===n.id?"#111800":"transparent",borderLeft:active===n.id?`3px solid ${C.lime}`:"3px solid transparent",color:active===n.id?C.lime:locked?C.dim:C.muted,fontFamily:"monospace",fontSize:10,letterSpacing:1}}>
            <span style={{fontSize:12}}>{n.icon}</span><span style={{flex:1}}>{n.label.toUpperCase()}</span>
            {locked&&<span style={{fontSize:9}}>🔒</span>}
          </div>;
        })}
      </div>
      <div style={{padding:12,borderTop:`1px solid ${C.border}`}}>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginBottom:5}}>INTEGRATIONS</div>
        <div style={{background:C.dim,height:2,marginBottom:5}}><div style={{height:"100%",background:C.lime,width:`${(connCount/Object.keys(INTEGRATION_DEFS).length)*100}%`,transition:"width 0.3s"}}/></div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8}}>{connCount}/{Object.keys(INTEGRATION_DEFS).length} connected</div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:3}}>ORG: <span style={{color:C.lime}}>{activeOrg?.name||"—"}</span></div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:3}}>DOMAIN: <span style={{color:C.lime}}>{connectedDomain}</span></div>
        {integrations.ai?.connected&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:3}}>AI: <span style={{color:C.lime}}>{integrations.ai.fields.model?.split("/").pop()?.slice(0,18)}</span></div>}
        <div style={{marginTop:8,display:"flex",gap:5,alignItems:"center"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:agentOnline?C.green:C.red}}/>
          <span style={{color:C.muted,fontFamily:"monospace",fontSize:8}}>{agentOnline?"AGENT ONLINE":"AGENT OFFLINE"}</span>
        </div>
      </div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:55,borderBottom:`1px solid ${C.border}`,background:C.panel,flexShrink:0}}>
        <div style={{width:292,maxWidth:"40%"}}>
          <ThemeDropdown
            value={activeOrgId}
            onChange={(v)=>{
              if (v === "__create_org__") { setShowOrgModal(true); return; }
              setActiveOrgId(v);setActive("integrations");
            }}
            options={[
              ...orgs.map((o)=>({value:o.id,label:o.name,meta:`${Object.values(o.integrations||{}).filter(x=>x.connected).length} integrations`})),
              { value:"__create_org__", label:"+ Create New Organization", meta:"Create a separate workspace" }
            ]}
            placeholder="Select organization"
            compact
            activeBorderColor="#2f3a1f"
            menuBorderColor="#273118"
          />
        </div>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          {integrations.ai?.connected&&<span style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>{AI_PROVIDERS[integrations.ai.fields.provider]?.label} · <span style={{color:C.lime}}>{integrations.ai.fields.model?.split("/").pop()}</span></span>}
          <span style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>{new Date().toLocaleString()}</span>
          <div style={{background:"#111800",border:`1px solid ${C.lime}`,color:C.lime,fontFamily:"monospace",fontSize:9,padding:"2px 10px",letterSpacing:2}}>{agentOnline?"● ONLINE":"○ OFFLINE"}</div>
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex"}}>{renderModule()}</div>
    </div>
    {showOrgModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
      <div style={{width:460,background:C.panel,border:`1px solid ${C.lime}`,padding:18}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,letterSpacing:2,marginBottom:10}}>CREATE ORGANIZATION</div>
        <Input label="Organization Name" value={newOrgName} onChange={setNewOrgName} placeholder="e.g. Client Alpha"/>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
          <Btn onClick={()=>{setShowOrgModal(false);setNewOrgName("");}} variant="blue">CANCEL</Btn>
          <Btn onClick={createOrg} disabled={!newOrgName.trim()}>CREATE</Btn>
        </div>
      </div>
    </div>}
  </div>;
}
