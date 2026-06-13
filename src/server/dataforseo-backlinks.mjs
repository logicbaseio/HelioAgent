/* global Buffer, URL, fetch, process */
const DATAFORSEO_BASE_URL = "https://api.dataforseo.com/v3/backlinks";

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

const firstTaskStatus = (payload = {}) => {
  const task = Array.isArray(payload?.tasks) ? payload.tasks[0] : null;
  return {
    statusCode: payload?.status_code || task?.status_code || 0,
    statusMessage: payload?.status_message || task?.status_message || "Unknown DataForSEO response",
  };
};

const normalizeTarget = (raw = "") => {
  const input = String(raw || "").trim();
  if (!input) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return input.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
};

async function postDataForSeo(path, body, authHeader) {
  const res = await fetch(`${DATAFORSEO_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify([body]),
  });
  const payload = await res.json().catch(() => ({}));
  const status = firstTaskStatus(payload);
  if (!res.ok || status.statusCode !== 20000) {
    const err = new Error(status.statusMessage || `DataForSEO HTTP ${res.status}`);
    err.status = res.status || 502;
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function getDataForSeoBacklinks({ target, login, password, limit = 20 } = {}) {
  const normalizedTarget = normalizeTarget(target);
  const user = String(login || process.env.DATAFORSEO_LOGIN || "").trim();
  const pass = String(password || process.env.DATAFORSEO_PASSWORD || "").trim();
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));

  if (!normalizedTarget) return { ok: false, error: "Missing backlink target" };
  if (!user || !pass) return { ok: false, error: "Missing DataForSEO credentials" };

  const authHeader = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  const [summaryPayload, backlinksPayload] = await Promise.all([
    postDataForSeo("/summary/live", { target: normalizedTarget, include_subdomains: true }, authHeader),
    postDataForSeo("/backlinks/live", { target: normalizedTarget, include_subdomains: true, limit: safeLimit, mode: "as_is" }, authHeader),
  ]);

  return {
    ok: true,
    target: normalizedTarget,
    summary: summaryPayload?.tasks?.[0]?.result?.[0] || {},
    backlinks: backlinksPayload?.tasks?.[0]?.result?.[0]?.items || [],
    raw: { summary: summaryPayload, backlinks: backlinksPayload },
  };
}

export async function handleDataForSeoBacklinks(req, res) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    if (method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    const body = await readJsonBody(req);
    const result = await getDataForSeoBacklinks(body);
    return sendJson(res, result.ok ? 200 : 400, result);
  } catch (error) {
    return sendJson(res, error?.status || 502, {
      ok: false,
      error: error?.message || "DataForSEO backlink request failed",
    });
  }
}
