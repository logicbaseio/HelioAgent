/* global process, URL */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeHelioBacklinks, isSafePublicHttpUrl, normalizeBacklinkTarget, normalizeCandidateUrl } from "../lib/helio-backlink-tool.js";

const INDEX_ROOT = process.env.HELIO_BACKLINK_INDEX_DIR || path.resolve(process.cwd(), ".helio/backlinks");
const INDEX_VERSION = "1.0.0";
const DEFAULT_QUEUE_BATCH = 30;
const MAX_QUEUE_BATCH = 120;
const LOCK_STALE_MS = Number(process.env.HELIO_BACKLINK_LOCK_STALE_MS || 60000);
const MAX_QUEUE_CANDIDATES = Number(process.env.HELIO_BACKLINK_MAX_QUEUE_CANDIDATES || 1200);
const MAX_PER_HOST_IN_BATCH = Number(process.env.HELIO_BACKLINK_MAX_PER_HOST_IN_BATCH || 3);
const MIN_RECRAWL_HOURS_FOR_COLD = Number(process.env.HELIO_BACKLINK_MIN_RECRAWL_HOURS_COLD || 36);

function safeSegment(input = "") {
  return String(input || "default").toLowerCase().replace(/[^a-z0-9.-]+/g, "_").slice(0, 120) || "default";
}

function linkKey(item = {}) {
  return crypto
    .createHash("sha256")
    .update([item.url_from || "", item.url_to || "", item.anchor || ""].join("\n"))
    .digest("hex");
}

function indexPath(orgScope = "default", target = "") {
  return path.join(INDEX_ROOT, safeSegment(orgScope), `${safeSegment(target)}.json`);
}

function indexLockPath(orgScope = "default", target = "") {
  return path.join(INDEX_ROOT, safeSegment(orgScope), `${safeSegment(target)}.lock`);
}

async function acquireIndexLock(orgScope = "default", target = "", options = {}) {
  const lockPath = indexLockPath(orgScope, target);
  const waitMs = Math.max(1000, Number(options.waitMs || 15000));
  const retryMs = Math.max(100, Number(options.retryMs || 250));
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      await fs.mkdir(path.dirname(lockPath), { recursive: true });
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(String(process.pid || "0"));
      await handle.close();
      return lockPath;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const stats = await fs.stat(lockPath);
        if (Date.now() - Number(stats.mtimeMs || 0) > Number(options.staleMs || LOCK_STALE_MS)) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch {
        // ignore stale-lock stat/unlink race
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, retryMs));
    }
  }
  throw new Error(`Backlink index lock timeout for ${orgScope}/${target}`);
}

async function releaseIndexLock(lockPath = "") {
  if (!lockPath) return;
  try {
    await fs.unlink(lockPath);
  } catch {
    // ignore unlock races
  }
}

function emptyIndex(orgScope = "default", target = "") {
  const now = new Date().toISOString();
  return {
    version: INDEX_VERSION,
    orgScope,
    target,
    createdAt: now,
    updatedAt: now,
    runs: [],
    candidates: {},
    links: {},
    hostStats: {},
    queue: {
      pending: [],
      in_progress: [],
      completed: [],
      failed: [],
    },
    queueCycles: [],
    snapshots: [],
  };
}

function addDaysIso(days = 1) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function daysSinceIso(input = "") {
  const ts = Date.parse(String(input || ""));
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
}

function normalizeQueue(index = {}) {
  const queue = index.queue && typeof index.queue === "object" ? index.queue : {};
  return {
    pending: Array.isArray(queue.pending) ? queue.pending : [],
    in_progress: Array.isArray(queue.in_progress) ? queue.in_progress : [],
    completed: Array.isArray(queue.completed) ? queue.completed : [],
    failed: Array.isArray(queue.failed) ? queue.failed : [],
  };
}

function uniqueUrls(urls = []) {
  const out = [];
  const seen = new Set();
  for (const raw of urls) {
    const url = normalizeCandidateUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function hostFromCandidateUrl(input = "") {
  try {
    return new URL(input).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostFromSourceUrl(input = "") {
  try {
    return new URL(input).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourcePriority(source = "") {
  const s = String(source || "").toLowerCase();
  if (s.includes("manual") || s.includes("import")) return 5;
  if (s.includes("commoncrawl") || s.includes("archive")) return 4;
  if (s.includes("serp")) return 3;
  if (s.includes("expansion")) return 1;
  return 2;
}

function setCandidateQueueState(index = {}, url = "", state = "pending") {
  const normalized = normalizeCandidateUrl(url);
  if (!normalized) return;
  index.queue = normalizeQueue(index);
  const states = ["pending", "in_progress", "completed", "failed"];
  for (const s of states) index.queue[s] = index.queue[s].filter((u) => u !== normalized);
  if (states.includes(state)) index.queue[state].push(normalized);
}

function enqueueCandidates(index = {}, urls = [], options = {}) {
  const now = new Date().toISOString();
  const nowTs = Date.now();
  const basePriority = Number(options.priority || 1);
  const srcPriority = sourcePriority(options.source);
  const priority = Math.max(1, basePriority + srcPriority - 1);
  for (const url of uniqueUrls(urls)) {
    const prev = index.candidates[url] || {};
    const host = hostFromCandidateUrl(url);
    const hostStats = index.hostStats?.[host] || {};
    const successRate = Number(hostStats.successRate || 0);
    const hostPenalty = Number(hostStats.attempts || 0) >= 4 && successRate < 0.05 ? 3 : 0;
    const prevNextRunTs = prev.queueNextRunAt ? Date.parse(prev.queueNextRunAt) : 0;
    const shouldRespectSchedule = options.respectSchedule !== false;
    const blockedBySchedule =
      shouldRespectSchedule &&
      Number.isFinite(prevNextRunTs) &&
      prevNextRunTs > nowTs &&
      (prev.queueState === "completed" || prev.queueState === "failed");

    index.candidates[url] = {
      ...prev,
      url,
      source: options.source || prev.source || "queue",
      query: options.query || prev.query || "",
      firstDiscoveredAt: prev.firstDiscoveredAt || now,
      lastDiscoveredAt: now,
      discoveryHits: Number(prev.discoveryHits || 0) + 1,
      queuePriority: Math.max(0, Number(prev.queuePriority || 0) + priority - hostPenalty),
      queueQueuedAt: blockedBySchedule ? prev.queueQueuedAt || now : now,
      queueNextRunAt: prev.queueNextRunAt || now,
      queueAttempts: Number(prev.queueAttempts || 0),
      queueState: blockedBySchedule ? prev.queueState : "pending",
      lastQueuedAt: blockedBySchedule ? prev.lastQueuedAt || now : now,
    };
    if (!blockedBySchedule) setCandidateQueueState(index, url, "pending");
  }
  // Keep queue bounded so crawl pressure remains manageable.
  const keys = Object.keys(index.candidates || {});
  if (keys.length > MAX_QUEUE_CANDIDATES) {
    const ranked = keys
      .map((url) => ({ url, c: index.candidates[url] || {} }))
      .sort((a, b) => {
        const aPri = Number(a.c.queuePriority || 0);
        const bPri = Number(b.c.queuePriority || 0);
        if (aPri !== bPri) return bPri - aPri;
        const aLive = Date.parse(String(a.c.lastLiveLinkAt || "")) || 0;
        const bLive = Date.parse(String(b.c.lastLiveLinkAt || "")) || 0;
        if (aLive !== bLive) return bLive - aLive;
        const aDis = Date.parse(String(a.c.lastDiscoveredAt || "")) || 0;
        const bDis = Date.parse(String(b.c.lastDiscoveredAt || "")) || 0;
        return bDis - aDis;
      });
    const keep = new Set(ranked.slice(0, MAX_QUEUE_CANDIDATES).map((x) => x.url));
    for (const url of keys) {
      if (keep.has(url)) continue;
      delete index.candidates[url];
    }
    index.queue = normalizeQueue(index);
    index.queue.pending = index.queue.pending.filter((url) => keep.has(url));
    index.queue.in_progress = index.queue.in_progress.filter((url) => keep.has(url));
    index.queue.completed = index.queue.completed.filter((url) => keep.has(url));
    index.queue.failed = index.queue.failed.filter((url) => keep.has(url));
  }
}

function pullQueueBatch(index = {}, size = DEFAULT_QUEUE_BATCH) {
  index.queue = normalizeQueue(index);
  const safeSize = Math.max(1, Math.min(MAX_QUEUE_BATCH, Number(size || DEFAULT_QUEUE_BATCH)));
  const now = Date.now();
  const pool = uniqueUrls([
    ...index.queue.pending,
    ...index.queue.completed,
    ...index.queue.failed,
  ]);
  const sortable = pool
    .map((url) => ({ url, candidate: index.candidates[url] || {} }))
    .filter((item) => item.url)
    .filter((item) => {
      const when = item.candidate.queueNextRunAt ? Date.parse(item.candidate.queueNextRunAt) : 0;
      return !Number.isFinite(when) || when <= now;
    })
    .filter((item) => {
      // Novelty gate: avoid repeatedly recrawling cold/no-link URLs too quickly.
      const outcome = String(item.candidate.queueLastOutcome || "");
      const checkedAt = Date.parse(String(item.candidate.lastChecked || item.candidate.queueLastFinishedAt || ""));
      if (!Number.isFinite(checkedAt)) return true;
      const ageHours = (now - checkedAt) / (1000 * 60 * 60);
      const isCold = outcome.includes("no-links") || item.candidate.recrawlTier === "cold";
      if (!isCold) return true;
      return ageHours >= Math.max(6, MIN_RECRAWL_HOURS_FOR_COLD);
    })
    .sort((a, b) => {
      const staleA = daysSinceIso(a.candidate.lastChecked) ?? 9999;
      const staleB = daysSinceIso(b.candidate.lastChecked) ?? 9999;
      if (staleA !== staleB) return staleB - staleA;
      const p = Number(b.candidate.queuePriority || 0) - Number(a.candidate.queuePriority || 0);
      if (p !== 0) return p;
      const aa = Number(a.candidate.queueAttempts || 0);
      const bb = Number(b.candidate.queueAttempts || 0);
      if (aa !== bb) return aa - bb;
      const at = Date.parse(a.candidate.lastQueuedAt || 0);
      const bt = Date.parse(b.candidate.lastQueuedAt || 0);
      return at - bt;
    })
    .slice(0, safeSize);

  const perHostCap = Math.max(1, Math.min(8, Number(MAX_PER_HOST_IN_BATCH || 3)));
  const hostCount = new Map();
  const picked = [];
  for (const row of sortable) {
    const host = hostFromCandidateUrl(row.url);
    const current = Number(hostCount.get(host) || 0);
    if (host && current >= perHostCap) continue;
    if (host) hostCount.set(host, current + 1);
    picked.push(row.url);
    if (picked.length >= safeSize) break;
  }
  picked.forEach((url) => {
    const prev = index.candidates[url] || {};
    index.candidates[url] = { ...prev, queueState: "in_progress", queueLastStartedAt: new Date().toISOString() };
    setCandidateQueueState(index, url, "in_progress");
  });
  return picked;
}

function applyQueueResult(index = {}, verifiedPages = []) {
  const now = new Date().toISOString();
  index.hostStats = index.hostStats && typeof index.hostStats === "object" ? index.hostStats : {};
  for (const page of verifiedPages || []) {
    const url = normalizeCandidateUrl(page?.url_from || "");
    if (!url) continue;
    const host = hostFromSourceUrl(url);
    const prev = index.candidates[url] || { url };
    const attempts = Number(prev.queueAttempts || 0) + 1;
    if (page.ok) {
      const links = Number(page.links || 0);
      const prevLinks = Object.values(index.links || {}).filter((r) => r.url_from === url && r.status === "live");
      const maxConfidence = prevLinks.reduce((acc, r) => Math.max(acc, Number(r.confidence || 0)), 0);
      const tier = links > 0
        ? (maxConfidence >= 75 ? "hot" : maxConfidence >= 50 ? "warm" : "cold")
        : "cold";
      const days = tier === "hot" ? 3 : tier === "warm" ? 7 : 21;
      index.candidates[url] = {
        ...prev,
        queueAttempts: attempts,
        queueState: "completed",
        queueLastFinishedAt: now,
        queueNextRunAt: addDaysIso(days),
        queueLastOutcome: links > 0 ? "live-links" : "no-links",
        lastLiveLinkAt: links > 0 ? now : (prev.lastLiveLinkAt || ""),
        recrawlTier: tier,
        recrawlCadenceDays: days,
      };
      setCandidateQueueState(index, url, "completed");
      if (host) {
        const prevHost = index.hostStats[host] || { attempts: 0, liveHits: 0 };
        const attemptsHost = Number(prevHost.attempts || 0) + 1;
        const liveHitsHost = Number(prevHost.liveHits || 0) + (links > 0 ? 1 : 0);
        index.hostStats[host] = {
          ...prevHost,
          host,
          attempts: attemptsHost,
          liveHits: liveHitsHost,
          successRate: Number((liveHitsHost / Math.max(1, attemptsHost)).toFixed(4)),
          lastCheckedAt: now,
          lastLiveAt: links > 0 ? now : (prevHost.lastLiveAt || ""),
        };
      }
    } else {
      const backoffDays = Math.min(14, Math.max(1, 2 ** Math.min(4, attempts - 1)));
      index.candidates[url] = {
        ...prev,
        queueAttempts: attempts,
        queueState: "failed",
        queueLastFinishedAt: now,
        queueNextRunAt: addDaysIso(backoffDays),
        queueLastOutcome: `error:${page.error || "fetch-failed"}`,
      };
      setCandidateQueueState(index, url, "failed");
      if (host) {
        const prevHost = index.hostStats[host] || { attempts: 0, liveHits: 0 };
        const attemptsHost = Number(prevHost.attempts || 0) + 1;
        const liveHitsHost = Number(prevHost.liveHits || 0);
        index.hostStats[host] = {
          ...prevHost,
          host,
          attempts: attemptsHost,
          liveHits: liveHitsHost,
          successRate: Number((liveHitsHost / Math.max(1, attemptsHost)).toFixed(4)),
          lastCheckedAt: now,
          lastLiveAt: prevHost.lastLiveAt || "",
        };
      }
    }
  }
}

export async function loadBacklinkIndex(orgScope = "default", targetInput = "") {
  const target = normalizeBacklinkTarget(targetInput);
  if (!target) return emptyIndex(orgScope, "");
  try {
    const raw = await fs.readFile(indexPath(orgScope, target), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { ...emptyIndex(orgScope, target), ...parsed, orgScope, target } : emptyIndex(orgScope, target);
  } catch {
    return emptyIndex(orgScope, target);
  }
}

async function saveBacklinkIndex(index = {}) {
  const target = normalizeBacklinkTarget(index.target);
  if (!target) throw new Error("Cannot save backlink index without target");
  const next = { ...index, target, updatedAt: new Date().toISOString() };
  const file = indexPath(next.orgScope || "default", target);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function listBacklinkIndexTargets(orgScope = "") {
  const root = INDEX_ROOT;
  const scoped = safeSegment(orgScope || "");
  const targets = [];
  const walkOrg = async (orgDir, orgId) => {
    let files;
    try {
      files = await fs.readdir(orgDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(orgDir, entry.name), "utf8");
        const parsed = JSON.parse(raw);
        const target = normalizeBacklinkTarget(parsed?.target || "");
        if (!target) continue;
        targets.push({ orgScope: parsed?.orgScope || orgId, target });
      } catch {
        // ignore malformed index file
      }
    }
  };

  if (scoped) {
    await walkOrg(path.join(root, scoped), orgScope);
  } else {
    let orgDirs;
    try {
      orgDirs = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const dir of orgDirs) {
      if (!dir.isDirectory()) continue;
      await walkOrg(path.join(root, dir.name), dir.name);
    }
  }
  const seen = new Set();
  return targets.filter((x) => {
    const key = `${x.orgScope}::${x.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseCandidateText(text = "") {
  return Array.from(new Set(String(text || "")
    .split(/[\n,;\t ]+/)
    .map((raw) => normalizeCandidateUrl(raw.trim()))
    .filter(Boolean)));
}

function summarizeIndex(index = {}) {
  const nowMs = Date.now();
  const records = Object.values(index.links || {});
  const live = records.filter((r) => r.status === "live");
  const snapshots = Array.isArray(index.snapshots) ? index.snapshots : [];
  const isRecent = (iso = "", days = 30) => {
    const ts = Date.parse(String(iso || ""));
    return Number.isFinite(ts) && (nowMs - ts) <= (days * 24 * 60 * 60 * 1000);
  };
  const daysAgoMs = (days = 7) => nowMs - (days * 24 * 60 * 60 * 1000);
  const nearestSnapshotBefore = (targetMs = 0) => {
    let best = null;
    for (const sn of snapshots) {
      const at = Date.parse(String(sn?.at || ""));
      if (!Number.isFinite(at) || at > targetMs) continue;
      if (!best || at > best.at) best = { at, sn };
    }
    return best?.sn || null;
  };
  const queue = normalizeQueue(index);
  const runs = Array.isArray(index.runs) ? index.runs : [];
  const latestRun = runs.length ? runs[runs.length - 1] : null;
  const latestMeaningfulRun = [...runs].reverse().find((r) => Number(r?.verifiedPages || 0) > 0 && Number(r?.candidates || 0) > 0) || null;
  const avgRunMetric = (name = "", count = 5) => {
    const sample = runs.slice(-count).map((r) => Number(r?.[name] || 0)).filter((n) => Number.isFinite(n));
    if (!sample.length) return null;
    return Math.round(sample.reduce((a, b) => a + b, 0) / sample.length);
  };
  const candidateRows = Object.values(index.candidates || {});
  const nextRunDays = candidateRows
    .map((c) => {
      const ts = Date.parse(String(c.queueNextRunAt || ""));
      if (!Number.isFinite(ts)) return null;
      return Math.max(0, Math.floor((ts - nowMs) / (24 * 60 * 60 * 1000)));
    })
    .filter((v) => v !== null);
  const dueSoon = nextRunDays.filter((d) => d <= 1).length;
  const dueWeek = nextRunDays.filter((d) => d > 1 && d <= 7).length;
  const dueLater = nextRunDays.filter((d) => d > 7).length;
  const referringDomains = new Set(live.map((i) => {
    try { return new URL(i.url_from).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
  }).filter(Boolean));
  const scores = live.map((i) => Number(i.page_from_rank || 0)).filter((n) => n > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const latestSnap = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const weekSnap = nearestSnapshotBefore(daysAgoMs(7));
  const monthSnap = nearestSnapshotBefore(daysAgoMs(30));
  const liveNow = Number(latestSnap?.backlinks_live ?? live.length);
  const refNow = Number(latestSnap?.referring_domains ?? referringDomains.size);
  const live7dDelta = weekSnap ? (liveNow - Number(weekSnap.backlinks_live || 0)) : 0;
  const ref7dDelta = weekSnap ? (refNow - Number(weekSnap.referring_domains || 0)) : 0;
  const live30dDelta = monthSnap ? (liveNow - Number(monthSnap.backlinks_live || 0)) : live7dDelta;
  const velocity7d = Math.max(-100, Math.min(100, Math.round((live7dDelta / Math.max(1, Number(weekSnap?.backlinks_live || 1))) * 100)));
  const churn30d = records.filter((i) => i.status === "lost" && isRecent(i.lostAt, 30)).length;
  const new7d = records.filter((i) => i.status === "live" && isRecent(i.firstSeen, 7)).length;
  const new30d = records.filter((i) => i.status === "live" && isRecent(i.firstSeen, 30)).length;
  const recovered30d = records.filter((i) => {
    if (i.status !== "live") return false;
    const h = Array.isArray(i.history) ? i.history : [];
    const hadRecentLost = h.some((x) => x?.status === "lost" && isRecent(x?.at, 30));
    const hasRecentLive = h.some((x) => x?.status === "live" && isRecent(x?.at, 30));
    return hadRecentLost && hasRecentLive;
  }).length;
  return {
    rank: avgScore,
    backlinks: live.length,
    referring_domains: referringDomains.size,
    backlinks_dofollow: live.filter((i) => i.dofollow).length,
    backlinks_nofollow: live.filter((i) => !i.dofollow).length,
    broken_backlinks: records.filter((i) => i.status === "lost").length,
    referring_ips: null,
    referring_subnets: null,
    spam_score: scores.length ? Math.max(0, 100 - avgScore) : null,
    backlinks_follow: live.filter((i) => i.dofollow).length,
    backlinks_ugc: live.filter((i) => i.ugc).length,
    backlinks_sponsored: live.filter((i) => i.sponsored).length,
    live_last_7d: live.filter((i) => isRecent(i.lastSeen, 7)).length,
    live_last_30d: live.filter((i) => isRecent(i.lastSeen, 30)).length,
    lost_last_30d: records.filter((i) => i.status === "lost" && isRecent(i.lostAt, 30)).length,
    backlinks_trend_7d: live7dDelta,
    ref_domains_trend_7d: ref7dDelta,
    backlinks_trend_30d: live30dDelta,
    link_velocity_7d_pct: velocity7d,
    churn_30d: churn30d,
    new_links_7d: new7d,
    new_links_30d: new30d,
    recovered_links_30d: recovered30d,
    recrawl_due_24h: dueSoon,
    recrawl_due_7d: dueWeek,
    recrawl_due_later: dueLater,
    candidates_checked: Object.keys(index.candidates || {}).length,
    candidates_discovered: Object.keys(index.candidates || {}).length,
    coverage_score: Number.isFinite(Number(latestMeaningfulRun?.coverage_score)) ? Number(latestMeaningfulRun.coverage_score) : (Number.isFinite(Number(latestRun?.coverage_score)) ? Number(latestRun.coverage_score) : avgRunMetric("coverage_score", 5)),
    precision_score: Number.isFinite(Number(latestMeaningfulRun?.precision_score)) ? Number(latestMeaningfulRun.precision_score) : (Number.isFinite(Number(latestRun?.precision_score)) ? Number(latestRun.precision_score) : avgRunMetric("precision_score", 5)),
    recall_proxy_score: Number.isFinite(Number(latestMeaningfulRun?.recall_proxy_score)) ? Number(latestMeaningfulRun.recall_proxy_score) : (Number.isFinite(Number(latestRun?.recall_proxy_score)) ? Number(latestRun.recall_proxy_score) : avgRunMetric("recall_proxy_score", 5)),
    queue_pending: queue.pending.length,
    queue_in_progress: queue.in_progress.length,
    queue_completed: queue.completed.length,
    queue_failed: queue.failed.length,
    source: "helio-index",
  };
}

export function formatBacklinkIndex(index = {}) {
  const records = Object.values(index.links || {}).sort((a, b) => String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
  return {
    ok: true,
    target: index.target,
    provider: "helio-index",
    summary: summarizeIndex(index),
    backlinks: records,
    index: {
      version: index.version || INDEX_VERSION,
      createdAt: index.createdAt,
      updatedAt: index.updatedAt,
      runs: Array.isArray(index.runs) ? index.runs.slice(-10) : [],
      queueCycles: Array.isArray(index.queueCycles) ? index.queueCycles.slice(-20).reverse() : [],
      snapshots: Array.isArray(index.snapshots) ? index.snapshots.slice(-30).reverse() : [],
      candidates: Object.values(index.candidates || {}).sort((a, b) => String(b.lastChecked || "").localeCompare(String(a.lastChecked || ""))),
      hostStats: Object.values(index.hostStats || {}).sort((a, b) => Number(b.attempts || 0) - Number(a.attempts || 0)).slice(0, 200),
      queue: normalizeQueue(index),
    },
  };
}

export function mergeAnalysisIntoIndex(index = {}, analysis = {}) {
  const now = new Date().toISOString();
  const next = {
    ...emptyIndex(index.orgScope || "default", analysis.target || index.target),
    ...index,
    target: analysis.target || index.target,
    updatedAt: now,
    candidates: { ...(index.candidates || {}) },
    links: { ...(index.links || {}) },
  };

  const allCandidates = [
    ...(analysis.diagnostics?.candidates || []),
    ...(analysis.diagnostics?.expandedCandidates || []),
  ];

  const candidateUrls = [];
  for (const c of allCandidates) {
    const url = normalizeCandidateUrl(c.url);
    if (!url) continue;
    candidateUrls.push(url);
    next.candidates[url] = {
      ...(next.candidates[url] || {}),
      url,
      source: c.source || next.candidates[url]?.source || "candidate",
      query: c.query || next.candidates[url]?.query || "",
    };
  }
  enqueueCandidates(next, candidateUrls, { source: "analysis-discovery", priority: 2 });

  for (const page of analysis.diagnostics?.verifiedPages || []) {
    const url = normalizeCandidateUrl(page.url_from);
    if (!url) continue;
    next.candidates[url] = {
      ...(next.candidates[url] || {}),
      url,
      source: page.source || next.candidates[url]?.source || "candidate",
      lastChecked: now,
      lastStatus: page.ok ? "checked" : "error",
      lastError: page.error || "",
      linksFound: page.links || 0,
    };
  }

  const seenKeys = new Set();
  for (const item of analysis.backlinks || []) {
    const key = linkKey(item);
    seenKeys.add(key);
    const prev = next.links[key] || {};
    next.links[key] = {
      ...prev,
      ...item,
      key,
      status: "live",
      firstSeen: prev.firstSeen || now,
      lastSeen: now,
      lastChecked: now,
      lostAt: "",
      seenCount: Number(prev.seenCount || 0) + 1,
      history: [...(prev.history || []), { at: now, status: "live", dofollow: item.dofollow, anchor: item.anchor || "" }].slice(-20),
    };
  }

  for (const [key, record] of Object.entries(next.links)) {
    const candidateWasChecked = !!next.candidates[record.url_from]?.lastChecked && next.candidates[record.url_from].lastChecked === now;
    if (!seenKeys.has(key) && candidateWasChecked && record.status === "live") {
      next.links[key] = {
        ...record,
        status: "lost",
        lastChecked: now,
        lostAt: now,
        history: [...(record.history || []), { at: now, status: "lost" }].slice(-20),
      };
    }
  }

  next.runs = [
    ...(Array.isArray(next.runs) ? next.runs : []),
    {
      at: now,
      provider: analysis.provider || "helio-native",
      candidates: allCandidates.length,
      verifiedPages: analysis.diagnostics?.verifiedPages?.length || 0,
      liveLinks: analysis.backlinks?.length || 0,
      coverage_score: Number(analysis.summary?.coverage_score || 0),
      precision_score: Number(analysis.summary?.precision_score || 0),
      recall_proxy_score: Number(analysis.summary?.recall_proxy_score || 0),
    },
  ].slice(-50);
  next.snapshots = [
    ...(Array.isArray(next.snapshots) ? next.snapshots : []),
    {
      at: now,
      backlinks_live: Object.values(next.links || {}).filter((r) => r.status === "live").length,
      backlinks_lost: Object.values(next.links || {}).filter((r) => r.status === "lost").length,
      referring_domains: (() => {
        const hosts = new Set(
          Object.values(next.links || {})
            .filter((r) => r.status === "live")
            .map((r) => {
              try { return new URL(r.url_from).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
            })
            .filter(Boolean)
        );
        return hosts.size;
      })(),
    },
  ].slice(-120);
  return next;
}

export async function importBacklinkCandidates({ orgScope = "default", target = "", candidates = [], text = "" } = {}) {
  const normalizedTarget = normalizeBacklinkTarget(target);
  if (!normalizedTarget) return { ok: false, error: "Missing backlink target" };
  const rawUrls = Array.from(new Set([...(Array.isArray(candidates) ? candidates : []), ...parseCandidateText(text)]))
    .map((url) => normalizeCandidateUrl(url))
    .filter(Boolean)
    .slice(0, 1000);
  const urls = [];
  let blocked = 0;
  for (const url of rawUrls) {
    if (await isSafePublicHttpUrl(url)) urls.push(url);
    else blocked += 1;
  }
  const index = await loadBacklinkIndex(orgScope, normalizedTarget);
  urls.forEach((url) => {
    index.candidates[url] = { ...(index.candidates[url] || {}), url, source: "import", importedAt: new Date().toISOString() };
  });
  enqueueCandidates(index, urls, { source: "import", priority: 3 });
  const saved = await saveBacklinkIndex(index);
  return { ...formatBacklinkIndex(saved), imported: urls.length, blocked };
}

export async function analyzeAndUpdateBacklinkIndex(input = {}) {
  const orgScope = input.orgScope || "default";
  const target = normalizeBacklinkTarget(input.target);
  if (!target) return { ok: false, error: "Missing backlink target" };
  const lock = await acquireIndexLock(orgScope, target);
  try {
    const index = await loadBacklinkIndex(orgScope, target);
    const manualCandidates = Array.isArray(input.candidates) ? input.candidates : [];
    enqueueCandidates(index, manualCandidates, { source: "manual", priority: 4 });
    const pressure = normalizeQueue(index);
    const pressureScore = Number(pressure.pending.length || 0) + Number(pressure.failed.length || 0);
    const adaptiveBatch = Math.max(
      10,
      Math.min(
        MAX_QUEUE_BATCH,
        Number(input.queueBatchSize || input.maxCandidates || DEFAULT_QUEUE_BATCH) + Math.min(40, Math.floor(pressureScore / 12))
      )
    );
    const runCandidates = uniqueUrls([
      ...manualCandidates,
      ...pullQueueBatch(index, adaptiveBatch),
    ]).slice(0, Math.max(1, Math.min(MAX_QUEUE_BATCH, Number(input.maxCandidates || adaptiveBatch))));

    if (!runCandidates.length) {
      const fallback = Object.keys(index.candidates || {}).slice(0, Math.max(1, Math.min(20, Number(input.maxCandidates || 20))));
      enqueueCandidates(index, fallback, { source: "fallback", priority: 1 });
      runCandidates.push(...pullQueueBatch(index, adaptiveBatch));
    }

    const analysis = await analyzeHelioBacklinks({
      ...input,
      target,
      candidates: runCandidates,
      discover: input.discover !== false,
      enableReferrerSurface: input.enableReferrerSurface === true || input.recallMode === true || String(input.mode || "").toLowerCase() === "pro",
      maxCandidates: Math.max(1, Math.min(MAX_QUEUE_BATCH, Number(input.maxCandidates || DEFAULT_QUEUE_BATCH))),
    });
    if (!analysis.ok) return analysis;
    const merged = mergeAnalysisIntoIndex(index, analysis);
    applyQueueResult(merged, analysis.diagnostics?.verifiedPages || []);
    merged.queueCycles = [
      ...(Array.isArray(merged.queueCycles) ? merged.queueCycles : []),
      {
        at: new Date().toISOString(),
        mode: input.discover === false ? "crawl" : "analyze",
        orgScope,
        target,
        queueBatchProcessed: runCandidates.length,
        verifiedPages: Number(analysis.diagnostics?.verifiedPages?.length || 0),
        liveLinks: Number(analysis.backlinks?.length || 0),
      },
    ].slice(-200);
    const saved = await saveBacklinkIndex(merged);
    return { ...formatBacklinkIndex(saved), diagnostics: analysis.diagnostics, queueBatchProcessed: runCandidates.length, queueBatchAdaptive: adaptiveBatch };
  } finally {
    await releaseIndexLock(lock);
  }
}

export async function crawlBacklinkQueueForScope({ orgScope = "", queueBatchSize = DEFAULT_QUEUE_BATCH, maxCandidates = DEFAULT_QUEUE_BATCH, rounds = 1, maxTargetsPerCycle = 40, maxFailureRate = 0.5 } = {}) {
  const targetsAll = await listBacklinkIndexTargets(orgScope);
  const targets = targetsAll.slice(0, Math.max(1, Math.min(200, Number(maxTargetsPerCycle || 40))));
  const results = [];
  const totalRounds = Math.max(1, Math.min(6, Number(rounds || 1)));
  let haltedByBackpressure = false;
  for (let round = 1; round <= totalRounds; round += 1) {
    for (const item of targets) {
      const out = await analyzeAndUpdateBacklinkIndex({
        target: item.target,
        orgScope: item.orgScope,
        discover: false,
        queueBatchSize,
        maxCandidates,
      });
      results.push({
        orgScope: item.orgScope,
        target: item.target,
        ok: !!out.ok,
        queueBatchProcessed: Number(out.queueBatchProcessed || 0),
        queueBatchAdaptive: Number(out.queueBatchAdaptive || 0),
        summary: out.summary || {},
        error: out.error || "",
        round,
      });
      const processedThisRound = results.filter((r) => r.round === round);
      const failedThisRound = processedThisRound.filter((r) => !r.ok).length;
      const failureRate = failedThisRound / Math.max(1, processedThisRound.length);
      if (processedThisRound.length >= 3 && failureRate >= Math.max(0.1, Math.min(0.95, Number(maxFailureRate || 0.5)))) {
        haltedByBackpressure = true;
        break;
      }
    }
    if (haltedByBackpressure) break;
  }
  const cycleAt = new Date().toISOString();
  for (const item of targets) {
    const lock = await acquireIndexLock(item.orgScope, item.target);
    try {
      const idx = await loadBacklinkIndex(item.orgScope, item.target);
      idx.queueCycles = [
        ...(Array.isArray(idx.queueCycles) ? idx.queueCycles : []),
        {
          at: cycleAt,
          mode: "crawl_scope",
          orgScope: item.orgScope,
          target: item.target,
          queueBatchProcessed: Number(results.find((r) => r.orgScope === item.orgScope && r.target === item.target)?.queueBatchProcessed || 0),
          verifiedPages: 0,
          liveLinks: 0,
        },
      ].slice(-200);
      await saveBacklinkIndex(idx);
    } finally {
      await releaseIndexLock(lock);
    }
  }
  return {
    ok: true,
    targets: targets.length,
    targetsAvailable: targetsAll.length,
    haltedByBackpressure,
    rounds: totalRounds,
    processedBatches: results.reduce((acc, r) => acc + Number(r.queueBatchProcessed || 0), 0),
    results,
  };
}
