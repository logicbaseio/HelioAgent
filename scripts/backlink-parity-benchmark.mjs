/* global process */
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeHelioBacklinks, normalizeBacklinkTarget } from "../src/lib/helio-backlink-tool.js";

function parseArgs(argv = []) {
  const out = {
    baselineDir: "",
    maxCandidates: 120,
    maxExpansionDepth: 2,
    maxExpandedCandidates: 240,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--baseline-dir" && v) out.baselineDir = v;
    if (a === "--max-candidates" && v) out.maxCandidates = Math.max(1, Number(v) || out.maxCandidates);
    if (a === "--max-expansion-depth" && v) out.maxExpansionDepth = Math.max(0, Number(v) || out.maxExpansionDepth);
    if (a === "--max-expanded-candidates" && v) out.maxExpandedCandidates = Math.max(1, Number(v) || out.maxExpandedCandidates);
  }
  return out;
}

function splitCsvLine(line = "") {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function findColumnIndex(headers = [], candidates = []) {
  const normalized = headers.map((h) => String(h || "").toLowerCase().trim());
  for (const c of candidates) {
    const idx = normalized.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeHostFromUrl(raw = "") {
  try {
    const u = new URL(String(raw || "").trim());
    return normalizeBacklinkTarget(u.hostname || "");
  } catch {
    return normalizeBacklinkTarget(String(raw || "").trim());
  }
}

async function readCsvRows(filePath = "") {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const refIdx = findColumnIndex(headers, ["referring page url", "source_url", "source url", "referring page", "url_from", "url"]);
  const targetIdx = findColumnIndex(headers, ["target url", "target", "url_to", "destination url"]);
  if (refIdx < 0) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    rows.push({
      referring: cols[refIdx] || "",
      target: targetIdx >= 0 ? cols[targetIdx] || "" : "",
    });
  }
  return rows;
}

async function loadBaselines(baselineDir = "") {
  const files = await fs.readdir(baselineDir);
  const all = [];
  for (const name of files) {
    if (!name.toLowerCase().endsWith(".csv")) continue;
    const provider = name.toLowerCase().includes("ahrefs") ? "ahrefs" : name.toLowerCase().includes("semrush") ? "semrush" : "unknown";
    const domain = name
      .replace(/\.csv$/i, "")
      .replace(/_?ahrefs/i, "")
      .replace(/_?semrush/i, "")
      .replace(/_?backlinks?/i, "")
      .replace(/_+/g, ".")
      .replace(/-+/g, ".")
      .toLowerCase();
    const rows = await readCsvRows(path.join(baselineDir, name));
    for (const row of rows) {
      const host = normalizeHostFromUrl(row.referring);
      if (!host) continue;
      all.push({
        provider,
        domain: normalizeBacklinkTarget(domain),
        referringHost: host,
      });
    }
  }
  return all;
}

function overlapMetrics(helioHosts = new Set(), baselineHosts = new Set()) {
  const intersection = new Set([...helioHosts].filter((x) => baselineHosts.has(x)));
  const precision = helioHosts.size ? (intersection.size / helioHosts.size) * 100 : 0;
  const recall = baselineHosts.size ? (intersection.size / baselineHosts.size) * 100 : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    helioHosts: helioHosts.size,
    baselineHosts: baselineHosts.size,
    overlapHosts: intersection.size,
    precisionPct: Number(precision.toFixed(2)),
    recallPct: Number(recall.toFixed(2)),
    f1Pct: Number(f1.toFixed(2)),
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baselineDir) {
    throw new Error("Missing --baseline-dir");
  }
  const baselineDir = path.resolve(process.cwd(), args.baselineDir);
  const baselineRows = await loadBaselines(baselineDir);
  if (!baselineRows.length) {
    throw new Error(`No usable baseline CSV rows found in ${baselineDir}`);
  }
  const domains = [...new Set(baselineRows.map((r) => normalizeBacklinkTarget(r.domain)).filter(Boolean))];
  const domainResults = [];
  for (const domain of domains) {
    const helio = await analyzeHelioBacklinks({
      target: domain,
      maxCandidates: args.maxCandidates,
      discoveryOptions: {
        maxExpansionDepth: args.maxExpansionDepth,
        maxExpandedCandidates: args.maxExpandedCandidates,
      },
    });
    const helioHosts = new Set((helio.backlinks || []).map((b) => normalizeHostFromUrl(b.url_from)).filter(Boolean));
    const ahrefsHosts = new Set(
      baselineRows.filter((r) => r.domain === domain && r.provider === "ahrefs").map((r) => r.referringHost)
    );
    const semrushHosts = new Set(
      baselineRows.filter((r) => r.domain === domain && r.provider === "semrush").map((r) => r.referringHost)
    );
    domainResults.push({
      domain,
      helio: {
        ok: Boolean(helio.ok),
        backlinks: Number(helio.summary?.backlinks || 0),
        referringDomains: Number(helio.summary?.referring_domains || 0),
      },
      vsAhrefs: overlapMetrics(helioHosts, ahrefsHosts),
      vsSemrush: overlapMetrics(helioHosts, semrushHosts),
    });
  }

  const avg = (arr, key) => (arr.length ? Number((arr.reduce((s, x) => s + Number(x[key] || 0), 0) / arr.length).toFixed(2)) : 0);
  const ahrefsRows = domainResults.map((d) => d.vsAhrefs);
  const semrushRows = domainResults.map((d) => d.vsSemrush);
  const summary = {
    domains: domains.length,
    ahrefs: {
      precisionPct: avg(ahrefsRows, "precisionPct"),
      recallPct: avg(ahrefsRows, "recallPct"),
      f1Pct: avg(ahrefsRows, "f1Pct"),
      parityPct: avg(ahrefsRows, "f1Pct"),
    },
    semrush: {
      precisionPct: avg(semrushRows, "precisionPct"),
      recallPct: avg(semrushRows, "recallPct"),
      f1Pct: avg(semrushRows, "f1Pct"),
      parityPct: avg(semrushRows, "f1Pct"),
    },
  };

  const payload = {
    ranAt: new Date().toISOString(),
    config: args,
    summary,
    domainResults,
  };
  const outFile = path.resolve(process.cwd(), `reports/backlink-parity-benchmark-${Date.now()}.json`);
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(outFile);
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});

