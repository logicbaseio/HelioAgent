/* eslint-disable @typescript-eslint/no-explicit-any */

type WaitlistPayload = {
  name: string;
  email: string;
  phone: string;
  country: string;
  heardFrom: string[];
};

const DESTINATION_EMAIL = "hamzaashergill@gmail.com";

function isValidPayload(body: any): body is WaitlistPayload {
  return (
    typeof body?.name === "string" &&
    typeof body?.email === "string" &&
    typeof body?.phone === "string" &&
    typeof body?.country === "string" &&
    Array.isArray(body?.heardFrom) &&
    body.heardFrom.every((item: unknown) => typeof item === "string")
  );
}

async function forwardToWebhook(payload: WaitlistPayload) {
  const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("WAITLIST_WEBHOOK_URL is not configured.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      destinationEmail: DESTINATION_EMAIL,
      submittedAt: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook failed: ${response.status} ${text}`);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = req.body;
  if (!isValidPayload(payload)) {
    res.status(400).json({ error: "Invalid request payload" });
    return;
  }

  try {
    await forwardToWebhook(payload);
    res.status(200).json({ ok: true });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ error: err.message || "Failed to submit waitlist form" });
  }
}
