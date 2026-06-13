export const config = {
  maxDuration: 300,
  api: {
    bodyParser: {
      sizeLimit: "30mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const core = await import("./_carousel-core.mjs");
    const day = req.body?.day;
    if (day?.day) {
      const status = await core.getDayStatus(day.day);
      if (status?.postedAt && !req.body?.force) {
        return res.status(409).json({ ok: false, error: `Day ${day.day} is already posted` });
      }
    }
    const result = await core.publishCarousel(req.body || {});
    let statusWarning = "";
    if (day?.day) {
      try {
        await core.markDayPosted(day, {
          source: "manual",
          mediaId: result.mediaId,
          creationId: result.creationId,
          outDir: result.outDir,
        });
      } catch (statusError: any) {
        statusWarning = statusError?.message || "Posted status could not be saved";
      }
    }
    return res.status(200).json({ ...result, ...(statusWarning ? { warning: statusWarning } : {}) });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || "Publish failed" });
  }
}
