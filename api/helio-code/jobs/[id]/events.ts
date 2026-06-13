/* eslint-disable @typescript-eslint/no-explicit-any */
import { handleHelioCodeJobEvents } from "../../../../src/server/helio-code/api.mjs";

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id || "");
  return handleHelioCodeJobEvents(req, res, id);
}
