/* eslint-disable @typescript-eslint/no-explicit-any */
import { handleCreateHelioCodeJob, handleListHelioCodeJobs } from "../../src/server/helio-code/api.mjs";

export default async function handler(req: any, res: any) {
  if (req.method === "POST") return handleCreateHelioCodeJob(req, res);
  if (req.method === "GET") return handleListHelioCodeJobs(req, res);
  res.status(405).json({ ok: false, error: "Method not allowed" });
}
