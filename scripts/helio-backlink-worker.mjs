#!/usr/bin/env node
import { crawlBacklinkQueueForScope } from "../src/server/helio-backlink-index.mjs";

function parseArgs(argv = []) {
  const out = {
    once: false,
    orgScope: process.env.HELIO_BACKLINK_ORG_SCOPE || "",
    intervalMs: Number(process.env.HELIO_BACKLINK_WORKER_POLL_MS || 5 * 60 * 1000),
    queueBatchSize: Number(process.env.HELIO_BACKLINK_QUEUE_BATCH || 30),
    maxCandidates: Number(process.env.HELIO_BACKLINK_MAX_CANDIDATES || 30),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--once") out.once = true;
    if (a === "--org-scope") out.orgScope = String(argv[i + 1] || "");
    if (a === "--interval-ms") out.intervalMs = Number(argv[i + 1] || out.intervalMs);
    if (a === "--batch") out.queueBatchSize = Number(argv[i + 1] || out.queueBatchSize);
    if (a === "--max-candidates") out.maxCandidates = Number(argv[i + 1] || out.maxCandidates);
  }
  return out;
}

async function runCycle(cfg) {
  const startedAt = new Date().toISOString();
  const result = await crawlBacklinkQueueForScope({
    orgScope: cfg.orgScope,
    queueBatchSize: cfg.queueBatchSize,
    maxCandidates: cfg.maxCandidates,
  });
  const line = {
    at: startedAt,
    ok: !!result.ok,
    targets: result.targets || 0,
    processedBatches: result.processedBatches || 0,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
  return result;
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  do {
    await runCycle(cfg);
    if (cfg.once) break;
    await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Number(cfg.intervalMs || 300000))));
  } while (true);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exit(1);
});

