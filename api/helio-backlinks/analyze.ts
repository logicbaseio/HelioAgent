/* eslint-disable @typescript-eslint/no-explicit-any */
import { handleHelioBacklinkAnalysis } from "../../src/server/helio-backlink-api.mjs";

export default async function handler(req: any, res: any) {
  return handleHelioBacklinkAnalysis(req, res);
}
