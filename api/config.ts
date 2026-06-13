export default async function handler(req: any, res: any) {
  try {
    const core = await import("./_carousel-core.mjs");

    if (req.method === "GET") {
      const config = await core.getAutomationConfig();
      return res.status(200).json({ ok: true, config: core.redactConfig(config) });
    }

    if (req.method === "POST") {
      const config = await core.saveAutomationConfig(req.body || {});
      return res.status(200).json({ ok: true, config });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || "Config request failed" });
  }
}
