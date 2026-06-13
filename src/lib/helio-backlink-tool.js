import { lookup } from "node:dns/promises";
import net from "node:net";

const DEFAULT_SEARCH_ENDPOINTS = [
  {
    provider: "duckduckgo",
    url: (q, page = 0) => `https://r.jina.ai/http://duckduckgo.com/html/?q=${encodeURIComponent(q)}${page > 0 ? `&s=${page * 50}` : ""}`,
  },
  {
    provider: "bing",
    url: (q, page = 0) => `https://r.jina.ai/http://www.bing.com/search?q=${encodeURIComponent(q)}${page > 0 ? `&first=${page * 10 + 1}` : ""}`,
  },
  {
    provider: "yahoo",
    url: (q, page = 0) => `https://r.jina.ai/http://search.yahoo.com/search?p=${encodeURIComponent(q)}${page > 0 ? `&b=${page * 10 + 1}` : ""}`,
  },
];

const MAX_FETCH_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_EXPANSION_LINKS_PER_HOST = 25;
const COMMONCRAWL_COLLINFO_URL = "https://index.commoncrawl.org/collinfo.json";
const LOW_SIGNAL_HOST_PATTERNS = [
  /(^|\.)whois\.com$/i,
  /(^|\.)ipaddress\.com$/i,
  /(^|\.)ipqualityscore\.com$/i,
  /(^|\.)sur\.ly$/i,
  /(^|\.)hypestat\.com$/i,
  /(^|\.)web\.archive\.org$/i,
  /(^|\.)youtube\.com$/i,
];
const LOW_SIGNAL_PATH_PATTERNS = [
  /^\/?about\/?$/i,
  /^\/?privacy/i,
  /^\/?terms/i,
  /^\/?contact/i,
  /^\/?disclaimer/i,
  /^\/?sitemap/i,
  /^\/?cdn-cgi\//i,
];
const HIGH_SIGNAL_PATH_PATTERNS = [
  /\/(blog|news|article|insights?|resources?|guides?)\b/i,
  /\/(review|reviews|comparison|compare|alternatives?)\b/i,
  /\/(partners?|customers?|case-studies?)\b/i,
];
const HIGH_SIGNAL_HOST_PATTERNS = [
  /(^|\.)crunchbase\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)github\.com$/i,
  /(^|\.)medium\.com$/i,
  /(^|\.)behance\.net$/i,
  /(^|\.)producthunt\.com$/i,
  /(^|\.)g2\.com$/i,
  /(^|\.)clutch\.co$/i,
  /(^|\.)capterra\.com$/i,
];

export function normalizeBacklinkTarget(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
  }
}

export function normalizeCandidateUrl(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

function hostFromUrl(input = "") {
  try {
    return new URL(input).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isLikelyLowSignalUrl(input = "") {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname || "/";
    if (LOW_SIGNAL_HOST_PATTERNS.some((re) => re.test(host))) return true;
    if (LOW_SIGNAL_PATH_PATTERNS.some((re) => re.test(path))) return true;
    return false;
  } catch {
    return false;
  }
}

function isLikelyHighSignalUrl(input = "") {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = `${u.pathname || "/"} ${u.search || ""}`;
    if (HIGH_SIGNAL_HOST_PATTERNS.some((re) => re.test(host))) return true;
    return HIGH_SIGNAL_PATH_PATTERNS.some((re) => re.test(path));
  } catch {
    return false;
  }
}

function canonicalizeBacklinkUrl(input = "") {
  try {
    const u = new URL(input);
    u.hash = "";
    const dropParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "msclkid", "ref", "source", "src", "srsltid",
      "mc_cid", "mc_eid", "igshid", "_hsenc", "_hsmi",
    ];
    dropParams.forEach((p) => u.searchParams.delete(p));
    if ((u.pathname || "/") === "/index.html" || (u.pathname || "/") === "/index.htm") u.pathname = "/";
    if ((u.pathname || "/") === "/default.aspx") u.pathname = "/";
    const sorted = Array.from(u.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    u.search = sorted.length
      ? `?${sorted.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
      : "";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return normalizeCandidateUrl(input);
  }
}

function resolveSearchResultUrl(input = "") {
  const raw = String(input || "").trim();
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host.endsWith("duckduckgo.com")) {
      const uddg = u.searchParams.get("uddg");
      if (uddg) return uddg;
    }
    if (host.endsWith("bing.com") || host.endsWith("google.com")) {
      const target = u.searchParams.get("url") || u.searchParams.get("q") || u.searchParams.get("u");
      if (target && /^https?:\/\//i.test(target)) return target;
    }
    return raw;
  } catch {
    return raw;
  }
}

function isPrivateIp(ip = "") {
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return false;
}

export async function isSafePublicHttpUrl(input = "") {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const host = parsed.hostname.replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  // Reserved documentation domains are always public and safe to treat as external targets.
  if (host === "example.com" || host === "example.org" || host === "example.net" || host.endsWith(".example")) return true;
  if (["169.254.169.254", "metadata.google.internal"].includes(host)) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    return records.length > 0 && records.every((r) => !isPrivateIp(r.address));
  } catch {
    return false;
  }
}

function hostLinksToTarget(linkUrl = "", targetHost = "") {
  const host = hostFromUrl(linkUrl);
  return !!host && (host === targetHost || host.endsWith(`.${targetHost}`));
}

function stripTags(input = "") {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attrValue(attrs = "", name = "") {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = String(attrs || "").match(re);
  return m ? (m[2] || m[3] || m[4] || "").trim() : "";
}

function extractPageTitle(html = "") {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripTags(m?.[1] || "");
}

export function extractBacklinkAnchors(html = "", pageUrl = "", targetHost = "") {
  const links = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const attrs = m[1] || "";
    const href = attrValue(attrs, "href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let absolute;
    try {
      absolute = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (!hostLinksToTarget(absolute, targetHost)) continue;
    const rel = attrValue(attrs, "rel").toLowerCase();
    const relTokens = rel.split(/\s+/).filter(Boolean);
    const context = String(html || "").slice(Math.max(0, m.index - 320), Math.min(String(html || "").length, m.index + (m[0]?.length || 0) + 320)).toLowerCase();
    const placement = classifyLinkPlacement(context);
    links.push({
      url_to: absolute,
      anchor: stripTags(m[2] || ""),
      rel,
      dofollow: !relTokens.includes("nofollow"),
      ugc: relTokens.includes("ugc"),
      sponsored: relTokens.includes("sponsored"),
      placement,
    });
  }
  return links;
}

function classifyLinkPlacement(context = "") {
  const c = String(context || "").toLowerCase();
  if (!c) return "unknown";
  if (/<footer\b|class\s*=\s*["'][^"']*footer|id\s*=\s*["'][^"']*footer/.test(c)) return "footer";
  if (/<aside\b|class\s*=\s*["'][^"']*(sidebar|widget)|id\s*=\s*["'][^"']*(sidebar|widget)/.test(c)) return "sidebar";
  if (/<nav\b|class\s*=\s*["'][^"']*(nav|menu)|id\s*=\s*["'][^"']*(nav|menu)/.test(c)) return "nav";
  if (/<header\b|class\s*=\s*["'][^"']*header|id\s*=\s*["'][^"']*header/.test(c)) return "header";
  if (/<main\b|<article\b|<section\b|<p\b/.test(c)) return "content";
  return "unknown";
}

function classifySourceType(urlFrom = "", pageTitle = "") {
  const url = String(urlFrom || "").toLowerCase();
  const title = String(pageTitle || "").toLowerCase();
  const host = hostFromUrl(url);
  const combined = `${url} ${title}`;
  if (/(crunchbase\.com|linkedin\.com\/company|yelp\.com|clutch\.co|g2\.com|capterra\.com)/.test(host)) return "directory";
  if (/(profile|company|listing|directory|partners|resources)/.test(combined)) return "profile";
  if (/(forum|community|thread|discussion|reddit\.com|quora\.com)/.test(combined)) return "forum";
  if (/(blog|news|article|insights|editorial)/.test(combined)) return "editorial";
  return "general";
}

function scoreBacklinkConfidence({ dofollow = false, sponsored = false, ugc = false, placement = "unknown", anchor = "", sourceType = "general", pageRank = 0 } = {}) {
  let score = 45;
  const reasons = [];

  if (dofollow) { score += 16; reasons.push("dofollow"); } else { score -= 4; reasons.push("nofollow"); }
  if (ugc) { score -= 6; reasons.push("ugc"); }
  if (sponsored) { score -= 10; reasons.push("sponsored"); }

  if (placement === "content") { score += 16; reasons.push("content-placement"); }
  else if (placement === "sidebar") { score += 8; reasons.push("sidebar-placement"); }
  else if (placement === "nav" || placement === "footer" || placement === "header") { score += 3; reasons.push(`${placement}-placement`); }
  else { reasons.push("unknown-placement"); }

  const anchorLen = String(anchor || "").trim().length;
  if (anchorLen >= 2 && anchorLen <= 90) { score += 8; reasons.push("anchor-quality"); }
  else if (anchorLen === 0) { score -= 6; reasons.push("missing-anchor"); }
  else { score -= 2; reasons.push("weak-anchor"); }

  if (sourceType === "editorial") { score += 10; reasons.push("editorial-source"); }
  else if (sourceType === "directory") { score -= 2; reasons.push("directory-source"); }
  else if (sourceType === "forum") { score -= 5; reasons.push("forum-source"); }
  else if (sourceType === "profile") { score += 1; reasons.push("profile-source"); }

  const pageSignal = Math.max(0, Math.min(100, Number(pageRank || 0)));
  score += Math.round(pageSignal / 6);
  reasons.push(`page-rank:${pageSignal}`);

  return {
    confidence: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

function scoreBacklinkPage({ url = "", html = "", links = [] } = {}) {
  const text = stripTags(html);
  const title = extractPageTitle(html);
  let score = 20;
  if (/^https:\/\//i.test(url)) score += 8;
  if (title.length >= 8) score += 8;
  if (text.length > 500) score += 12;
  if (text.length > 2000) score += 10;
  if (links.some((l) => l.dofollow)) score += 18;
  if (links.some((l) => l.anchor && l.anchor.length <= 80)) score += 8;
  if (/(casino|viagra|porn|payday|forex|crypto bonus)/i.test(text)) score -= 25;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function mergeRelTokens(a = "", b = "") {
  const tokens = new Set(
    `${a || ""} ${b || ""}`
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  );
  return Array.from(tokens).join(" ");
}

function extractSameHostPageLinks(html = "", pageUrl = "", options = {}) {
  const urls = new Set();
  let pageHost;
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return [];
  }
  const targetHost = normalizeBacklinkTarget(options.targetHost || "");
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const attrs = m[1] || "";
    const href = attrValue(attrs, "href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let absolute;
    try {
      absolute = canonicalizeBacklinkUrl(new URL(href, pageUrl).toString());
    } catch {
      continue;
    }
    const host = hostFromUrl(absolute);
    if (!host || host !== pageHost) continue;
    if (targetHost && (host === targetHost || host.endsWith(`.${targetHost}`))) continue;
    if (/\.(avif|gif|ico|jpe?g|png|svg|webp|pdf|zip|rar)(?:[?#].*)?$/i.test(absolute)) continue;
    if (isLikelyLowSignalUrl(absolute)) continue;
    urls.add(absolute);
    if (urls.size >= (options.maxLinks || MAX_EXPANSION_LINKS_PER_HOST)) break;
  }
  return Array.from(urls);
}

function extractCrossHostLikelyReferrerLinks(html = "", pageUrl = "", targetHost = "", options = {}) {
  const urls = new Set();
  const cap = Math.max(1, Math.min(80, Number(options.maxLinks || 30)));
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const attrs = m[1] || "";
    const href = attrValue(attrs, "href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let absolute;
    try {
      absolute = canonicalizeBacklinkUrl(new URL(href, pageUrl).toString());
    } catch {
      continue;
    }
    const host = hostFromUrl(absolute);
    if (!host) continue;
    if (targetHost && (host === targetHost || host.endsWith(`.${targetHost}`))) continue;
    if (/\.(avif|gif|ico|jpe?g|png|svg|webp|pdf|zip|rar)(?:[?#].*)?$/i.test(absolute)) continue;
    if (isLikelyLowSignalUrl(absolute)) continue;
    const anchorText = stripTags(m[2] || "").toLowerCase();
    const hrefText = absolute.toLowerCase();
    const looksReferrer =
      /partner|customer|case|portfolio|project|featured|review|resource|directory|profile|company|listing|mention/.test(anchorText) ||
      /partner|customer|case|portfolio|project|featured|review|resource|directory|profile|company|listing|mention/.test(hrefText) ||
      isLikelyHighSignalUrl(absolute);
    if (!looksReferrer) continue;
    urls.add(absolute);
    if (urls.size >= cap) break;
  }
  return Array.from(urls);
}

function consolidateBacklinkItems(items = []) {
  const byKey = new Map();
  for (const item of items) {
    const canonicalFrom = canonicalizeBacklinkUrl(item.url_from);
    const canonicalTo = canonicalizeBacklinkUrl(item.url_to);
    if (!canonicalFrom || !canonicalTo) continue;
    const key = `${canonicalFrom}\n${canonicalTo}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        ...item,
        url_from: canonicalFrom,
        url_to: canonicalTo,
        occurrences: 1,
      });
      continue;
    }
    const merged = {
      ...prev,
      dofollow: prev.dofollow || item.dofollow,
      ugc: prev.ugc || item.ugc,
      sponsored: prev.sponsored || item.sponsored,
      rel: mergeRelTokens(prev.rel, item.rel),
      anchor: prev.anchor || item.anchor || "",
      occurrences: Number(prev.occurrences || 1) + 1,
      page_from_rank: Math.max(Number(prev.page_from_rank || 0), Number(item.page_from_rank || 0)),
      confidence: Math.max(Number(prev.confidence || 0), Number(item.confidence || 0)),
      confidence_reasons: Array.from(new Set([...(prev.confidence_reasons || []), ...(item.confidence_reasons || [])])),
      placement: prev.placement === "content" ? "content" : (item.placement || prev.placement || "unknown"),
      source_type: prev.source_type === "editorial" ? "editorial" : (item.source_type || prev.source_type || "general"),
    };
    byKey.set(key, merged);
  }
  return Array.from(byKey.values());
}

async function discoverFromVerifiedNeighborhood(verifiedPages = [], targetHost = "", options = {}) {
  const fetcher = options.fetcher || fetch;
  const maxHosts = Math.max(1, Math.min(8, Number(options.maxExpansionHosts || 4)));
  const maxLinksPerHost = Math.max(1, Math.min(40, Number(options.maxExpansionLinksPerHost || MAX_EXPANSION_LINKS_PER_HOST)));
  const maxCandidates = Math.max(1, Math.min(120, Number(options.maxExpandedCandidates || 60)));
  const seenHost = new Set();
  const expanded = [];

  for (const page of verifiedPages.filter((p) => p?.ok)) {
    const host = hostFromUrl(page.url_from || "");
    if (!host || seenHost.has(host)) continue;
    seenHost.add(host);
    if (seenHost.size > maxHosts) break;

    const fetched = await fetchText(page.url_from, fetcher);
    if (!fetched.ok || !fetched.html) continue;
    const links = extractSameHostPageLinks(fetched.html, page.url_from, {
      targetHost,
      maxLinks: maxLinksPerHost,
    });
    for (const url of links) {
      expanded.push({ url, source: "expansion:same-host", parent: page.url_from });
      if (expanded.length >= maxCandidates) return expanded;
    }
  }
  return expanded;
}

async function discoverFromVerifiedNeighborhoodDepth(verifiedPages = [], targetHost = "", options = {}) {
  const depth = Math.max(1, Math.min(3, Number(options.maxExpansionDepth || 1)));
  const globalCap = Math.max(1, Math.min(400, Number(options.maxExpandedCandidates || 120)));
  const all = [];
  const seen = new Set();
  let frontier = Array.isArray(verifiedPages) ? verifiedPages.filter((p) => p?.ok) : [];

  for (let level = 0; level < depth; level += 1) {
    if (!frontier.length || all.length >= globalCap) break;
    const batch = await discoverFromVerifiedNeighborhood(frontier, targetHost, {
      ...options,
      maxExpandedCandidates: Math.max(1, globalCap - all.length),
    });
    const uniqueBatch = [];
    for (const c of batch) {
      if (!c?.url || seen.has(c.url)) continue;
      seen.add(c.url);
      all.push(c);
      uniqueBatch.push(c);
      if (all.length >= globalCap) break;
    }
    if (!uniqueBatch.length) break;
    frontier = uniqueBatch.map((c) => ({ ok: true, url_from: c.url }));
  }

  return all;
}

async function discoverFromReferrerSurfaces(verifiedPages = [], targetHost = "", options = {}) {
  const fetcher = options.fetcher || fetch;
  const maxPages = Math.max(1, Math.min(20, Number(options.maxSurfacePages || 10)));
  const maxOut = Math.max(1, Math.min(180, Number(options.maxSurfaceCandidates || 60)));
  const out = [];
  const seen = new Set();
  const pages = Array.isArray(verifiedPages) ? verifiedPages.filter((p) => p?.ok).slice(0, maxPages) : [];
  for (const page of pages) {
    const fetched = await fetchText(page.url_from, fetcher);
    if (!fetched.ok || !fetched.html) continue;
    const links = extractCrossHostLikelyReferrerLinks(fetched.html, page.url_from, targetHost, {
      maxLinks: Math.min(40, maxOut - out.length),
    });
    for (const url of links) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, source: "expansion:referrer-surface", parent: page.url_from });
      if (out.length >= maxOut) return out;
    }
    if (out.length >= maxOut) break;
  }
  return out;
}

async function fetchText(url, fetcher = fetch) {
  if (!(await isSafePublicHttpUrl(url))) {
    return { ok: false, error: "Blocked unsafe or private URL", html: "", status: 0, source: "blocked" };
  }
  const attempts = [
    { source: "direct", url },
    { source: "jina", url: `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}` },
  ];
  let lastError = "fetch failed";
  for (const attempt of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetcher(attempt.url, { headers: { "User-Agent": "HelioBacklinkTool/0.1" }, signal: controller.signal });
      const length = Number(res.headers?.get?.("content-length") || 0);
      if (length > MAX_FETCH_BYTES) {
        lastError = `${attempt.source}: response too large`;
        continue;
      }
      const text = await res.text();
      if (!res.ok || !text) {
        lastError = `${attempt.source}: HTTP ${res.status}`;
        continue;
      }
      if (text.length > MAX_FETCH_BYTES) {
        lastError = `${attempt.source}: response too large`;
        continue;
      }
      return { ok: true, html: text, status: res.status, source: attempt.source };
    } catch (e) {
      lastError = `${attempt.source}: ${e.message}`;
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, error: lastError, html: "", status: 0, source: "none" };
}

function extractUrlsFromSearchText(text = "", targetHost = "") {
  const urls = new Set();

  const addCandidate = (rawUrl = "") => {
    const resolved = resolveSearchResultUrl(rawUrl);
    const clean = canonicalizeBacklinkUrl(resolved.replace(/[.,;:!?]+$/, ""));
    const host = hostFromUrl(clean);
    if (!clean || !host) return;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return;
    if (net.isIP(host) && isPrivateIp(host)) return;
    if (host === targetHost || host.endsWith(`.${targetHost}`)) return;
    if (/(google|bing|duckduckgo|jina\.ai|microsoft|r\.bing|external-content\.duckduckgo)\./i.test(host)) return;
    if (/\.(avif|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(clean)) return;
    urls.add(clean);
  };

  const raw = String(text || "");
  const markdownLinkRe = /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
  let markdownMatch;
  while ((markdownMatch = markdownLinkRe.exec(raw))) {
    addCandidate(markdownMatch[1]);
  }

  const re = /https?:\/\/[^\s"'<>()[\]{}]+/gi;
  let m;
  while ((m = re.exec(raw))) {
    addCandidate(m[0]);
  }
  return Array.from(urls);
}

function buildDiscoveryQueries(targetHost = "") {
  const host = normalizeBacklinkTarget(targetHost);
  if (!host) return [];
  const parts = host.split(".").filter(Boolean);
  const root = parts.slice(0, -1).join(".") || host;
  const shortBrand = root
    .replace(/^www\./i, "")
    .split(/[-_]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3)
    .slice(0, 2)
    .join(" ");

  const candidates = [
    `"${host}" -site:${host}`,
    `"https://${host}" -site:${host}`,
    `"www.${host}" -site:${host}`,
    `"${host}" (review OR alternative OR competitors) -site:${host}`,
    `"${host}" (directory OR profile OR listing) -site:${host}`,
    `"${host}" (resources OR tools OR recommended) -site:${host}`,
    `"${host}" (partner OR partners OR customer OR case study) -site:${host}`,
    `"${host}" (mention OR featured OR roundup) -site:${host}`,
    `"${host}" (github OR medium OR producthunt OR crunchbase) -site:${host}`,
    `"${host}" (linktree OR bio OR profile) -site:${host}`,
    `"${host}" (forum OR thread OR community OR discussion) -site:${host}`,
    `"${host}" (coupon OR deal OR promo) -site:${host}`,
  ];

  if (shortBrand) {
    candidates.push(`"${shortBrand}" "${host}" -site:${host}`);
    candidates.push(`"${shortBrand}" (mentions OR featured OR partner) -site:${host}`);
    candidates.push(`"${shortBrand}" (review OR comparison OR alternatives) -site:${host}`);
    candidates.push(`"${shortBrand}" (directory OR listing OR profile) -site:${host}`);
    candidates.push(`"${shortBrand}" (customer story OR case study) -site:${host}`);
  }

  return Array.from(new Set(candidates)).slice(0, 32);
}

function prioritizeDiscoveredCandidates(candidates = [], targetHost = "", options = {}) {
  const hostCap = Math.max(1, Math.min(10, Number(options.maxPerRefHost || 3)));
  const sourceCap = Math.max(1, Math.min(20, Number(options.maxPerSource || 8)));
  const priorityBySource = {
    "serp:duckduckgo": 3,
    "serp:bing": 2,
    "expansion:referrer-surface": 4,
    "expansion:same-host": 1,
  };
  const target = normalizeBacklinkTarget(targetHost);
  const byHostCount = new Map();
  const bySourceCount = new Map();

  const scored = candidates
    .map((c, idx) => {
      const host = hostFromUrl(c?.url || "");
      if (!host || !c?.url) return null;
      let score = Number(priorityBySource[c.source] || 0) * 100;
      if (!target || (!host.endsWith(`.${target}`) && host !== target)) score += 10;
      if (c.query && /\breview|alternative|competitors\b/i.test(c.query)) score += 6;
      if (c.query && /\bdirectory|profile|listing\b/i.test(c.query)) score += 2;
      if (c.source === "expansion:same-host") score -= 4;
      if (c.source === "expansion:referrer-surface") score += 10;
      if (isLikelyLowSignalUrl(c.url)) score -= 22;
      if (isLikelyHighSignalUrl(c.url)) score += 12;
      return { ...c, host, __score: score, __idx: idx };
    })
    .filter(Boolean)
    .sort((a, b) => (b.__score - a.__score) || (a.__idx - b.__idx));

  const selected = [];
  for (const c of scored) {
    const hostCount = Number(byHostCount.get(c.host) || 0);
    const sourceCount = Number(bySourceCount.get(c.source || "unknown") || 0);
    if (hostCount >= hostCap || sourceCount >= sourceCap) continue;
    byHostCount.set(c.host, hostCount + 1);
    bySourceCount.set(c.source || "unknown", sourceCount + 1);
    selected.push({
      url: c.url,
      source: c.source,
      query: c.query || "",
      page: c.page,
      parent: c.parent || "",
    });
  }
  return selected;
}

async function discoverArchiveCandidates(targetHost = "", options = {}) {
  const host = normalizeBacklinkTarget(targetHost);
  if (!host) return [];
  const fetcher = options.fetcher || fetch;
  const limit = Math.max(1, Math.min(100, Number(options.archiveLimit || 30)));
  const queryUrl = `https://web.archive.org/cdx/search/cdx?url=*.${encodeURIComponent(host)}/*&output=json&fl=original,statuscode,mimetype&filter=statuscode:200&collapse=urlkey&limit=${limit}`;
  try {
    const res = await fetcher(queryUrl);
    const text = await res.text();
    if (!res.ok || !text) return [];
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const urls = [];
    for (const row of rows.slice(1)) {
      const original = Array.isArray(row) ? row[0] : "";
      const normalized = canonicalizeBacklinkUrl(original);
      const h = hostFromUrl(normalized);
      if (!normalized || !h || h === host || h.endsWith(`.${host}`)) continue;
      urls.push({ url: normalized, source: "archive:wayback", query: `backlink:${host}` });
      if (urls.length >= limit) break;
    }
    return urls;
  } catch {
    return [];
  }
}

async function getLatestCommonCrawlCollection(fetcher = fetch) {
  try {
    const res = await fetcher(COMMONCRAWL_COLLINFO_URL);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return "";
    const id = rows[0]?.id || "";
    return id ? `https://index.commoncrawl.org/${id}-index` : "";
  } catch {
    return "";
  }
}

async function discoverCommonCrawlCandidates(targetHost = "", options = {}) {
  const host = normalizeBacklinkTarget(targetHost);
  if (!host) return [];
  const fetcher = options.fetcher || fetch;
  const limit = Math.max(1, Math.min(100, Number(options.commonCrawlLimit || 30)));
  const indexBase = options.commonCrawlIndex || await getLatestCommonCrawlCollection(fetcher);
  if (!indexBase) return [];
  const query = `${indexBase}?url=*.${encodeURIComponent(host)}/*&output=json&filter=status:200&limit=${limit}`;
  try {
    const res = await fetcher(query);
    const text = await res.text();
    if (!res.ok || !text) return [];
    const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        const url = canonicalizeBacklinkUrl(String(row.url || row.urlkey || ""));
        const h = hostFromUrl(url);
        if (!url || !h || h === host || h.endsWith(`.${host}`)) continue;
        out.push({ url, source: "index:commoncrawl", query: `backlink:${host}` });
        if (out.length >= limit) break;
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function discoverBacklinkCandidates(target = "", options = {}) {
  const targetHost = normalizeBacklinkTarget(target);
  if (!targetHost) return [];
  const fetcher = options.fetcher || fetch;
  const queries = options.queries || buildDiscoveryQueries(targetHost);
  const found = [];
  const seen = new Set();
  const maxDiscovered = Math.max(1, Math.min(1000, Number(options.maxDiscovered || 80)));
  const maxQueries = Math.max(1, Math.min(40, Number(options.maxQueries || 10)));
  const maxProviders = Math.max(1, Math.min(DEFAULT_SEARCH_ENDPOINTS.length, Number(options.maxSearchProviders || DEFAULT_SEARCH_ENDPOINTS.length)));
  const maxPagesPerQuery = Math.max(1, Math.min(12, Number(options.maxSearchPages || 4)));
  const includeExternal = options.includeExternalIndexes !== false;

  if (includeExternal) {
    const external = [
      ...(await discoverArchiveCandidates(targetHost, options)),
      ...(await discoverCommonCrawlCandidates(targetHost, options)),
    ];
    for (const c of external) {
      if (!c.url || seen.has(c.url)) continue;
      seen.add(c.url);
      found.push(c);
      if (found.length >= maxDiscovered) {
        return prioritizeDiscoveredCandidates(found, targetHost, options).slice(0, maxDiscovered);
      }
    }
  }

  for (const q of queries.slice(0, maxQueries)) {
    for (const endpoint of DEFAULT_SEARCH_ENDPOINTS.slice(0, maxProviders)) {
      for (let page = 0; page < maxPagesPerQuery; page += 1) {
        try {
          const res = await fetcher(endpoint.url(q, page));
          const text = await res.text();
          if (!res.ok || !text) continue;
          for (const url of extractUrlsFromSearchText(text, targetHost)) {
            if (seen.has(url)) continue;
            seen.add(url);
            found.push({ url, source: `serp:${endpoint.provider}`, query: q, page });
            if (found.length >= maxDiscovered) {
              return prioritizeDiscoveredCandidates(found, targetHost, options).slice(0, maxDiscovered);
            }
          }
        } catch {}
      }
    }
    if (found.length >= maxDiscovered) break;
  }
  return prioritizeDiscoveredCandidates(found, targetHost, options).slice(0, maxDiscovered);
}

export function __internal_buildDiscoveryQueries(targetHost = "") {
  return buildDiscoveryQueries(targetHost);
}

export function __internal_extractUrlsFromSearchText(text = "", targetHost = "") {
  return extractUrlsFromSearchText(text, targetHost);
}

async function verifyBacklinkCandidate(candidate, targetHost = "", options = {}) {
  const url = normalizeCandidateUrl(typeof candidate === "string" ? candidate : candidate?.url);
  if (!url) return { ok: false, error: "Invalid candidate URL", url_from: "" };
  const fetched = await fetchText(url, options.fetcher || fetch);
  if (!fetched.ok) return { ok: false, error: fetched.error, url_from: url, source: candidate?.source || "candidate" };
  const links = extractBacklinkAnchors(fetched.html, url, targetHost);
  const pageTitle = extractPageTitle(fetched.html);
  const score = scoreBacklinkPage({ url, html: fetched.html, links });
  return {
    ok: true,
    url_from: url,
    source: candidate?.source || fetched.source || "candidate",
    status: fetched.status,
    page_title: pageTitle,
    page_from_rank: score,
    links,
  };
}

export async function analyzeHelioBacklinks(input = {}) {
  const target = normalizeBacklinkTarget(input.target);
  if (!target) return { ok: false, error: "Missing backlink target" };
  const fetcher = input.fetcher || fetch;
  const maxCandidates = Math.max(1, Math.min(800, Number(input.maxCandidates || 80)));
  const manualCandidates = (Array.isArray(input.candidates) ? input.candidates : [])
    .map((url) => ({ url: normalizeCandidateUrl(url), source: "manual" }))
    .filter((c) => c.url);
  const discovered = input.discover === false
    ? []
    : await discoverBacklinkCandidates(target, { ...input.discoveryOptions, fetcher, maxDiscovered: maxCandidates });

  const merged = [];
  const seen = new Set();
  for (const c of [...manualCandidates, ...discovered]) {
    if (!c.url || seen.has(c.url)) continue;
    seen.add(c.url);
    merged.push(c);
    if (merged.length >= maxCandidates) break;
  }

  const verified = [];
  for (const c of merged) verified.push(await verifyBacklinkCandidate(c, target, { fetcher }));

  const expansionCandidates = input.expandNeighborhood === false
    ? []
    : await discoverFromVerifiedNeighborhoodDepth(verified, target, { ...input.discoveryOptions, fetcher });
  const enableReferrerSurface = input.discoveryOptions?.enableReferrerSurface === true || input.enableReferrerSurface === true;
  const referrerSurfaceCandidates = input.expandNeighborhood === false || !enableReferrerSurface
    ? []
    : await discoverFromReferrerSurfaces(verified, target, { ...input.discoveryOptions, fetcher });

  const verifyQueue = [];
  const verifySeen = new Set(merged.map((c) => c.url));
  for (const c of [...referrerSurfaceCandidates, ...expansionCandidates]) {
    if (!c.url || verifySeen.has(c.url)) continue;
    verifySeen.add(c.url);
    verifyQueue.push(c);
    if (verifyQueue.length + merged.length >= maxCandidates) break;
  }
  for (const c of verifyQueue) verified.push(await verifyBacklinkCandidate(c, target, { fetcher }));

  const items = [];
  for (const page of verified.filter((v) => v.ok)) {
    page.links.forEach((link) => {
      const sourceType = classifySourceType(page.url_from, page.page_title);
      const confidence = scoreBacklinkConfidence({
        dofollow: link.dofollow,
        sponsored: link.sponsored,
        ugc: link.ugc,
        placement: link.placement,
        anchor: link.anchor,
        sourceType,
        pageRank: page.page_from_rank,
      });
      items.push({
        url_from: page.url_from,
        url_to: link.url_to,
        anchor: link.anchor,
        rel: link.rel,
        dofollow: link.dofollow,
        ugc: link.ugc,
        sponsored: link.sponsored,
        placement: link.placement || "unknown",
        source_type: sourceType,
        confidence: confidence.confidence,
        confidence_reasons: confidence.reasons,
        page_from_rank: page.page_from_rank,
        page_title: page.page_title,
        source: page.source,
        status: page.status,
      });
    });
  }

  const uniqueItems = consolidateBacklinkItems(items);
  const referringDomains = new Set(uniqueItems.map((i) => hostFromUrl(i.url_from)).filter(Boolean));
  const scores = uniqueItems.map((i) => Number(i.page_from_rank || 0)).filter((n) => n > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const nofollow = uniqueItems.filter((i) => !i.dofollow).length;
  const summary = {
    rank: avgScore,
    backlinks: uniqueItems.length,
    referring_domains: referringDomains.size,
    backlinks_dofollow: uniqueItems.filter((i) => i.dofollow).length,
    backlinks_nofollow: nofollow,
    broken_backlinks: verified.filter((v) => !v.ok).length,
    referring_ips: null,
    referring_subnets: null,
    spam_score: scores.length ? Math.max(0, 100 - avgScore) : null,
    backlinks_follow: uniqueItems.filter((i) => i.dofollow).length,
    backlinks_ugc: uniqueItems.filter((i) => i.ugc).length,
    backlinks_sponsored: uniqueItems.filter((i) => i.sponsored).length,
    candidates_checked: verified.length,
    candidates_discovered: discovered.length + expansionCandidates.length,
    raw_link_hits: items.length,
    coverage_score: Math.max(0, Math.min(100, Math.round((Number(verified.length || 0) / Math.max(1, Number(discovered.length + expansionCandidates.length || 0))) * 100))),
    precision_score: Math.max(0, Math.min(100, Math.round((Number(uniqueItems.length || 0) / Math.max(1, Number(verified.length || 0))) * 100))),
    recall_proxy_score: Math.max(0, Math.min(100, Math.round((Number(uniqueItems.length || 0) / Math.max(1, Number(discovered.length + expansionCandidates.length || 0))) * 100))),
    source: "helio-native",
  };

  return {
    ok: true,
    target,
    provider: "helio-native",
    summary,
    backlinks: uniqueItems,
    diagnostics: {
      candidates: merged,
      referrerSurfaceCandidates,
      expandedCandidates: expansionCandidates,
      verifiedPages: verified.map((v) => ({ ok: v.ok, url_from: v.url_from, source: v.source, error: v.error || "", links: v.links?.length || 0 })),
    },
  };
}
