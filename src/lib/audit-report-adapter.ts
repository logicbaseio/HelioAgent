import type { AuditReport, TableRow, AuditIssue } from "./audit-types";

function humanizeKey(key: string): string {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function cell(value: any): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    const primitive = value.every((x) => ["string", "number", "boolean"].includes(typeof x));
    if (primitive) return value.map((x) => String(x)).join(" | ");
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    const ks = Object.keys(value);
    if (!ks.length) return "—";
    return ks.slice(0, 5).map((k) => `${humanizeKey(k)}: ${cell((value as any)[k])}`).join(" | ");
  }
  return String(value);
}

function mapIssueLevel(level: string): AuditIssue["level"] {
  const v = String(level || "medium").toLowerCase();
  if (v === "critical" || v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

function toKeyValueTable(obj: Record<string, any> = {}, headers: [string, string] = ["Metric", "Value"]): TableRow[] {
  const rows: TableRow[] = [[headers[0], headers[1]]];
  Object.entries(obj || {}).forEach(([k, v]) => {
    rows.push([humanizeKey(k), cell(v)]);
  });
  return rows;
}

function toObjectTable(items: any[] = [], columns: Array<{ key: string; label: string }>): TableRow[] {
  const rows: TableRow[] = [columns.map((c) => c.label)];
  for (const item of items) {
    rows.push(columns.map((c) => cell(item?.[c.key])));
  }
  return rows;
}

function speedRows(section12: any): TableRow[] {
  const mobile = section12?.pagespeed?.mobile || {};
  const desktop = section12?.pagespeed?.desktop || {};
  return [
    ["Metric", "Mobile", "Desktop"],
    ["Performance Score", cell(mobile.performance), cell(desktop.performance)],
    ["SEO Score", cell(mobile.seo), cell(desktop.seo)],
    ["Best Practices", cell(mobile.bestPractices), cell(desktop.bestPractices)],
    ["Accessibility", cell(mobile.accessibility), cell(desktop.accessibility)],
    ["LCP", cell(mobile.lcp), cell(desktop.lcp)],
    ["INP", cell(mobile.inp), cell(desktop.inp)],
    ["CLS", cell(mobile.cls), cell(desktop.cls)],
    ["TBT", cell(mobile.tbt), cell(desktop.tbt)],
    ["FCP", cell(mobile.fcp), cell(desktop.fcp)],
  ];
}

export function buildAuditReportJson({ generatedReport, payload, domain, source, remediationSummary }: {
  generatedReport: any;
  payload: any;
  domain: string;
  source?: string;
  remediationSummary?: {
    healthyChecks?: number;
    openFixes?: number;
    executedFixes?: number;
    approvalBlockedFixes?: number;
  };
}): AuditReport {
  const host = generatedReport?.domain || domain || "unknown-domain";
  const issues = Array.isArray(generatedReport?.section17_priorityFindings)
    ? generatedReport.section17_priorityFindings
    : [];

  const score = Number(generatedReport?.quality?.score || payload?.quality?.score || 0);
  const s3 = generatedReport?.section3_overallHealthSnapshot || {};
  const s12 = generatedReport?.section12_pageExperienceTechnicalPerformance || {};

  const categoryScores = [
    { category: "Crawlability", score: Number(s3?.crawlability || 0), weight: "18%" },
    { category: "Indexation Health", score: Number(s3?.indexationHealth || 0), weight: "16%" },
    { category: "Site Architecture", score: Number(s3?.siteArchitectureQuality || 0), weight: "14%" },
    { category: "Metadata Quality", score: Number(s3?.metadataQuality || 0), weight: "14%" },
    { category: "Internal Linking", score: Number(s3?.internalLinkingStrength || 0), weight: "12%" },
    {
      category: "PageSpeed (Mobile)",
      score: s12?.pagespeed?.mobile?.performance ?? null,
      weight: "13%",
      unknown: !s12?.pagespeed?.mobile,
    },
    {
      category: "PageSpeed (Desktop)",
      score: s12?.pagespeed?.desktop?.performance ?? null,
      weight: "13%",
      unknown: !s12?.pagespeed?.desktop,
    },
  ];

  const matrix = issues.map((i: any) => ({
    priority: mapIssueLevel(String(i.severity || "medium")),
    issue: String(i.issue || "Issue"),
    pages: String(i.value ?? 0),
    impact: String(i.likelyImpact || ""),
    fix: String(i.recommendedFix || ""),
  }));

  const protocol = generatedReport?.section23_appendixEvidence?.protocol || null;
  const phaseRows = [
    {
      id: 1,
      title: "Audit Scope and Method",
      subsectionTitle: "Scope",
      rows: toKeyValueTable(generatedReport?.section2_scopeAndMethod || {}, ["Parameter", "Detail"]),
    },
    {
      id: 2,
      title: "Overall Health Snapshot",
      subsectionTitle: "Scorecard",
      rows: toKeyValueTable(s3, ["Dimension", "Score / Status"]),
    },
    {
      id: 3,
      title: "Crawlability Review",
      subsectionTitle: "Crawl Infrastructure",
      rows: toKeyValueTable(generatedReport?.section4_crawlabilityReview || {}, ["Check", "Value"]),
    },
    {
      id: 4,
      title: "Indexation Review",
      subsectionTitle: "Indexation Signals",
      rows: toKeyValueTable(generatedReport?.section5_indexationReview || {}, ["Metric", "Value"]),
    },
    {
      id: 5,
      title: "Site Architecture and URL Structure",
      subsectionTitle: "Architecture Signals",
      rows: toKeyValueTable(generatedReport?.section6_siteArchitectureAndUrlStructure || {}, ["Metric", "Value"]),
    },
    {
      id: 6,
      title: "Internal Linking Audit",
      subsectionTitle: "Link Equity Signals",
      rows: toKeyValueTable(generatedReport?.section7_internalLinkingAudit || {}, ["Metric", "Value"]),
    },
    {
      id: 7,
      title: "Technical On-Page Elements",
      subsectionTitle: "On-Page Metrics",
      rows: toKeyValueTable(generatedReport?.section8_technicalOnPageElements || {}, ["Element", "Status"]),
    },
    {
      id: 8,
      title: "XML Sitemap and Robots",
      subsectionTitle: "Crawler Guidance",
      rows: toKeyValueTable(generatedReport?.section9_xmlSitemapAndRobotsReview || {}, ["Item", "Status"]),
    },
    {
      id: 9,
      title: "Canonicalization and Duplicate Content",
      subsectionTitle: "Canonical and Duplication",
      rows: toKeyValueTable(generatedReport?.section10_canonicalizationAndDuplicateContent || {}, ["Metric", "Value"]),
    },
    {
      id: 10,
      title: "Structured Data / Schema Audit",
      subsectionTitle: "Schema Coverage",
      rows: toKeyValueTable(generatedReport?.section11_structuredDataSchemaAudit || {}, ["Metric", "Value"]),
    },
    {
      id: 11,
      title: "Speed Analytics and Error Diagnostics",
      subsectionTitle: "PageSpeed (Connected API)",
      rows: speedRows(s12),
    },
    {
      id: 12,
      title: "Mobile SEO Review",
      subsectionTitle: "Mobile Readiness",
      rows: toKeyValueTable(generatedReport?.section13_mobileSeoReview || {}, ["Metric", "Value"]),
    },
    {
      id: 13,
      title: "Redirects, Status Codes, and Broken Pages",
      subsectionTitle: "HTTP Integrity",
      rows: toKeyValueTable(generatedReport?.section14_redirectsStatusCodesBrokenPages || {}, ["Metric", "Value"]),
    },
    {
      id: 14,
      title: "JavaScript / Rendering Risks",
      subsectionTitle: "Render Risks",
      rows: toKeyValueTable(generatedReport?.section15_javascriptRenderingRisks || {}, ["Metric", "Value"]),
    },
    {
      id: 15,
      title: "Content and Search Intent Risks",
      subsectionTitle: "Intent / Cannibalization",
      rows: toKeyValueTable(generatedReport?.section16_contentAndSearchIntentRisks || {}, ["Metric", "Value"]),
    },
    {
      id: 16,
      title: "Priority Findings",
      subsectionTitle: "Finding → Implication → Fix",
      rows: [["Issue", "Impact", "Fix", "Confidence", "Severity"]],
    },
    {
      id: 17,
      title: "Speed Errors and Fix Plan",
      subsectionTitle: "Performance Remediation",
      rows: [["Severity", "Issue", "Evidence", "Fix Plan"]],
    },
    {
      id: 18,
      title: "Helio Recommendations",
      subsectionTitle: "Honest Recommended Plan",
      rows: [["Priority", "Recommendation", "Rationale", "Success Metric"]],
    },
    {
      id: 19,
      title: "AEO / GEO Readiness",
      subsectionTitle: "LLM Visibility and Retrieval",
      rows: [["Signal", "Status", "Evidence"]],
    },
    {
      id: 20,
      title: "Risks, Assumptions, and Validation Notes",
      subsectionTitle: "Validation",
      rows: toKeyValueTable(generatedReport?.section21_risksAssumptionsValidation || {}, ["Type", "Detail"]),
    },
    {
      id: 21,
      title: "Expected Impact",
      subsectionTitle: "Impact Forecast",
      rows: toKeyValueTable(generatedReport?.section22_expectedImpact || {}, ["Dimension", "Expectation"]),
    },
    {
      id: 22,
      title: "Protocol Execution Trace",
      subsectionTitle: "Mandatory Audit Steps",
      rows: [
        ["Step", "Status"],
        ["Homepage Fetch", protocol?.fetched?.home_www?.ok ? "PASS" : "FAIL"],
        ["Redirect Variant Fetches", protocol?.fetched?.home_non_www?.ok && protocol?.fetched?.home_http_www?.ok ? "PASS" : "WARN"],
        ["Robots Fetch", protocol?.fetched?.robots?.ok ? "PASS" : "FAIL"],
        ["Sitemap Fetch Set", (protocol?.fetched?.sitemap_xml?.ok || protocol?.fetched?.sitemap_index?.ok || protocol?.fetched?.wp_sitemap?.ok) ? "PASS" : "FAIL"],
        ["Inner Page Sampling", protocol?.fetched?.about?.ok || protocol?.fetched?.blog?.ok || protocol?.fetched?.pricing?.ok ? "PASS" : "WARN"],
        ["site: Search Query", (protocol?.searches || [])[0]?.ok ? "PASS" : "FAIL"],
      ],
    },
  ];

  const findingsRows = issues.map((i: any) => [
    cell(i.issue),
    cell(i.likelyImpact),
    cell(i.recommendedFix),
    cell(i.confidence || "medium"),
    `${String(i.severity || "medium").toUpperCase()} ${String(i.priority || "")}`.trim(),
  ]);

  const speedErrRows = (s12?.speedAnalyticsErrors || []).map((e: any) => [
    String(e?.severity || "medium").toUpperCase(),
    cell(e?.issue),
    cell(e?.evidence),
    cell(e?.fix),
  ]);

  const helioRecRows = (generatedReport?.section24_helioRecommendations || []).map((r: any) => [
    String(r?.priority || "medium").toUpperCase(),
    cell(r?.recommendation),
    cell(r?.rationale),
    cell(r?.successMetric),
  ]);

  const aeo = generatedReport?.section25_aeoGeoReadiness || {};
  const aeoRows = [
    ["llms/llm policy present", aeo?.llmTxtFound ? "Yes" : "No", aeo?.llmTxtUrl || "—"],
    ["llms/llm status code", cell(aeo?.llmTxtStatusCode), "Root file availability signal"],
    ["LLM visibility risk", String(aeo?.llmVisibilityRisk || "unknown").toUpperCase(), "Risk for AI answer/retrieval systems"],
    ["Organization schema pages", cell(aeo?.entitySignalsDetected?.organizationSchemaPages), "Entity trust signal"],
    ["FAQ schema pages", cell(aeo?.entitySignalsDetected?.faqSchemaPages), "Answer extraction signal"],
    ["Article schema pages", cell(aeo?.entitySignalsDetected?.articleSchemaPages), "Citation eligibility signal"],
  ];

  const phases = phaseRows.map((p) => {
    let rows = p.rows;
    if (p.id === 16) rows = [p.rows[0], ...findingsRows];
    if (p.id === 17) rows = [p.rows[0], ...speedErrRows];
    if (p.id === 18) rows = [p.rows[0], ...helioRecRows];
    if (p.id === 19) rows = [p.rows[0], ...aeoRows];
    if (rows.length === 1) rows.push(["No data", "—"]);

    return {
      id: p.id,
      title: p.title,
      subsections: [{
        id: `${p.id}.1`,
        title: p.subsectionTitle,
        table: rows,
        score,
      }],
    };
  });

  const quickWins = (generatedReport?.section18_quickWins || []).slice(0, 10).map((w: any) => ({
    time: w.priority === "P1" ? "30 min - 2 hrs" : w.priority === "P2" ? "< 1 day" : "1-3 days",
    title: w.issue || "Quick win",
    desc: w.recommendedFix || "",
  }));

  const gscSnapshot = generatedReport?.section23_appendixEvidence?.gscSnapshot || null;
  const ga4Snapshot = generatedReport?.section23_appendixEvidence?.ga4Snapshot || null;

  return {
    meta: {
      domain: host,
      date: new Date().toISOString().slice(0, 10),
      auditor: source || generatedReport?.source || "Helio Core",
      skillVersion: "helio-core-seo-audit-v2 + seo-audit-report-generator-v3",
    },
    executiveSummary: {
      overallScore: score,
      criticalIssues: matrix.filter((m) => m.priority === "critical").length,
      highIssues: matrix.filter((m) => m.priority === "high").length,
      mediumIssues: matrix.filter((m) => m.priority === "medium").length,
      lowIssues: matrix.filter((m) => m.priority === "low").length,
      pagesIndexed: `${payload?.summary?.pages_crawled || 0} crawled pages`,
      gsc: gscSnapshot
        ? {
            clicks: Number(gscSnapshot.clicks || 0),
            impressions: Number(gscSnapshot.impressions || 0),
            ctr: String(gscSnapshot.ctr || "0%"),
            avgPosition: String(gscSnapshot.avgPosition || "n/a"),
          }
        : undefined,
      ga4: ga4Snapshot
        ? {
            sessions: Number(ga4Snapshot.sessions || 0),
            users: Number(ga4Snapshot.users || 0),
            pageviews: Number(ga4Snapshot.pageviews || 0),
          }
        : undefined,
      topWins: quickWins.slice(0, 4).map((w) => ({ title: w.title, desc: w.desc })),
    },
    categoryScores,
    weightedScore: score,
    phases,
    priorityMatrix: matrix,
    quickWins,
    appendices: {
      crawledUrls: (generatedReport?.section23_appendixEvidence?.sampleUrls || []).slice(0, 120).map((u: any) => ({
        url: String(u.url || ""),
        status: String(u.status || ""),
        loadTime: `${u.loadMs || 0} ms`,
        notes: "",
      })),
      manualUrls: [
        { tool: "Google Search Console", url: "https://search.google.com/search-console", check: "Coverage and indexing parity" },
        { tool: "PageSpeed Insights", url: `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://${host}`)}`, check: "CWV and lab metrics" },
        { tool: "llms.txt", url: `https://${host}/llms.txt`, check: "AEO/GEO retrieval policy file (canonical)" },
        { tool: "llm.txt", url: `https://${host}/llm.txt`, check: "AEO/GEO retrieval policy file (compat)" },
      ],
      sitemapNote: generatedReport?.section9_xmlSitemapAndRobotsReview?.sitemapMissing ? "Sitemap missing." : "Sitemap detected.",
      schemaNote: `Schema parse errors: ${generatedReport?.section11_structuredDataSchemaAudit?.implementationErrors || 0}`,
    },
    remediationSummary: remediationSummary
      ? {
          healthyChecks: Number(remediationSummary.healthyChecks || 0),
          openFixes: Number(remediationSummary.openFixes || 0),
          executedFixes: Number(remediationSummary.executedFixes || 0),
          approvalBlockedFixes: Number(remediationSummary.approvalBlockedFixes || 0),
        }
      : undefined,
  };
}
