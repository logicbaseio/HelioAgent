/* eslint-disable @typescript-eslint/no-explicit-any */
import { listApprovalRequests } from "../../src/server/approval-channel/store.mjs";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const orgId = String(req.query?.orgId || "");
    const host = String(req.query?.host || "");
    const decisions = await listApprovalRequests({ orgId, host });
    res.status(200).json({ ok: true, decisions });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || "Failed to load approval decisions" });
  }
}
