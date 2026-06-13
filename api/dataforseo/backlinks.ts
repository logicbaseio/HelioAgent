/* eslint-disable @typescript-eslint/no-explicit-any */
import { handleDataForSeoBacklinks } from "../../src/server/dataforseo-backlinks.mjs";

export default async function handler(req: any, res: any) {
  return handleDataForSeoBacklinks(req, res);
}
