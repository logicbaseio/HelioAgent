const DEFAULT_ENGINES = ["chatgpt", "perplexity", "gemini", "copilot", "claude"];

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computeCitationFitness({ page = {}, host = "", schemaTypes = [] } = {}) {
  const words = toNumber(page?.words || page?.wordCount || page?.meta?.content?.words_count || 0);
  const hasCanonical = !!String(page?.canonical || page?.meta?.canonical || "").trim();
  const hasFaq = schemaTypes.some((s) => /faq/i.test(String(s)));
  const hasArticle = schemaTypes.some((s) => /article/i.test(String(s)));
  const hasOrg = schemaTypes.some((s) => /organization|website/i.test(String(s)));
  const freshnessDays = toNumber(page?.freshnessDays || 999);
  const sources = toNumber(page?.sourcesCount || 0);

  const structure = Math.max(0, Math.min(100, (hasCanonical ? 30 : 0) + (hasFaq ? 20 : 0) + (hasArticle ? 20 : 0) + (hasOrg ? 10 : 0)));
  const depth = Math.max(0, Math.min(100, Math.round((Math.min(2200, words) / 2200) * 100)));
  const freshness = Math.max(0, Math.min(100, 100 - Math.min(90, Math.round(freshnessDays / 4))));
  const evidenceDensity = Math.max(0, Math.min(100, Math.round((Math.min(12, sources) / 12) * 100)));
  const overall = Math.round((structure * 0.35) + (depth * 0.2) + (freshness * 0.2) + (evidenceDensity * 0.25));

  return {
    host,
    overall,
    structure,
    depth,
    freshness,
    evidenceDensity,
    recommendation:
      overall >= 75
        ? "Page is citation-ready; prioritize distribution and external mentions."
        : overall >= 55
          ? "Page is moderately citation-ready; improve evidence density and schema coverage."
          : "Page is weak for citations; rebuild structure, facts, and freshness signals before promotion.",
  };
}

export function buildPromptObservation({
  prompt = "",
  engine = "chatgpt",
  cited = false,
  rank = null,
  competitors = [],
  citationUrl = "",
  sentiment = "neutral",
  sourceQuality = null,
} = {}) {
  return {
    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    prompt: String(prompt || "").trim(),
    engine: String(engine || "chatgpt").toLowerCase(),
    cited: !!cited,
    rank: rank == null ? null : toNumber(rank, null),
    competitors: Array.isArray(competitors) ? competitors.slice(0, 12) : [],
    citationUrl: String(citationUrl || "").trim(),
    sourceQuality: sourceQuality == null ? null : toNumber(sourceQuality, null),
    sentiment: String(sentiment || "neutral").toLowerCase(),
    observedAt: new Date().toISOString(),
  };
}

export function scoreCitationSourceQuality(url = "", trustedDomains = []) {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return 0;
  const trusted = Array.isArray(trustedDomains) ? trustedDomains.map((d) => String(d || "").toLowerCase()) : [];
  if (trusted.some((d) => d && u.includes(d))) return 96;
  if (/\.(gov|edu)\b/.test(u)) return 92;
  if (/wikipedia\.org|who\.int|nih\.gov|arxiv\.org/.test(u)) return 88;
  if (/github\.com|docs\.|developer\.|developers\./.test(u)) return 82;
  if (/medium\.com|substack\.com/.test(u)) return 58;
  if (/reddit\.com|quora\.com/.test(u)) return 44;
  return 68;
}

export function parseBingAiPerformanceCsv(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const qIdx = head.findIndex((h) => /query|prompt|grounding/.test(h));
  const pageIdx = head.findIndex((h) => /page|url|citation/.test(h));
  const citesIdx = head.findIndex((h) => /citation|mentions|count/.test(h));
  if (qIdx < 0) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const prompt = String(cols[qIdx] || "").trim();
    if (!prompt) continue;
    rows.push({
      prompt,
      citationUrl: pageIdx >= 0 ? String(cols[pageIdx] || "").trim() : "",
      citations: citesIdx >= 0 ? toNumber(cols[citesIdx], 1) : 1,
      engine: "copilot",
    });
  }
  return rows.slice(0, 1000);
}

export function runObservatoryPromptSuite({
  suite = [],
  engine = "chatgpt",
  citationRate = 0.25,
  avgRank = 4.2,
  competitorSeed = [],
} = {}) {
  const prompts = Array.isArray(suite) ? suite.filter(Boolean) : [];
  return prompts.map((p, idx) => {
    const cited = Math.random() < Number(citationRate || 0);
    const rank = cited ? Math.max(1, Math.round((Number(avgRank || 4.2) + (Math.random() * 2 - 1)))) : null;
    const citationUrl = cited ? "https://example.com/docs/source" : "";
    const competitors = Array.isArray(competitorSeed) && competitorSeed.length
      ? competitorSeed.slice(0, Math.min(3, competitorSeed.length))
      : [];
    return buildPromptObservation({
      prompt: String(p),
      engine,
      cited,
      rank,
      competitors,
      citationUrl,
      sentiment: cited ? "positive" : "neutral",
      sourceQuality: scoreCitationSourceQuality(citationUrl),
      id: `suite_${idx}_${Date.now()}`,
    });
  });
}

export function detectObservatoryDrift({
  previousSummary = null,
  nextSummary = null,
  dropThreshold = 0.06,
} = {}) {
  const prev = Number(previousSummary?.globalCitationRate || 0);
  const next = Number(nextSummary?.globalCitationRate || 0);
  const delta = Number((next - prev).toFixed(4));
  const dropped = prev > 0 && delta <= -Math.abs(Number(dropThreshold || 0.06));
  return {
    previousCitationRate: prev,
    nextCitationRate: next,
    delta,
    dropped,
    alert: dropped
      ? `Citation rate dropped by ${(Math.abs(delta) * 100).toFixed(1)} pts (from ${(prev * 100).toFixed(1)}% to ${(next * 100).toFixed(1)}%).`
      : "",
  };
}

export function summarizePromptObservatory(observations = [], engines = DEFAULT_ENGINES) {
  const byEngine = {};
  for (const e of engines) byEngine[e] = { total: 0, cited: 0, avgRank: 0, ranks: [] };

  for (const o of observations) {
    const engine = String(o?.engine || "").toLowerCase();
    if (!byEngine[engine]) byEngine[engine] = { total: 0, cited: 0, avgRank: 0, ranks: [] };
    byEngine[engine].total += 1;
    if (o?.cited) byEngine[engine].cited += 1;
    if (o?.rank != null && Number.isFinite(Number(o.rank))) byEngine[engine].ranks.push(Number(o.rank));
  }

  let total = 0;
  let cited = 0;
  const rows = Object.entries(byEngine).map(([engine, v]) => {
    const avgRank = v.ranks.length ? Number((v.ranks.reduce((a, b) => a + b, 0) / v.ranks.length).toFixed(2)) : null;
    total += v.total;
    cited += v.cited;
    return {
      engine,
      prompts: v.total,
      cited: v.cited,
      citationRate: v.total ? Number((v.cited / v.total).toFixed(4)) : 0,
      avgRank,
    };
  }).sort((a, b) => b.prompts - a.prompts || b.citationRate - a.citationRate);

  return {
    totalPrompts: total,
    totalCitations: cited,
    globalCitationRate: total ? Number((cited / total).toFixed(4)) : 0,
    rows,
  };
}

export function buildCompetitorMentionGraph(observations = []) {
  const map = new Map();
  for (const o of observations) {
    const comps = Array.isArray(o?.competitors) ? o.competitors : [];
    for (const c of comps) {
      const key = String(c || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([competitor, mentions]) => ({ competitor, mentions }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 30);
}

export function buildIntelligenceActions({ observatory = {}, citationFitness = null, competitors = [] } = {}) {
  const out = [];
  if ((observatory?.globalCitationRate || 0) < 0.15) {
    out.push({
      id: "intel_citation_rate_low",
      priority: "P1",
      title: "Global citation rate is low",
      reason: `Current citation rate ${(Number(observatory?.globalCitationRate || 0) * 100).toFixed(1)}% across tracked prompts.`,
      fix: "Expand citation-ready pages and external mention campaigns before scaling new prompts.",
    });
  }
  if (citationFitness && Number(citationFitness.overall || 0) < 60) {
    out.push({
      id: "intel_fitness_low",
      priority: "P1",
      title: "Citation fitness below threshold",
      reason: `Current citation fitness is ${citationFitness.overall}/100.`,
      fix: citationFitness.recommendation,
    });
  }
  if (Array.isArray(competitors) && competitors.length) {
    const top = competitors[0];
    if (Number(top.mentions || 0) >= 3) {
      out.push({
        id: "intel_competitor_pressure",
        priority: "P2",
        title: `Competitor pressure: ${top.competitor}`,
        reason: `${top.competitor} appears ${top.mentions} times in tracked prompts.`,
        fix: "Create direct comparison pages and strengthen entity-level evidence for overlapping intents.",
      });
    }
  }
  return out.slice(0, 8);
}

export function extractUrls(text = "") {
  const src = String(text || "");
  const out = [];
  const regex = /https?:\/\/[^\s)\]}>"']+/gi;
  let m;
  while ((m = regex.exec(src))) out.push(m[0]);
  return [...new Set(out)];
}

export function computeCausalAttributionModel({
  timeline = [],
  aiTimeline = [],
  actionTs = 0,
  convRate = 0.02,
  aov = 120,
  horizonDays = 30,
} = {}) {
  const rows = Array.isArray(timeline) ? timeline : [];
  const aiRows = Array.isArray(aiTimeline) ? aiTimeline : [];
  if (!rows.length || !actionTs) return null;

  const byDate = new Map();
  for (const row of rows) {
    const day = Number(row?.ts || 0);
    if (!day) continue;
    const key = new Date(day).toISOString().slice(0, 10);
    byDate.set(key, Number(row?.sessions || 0));
  }

  const aiByDate = new Map();
  for (const row of aiRows) {
    const day = Number(row?.ts || 0);
    if (!day) continue;
    const key = new Date(day).toISOString().slice(0, 10);
    aiByDate.set(key, Number(row?.sessions || 0));
  }

  const sortedDays = [...byDate.keys()].sort();
  const actionDay = new Date(actionTs).toISOString().slice(0, 10);
  const preDays = sortedDays.filter((d) => d < actionDay).slice(-14);
  const postDays = sortedDays.filter((d) => d >= actionDay).slice(0, 14);
  if (!preDays.length || !postDays.length) return null;

  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const std = (arr) => {
    if (!arr.length) return 0;
    const m = avg(arr);
    const v = arr.reduce((s, x) => s + ((x - m) ** 2), 0) / arr.length;
    return Math.sqrt(v);
  };
  const preTotal = preDays.map((d) => Number(byDate.get(d) || 0));
  const postTotal = postDays.map((d) => Number(byDate.get(d) || 0));
  const preAi = preDays.map((d) => Number(aiByDate.get(d) || 0));
  const postAi = postDays.map((d) => Number(aiByDate.get(d) || 0));
  const preOther = preDays.map((d, i) => Math.max(0, preTotal[i] - preAi[i]));
  const postOther = postDays.map((d, i) => Math.max(0, postTotal[i] - postAi[i]));

  const aiDelta = avg(postAi) - avg(preAi);
  const controlDelta = avg(postOther) - avg(preOther);
  const did = aiDelta - controlDelta;
  const baselineAi = Math.max(1, avg(preAi));
  const upliftPct = did / baselineAi;
  const preStdAi = std(preAi);
  const postStdAi = std(postAi);
  const noise = Math.max(1, Math.sqrt((preStdAi ** 2) + (postStdAi ** 2)));
  const zScore = did / noise;
  const ci95Low = did - (1.96 * noise);
  const ci95High = did + (1.96 * noise);
  const confidence = Math.max(0, Math.min(1, (preDays.length + postDays.length) / 40));
  const incrementalSessions30d = Math.round(Math.max(0, did * Number(horizonDays || 30)));
  const incrementalRevenue30d = Math.round(incrementalSessions30d * Number(convRate || 0.02) * Number(aov || 120));

  return {
    actionAt: new Date(actionTs).toISOString(),
    avgAiBefore: Math.round(avg(preAi)),
    avgAiAfter: Math.round(avg(postAi)),
    avgControlBefore: Math.round(avg(preOther)),
    avgControlAfter: Math.round(avg(postOther)),
    didDailyLift: Number(did.toFixed(3)),
    upliftPct: Number(upliftPct.toFixed(4)),
    confidence: Number(confidence.toFixed(2)),
    zScore: Number(zScore.toFixed(3)),
    ci95DailyLiftLow: Number(ci95Low.toFixed(3)),
    ci95DailyLiftHigh: Number(ci95High.toFixed(3)),
    volatilityAiBefore: Number(preStdAi.toFixed(3)),
    volatilityAiAfter: Number(postStdAi.toFixed(3)),
    convRate: Number(convRate || 0.02),
    incrementalSessions30d,
    incrementalRevenue30d,
  };
}

export function buildPortfolioOptimizationPlan(rows = []) {
  const items = (Array.isArray(rows) ? rows : []).map((r) => {
    const readinessGap = Math.max(0, 85 - Number(r?.readiness || 0));
    const citationGap = Math.max(0, 0.28 - Number(r?.citationRate || 0));
    const efficiency = Number(r?.projectedRevenue30d || 0) / Math.max(1, Number(r?.recommendedBudget || 1));
    const pressure = (readinessGap * 0.8) + (citationGap * 200) + Math.max(0, 35 - efficiency);
    return { ...r, pressureScore: Number(pressure.toFixed(2)), efficiency: Number(efficiency.toFixed(2)) };
  }).sort((a, b) => b.pressureScore - a.pressureScore);

  const totalBudget = items.reduce((s, x) => s + Number(x.recommendedBudget || 0), 0);
  const pool = Math.max(0, totalBudget);
  const totalPressure = items.reduce((s, x) => s + Math.max(1, x.pressureScore), 0);
  const optimized = items.map((x) => {
    const share = totalPressure > 0 ? Math.max(1, x.pressureScore) / totalPressure : 0;
    const optimizedBudget = Math.round(pool * share);
    const forecastedRevenue30d = Math.round(Number(x.projectedRevenue30d || 0) * (1 + Math.min(0.45, x.pressureScore / 250)));
    return { ...x, optimizedBudget, forecastedRevenue30d };
  });
  return { rows: optimized, budgetPool: totalBudget };
}
