import {
  appendHelioCodeLog,
  createHelioCodeJob,
  getHelioCodeJob,
  listHelioCodeJobs,
  migrateHelioCodeStore,
} from "./store.mjs";
import process from "node:process";
import { createHelioCodeJobRecord } from "../../lib/helio-code.js";

const memJobs = new Map();
const memLogs = new Map();

function dbEnabled() {
  return !!String(process.env.DATABASE_URL || "").trim();
}

function memoryFallbackAllowed() {
  return String(process.env.HELIO_CODE_ALLOW_MEMORY_FALLBACK || "false").toLowerCase() === "true";
}

function memAttachLog(jobId, level, message, metadata = {}) {
  const rows = memLogs.get(jobId) || [];
  rows.push({
    at: new Date().toISOString(),
    level,
    message,
    metadata,
  });
  memLogs.set(jobId, rows);
}

function memGetJob(id) {
  const row = memJobs.get(id);
  if (!row) return null;
  return {
    ...row,
    logs: (memLogs.get(id) || []).slice(),
  };
}

export function sendApiJson(res, status, payload) {
  res.status(status).json(payload);
}

export async function handleCreateHelioCodeJob(req, res) {
  if (req.method !== "POST") return sendApiJson(res, 405, { ok: false, error: "Method not allowed" });
  try {
    if (!dbEnabled()) {
      if (!memoryFallbackAllowed()) {
        return sendApiJson(res, 503, {
          ok: false,
          error: "Helio Code production queue is not configured. Set DATABASE_URL or explicitly enable HELIO_CODE_ALLOW_MEMORY_FALLBACK for development.",
        });
      }
      const created = createHelioCodeJobRecord(req.body || {});
      if (!created.ok) return sendApiJson(res, 400, { ok: false, errors: created.errors });
      const next = {
        ...created.job,
        note: "Dev fallback mode: DATABASE_URL not configured. Job queued in memory.",
      };
      memJobs.set(next.id, next);
      memAttachLog(next.id, "info", "Job accepted by local in-memory Helio Code API fallback.", { source: "api" });
      return sendApiJson(res, 202, { ok: true, job: memGetJob(next.id) });
    }
    if (process.env.HELIO_CODE_AUTO_MIGRATE === "true") await migrateHelioCodeStore();
    const created = await createHelioCodeJob(req.body || {});
    if (!created.ok) return sendApiJson(res, 400, { ok: false, errors: created.errors });
    await appendHelioCodeLog(created.job.id, "info", "Job accepted by production API.", { source: "api" });
    return sendApiJson(res, 202, { ok: true, job: await getHelioCodeJob(created.job.id) });
  } catch (error) {
    return sendApiJson(res, 500, { ok: false, error: error?.message || "Failed to create Helio Code job" });
  }
}

export async function handleListHelioCodeJobs(req, res) {
  if (req.method !== "GET") return sendApiJson(res, 405, { ok: false, error: "Method not allowed" });
  try {
    if (!dbEnabled()) {
      if (!memoryFallbackAllowed()) return sendApiJson(res, 503, { ok: false, error: "Helio Code production queue is not configured." });
      const orgId = String(req.query?.orgId || "");
      const missionId = String(req.query?.missionId || "");
      const limit = Number(req.query?.limit || 50);
      const jobs = Array.from(memJobs.values())
        .filter((j) => (orgId ? String(j?.payload?.orgId || "") === orgId : true))
        .filter((j) => (missionId ? String(j?.payload?.missionId || "") === missionId : true))
        .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")))
        .slice(0, Math.max(1, limit))
        .map((j) => memGetJob(j.id));
      return sendApiJson(res, 200, { ok: true, jobs });
    }
    const jobs = await listHelioCodeJobs({
      orgId: String(req.query?.orgId || ""),
      missionId: String(req.query?.missionId || ""),
      limit: Number(req.query?.limit || 50),
    });
    return sendApiJson(res, 200, { ok: true, jobs });
  } catch (error) {
    return sendApiJson(res, 500, { ok: false, error: error?.message || "Failed to list Helio Code jobs" });
  }
}

export async function handleGetHelioCodeJob(req, res, id) {
  if (req.method !== "GET") return sendApiJson(res, 405, { ok: false, error: "Method not allowed" });
  try {
    if (!dbEnabled()) {
      if (!memoryFallbackAllowed()) return sendApiJson(res, 503, { ok: false, error: "Helio Code production queue is not configured." });
      const job = memGetJob(id);
      if (!job) return sendApiJson(res, 404, { ok: false, error: "Helio Code job not found" });
      return sendApiJson(res, 200, { ok: true, job });
    }
    const job = await getHelioCodeJob(id);
    if (!job) return sendApiJson(res, 404, { ok: false, error: "Helio Code job not found" });
    return sendApiJson(res, 200, { ok: true, job });
  } catch (error) {
    return sendApiJson(res, 500, { ok: false, error: error?.message || "Failed to get Helio Code job" });
  }
}

export async function handleHelioCodeJobEvents(_req, res, id) {
  try {
    if (!dbEnabled()) {
      if (!memoryFallbackAllowed()) return sendApiJson(res, 503, { ok: false, error: "Helio Code production queue is not configured." });
      const job = memGetJob(id);
      if (!job) return sendApiJson(res, 404, { ok: false, error: "Helio Code job not found" });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.write(`event: job\n`);
      res.write(`data: ${JSON.stringify(job)}\n\n`);
      res.end();
      return;
    }
    const job = await getHelioCodeJob(id);
    if (!job) return sendApiJson(res, 404, { ok: false, error: "Helio Code job not found" });
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.write(`event: job\n`);
    res.write(`data: ${JSON.stringify(job)}\n\n`);
    res.end();
  } catch (error) {
    return sendApiJson(res, 500, { ok: false, error: error?.message || "Failed to stream Helio Code job" });
  }
}
