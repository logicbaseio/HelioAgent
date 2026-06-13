/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  handleCreateHelioCodeJob,
  handleGetHelioCodeJob,
  handleHelioCodeJobEvents,
  handleListHelioCodeJobs,
} from "../../src/server/helio-code/api.mjs";
import { buildHelioCodeReadiness } from "../../src/server/helio-code/readiness.mjs";

function routePath(value: unknown) {
  return Array.isArray(value) ? value.map((part) => String(part || "")) : [String(value || "")];
}

export default async function handler(req: any, res: any) {
  const parts = routePath(req.query?.path).filter(Boolean);
  const method = String(req.method || "").toUpperCase();

  if (parts.length === 1 && parts[0] === "readiness") {
    if (method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
    return res.status(200).json(await buildHelioCodeReadiness());
  }

  if (parts.length === 2 && parts[0] === "worker" && parts[1] === "start") {
    return res.status(501).json({
      ok: false,
      error: "Helio Code worker start is only available in the local agent runtime. Vercel hosts the dashboard/API, not long-running local workers.",
    });
  }

  if (parts.length === 1 && parts[0] === "jobs") {
    if (method === "POST") return handleCreateHelioCodeJob(req, res);
    if (method === "GET") return handleListHelioCodeJobs(req, res);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (parts.length === 2 && parts[0] === "jobs") {
    return handleGetHelioCodeJob(req, res, String(parts[1] || ""));
  }

  if (parts.length === 3 && parts[0] === "jobs" && parts[2] === "events") {
    return handleHelioCodeJobEvents(req, res, String(parts[1] || ""));
  }

  return res.status(404).json({ ok: false, error: "Unknown Helio Code route" });
}
