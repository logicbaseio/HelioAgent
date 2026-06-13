/* global Buffer, URL */
import {
  analyzeAndUpdateBacklinkIndex,
  crawlBacklinkQueueForScope,
  formatBacklinkIndex,
  importBacklinkCandidates,
  loadBacklinkIndex,
} from "./helio-backlink-index.mjs";

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const sendJson = (res, status, payload) => {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(status).json(payload);
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

export async function handleHelioBacklinkAnalysis(req, res) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    if (method === "GET") {
      const url = new URL(req.url || "/", "http://localhost");
      const target = url.searchParams.get("target") || "";
      const orgScope = url.searchParams.get("orgScope") || "default";
      const index = await loadBacklinkIndex(orgScope, target);
      return sendJson(res, 200, formatBacklinkIndex(index));
    }
    if (method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    const body = await readJsonBody(req);
    let result;
    if (body?.action === "import" || body?.action === "enqueue") {
      result = await importBacklinkCandidates(body);
    } else if (body?.action === "crawl_scope") {
      result = await crawlBacklinkQueueForScope(body);
    } else if (body?.action === "crawl") {
      result = await analyzeAndUpdateBacklinkIndex({ ...body, discover: false });
    } else {
      result = await analyzeAndUpdateBacklinkIndex(body);
    }
    return sendJson(res, result.ok ? 200 : 400, result);
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error?.message || "Helio backlink analysis failed" });
  }
}
