/* eslint-disable @typescript-eslint/no-explicit-any */

function normalize(rows: any[] = []) {
  return rows
    .map((m: any) => ({
      id: String(m?.id || ""),
      name: String(m?.name || m?.display_name || m?.id || ""),
      ctx: m?.context_length ? String(m.context_length) : "?",
      price: "Live",
    }))
    .filter((m) => m.id);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const provider = String(req.body?.provider || "").toLowerCase();
    const apiKey = String(req.body?.apiKey || "");
    const action = String(req.body?.action || "list").toLowerCase();
    const model = String(req.body?.model || "");
    if (!provider || !apiKey) {
      res.status(400).json({ ok: false, error: "provider and apiKey are required" });
      return;
    }

    if (provider === "openrouter") {
      if (action === "test") {
        const tr = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://helio-seo.app",
            "X-Title": "Helio",
          },
          body: JSON.stringify({
            model: model || "openai/gpt-4o-mini",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
        });
        const td: any = await tr.json().catch(() => ({}));
        if (!tr.ok) throw new Error(td?.error?.message || `OpenRouter HTTP ${tr.status}`);
        res.status(200).json({ ok: true, testedModel: model || "openai/gpt-4o-mini" });
        return;
      }
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message || `OpenRouter HTTP ${r.status}`);
      res.status(200).json({ ok: true, models: normalize(Array.isArray(d?.data) ? d.data : []) });
      return;
    }

    if (provider === "openai") {
      if (action === "test") {
        const tr = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
        });
        const td: any = await tr.json().catch(() => ({}));
        if (!tr.ok) throw new Error(td?.error?.message || `OpenAI HTTP ${tr.status}`);
        res.status(200).json({ ok: true, testedModel: model || "gpt-4o-mini" });
        return;
      }
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message || `OpenAI HTTP ${r.status}`);
      res.status(200).json({ ok: true, models: normalize(Array.isArray(d?.data) ? d.data : []) });
      return;
    }

    if (provider === "anthropic") {
      if (action === "test") {
        const tr = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: model || "claude-sonnet-4-5",
            max_tokens: 8,
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        const td: any = await tr.json().catch(() => ({}));
        if (!tr.ok) throw new Error(td?.error?.message || `Anthropic HTTP ${tr.status}`);
        res.status(200).json({ ok: true, testedModel: model || "claude-sonnet-4-5" });
        return;
      }
      const r = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message || `Anthropic HTTP ${r.status}`);
      res.status(200).json({ ok: true, models: normalize(Array.isArray(d?.data) ? d.data : []) });
      return;
    }

    res.status(400).json({ ok: false, error: "Unsupported provider" });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || "Failed to load model catalog" });
  }
}
