// ============================================================
// lib/audit-types.ts
// Full TypeScript schema for Helio audit JSON output.
// Import this wherever you need type safety on audit data.
// ============================================================

export type IssueLevelType = "critical" | "high" | "medium" | "low";
export type PriorityType = "critical" | "high" | "medium" | "low";

interface AuditMeta {
  domain: string;
  date: string;           // YYYY-MM-DD
  auditor: string;
  skillVersion: string;
}

interface GSCData {
  clicks: number;
  impressions: number;
  ctr: string;
  avgPosition: string;
  topQuery?: string;
}

interface GA4Data {
  sessions: number;
  users: number;
  pageviews: number;
}

interface TopWin {
  title: string;
  desc: string;
}

interface ExecutiveSummary {
  overallScore: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  pagesIndexed: string;
  gsc?: GSCData;
  ga4?: GA4Data;
  topWins: TopWin[];
}

interface CategoryScore {
  category: string;
  score: number | null;
  weight: string;
  na?: boolean;
  unknown?: boolean;
}

export interface AuditIssue {
  level: IssueLevelType;
  text: string;
  fix: string;
}

// Table rows: either 2-col [key, value] or multi-col [col1, col2, col3, ...]
export type TableRow = string[];

export interface PhaseSubsection {
  id: string;             // e.g. "1.1", "4.2"
  title: string;
  table?: TableRow[];
  issues?: AuditIssue[];
  score?: number | null;
  na?: boolean;
  unknown?: boolean;
  naNote?: string;
}

export interface AuditPhase {
  id: number;
  title: string;
  table?: TableRow[];
  findings?: string;
  subsections: PhaseSubsection[];
}

interface PriorityMatrixItem {
  priority: PriorityType;
  issue: string;
  pages: string;
  impact: string;
  fix: string;
}

interface QuickWin {
  time: string;           // e.g. "30 min", "2 hrs", "1 week"
  title: string;
  desc: string;
}

interface CrawledUrl {
  url: string;
  status: string;
  loadTime: string;
  notes: string;
}

interface ManualVerificationUrl {
  tool: string;
  url: string;
  check: string;
}

interface AuditAppendices {
  crawledUrls: CrawledUrl[];
  manualUrls: ManualVerificationUrl[];
  sitemapNote?: string;
  schemaNote?: string;
  redirectChains?: Array<{ chain: string; expected: string; actual: string; status: string }>;
}

interface AuditRemediationSummary {
  healthyChecks: number;
  openFixes: number;
  executedFixes: number;
  approvalBlockedFixes: number;
}

// ─── THE MAIN AUDIT REPORT TYPE ───────────────────────────────────────────────
export interface AuditReport {
  meta: AuditMeta;
  executiveSummary: ExecutiveSummary;
  categoryScores: CategoryScore[];
  weightedScore: number;
  phases: AuditPhase[];
  priorityMatrix: PriorityMatrixItem[];
  quickWins: QuickWin[];
  appendices: AuditAppendices;
  remediationSummary?: AuditRemediationSummary;
}
