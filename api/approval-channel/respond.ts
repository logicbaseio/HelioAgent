/* eslint-disable @typescript-eslint/no-explicit-any */
import { decideApprovalRequest, getApprovalRequest } from "../../src/server/approval-channel/store.mjs";

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }
  const token = String(req.query?.token || "");
  const decision = String(req.query?.decision || "").toLowerCase();
  if (!token || !["approve", "reject"].includes(decision)) {
    res.status(400).send("<h1>Invalid Helio approval link</h1><p>The approval token or decision is missing.</p>");
    return;
  }
  const existing = await getApprovalRequest(token);
  if (!existing) {
    res.status(404).send("<h1>Approval request not found</h1><p>This approval link is invalid or expired.</p>");
    return;
  }
  const record = await decideApprovalRequest(token, decision);
  const label = record?.status === "approved" ? "approved" : record?.status === "rejected" ? "rejected" : "already decided";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
    <html><head><meta charset="utf-8"/><title>Helio approval ${escapeHtml(label)}</title>
    <style>body{background:#070807;color:#d7d7d7;font-family:ui-monospace,Menlo,monospace;padding:40px}a{color:#caff3d}.box{border:1px solid #9fd24a;padding:24px;max-width:760px}</style></head>
    <body><div class="box"><h1>Helio deployment ${escapeHtml(label)}</h1>
    <p><strong>Action:</strong> ${escapeHtml(String(record?.actionLabel || record?.title || "Deployment action"))}</p>
    <p><strong>Detail:</strong> ${escapeHtml(String(record?.actionDetail || record?.message || ""))}</p>
    <p><strong>Decision time:</strong> ${escapeHtml(String(record?.decidedAt || "pending"))}</p>
    <p><a href="${escapeHtml(String(record?.dashboardUrl || "/dashboard"))}">Return to Helio Dashboard</a></p></div></body></html>`);
}
