/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildHelioCodeReadiness } from "../../src/server/helio-code/readiness.mjs";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  res.status(200).json(await buildHelioCodeReadiness());
}
