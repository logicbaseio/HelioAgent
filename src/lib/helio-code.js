export const HELIO_CODE_STATUSES = [
  "code-queued",
  "code-running",
  "worker-unavailable",
  "code-pr-opened",
  "code-checks-failed",
  "code-failed",
  "merged-awaiting-deploy",
  "resolved-verified",
];

const HELIO_CODE_SKILLS = [
  {
    id: "technical-sitemap",
    name: "Technical Sitemap Remediation",
    issueTypes: ["sitemap"],
    supportedFrameworks: ["nextjs-app-router", "nextjs-pages-router", "vite-static", "astro", "generic-react", "unknown"],
    repoInspectionChecklist: ["Find routing framework", "Check public assets", "Check app/pages route metadata", "Check robots file"],
    editStrategy: "Create or repair sitemap implementation using the framework-native route when available; otherwise use public/sitemap.xml.",
    verificationCommands: ["package-manager build", "static sitemap route check"],
    riskRules: ["Do not overwrite an existing dynamic sitemap without preserving existing routes.", "Do not invent URLs outside the audited domain evidence."],
    rollbackGuidance: "Remove the added sitemap route/file and any robots.txt sitemap reference from the Helio branch.",
  },
  {
    id: "technical-robots",
    name: "Robots and Crawl Directives Remediation",
    issueTypes: ["robots", "crawlability", "indexability"],
    supportedFrameworks: ["nextjs-app-router", "nextjs-pages-router", "vite-static", "astro", "generic-react", "unknown"],
    repoInspectionChecklist: ["Inspect robots.txt/app robots route", "Inspect noindex directives", "Check sitemap reference"],
    editStrategy: "Repair robots directives and sitemap references without weakening intentional disallow/noindex rules.",
    verificationCommands: ["package-manager build", "static robots route check"],
    riskRules: ["Never remove disallow/noindex directives without explicit audit evidence.", "Keep admin/private paths blocked."],
    rollbackGuidance: "Restore previous robots file or route from the PR diff.",
  },
  {
    id: "technical-metadata",
    name: "Metadata and Canonical Remediation",
    issueTypes: ["metadata", "title", "description", "canonical"],
    supportedFrameworks: ["nextjs-app-router", "nextjs-pages-router", "vite-static", "astro", "generic-react", "unknown"],
    repoInspectionChecklist: ["Find layout/head component", "Inspect per-route metadata", "Inspect canonical generation"],
    editStrategy: "Add framework-native title, description, canonical, and Open Graph metadata using existing page data where possible.",
    verificationCommands: ["package-manager build", "static rendered-head check"],
    riskRules: ["Do not rewrite large page copy.", "Do not hardcode wrong domains when domain config exists."],
    rollbackGuidance: "Revert metadata additions in the affected route/layout files.",
  },
  {
    id: "technical-schema",
    name: "Structured Data and AEO/GEO Markup",
    issueTypes: ["schema", "structured-data", "aeo", "geo", "entity"],
    supportedFrameworks: ["nextjs-app-router", "nextjs-pages-router", "vite-static", "astro", "generic-react", "unknown"],
    repoInspectionChecklist: ["Find schema/json-ld utilities", "Inspect page content sources", "Find entity/about/contact data"],
    editStrategy: "Add code-backed JSON-LD, entity metadata, and answer-friendly structural markup only when audit evidence provides source facts.",
    verificationCommands: ["package-manager build", "schema syntax check"],
    riskRules: ["Do not invent facts, reviews, ratings, claims, or large new content.", "Only add FAQ/answer markup when source page content supports it."],
    rollbackGuidance: "Remove the JSON-LD/script component or metadata additions from the affected pages.",
  },
  {
    id: "technical-links",
    name: "Internal Link and Redirect Remediation",
    issueTypes: ["broken-link", "redirect", "internal-link"],
    supportedFrameworks: ["nextjs-app-router", "nextjs-pages-router", "vite-static", "astro", "generic-react", "unknown"],
    repoInspectionChecklist: ["Inspect route files", "Inspect redirect config", "Find broken link source references"],
    editStrategy: "Fix broken internal hrefs and add framework-native redirects only when destination evidence is unambiguous.",
    verificationCommands: ["package-manager build", "static link check"],
    riskRules: ["Do not redirect external URLs.", "Do not delete routes without explicit replacement evidence."],
    rollbackGuidance: "Revert href/redirect changes in the affected files.",
  },
];

export function normalizeHelioCodeStatus(raw = "") {
  const status = String(raw || "").trim().toLowerCase().replace(/_/g, "-");
  return HELIO_CODE_STATUSES.includes(status) ? status : "";
}

export function inferHelioCodeIssueType(input = {}) {
  const text = [input.issueType, input.title, input.reason, input.fixHint, input.expectedOutcome]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("llms.txt") || text.includes("llm.txt") || text.includes("llm policy") || text.includes("retrieval policy")) return "schema";
  if (text.includes("sitemap")) return "sitemap";
  if (text.includes("robots") || text.includes("crawl") || text.includes("noindex") || text.includes("indexability")) return "robots";
  if (text.includes("canonical")) return "canonical";
  if (text.includes("meta") || text.includes("title") || text.includes("description") || text.includes("open graph")) return "metadata";
  if (text.includes("schema") || text.includes("json-ld") || text.includes("structured") || text.includes("aeo") || text.includes("geo") || text.includes("entity")) return "schema";
  if (text.includes("broken link") || text.includes("broken-link") || text.includes("internal link") || text.includes("internal-link") || text.includes("redirect")) return "broken-link";
  return "metadata";
}

export function selectHelioCodeSkill({ issueType = "", framework = "unknown", skillId = "" } = {}) {
  const requested = String(skillId || "").trim();
  if (requested) {
    const exact = HELIO_CODE_SKILLS.find((skill) => skill.id === requested);
    if (exact) return exact;
  }
  const normalizedIssue = inferHelioCodeIssueType({ issueType });
  return (
    HELIO_CODE_SKILLS.find(
      (skill) =>
        skill.issueTypes.includes(normalizedIssue) &&
        (skill.supportedFrameworks.includes(framework) || skill.supportedFrameworks.includes("unknown"))
    ) || HELIO_CODE_SKILLS.find((skill) => skill.id === "technical-metadata")
  );
}

export function validateHelioCodeJobPayload(payload = {}) {
  const errors = [];
  const requiredStrings = ["missionId", "orgId", "domain", "repo", "issueType", "priority", "severity", "expectedOutcome"];
  for (const key of requiredStrings) {
    if (!String(payload[key] || "").trim()) errors.push(`${key} is required`);
  }
  if (!Array.isArray(payload.affectedUrls)) errors.push("affectedUrls must be an array");
  if (!Array.isArray(payload.constraints)) errors.push("constraints must be an array");
  if (payload.auditEvidence == null) errors.push("auditEvidence is required");
  return { ok: errors.length === 0, errors };
}

export function buildHelioCodeJobPayload({ mission = {}, orgId = "default", domain = "", repo = "", skillId = "", agentConfig = null } = {}) {
  const issueType = inferHelioCodeIssueType({
    issueType: mission.issueType,
    title: mission.title,
    reason: mission.reason,
    fixHint: mission.fixHint,
    expectedOutcome: mission.expectedOutcome,
  });
  const affectedUrls = Array.isArray(mission.affectedUrls)
    ? mission.affectedUrls
    : Array.isArray(mission.urls)
      ? mission.urls
      : [];
  return {
    missionId: String(mission.id || ""),
    orgId: String(orgId || "default"),
    domain: String(domain || ""),
    repo: String(repo || ""),
    githubInstallationId: String(mission.githubInstallationId || ""),
    githubToken: String(mission.githubToken || ""),
    issueType,
    priority: String(mission.priority || "P3"),
    severity: String(mission.severity || "medium"),
    auditEvidence: {
      title: mission.title || "",
      reason: mission.reason || "",
      fixHint: mission.fixHint || "",
      source: mission.source || "technical_audit",
      affectedCount: Number(mission.affectedCount || affectedUrls.length || 0),
      ...(mission.auditEvidence && typeof mission.auditEvidence === "object" ? mission.auditEvidence : {}),
    },
    affectedUrls,
    expectedOutcome:
      mission.expectedOutcome ||
      `Implement a code-backed ${issueType} remediation for ${domain} and prepare a PR with checks and rollback notes.`,
    constraints: [
      "Open a branch and PR only; do not merge.",
      "Preserve existing framework conventions.",
      "Do not invent AEO/GEO facts, reviews, ratings, or large content blocks.",
      "Run available repo checks before marking the PR ready.",
    ],
    skillId: skillId || selectHelioCodeSkill({ issueType }).id,
    agent: agentConfig && typeof agentConfig === "object"
      ? {
          provider: String(agentConfig.provider || ""),
          model: String(agentConfig.model || ""),
          apiKey: String(agentConfig.apiKey || ""),
        }
      : undefined,
  };
}

export function createHelioCodeJobRecord(payload = {}, now = new Date()) {
  const validation = validateHelioCodeJobPayload(payload);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const id = `hc_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
  const skill = selectHelioCodeSkill({ issueType: payload.issueType, skillId: payload.skillId });
  return {
    ok: true,
    job: {
      id,
      status: "code-queued",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      payload: { ...payload, skillId: skill.id },
      logs: [{ at: now.toISOString(), level: "info", message: `Helio Code job queued with skill ${skill.name}.` }],
      result: null,
      attempts: 0,
    },
  };
}

export function buildHelioCodeEvidence({ job = {}, repoProfile = {}, changedFiles = [], checks = [], pullRequestUrl = "", branch = "" } = {}) {
  const failedChecks = checks.filter((check) => check.status !== "passed");
  const riskScore = failedChecks.length ? "high" : changedFiles.length > 8 ? "medium" : "low";
  return {
    status: failedChecks.length ? "code-checks-failed" : "code-pr-opened",
    branch,
    pullRequestUrl,
    changedFiles,
    checks,
    riskScore,
    rollbackNotes: "Revert the Helio Code branch or close the PR before merge. After merge, revert the PR commit.",
    agentSummary: `Helio Code prepared ${changedFiles.length} file change(s) for ${job?.payload?.issueType || "SEO"} remediation using ${job?.payload?.skillId || "selected skill"}.`,
    repoProfile,
    failureReason: failedChecks.length ? "One or more repo checks failed." : "",
  };
}

export function buildHelioCodePrBody({ payload = {}, skill = {}, evidence = {} } = {}) {
  return [
    `Mission: ${payload.auditEvidence?.title || payload.missionId}`,
    `Mission ID: ${payload.missionId}`,
    `Domain: ${payload.domain}`,
    `Issue type: ${payload.issueType}`,
    `Skill: ${skill.name || payload.skillId}`,
    ``,
    `Expected outcome:`,
    payload.expectedOutcome || "Apply code-backed SEO/AEO/GEO remediation.",
    ``,
    `Evidence:`,
    `- Changed files: ${(evidence.changedFiles || []).join(", ") || "pending"}`,
    `- Checks: ${(evidence.checks || []).map((check) => `${check.name}:${check.status}`).join(", ") || "pending"}`,
    `- Risk: ${evidence.riskScore || "pending"}`,
    ``,
    `Rollback:`,
    evidence.rollbackNotes || "Revert this PR.",
  ].join("\n");
}
