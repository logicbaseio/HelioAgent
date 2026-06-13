import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  canonicalizeCrawlUrl,
  autonomousResolveStatus,
  buildContentPlanFromContext,
  buildCalendarFromPlan,
  buildContentEngineContext,
  buildKeywordIntelPlan,
  buildMissionVerificationChecks,
  computeHelioAuditScore,
  dataForSeoBacklinkAnalysis,
  dataForSeoSerpSearch,
  ensureReportIssueBlocks,
  isAutonomousPlanOnlyResolve,
  normalizeMarkdownTables,
  normalizeMissionStatus,
  normalizeUrl,
  priorityRank,
  roadmapIdForCluster,
  selectedRoadmapFromKeywordCluster,
  validateAuditReportQuality,
  webSearchTool,
} from "./HelioDashboard.jsx";
import {
  buildHelioCodeJobPayload,
  createHelioCodeJobRecord,
  inferHelioCodeIssueType,
  selectHelioCodeSkill,
  validateHelioCodeJobPayload,
} from "../../lib/helio-code";
import {
  __internal_buildDiscoveryQueries,
  __internal_extractUrlsFromSearchText,
  analyzeHelioBacklinks,
  discoverBacklinkCandidates,
  extractBacklinkAnchors,
  isSafePublicHttpUrl,
  normalizeBacklinkTarget,
} from "../../lib/helio-backlink-tool";
import {
  analyzeAndUpdateBacklinkIndex,
  crawlBacklinkQueueForScope,
  formatBacklinkIndex,
  importBacklinkCandidates,
  loadBacklinkIndex,
  mergeAnalysisIntoIndex,
  parseCandidateText,
} from "../../server/helio-backlink-index.mjs";
import { createGitHubAppJwt } from "../../server/helio-code/github-app.mjs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Helio core deterministic utilities", () => {
  it("normalizes plain domains to https", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("canonicalizes crawl URLs by dropping tracking params and hash", () => {
    const out = canonicalizeCrawlUrl("https://example.com/blog/?utm_source=x&b=2&a=1#section");
    expect(out).toBe("https://example.com/blog?a=1&b=2");
  });

  it("produces high score for clean summary", () => {
    const score = computeHelioAuditScore({
      pages_crawled: 10,
      broken_pages: 0,
      duplicate_title: 0,
      checks: {
        no_h1_tag: 0,
        no_description: 0,
        no_image_alt: 0,
        no_index_page: 0,
        high_loading_time: 0,
      },
    });
    expect(score.score).toBeGreaterThanOrEqual(95);
    expect(score.severity).toBe("low");
  });

  it("adds issue blocks so report QA can pass when an AI report only has tables", () => {
    const base = [
      "# Technical SEO Audit Report",
      "🟢 Coverage: sampled crawl completed.",
      "**Score: 82/100** 🟡",
      "| Status | Issue | Priority |",
      "| --- | --- | --- |",
      "| 🟡 Medium | Missing descriptions | P2 |",
      "x".repeat(3200),
    ].join("\n");
    const report = {
      section17_priorityFindings: [
        {
          severity: "medium",
          issue: "Missing meta descriptions on sampled pages",
          recommendedFix: "Write unique descriptions for affected templates.",
        },
      ],
    };
    const payload = { summary: { pages_crawled: 12 }, quality: { score: 82 } };

    const fixed = ensureReportIssueBlocks(base, report, payload);
    const qa = validateAuditReportQuality(fixed, payload, report, {});

    expect(fixed).toContain("🟡 Medium Issue: Missing meta descriptions on sampled pages");
    expect(qa.ok).toBe(true);
  });

  it("normalizes malformed markdown tables before report QA", () => {
    const malformed = [
      "# Technical SEO Audit Report",
      "🟢 Coverage: sampled crawl completed.",
      "🟡 Medium Issue: Metadata rows need cleanup",
      "Fix: Normalize table rows.",
      "Score: 82/100 🟡",
      "| Metric | Value | Notes |",
      "| Missing descriptions | 2 | Title A | Title B |",
      "| Broken pages | 0 | OK |",
      "x".repeat(3200),
    ].join("\n");
    const normalized = normalizeMarkdownTables(malformed);
    const qa = validateAuditReportQuality(normalized, { summary: { pages_crawled: 12 }, quality: { score: 82 } }, {}, {});

    expect(normalized).toContain("| --- | --- | --- |");
    expect(normalized).toContain("| Missing descriptions | 2 | Title A / Title B |");
    expect(qa.ok).toBe(true);
  });

  it("falls back from blocked Google web search to DuckDuckGo", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("blocked", { status: 451 }))
      .mockResolvedValueOnce(new Response("Title: example at DuckDuckGo\nhttps://example.com", { status: 200 }));

    const result = await webSearchTool("site:example.com");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("duckduckgo");
    expect(result.snippets).toContain("https://example.com");
  });

  it("uses DataForSEO Google SERP before proxy search when credentials are present", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      status_code: 20000,
      tasks: [{
        status_code: 20000,
        result: [{
          items: [{
            type: "organic",
            rank_group: 1,
            title: "Example result",
            url: "https://example.com/",
            domain: "example.com",
            description: "Example description",
          }],
        }],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await webSearchTool("site:example.com", {
      dataforseo: { login: "user", password: "pass" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.dataforseo.com/v3/serp/google/organic/live/advanced");
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("dataforseo-google");
    expect(result.results[0].url).toBe("https://example.com/");
  });

  it("surfaces DataForSEO SERP API errors without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      status_code: 40100,
      status_message: "Invalid login or password",
      tasks: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await dataForSeoSerpSearch("site:example.com", { login: "bad", password: "bad" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid login or password");
    expect(result.provider).toBe("dataforseo-google");
  });

  it("loads backlink analysis through the same-origin DataForSEO API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      target: "example.com",
      summary: { backlinks: 12, referring_domains: 3 },
      backlinks: [{ url_from: "https://partner.example/post", dofollow: true, anchor: "Example" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await dataForSeoBacklinkAnalysis("https://www.example.com/path", { login: "user", password: "pass" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/dataforseo/backlinks");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).target).toBe("example.com");
    expect(result.ok).toBe(true);
    expect(result.summary.backlinks).toBe(12);
    expect(result.backlinks[0].url_from).toBe("https://partner.example/post");
  });

  it("reports missing DataForSEO credentials before backlink analysis", async () => {
    const result = await dataForSeoBacklinkAnalysis("example.com", {});

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Connect DataForSEO credentials");
  });

  it("extracts and classifies backlinks from referring page HTML", () => {
    const links = extractBacklinkAnchors(`
      <article><p><a href="https://example.com/pricing">commercial anchor</a></p></article>
      <footer><a href="https://example.com/blog" rel="nofollow ugc">community mention</a></footer>
      <a href="https://other.test">ignore</a>
    `, "https://source.test/post", "example.com");

    expect(links).toHaveLength(2);
    expect(links[0].dofollow).toBe(true);
    expect(links[1].dofollow).toBe(false);
    expect(links[1].ugc).toBe(true);
    expect(["content", "footer", "unknown"]).toContain(links[0].placement);
    expect(links[1].placement).toBe("footer");
  });

  it("runs Helio native backlink analysis against manual candidates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(`
      <html><head><title>Partner resource list</title></head>
      <body><p>Useful automation resources.</p><a href="https://example.com/">Example</a>${"content ".repeat(200)}</body></html>
    `, { status: 200, headers: { "Content-Type": "text/html" } }));

    const result = await analyzeHelioBacklinks({
      target: "https://www.example.com",
      candidates: ["https://example.org/resources"],
      discover: false,
      expandNeighborhood: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("helio-native");
    expect(result.summary.backlinks).toBe(1);
    expect(result.summary.referring_domains).toBe(1);
    expect(result.backlinks[0].url_from).toBe("https://example.org/resources");
    expect(result.backlinks[0].dofollow).toBe(true);
    expect(result.backlinks[0].source_type).toBeDefined();
    expect(typeof result.backlinks[0].confidence).toBe("number");
    expect(Array.isArray(result.backlinks[0].confidence_reasons)).toBe(true);
  });

  it("deduplicates repeated links from the same referring page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(`
      <html><head><title>Partner list</title></head><body>
      <a href="https://example.com/?utm_source=newsletter">Example One</a>
      <a href="https://example.com/">Example Two</a>
      </body></html>
    `, { status: 200, headers: { "Content-Type": "text/html" } }));

    const result = await analyzeHelioBacklinks({
      target: "example.com",
      candidates: ["https://example.org/resources"],
      discover: false,
      expandNeighborhood: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.summary.backlinks).toBe(1);
    expect(result.summary.raw_link_hits).toBe(2);
    expect(result.backlinks[0].url_to).toBe("https://example.com/");
    expect(result.backlinks[0].occurrences).toBe(2);
  });

  it("expands discovery by crawling same-host neighborhood pages", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(`
        <html><body><a href="https://example.com/">Primary mention</a></body></html>
      `, { status: 200, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(`
        <html><body><a href="/resources">Resources</a></body></html>
      `, { status: 200, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(`
        <html><body><a href="https://example.com/pricing">Secondary mention</a></body></html>
      `, { status: 200, headers: { "Content-Type": "text/html" } }));

    const result = await analyzeHelioBacklinks({
      target: "example.com",
      candidates: ["https://example.org/post"],
      discover: false,
      maxCandidates: 20,
      discoveryOptions: { maxExpansionHosts: 2, maxExpansionLinksPerHost: 5 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    expect((result.diagnostics?.expandedCandidates || []).length).toBe(1);
    expect(result.summary.candidates_checked).toBe(2);
    expect(result.summary.backlinks).toBe(2);
    expect(result.backlinks.some((b) => b.url_from === "https://example.org/resources")).toBe(true);
  });

  it("discovers backlink candidates from DuckDuckGo redirect result links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(`
      ## [OmniSocials - Crunchbase Company Profile](http://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.crunchbase.com%2Forganization%2Fomnisocials&rut=abc)
      [www.crunchbase.com/organization/omnisocials](http://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.crunchbase.com%2Forganization%2Fomnisocials&rut=abc)
    `, { status: 200, headers: { "Content-Type": "text/plain" } }));

    const candidates = await discoverBacklinkCandidates("omnisocials.com", {
      maxDiscovered: 1,
      maxSearchProviders: 1,
      maxQueries: 1,
      includeExternalIndexes: false,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      url: "https://www.crunchbase.com/organization/omnisocials",
      source: "serp:duckduckgo",
      query: "\"omnisocials.com\" -site:omnisocials.com",
      page: 0,
    });
  });

  it("builds diversified discovery queries from a target host", () => {
    const queries = __internal_buildDiscoveryQueries("https://www.markaz.app");
    expect(queries.length).toBeGreaterThanOrEqual(6);
    expect(queries.some((q) => q.includes("\"markaz.app\""))).toBe(true);
    expect(queries.some((q) => q.includes("review") || q.includes("alternative"))).toBe(true);
  });

  it("persists queue cycle history for crawl operations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(`
      <html><body><a href="https://example.com/">Example</a></body></html>
    `, { status: 200, headers: { "Content-Type": "text/html" } }));

    const orgScope = `test_scope_${Date.now()}`;
    const target = "example.com";
    const out = await analyzeAndUpdateBacklinkIndex({
      orgScope,
      target,
      candidates: ["https://example.org/resources"],
      discover: false,
      maxCandidates: 5,
      queueBatchSize: 5,
    });
    expect(out.ok).toBe(true);
    const loaded = await loadBacklinkIndex(orgScope, target);
    expect(Array.isArray(loaded.queueCycles)).toBe(true);
    expect(loaded.queueCycles.length).toBeGreaterThan(0);
    expect(loaded.queueCycles[loaded.queueCycles.length - 1].mode).toBe("crawl");
  });

  it("runs enqueue -> crawl_scope queue transition flow", async () => {
    const orgScope = `flow_scope_${Date.now()}`;
    const target = "example.com";
    await importBacklinkCandidates({
      orgScope,
      target,
      candidates: ["https://example.org/resources"],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(`
      <html><body><a href="https://example.com/">Flow Link</a></body></html>
    `, { status: 200, headers: { "Content-Type": "text/html" } }));

    const cycle = await crawlBacklinkQueueForScope({
      orgScope,
      queueBatchSize: 10,
      maxCandidates: 10,
    });
    expect(cycle.ok).toBe(true);
    expect(cycle.targets).toBeGreaterThan(0);

    const loaded = await loadBacklinkIndex(orgScope, target);
    expect(loaded.queue.completed.length + loaded.queue.failed.length).toBeGreaterThan(0);
    expect(Array.isArray(loaded.queueCycles)).toBe(true);
    expect(loaded.queueCycles.some((c) => c.mode === "crawl_scope")).toBe(true);
  });

  it("extracts candidate URLs from markdown SERP snippets while filtering target host", () => {
    const urls = __internal_extractUrlsFromSearchText(`
      ## [Partner Page](https://example.org/post?id=1&utm_source=x)
      ## [Target Site](https://markaz.app/blog)
      ## [Localhost Noise](http://localhost/internal)
      ## [Private Noise](http://192.168.1.9/private)
      [Other](https://example.net/resources)
    `, "markaz.app");
    expect(urls).toContain("https://example.org/post?id=1");
    expect(urls).toContain("https://example.net/resources");
    expect(urls.some((u) => u.includes("markaz.app"))).toBe(false);
    expect(urls.some((u) => u.includes("localhost"))).toBe(false);
    expect(urls.some((u) => u.includes("192.168.1.9"))).toBe(false);
  });

  it("normalizes native backlink targets to bare hosts", () => {
    expect(normalizeBacklinkTarget("https://www.example.com/path?q=1")).toBe("example.com");
  });

  it("blocks private URLs from native backlink fetching", async () => {
    await expect(isSafePublicHttpUrl("http://127.0.0.1:5050/internal")).resolves.toBe(false);
    await expect(isSafePublicHttpUrl("file:///etc/passwd")).resolves.toBe(false);
  });

  it("merges native backlink runs into a persistent link index", () => {
    const imported = parseCandidateText("https://example.org/a\nhttps://example.org/a, https://example.net/b");
    expect(imported).toEqual(["https://example.org/a", "https://example.net/b"]);

    const index = mergeAnalysisIntoIndex({ orgScope: "default", target: "example.com" }, {
      target: "example.com",
      provider: "helio-native",
      backlinks: [{
        url_from: "https://example.org/a",
        url_to: "https://example.com/",
        anchor: "Example",
        dofollow: true,
        page_from_rank: 72,
      }],
      diagnostics: {
        candidates: [{ url: "https://example.org/a", source: "manual" }],
        verifiedPages: [{ ok: true, url_from: "https://example.org/a", source: "manual", links: 1 }],
      },
    });
    const formatted = formatBacklinkIndex(index);

    expect(formatted.summary.backlinks).toBe(1);
    expect(formatted.summary.referring_domains).toBe(1);
    expect(formatted.index.candidates).toHaveLength(1);
    expect(formatted.backlinks[0].status).toBe("live");
    expect(formatted.summary.queue_pending).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(formatted.index.queue?.pending)).toBe(true);
  });

  it("does not classify a plan-only autonomous PR as resolved-auto", () => {
    expect(autonomousResolveStatus(true)).toBe("resolved-auto");
    expect(autonomousResolveStatus(false)).toBe("autopatch-unavailable");
    expect(normalizeMissionStatus("resolved-plan-only")).toBe("autopatch-unavailable");
    expect(isAutonomousPlanOnlyResolve({ status: "resolved-auto", resolveResult: "autonomous-plan-only" })).toBe(true);
  });

  it("fails mission verification for plan-only autopatch output", () => {
    const checks = buildMissionVerificationChecks(
      {
        status: "autopatch-unavailable",
        resolveResult: "autonomous-plan-only",
        affectedCount: 1,
        failureReason: "",
      },
      { hasShipTarget: true }
    );

    expect(checks.filter((check) => check.pass)).toHaveLength(3);
    expect(checks.find((check) => check.label === "No plan-only autopatch fallback")?.pass).toBe(false);
    expect(checks.find((check) => check.label === "Issue evidence dropped to zero affected pages")?.pass).toBe(false);
  });

  it("requires post-deploy evidence before resolved-verified can pass", () => {
    const checks = buildMissionVerificationChecks(
      {
        status: "resolved-verified",
        affectedCount: 0,
        postDeployVerified: false,
        failureReason: "",
      },
      { hasShipTarget: true }
    );

    expect(checks.find((check) => check.label === "Post-deploy Helio Core verification completed")?.pass).toBe(false);
  });

  it("builds valid Helio Code job payloads from missions", () => {
    const payload = buildHelioCodeJobPayload({
      mission: {
        id: "ms_1",
        title: "Fix: Sitemap missing",
        reason: "sitemap.xml returned 404",
        priority: "P2",
        severity: "medium",
        affectedCount: 1,
      },
      orgId: "org_1",
      domain: "example.com",
      repo: "acme/site",
    });

    expect(payload.issueType).toBe("sitemap");
    expect(payload.skillId).toBe("technical-sitemap");
    expect(validateHelioCodeJobPayload(payload).ok).toBe(true);
  });

  it("selects Helio Code skills for technical and AEO/GEO issues", () => {
    expect(inferHelioCodeIssueType({ title: "Add Organization schema for AEO visibility" })).toBe("schema");
    expect(selectHelioCodeSkill({ issueType: "schema", framework: "nextjs-app-router" }).id).toBe("technical-schema");
    expect(selectHelioCodeSkill({ issueType: "broken-link", framework: "vite-static" }).id).toBe("technical-links");
  });

  it("creates queued Helio Code job records with selected skill metadata", () => {
    const payload = buildHelioCodeJobPayload({
      mission: { id: "ms_2", title: "Missing meta descriptions", priority: "P3", severity: "low" },
      orgId: "org_1",
      domain: "example.com",
      repo: "acme/site",
    });
    const created = createHelioCodeJobRecord(payload, new Date("2026-05-18T09:00:00.000Z"));

    expect(created.ok).toBe(true);
    expect(created.job.status).toBe("code-queued");
    expect(created.job.payload.skillId).toBe("technical-metadata");
    expect(created.job.logs[0].message).toContain("Helio Code job queued");
  });

  it("creates a signed GitHub App JWT without leaking repo tokens into the client contract", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" });
    const token = createGitHubAppJwt({ appId: "12345", privateKey: pem, now: 1779096000 });

    expect(token.split(".")).toHaveLength(3);
    expect(token).not.toContain("PRIVATE KEY");
  });

  it("builds a real keyword roadmap from GSC evidence and local service inputs", () => {
    const plan = buildKeywordIntelPlan({
      wizard: {
        goal: "local",
        category: "AI automation agency",
        services: "AI automation\nworkflow automation",
        locations: "New York",
        audiences: "startups",
      },
      project: {
        gsc: {
          topKeywords: [
            { keys: ["ai automation agency new york"], clicks: 7, impressions: 550, ctr: 0.012, position: 8.4 },
            { keys: ["workflow automation services"], clicks: 3, impressions: 240, ctr: 0.018, position: 14.2 },
          ],
          serpOpportunities: [
            { query: "ai automation agency new york", page: "https://helio.test/ai-automation/", serpTarget: "Low CTR query" },
          ],
          topPages: [{ keys: ["https://helio.test/ai-automation/"] }],
        },
        audit: { templatePatterns: [{ pattern: "ai-automation", pages: 1 }] },
      },
    });

    expect(plan.inventory.length).toBeGreaterThan(4);
    expect(plan.currentCount).toBe(2);
    expect(plan.confidence).toBe("medium");
    expect(plan.inventory.find((row) => row.keyword === "ai automation agency new york")).toMatchObject({
      source: "gsc",
      page: "https://helio.test/ai-automation/",
      recommendedAction: "Refresh title/meta and answer intent above fold",
    });
    expect(plan.inventory.some((row) => row.keyword === "ai automation in new york" && row.source === "generated")).toBe(true);
    expect(plan.clusters.length).toBeGreaterThan(0);
    expect(plan.clusters[0].rows.length).toBeGreaterThan(0);
  });

  it("creates full saved roadmap work packages with stable ids and keyword rows", () => {
    const plan = buildKeywordIntelPlan({
      wizard: { goal: "organic", category: "SEO software", services: "technical SEO audit", locations: "", audiences: "" },
      project: {
        gsc: {
          topKeywords: [
            { keys: ["technical seo audit checklist"], clicks: 5, impressions: 400, ctr: 0.02, position: 9 },
          ],
        },
      },
    });
    const cluster = plan.clusters[0];
    const saved = selectedRoadmapFromKeywordCluster(cluster, {
      userPriority: "P1",
      status: "active",
      selectedAt: "2026-05-18T00:00:00.000Z",
    });

    expect(saved.id).toBe(roadmapIdForCluster(cluster));
    expect(saved.userPriority).toBe("P1");
    expect(saved.status).toBe("active");
    expect(saved.supportingKeywords).toEqual(cluster.rows.map((row) => row.keyword));
    expect(saved.rows).toEqual(cluster.rows);
    expect(saved.helioScore).toBe(cluster.priorityScore);
  });

  it("orders selected roadmap priority before Helio score", () => {
    const rows = [
      { primaryKeyword: "later high score", userPriority: "P4", helioScore: 99 },
      { primaryKeyword: "critical lower score", userPriority: "P1", helioScore: 30 },
      { primaryKeyword: "high priority", userPriority: "P2", helioScore: 80 },
    ].sort((a, b) => priorityRank(a.userPriority) - priorityRank(b.userPriority) || Number(b.helioScore || 0) - Number(a.helioScore || 0));

    expect(rows.map((row) => row.primaryKeyword)).toEqual([
      "critical lower score",
      "high priority",
      "later high score",
    ]);
  });

  it("feeds Content Engine from selected Keyword Intel roadmaps before GSC fallback", () => {
    const ctx = buildContentEngineContext({
      host: "helio.test",
      projectData: {
        keywordIntel: {
          selectedRoadmaps: [
            {
              id: "p3",
              primaryKeyword: "low priority content",
              supportingKeywords: ["low support"],
              userPriority: "P3",
              helioScore: 99,
              status: "queued",
              targetPage: "/low/",
              contentType: "blog",
              action: "Write later",
            },
            {
              id: "p1",
              primaryKeyword: "first page seo roadmap",
              supportingKeywords: ["seo content calendar", "keyword content plan"],
              userPriority: "P1",
              helioScore: 55,
              status: "active",
              targetPage: "/seo-roadmap/",
              contentType: "pillar",
              action: "Create pillar page",
            },
          ],
          selectedKeywords: [{ keyword: "saved keyword" }],
        },
        gsc: {
          topKeywords: [{ keys: ["gsc fallback keyword"] }],
          topPages: [{ keys: ["/existing-page/"] }],
        },
      },
    });

    expect(ctx.source).toBe("keyword-roadmap");
    expect(ctx.activeRoadmap.primaryKeyword).toBe("first page seo roadmap");
    expect(ctx.contentTopic).toBe("first page seo roadmap");
    expect(ctx.seedKeywords.slice(0, 3)).toEqual([
      "first page seo roadmap",
      "seo content calendar",
      "keyword content plan",
    ]);
    expect(ctx.seedKeywords).toContain("saved keyword");
    expect(ctx.seedKeywords).toContain("gsc fallback keyword");
  });

  it("lets manual Content Engine keywords override roadmap source", () => {
    const ctx = buildContentEngineContext({
      manualTopic: "Manual Topic",
      manualKeywords: "manual kw one, manual kw two",
      projectData: {
        keywordIntel: {
          selectedRoadmaps: [{ primaryKeyword: "roadmap keyword", userPriority: "P1", helioScore: 100 }],
        },
      },
    });

    expect(ctx.source).toBe("manual");
    expect(ctx.contentTopic).toBe("Manual Topic");
    expect(ctx.seedKeywords.slice(0, 2)).toEqual(["manual kw one", "manual kw two"]);
  });

  it("builds a content plan from selected roadmap priority order", () => {
    const ctx = buildContentEngineContext({
      projectData: {
        keywordIntel: {
          selectedRoadmaps: [
            { primaryKeyword: "p2 keyword", userPriority: "P2", helioScore: 90, contentType: "comparison", targetPage: "/p2/", action: "Build comparison page" },
            { primaryKeyword: "p1 keyword", userPriority: "P1", helioScore: 40, contentType: "guide", targetPage: "new page", action: "Create guide" },
          ],
        },
      },
    });

    const plan = buildContentPlanFromContext(ctx);

    expect(plan[0]).toMatchObject({
      order: 1,
      priority: "P1",
      primaryKeyword: "p1 keyword",
      assetType: "Pillar Page",
      angle: "Create guide",
    });
    expect(plan[1]).toMatchObject({
      priority: "P2",
      primaryKeyword: "p2 keyword",
      assetType: "Comparison Page",
    });
  });

  it("builds weekly calendar rows from plan with keyword mapping", () => {
    const rows = buildCalendarFromPlan([
      {
        priority: "P1",
        primaryKeyword: "marketing tools for social media",
        assetType: "Pillar Page",
        targetPage: "/marketing-tools/",
        supportingKeywords: ["best marketing tools", "social media tools list"],
      },
    ], { cadence: "weekly", postsPerWeek: 2, horizonMonths: 1 }, new Date("2026-05-01T00:00:00.000Z"));

    expect(rows.length).toBe(8);
    expect(rows[0]).toMatchObject({
      priority: "P1",
      primaryKeyword: "marketing tools for social media",
      supportKeyword: "best marketing tools",
      targetPage: "/marketing-tools/",
    });
    expect(rows[0].publishDate).toBe("2026-05-01");
  });

  it("builds daily calendar rows using posts-per-day setting", () => {
    const rows = buildCalendarFromPlan([
      { priority: "P2", primaryKeyword: "best marketing tools", assetType: "Blog Post", targetPage: "new page", supportingKeywords: [] },
    ], { cadence: "daily", postsPerDay: 2, horizonMonths: 1 }, new Date("2026-05-10T00:00:00.000Z"));

    expect(rows.length).toBe(60);
    expect(rows[0].slotLabel).toBe("D1");
    expect(rows[1].slotLabel).toBe("D2");
    expect(rows[0].publishDate).toBe("2026-05-10");
    expect(rows[2].publishDate).toBe("2026-05-11");
  });
});
