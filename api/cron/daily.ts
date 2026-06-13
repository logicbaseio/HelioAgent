export const config = {
  maxDuration: 300,
};

export default async function handler(req: any, res: any) {
  try {
    const auth = req.headers.authorization || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { runDailyAutomation } = await import("../_carousel-core.mjs");
    const result = await runDailyAutomation();
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || "Daily automation failed" });
  }
}
