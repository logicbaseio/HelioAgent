/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createApprovalToken,
  saveApprovalRequest,
} from "../../src/server/approval-channel/store.mjs";

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `Webhook HTTP ${res.status}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const provider = String(req.body?.provider || "").toLowerCase();
    const webhookUrl = String(req.body?.webhookUrl || "").trim();
    const title = String(req.body?.title || "Helio approval request").trim();
    const message = String(req.body?.message || "").trim();
    const dashboardUrl = String(req.body?.dashboardUrl || "http://localhost:5050/dashboard").trim();
    const approval = req.body?.approval || {};
    if (!["slack", "discord"].includes(provider)) {
      res.status(400).json({ ok: false, error: "Unsupported approval provider" });
      return;
    }
    if (!/^https:\/\//i.test(webhookUrl)) {
      res.status(400).json({ ok: false, error: "Valid HTTPS webhookUrl is required" });
      return;
    }
    const publicBaseUrl = String(process.env.HELIO_PUBLIC_URL || req.body?.publicUrl || "").trim().replace(/\/+$/, "") || new URL(dashboardUrl).origin;
    const token = approval?.actionId ? createApprovalToken() : "";
    const approveUrl = token ? `${publicBaseUrl}/api/approval-channel/respond?token=${encodeURIComponent(token)}&decision=approve` : "";
    const rejectUrl = token ? `${publicBaseUrl}/api/approval-channel/respond?token=${encodeURIComponent(token)}&decision=reject` : "";
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
    res.status(200).json({ ok: true, token, approveUrl, rejectUrl });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || "Failed to send approval request" });
  }
}
