#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", ".vercel", ".turbo"]);
const TEXT_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".md", ".mdx", ".html", ".css", ".scss", ".txt", ".xml", ".yml", ".yaml", ".astro"]);
const MAX_CONTEXT_FILES = 22;
const MAX_FILE_CHARS = 9000;

async function exists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, root = dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await walk(abs, root, out);
    } else if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
      out.push(rel);
    }
  }
  return out;
}

function scoreFile(rel, prompt) {
  const p = `${rel}\n${prompt}`.toLowerCase();
  let score = 0;
  if (/llms?\.txt|robots\.txt|sitemap\.xml|schema|json-ld|metadata|head|layout|app\/|pages\/|routes?\/|public\//.test(rel.toLowerCase())) score += 20;
  if (/about|legal|entity|brand|organization|softwareapplication|faq|canonical|meta|title|description|robots|sitemap|llms?\.txt/.test(p)) score += 10;
  if (/package\.json|readme|index\.html/.test(rel.toLowerCase())) score += 5;
  return score;
}

async function buildRepoContext(repoDir, prompt) {
  const files = await walk(repoDir);
  const ranked = files
    .map((rel) => ({ rel, score: scoreFile(rel, prompt) }))
    .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel))
    .slice(0, MAX_CONTEXT_FILES);
  const rows = [];
  for (const { rel } of ranked) {
    const abs = path.join(repoDir, rel);
    let content = "";
    try {
      content = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    rows.push({
      path: rel,
      content: content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n/* ...truncated... */` : content,
    });
  }
  return { files: files.slice(0, 400), contextFiles: rows };
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Model returned empty response.");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

async function callAnthropic({ apiKey, model, system, user }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
  return data?.content?.map((part) => part?.text || "").join("\n") || "";
}

async function callOpenAi({ apiKey, model, system, user }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.1,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content || "";
}

async function callOpenRouter({ apiKey, model, system, user }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://helio-seo.app",
      "X-Title": "Helio Code",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.1,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `OpenRouter HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content || "";
}

async function callModel({ provider, apiKey, model, system, user }) {
  if (!provider || !apiKey || !model) {
    throw new Error("HELIO_CODE_LLM_PROVIDER, HELIO_CODE_LLM_MODEL, and HELIO_CODE_LLM_API_KEY are required.");
  }
  const p = String(provider).toLowerCase();
  if (p === "anthropic") return callAnthropic({ apiKey, model, system, user });
  if (p === "openai") return callOpenAi({ apiKey, model, system, user });
  if (p === "openrouter") return callOpenRouter({ apiKey, model, system, user });
  throw new Error(`Unsupported Helio Code LLM provider: ${provider}`);
}

function validateEdit(repoDir, edit) {
  const rel = String(edit?.path || "").trim().replace(/\\/g, "/");
  if (!rel || rel.startsWith("/") || rel.includes("..")) throw new Error(`Unsafe edit path: ${rel || "(empty)"}`);
  if (!TEXT_EXTS.has(path.extname(rel).toLowerCase())) throw new Error(`Refusing non-text edit path: ${rel}`);
  const abs = path.resolve(repoDir, rel);
  if (!abs.startsWith(path.resolve(repoDir) + path.sep)) throw new Error(`Edit path escapes repo: ${rel}`);
  const content = String(edit?.content ?? "");
  if (!content.trim()) throw new Error(`Empty content for edit: ${rel}`);
  if (/sk-[a-z0-9_-]{20,}|ghp_[a-z0-9_]{20,}|npg_[a-z0-9]{10,}/i.test(content)) {
    throw new Error(`Potential secret detected in edit content: ${rel}`);
  }
  return { rel, abs, content };
}

async function main() {
  const promptPath = process.argv[2];
  if (!promptPath) throw new Error("Usage: node scripts/helio-code-agent.mjs /path/to/.helio-code-prompt.md");
  const repoDir = process.cwd();
  const prompt = await fs.readFile(promptPath, "utf8");
  const repo = await buildRepoContext(repoDir, prompt);
  const system = [
    "You are Helio Code, an expert SEO/AEO/GEO coding agent.",
    "Return ONLY valid JSON. No markdown.",
    "You may create or edit small text/code files only.",
    "Do not invent reviews, ratings, statistics, legal claims, or unsupported company facts.",
    "Prefer minimal code-backed remediation that fits existing framework conventions.",
    "If you cannot safely edit, return an empty edits array with a reason.",
    "JSON shape: {\"summary\":\"...\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"complete file content\"}]}",
  ].join("\n");
  const user = [
    "HELIO MISSION PROMPT:",
    prompt,
    "",
    "REPO FILE LIST:",
    repo.files.join("\n"),
    "",
    "SELECTED FILE CONTEXT:",
    JSON.stringify(repo.contextFiles, null, 2),
  ].join("\n");
  const text = await callModel({
    provider: process.env.HELIO_CODE_LLM_PROVIDER,
    apiKey: process.env.HELIO_CODE_LLM_API_KEY,
    model: process.env.HELIO_CODE_LLM_MODEL,
    system,
    user,
  });
  const plan = extractJson(text);
  const edits = Array.isArray(plan?.edits) ? plan.edits.slice(0, 6) : [];
  if (!edits.length) {
    throw new Error(plan?.reason || plan?.summary || "Helio Code LLM produced no edits.");
  }
  for (const edit of edits) {
    const safe = validateEdit(repoDir, edit);
    await fs.mkdir(path.dirname(safe.abs), { recursive: true });
    await fs.writeFile(safe.abs, safe.content, "utf8");
    console.log(`edited ${safe.rel}`);
  }
  await fs.writeFile(path.join(repoDir, ".helio-code-agent-summary.md"), String(plan?.summary || "Helio Code applied LLM-generated edits."), "utf8");
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
