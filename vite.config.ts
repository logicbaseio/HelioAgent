import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
import { createHelioCodeJobRecord } from "./src/lib/helio-code.js";
import { handleDataForSeoBacklinks } from "./src/server/dataforseo-backlinks.mjs";
import { handleHelioBacklinkAnalysis } from "./src/server/helio-backlink-api.mjs";
import { buildHelioCodeReadiness } from "./src/server/helio-code/readiness.mjs";
import { executeHelioCodeJob } from "./scripts/helio-code-worker.mjs";
import { appendHelioCodeLog, createHelioCodeJob, getHelioCodeJob, listHelioCodeJobs } from "./src/server/helio-code/store.mjs";
import { getHelioCodeWorkerStatus, startHelioCodeWorker } from "./src/server/helio-code/worker-supervisor.mjs";
import { createApprovalToken, decideApprovalRequest, getApprovalRequest, listApprovalRequests, saveApprovalRequest } from "./src/server/approval-channel/store.mjs";

const readJsonBody = async (req: any) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const sendJson = (res: any, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

function helioAuditReportApi() {
  const reportsDir = path.resolve(process.cwd(), "reports");

  const ensureDir = async () => {
    await fs.mkdir(reportsDir, { recursive: true });
  };

  const handler = async (req: any, res: any, next: any) => {
    try {
      if (!req.url?.startsWith("/api/audit-report")) return next();
      await ensureDir();
      const urlObj = new URL(req.url, "http://localhost");
      const method = String(req.method || "GET").toUpperCase();

      if (method === "POST" && urlObj.pathname === "/api/audit-report") {
        const body = await readJsonBody(req);
        const id = String(body?.id || "");
        const data = body?.data;
        if (!id || !data) return sendJson(res, 400, { error: "Missing id or data" });
        const filepath = path.join(reportsDir, `${id}.json`);
        const envelope = {
          id,
          createdAt: new Date().toISOString(),
          domain: String(data?.meta?.domain || data?.domain || "unknown-domain"),
          data,
        };
        await fs.writeFile(filepath, JSON.stringify(envelope, null, 2), "utf8");
        return sendJson(res, 200, { ok: true, reportUrl: `/reports/${id}` });
      }

      if (method === "GET" && urlObj.pathname === "/api/audit-report") {
        const id = String(urlObj.searchParams.get("id") || "");
        if (!id) return sendJson(res, 400, { error: "Missing id" });
        const filepath = path.join(reportsDir, `${id}.json`);
        try {
          const raw = await fs.readFile(filepath, "utf8");
          const envelope = JSON.parse(raw);
          return sendJson(res, 200, { ok: true, envelope });
        } catch {
          return sendJson(res, 404, { error: "Report not found" });
        }
      }

      return sendJson(res, 405, { error: "Method not allowed" });
    } catch (error: any) {
      return sendJson(res, 500, { error: error?.message || "Internal error" });
    }
  };

  return {
    name: "helio-audit-report-api",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

function helioCodeApi() {
  const jobs = new Map<string, any>();
  const dbEnabled = () => !!String(process.env.DATABASE_URL || "").trim();
  const memoryFallbackAllowed = () => String(process.env.HELIO_CODE_ALLOW_MEMORY_FALLBACK || "false").toLowerCase() === "true";

  const appendJobLog = (job: any, level: string, message: string) => {
    const now = new Date().toISOString();
    return {
      ...job,
      updatedAt: now,
      logs: [...(Array.isArray(job.logs) ? job.logs : []), { at: now, level, message }],
    };
  };

  const runLocalJob = async (jobId: string) => {
    const current = jobs.get(jobId);
    if (!current) return;
    const running = appendJobLog(
      { ...current, status: "code-running" },
      "info",
      "PROCESSING AUDIT PIPELINE"
    );
    jobs.set(jobId, running);
    try {
      const result = await executeHelioCodeJob(running);
      if (!result?.job) {
        jobs.set(
          jobId,
          appendJobLog(
            {
              ...running,
              status: "code-failed",
              result: { ...(running.result || {}), failureReason: "Local Helio Code execution returned no job result." },
            },
            "error",
            "Local Helio Code execution returned no job result."
          )
        );
        return;
      }
      jobs.set(jobId, {
        ...result.job,
        logs: Array.isArray(result.job.logs) ? result.job.logs : running.logs,
      });
    } catch (error: any) {
      jobs.set(
        jobId,
        appendJobLog(
          {
            ...running,
            status: "code-failed",
            result: { ...(running.result || {}), failureReason: error?.message || "Local Helio Code execution failed." },
          },
          "error",
          error?.message || "Local Helio Code execution failed."
        )
      );
    }
  };

  const handler = async (req: any, res: any, next: any) => {
    try {
      if (!req.url?.startsWith("/api/helio-code/")) return next();
      const urlObj = new URL(req.url, "http://localhost");
      const method = String(req.method || "GET").toUpperCase();
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const jobId = parts[3] || "";

      if (method === "GET" && urlObj.pathname === "/api/helio-code/readiness") {
        return sendJson(res, 200, await buildHelioCodeReadiness());
      }

      if (method === "POST" && urlObj.pathname === "/api/helio-code/worker/start") {
        return sendJson(res, 200, await startHelioCodeWorker({ cwd: process.cwd() }));
      }

      if (method === "GET" && urlObj.pathname === "/api/helio-code/worker/status") {
        return sendJson(res, 200, await getHelioCodeWorkerStatus());
      }

      if (method === "POST" && urlObj.pathname === "/api/helio-code/jobs") {
        const payload = await readJsonBody(req);
        if (dbEnabled() && !memoryFallbackAllowed()) {
          const created = await createHelioCodeJob(payload);
          if (!created.ok) return sendJson(res, 400, { ok: false, errors: created.errors });
          await appendHelioCodeLog(created.job.id, "info", "Job accepted by local Helio API into Neon Postgres queue.", { source: "vite-api" });
          return sendJson(res, 202, { ok: true, job: await getHelioCodeJob(created.job.id) });
        }
        const created = createHelioCodeJobRecord(payload);
        if (!created.ok) return sendJson(res, 400, { ok: false, errors: created.errors });
        const queued = appendJobLog(
          {
            ...created.job,
            status: "code-queued",
            result: {
              mode: "local-execution",
              note: "Queued in local execution mode. Helio will clone the repo, run the coding agent, verify checks, and push a PR from this machine.",
            },
          },
          "info",
          "Local adapter accepted job. Queueing execution lifecycle."
        );
        jobs.set(queued.id, queued);
        void runLocalJob(queued.id);
        return sendJson(res, 202, { ok: true, job: queued });
      }

      if (method === "GET" && parts[2] === "jobs" && jobId && parts.length === 4) {
        if (dbEnabled() && !memoryFallbackAllowed()) {
          const job = await getHelioCodeJob(jobId);
          if (!job) return sendJson(res, 404, { ok: false, error: "Helio Code job not found" });
          return sendJson(res, 200, { ok: true, job });
        }
        const current = jobs.get(jobId);
        const job = current || null;
        if (!job) return sendJson(res, 404, { ok: false, error: "Helio Code job not found" });
        return sendJson(res, 200, { ok: true, job });
      }

      if (method === "GET" && parts[2] === "jobs" && jobId && parts[4] === "events") {
        if (dbEnabled() && !memoryFallbackAllowed()) {
          const job = await getHelioCodeJob(jobId);
          if (!job) return sendJson(res, 404, { ok: false, error: "Helio Code job not found" });
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(`event: job\n`);
          res.write(`data: ${JSON.stringify(job)}\n\n`);
          res.end();
          return;
        }
        const job = jobs.get(jobId);
        if (!job) return sendJson(res, 404, { ok: false, error: "Helio Code job not found" });
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(`event: job\n`);
        res.write(`data: ${JSON.stringify(job)}\n\n`);
        res.end();
        return;
      }

      if (method === "GET" && urlObj.pathname === "/api/helio-code/jobs") {
        if (dbEnabled() && !memoryFallbackAllowed()) {
          const rows = await listHelioCodeJobs({
            orgId: String(urlObj.searchParams.get("orgId") || ""),
            missionId: String(urlObj.searchParams.get("missionId") || ""),
            limit: Number(urlObj.searchParams.get("limit") || 50),
          });
          return sendJson(res, 200, { ok: true, jobs: rows });
        }
        return sendJson(res, 200, { ok: true, jobs: Array.from(jobs.values()) });
      }

      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    } catch (error: any) {
      return sendJson(res, 500, { ok: false, error: error?.message || "Internal error" });
    }
  };

  return {
    name: "helio-code-api",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

function dataForSeoApi() {
  const handler = async (req: any, res: any, next: any) => {
    if (!req.url?.startsWith("/api/dataforseo/backlinks")) return next();
    return handleDataForSeoBacklinks(req, res);
  };

  return {
    name: "helio-dataforseo-api",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

function helioBacklinkApi() {
  const handler = async (req: any, res: any, next: any) => {
    if (!req.url?.startsWith("/api/helio-backlinks/analyze")) return next();
    return handleHelioBacklinkAnalysis(req, res);
  };

  return {
    name: "helio-native-backlink-api",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

function approvalChannelApi() {
  const htmlEscape = (value: string) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const sendHtml = (res: any, status: number, html: string) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  };

  const getPublicBaseUrl = (req: any, body?: any) => {
    const configured = String(process.env.HELIO_PUBLIC_URL || body?.publicUrl || "").trim().replace(/\/+$/, "");
    if (configured) return configured;
    const dashboardUrl = String(body?.dashboardUrl || "").trim();
    if (dashboardUrl) {
      try {
        const parsed = new URL(dashboardUrl);
        return parsed.origin;
      } catch {
        // Fall through to request host.
      }
    }
    const host = String(req.headers?.host || "127.0.0.1:5050");
    const proto = String(req.headers?.["x-forwarded-proto"] || "http").split(",")[0];
    return `${proto}://${host}`;
  };

  const postJson = async (url: string, payload: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(text || `Webhook HTTP ${res.status}`);
    return text;
  };

  const handler = async (req: any, res: any, next: any) => {
    try {
      if (!req.url?.startsWith("/api/approval-channel/")) return next();
      const urlObj = new URL(req.url, "http://localhost");
      const method = String(req.method || "").toUpperCase();

      if (method === "GET" && urlObj.pathname === "/api/approval-channel/respond") {
        const token = String(urlObj.searchParams.get("token") || "");
        const decision = String(urlObj.searchParams.get("decision") || "").toLowerCase();
        if (!token || !["approve", "reject"].includes(decision)) {
          return sendHtml(res, 400, "<h1>Invalid Helio approval link</h1><p>The approval token or decision is missing.</p>");
        }
        const record = await getApprovalRequest(token).catch(() => null);
        if (!record) {
          return sendHtml(res, 404, "<h1>Approval request not found</h1><p>This approval link is invalid or expired.</p>");
        }
        const decided = await decideApprovalRequest(token, decision);
        const label = decided.status === "approved" ? "approved" : decided.status === "rejected" ? "rejected" : "already decided";
        const dashboardUrl = String(decided.dashboardUrl || `${getPublicBaseUrl(req)}/dashboard`);
        return sendHtml(res, 200, `<!doctype html>
          <html><head><meta charset="utf-8"/><title>Helio approval ${htmlEscape(label)}</title>
          <style>body{background:#070807;color:#d7d7d7;font-family:ui-monospace,Menlo,monospace;padding:40px}a{color:#caff3d}.box{border:1px solid #9fd24a;padding:24px;max-width:760px}</style></head>
          <body><div class="box"><h1>Helio deployment ${htmlEscape(label)}</h1>
          <p><strong>Action:</strong> ${htmlEscape(String(decided.actionLabel || decided.title || "Deployment action"))}</p>
          <p><strong>Detail:</strong> ${htmlEscape(String(decided.actionDetail || decided.message || ""))}</p>
          <p><strong>Decision time:</strong> ${htmlEscape(String(decided.decidedAt || "pending"))}</p>
          <p><a href="${htmlEscape(dashboardUrl)}">Return to Helio Dashboard</a></p></div></body></html>`);
      }

      if (method === "GET" && urlObj.pathname === "/api/approval-channel/decisions") {
        const orgId = String(urlObj.searchParams.get("orgId") || "");
        const host = String(urlObj.searchParams.get("host") || "");
        const decisions = await listApprovalRequests({ orgId, host });
        return sendJson(res, 200, { ok: true, decisions });
      }

      if (method !== "POST" || urlObj.pathname !== "/api/approval-channel/send") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
      const body = await readJsonBody(req);
      const provider = String(body?.provider || "").toLowerCase();
      const webhookUrl = String(body?.webhookUrl || "").trim();
      const title = String(body?.title || "Helio approval request").trim();
      const message = String(body?.message || "").trim();
      const dashboardUrl = String(body?.dashboardUrl || "http://localhost:5050/dashboard").trim();
      const approval = body?.approval || {};
      if (!["slack", "discord"].includes(provider)) return sendJson(res, 400, { ok: false, error: "Unsupported approval provider" });
      if (!/^https:\/\//i.test(webhookUrl)) return sendJson(res, 400, { ok: false, error: "Valid HTTPS webhookUrl is required" });
      const token = approval?.actionId ? createApprovalToken() : "";
      const baseUrl = getPublicBaseUrl(req, body);
      const approveUrl = token ? `${baseUrl}/api/approval-channel/respond?token=${encodeURIComponent(token)}&decision=approve` : "";
      const rejectUrl = token ? `${baseUrl}/api/approval-channel/respond?token=${encodeURIComponent(token)}&decision=reject` : "";
      if (token) {
        await saveApprovalRequest({
          token,
          provider,
          orgId: String(approval.orgId || "default"),
          host: String(approval.host || ""),
          actionId: String(approval.actionId || ""),
          actionLabel: String(approval.actionLabel || ""),
          actionDetail: String(approval.actionDetail || ""),
          title,
          message,
          dashboardUrl,
          status: "pending",
          decision: "",
          requestedAt: new Date().toISOString(),
          decidedAt: "",
        });
      }
      if (provider === "slack") {
        await postJson(webhookUrl, {
          text: token ? `${title}\n${message}\nApprove: ${approveUrl}\nReject: ${rejectUrl}` : `${title}\n${message}\nOpen Helio: ${dashboardUrl}`,
          blocks: [
            { type: "header", text: { type: "plain_text", text: title.slice(0, 140) } },
            { type: "section", text: { type: "mrkdwn", text: message.slice(0, 2800) } },
            token
              ? { type: "actions", elements: [
                { type: "button", text: { type: "plain_text", text: "Approve" }, style: "primary", url: approveUrl },
                { type: "button", text: { type: "plain_text", text: "Reject" }, style: "danger", url: rejectUrl },
                { type: "button", text: { type: "plain_text", text: "Open Helio" }, url: dashboardUrl },
              ] }
              : { type: "section", text: { type: "mrkdwn", text: `Open Helio to approve or reject: ${dashboardUrl}` } },
          ],
        });
      } else {
        await postJson(webhookUrl, {
          content: token ? `**${title}**\n${message}\nUse the buttons below to approve or reject.` : `**${title}**\n${message}\nOpen Helio to approve or reject: ${dashboardUrl}`,
          components: token ? [{
            type: 1,
            components: [
              { type: 2, style: 5, label: "Approve", url: approveUrl },
              { type: 2, style: 5, label: "Reject", url: rejectUrl },
              { type: 2, style: 5, label: "Open Helio", url: dashboardUrl },
            ],
          }] : undefined,
        });
      }
      return sendJson(res, 200, { ok: true, token, approveUrl, rejectUrl });
    } catch (error: any) {
      return sendJson(res, 500, { ok: false, error: error?.message || "Failed to send approval request" });
    }
  };

  return {
    name: "helio-approval-channel-api",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

function aeoIntelligenceApi() {
  const extractUrls = (text: string) => {
    const out = new Set<string>();
    const re = /https?:\/\/[^\s)\]}>"']+/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(text || "")))) out.add(m[0]);
    return Array.from(out);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const fetchWithRetry = async (url: string, init: any, retries = 2, timeoutMs = 12000) => {
    let lastError: any = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();
      try {
        const res = await fetch(url, { ...(init || {}), signal: controller.signal });
        clearTimeout(timer);
        const latencyMs = Date.now() - started;
        if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        return { res, latencyMs, attempts: attempt + 1 };
      } catch (e: any) {
        clearTimeout(timer);
        lastError = e;
        if (attempt < retries) {
          await sleep(250 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastError || new Error("Request failed");
  };

  const handler = async (req: any, res: any, next: any) => {
    try {
      if (!req.url?.startsWith("/api/aeo/intel")) return next();
      const urlObj = new URL(req.url, "http://localhost");
      const method = String(req.method || "GET").toUpperCase();
      if (method !== "POST" || urlObj.pathname !== "/api/aeo/intel") {
        return sendJson(res, 405, { ok: false, error: "Method not allowed" });
      }
      const body = await readJsonBody(req);
      const prompt = String(body?.prompt || "").trim();
      const targetHost = String(body?.targetHost || "").toLowerCase();
      const connectors = body?.connectors || {};
      if (!prompt) return sendJson(res, 400, { ok: false, error: "Missing prompt" });

      const observations: any[] = [];
      const errors: any[] = [];
      const connectorStats: any = {};
      const add = (engine: string, text: string, urls: string[], status: string) => {
        const cited = !!targetHost && urls.some((u) => String(u || "").toLowerCase().includes(targetHost));
        observations.push({
          engine,
          prompt,
          cited,
          citationUrl: urls[0] || "",
          citations: urls.slice(0, 8),
          rank: cited ? 3 : null,
          sentiment: cited ? "positive" : "neutral",
          outcomeStatus: status,
          observedAt: new Date().toISOString(),
          rawPreview: String(text || "").slice(0, 500),
        });
      };

      if (connectors?.openaiSearchKey) {
        try {
          const { res: r, latencyMs, attempts } = await fetchWithRetry("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${connectors.openaiSearchKey}` },
            body: JSON.stringify({ model: "gpt-4.1-mini", input: prompt, tools: [{ type: "web_search_preview" }] }),
          });
          const d = await r.json().catch(() => ({}));
          connectorStats.chatgpt = { latencyMs, attempts, status: r.status };
          const text = String(d?.output_text || JSON.stringify(d?.output || d || ""));
          add("chatgpt", text, extractUrls(text), r.ok ? "ok" : "error");
          if (!r.ok) errors.push({ engine: "chatgpt", status: r.status, message: d?.error?.message || "OpenAI request failed" });
        } catch (e: any) {
          errors.push({ engine: "chatgpt", message: e?.message || "OpenAI probe error" });
        }
      }

      if (connectors?.anthropicSearchKey) {
        try {
          const { res: r, latencyMs, attempts } = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": connectors.anthropicSearchKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
          });
          const d = await r.json().catch(() => ({}));
          connectorStats.claude = { latencyMs, attempts, status: r.status };
          const text = JSON.stringify(d?.content || d || "");
          add("claude", text, extractUrls(text), r.ok ? "ok" : "error");
          if (!r.ok) errors.push({ engine: "claude", status: r.status, message: d?.error?.message || "Anthropic request failed" });
        } catch (e: any) {
          errors.push({ engine: "claude", message: e?.message || "Anthropic probe error" });
        }
      }

      if (connectors?.perplexityKey) {
        try {
          const { res: r, latencyMs, attempts } = await fetchWithRetry("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${connectors.perplexityKey}` },
            body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: prompt }] }),
          });
          const d = await r.json().catch(() => ({}));
          connectorStats.perplexity = { latencyMs, attempts, status: r.status };
          const text = String(d?.choices?.[0]?.message?.content || JSON.stringify(d || ""));
          add("perplexity", text, extractUrls(text), r.ok ? "ok" : "error");
          if (!r.ok) errors.push({ engine: "perplexity", status: r.status, message: d?.error?.message || "Perplexity request failed" });
        } catch (e: any) {
          errors.push({ engine: "perplexity", message: e?.message || "Perplexity probe error" });
        }
      }

      if (connectors?.bingApiKey && connectors?.bingSiteUrl) {
        try {
          const endpoint = `https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?apikey=${encodeURIComponent(connectors.bingApiKey)}&siteUrl=${encodeURIComponent(connectors.bingSiteUrl)}`;
          const { res: r, latencyMs, attempts } = await fetchWithRetry(endpoint, {}, 2, 12000);
          const d = await r.json().catch(() => ({}));
          connectorStats.copilot = { latencyMs, attempts, status: r.status };
          const rows = Array.isArray(d?.d) ? d.d.slice(0, 20) : [];
          for (const row of rows) {
            const q = String(row?.Query || row?.query || "");
            if (!q) continue;
            observations.push({
              engine: "copilot",
              prompt: q,
              cited: true,
              citationUrl: "",
              citations: [],
              rank: null,
              sentiment: "neutral",
              outcomeStatus: r.ok ? "ok" : "error",
              observedAt: new Date().toISOString(),
              rawPreview: "",
            });
          }
          if (!r.ok) errors.push({ engine: "copilot", status: r.status, message: d?.Message || "Bing query stats failed" });
        } catch (e: any) {
          errors.push({ engine: "copilot", message: e?.message || "Bing probe error" });
        }
      }

      return sendJson(res, 200, { ok: true, observations, errors, connectorStats });
    } catch (error: any) {
      return sendJson(res, 500, { ok: false, error: error?.message || "Internal error" });
    }
  };

  return {
    name: "helio-aeo-intel-api",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

function modelCatalogApi() {
  const handler = async (req: any, res: any, next: any) => {
    try {
      if (!req.url?.startsWith("/api/model-catalog")) return next();
      const urlObj = new URL(req.url, "http://localhost");
      const method = String(req.method || "GET").toUpperCase();
      if (method !== "POST" || urlObj.pathname !== "/api/model-catalog") {
        return sendJson(res, 405, { ok: false, error: "Method not allowed" });
      }
      const body = await readJsonBody(req);
      const provider = String(body?.provider || "").toLowerCase();
      const apiKey = String(body?.apiKey || "");
      const action = String(body?.action || "list").toLowerCase();
      const model = String(body?.model || "");
      if (!provider || !apiKey) return sendJson(res, 400, { ok: false, error: "provider and apiKey are required" });

      const normalize = (rows: any[] = []) =>
        rows
          .map((m: any) => ({
            id: String(m?.id || ""),
            name: String(m?.name || m?.display_name || m?.id || ""),
            ctx: m?.context_length ? String(m.context_length) : "?",
            price: "Live",
          }))
          .filter((m: any) => m.id);

      if (provider === "openrouter") {
        if (action === "test") {
          const tr = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": "https://helio-seo.app",
              "X-Title": "Helio",
            },
            body: JSON.stringify({
              model: model || "openai/gpt-4o-mini",
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 5,
            }),
          });
          const td = await tr.json().catch(() => ({}));
          if (!tr.ok) return sendJson(res, tr.status || 500, { ok: false, error: td?.error?.message || `OpenRouter HTTP ${tr.status}` });
          return sendJson(res, 200, { ok: true, testedModel: model || "openai/gpt-4o-mini" });
        }
        const r = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return sendJson(res, r.status || 500, { ok: false, error: d?.error?.message || `OpenRouter HTTP ${r.status}` });
        return sendJson(res, 200, { ok: true, models: normalize(Array.isArray(d?.data) ? d.data : []) });
      }

      if (provider === "openai") {
        if (action === "test") {
          const tr = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: model || "gpt-4o-mini",
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 5,
            }),
          });
          const td = await tr.json().catch(() => ({}));
          if (!tr.ok) return sendJson(res, tr.status || 500, { ok: false, error: td?.error?.message || `OpenAI HTTP ${tr.status}` });
          return sendJson(res, 200, { ok: true, testedModel: model || "gpt-4o-mini" });
        }
        const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return sendJson(res, r.status || 500, { ok: false, error: d?.error?.message || `OpenAI HTTP ${r.status}` });
        return sendJson(res, 200, { ok: true, models: normalize(Array.isArray(d?.data) ? d.data : []) });
      }

      if (provider === "anthropic") {
        if (action === "test") {
          const tr = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: model || "claude-sonnet-4-5",
              max_tokens: 8,
              messages: [{ role: "user", content: "ping" }],
            }),
          });
          const td = await tr.json().catch(() => ({}));
          if (!tr.ok) return sendJson(res, tr.status || 500, { ok: false, error: td?.error?.message || `Anthropic HTTP ${tr.status}` });
          return sendJson(res, 200, { ok: true, testedModel: model || "claude-sonnet-4-5" });
        }
        const r = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return sendJson(res, r.status || 500, { ok: false, error: d?.error?.message || `Anthropic HTTP ${r.status}` });
        return sendJson(res, 200, { ok: true, models: normalize(Array.isArray(d?.data) ? d.data : []) });
      }

      return sendJson(res, 400, { ok: false, error: "Unsupported provider" });
    } catch (error: any) {
      return sendJson(res, 500, { ok: false, error: error?.message || "Failed to load model catalog" });
    }
  };

  return {
    name: "helio-model-catalog-api",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), helioAuditReportApi(), helioCodeApi(), dataForSeoApi(), helioBacklinkApi(), approvalChannelApi(), aeoIntelligenceApi(), modelCatalogApi()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("jspdf")) return "vendor-jspdf";
          if (id.includes("html2canvas")) return "vendor-html2canvas";
          if (id.includes("react")) return "vendor-react";
        },
      },
    },
  },
  server: {
    port: 5050,
    strictPort: true,
  },
  preview: {
    port: 5050,
    strictPort: true,
  },
});
