"use client";

// ============================================================
// components/AuditReportRenderer.tsx
//
// DROP-IN COMPONENT — Add to any page in your Next.js app.
//
// Usage:
//   import { AuditReportRenderer } from "@/components/AuditReportRenderer";
//   <AuditReportRenderer data={auditJson} onDownloadPDF={handlePDF} />
//
// Props:
//   data          — AuditReport JSON object from Helio
//   onDownloadPDF — optional callback; if omitted, PDF button is hidden
//   className     — optional wrapper class
// ============================================================

import React, { useState, useRef, useCallback } from "react";
import type { AuditReport, AuditPhase, PhaseSubsection, AuditIssue, TableRow } from "../lib/audit-types";
import {
  getScoreColor, getScoreEmoji, getScoreLabel,
  getPriorityConfig, parseInlineText, formatAuditDate,
} from "../lib/audit-utils";

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface AuditReportRendererProps {
  data: AuditReport;
  onDownloadPDF?: () => void;
  className?: string;
}

// ─── TINY PRIMITIVES ──────────────────────────────────────────────────────────

const InlineCode = ({ children }: { children: React.ReactNode }) => (
  <code style={{
    background: "#101010", border: "1px solid #2a2a2a",
    borderRadius: 3, padding: "1px 5px",
    fontSize: "0.82em", fontFamily: "monospace",
    color: "#c8ff00",
  }}>{children}</code>
);

const RichText = ({ text }: { text: string }) => {
  const parts = parseInlineText(text);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "code") return <InlineCode key={i}>{part.content}</InlineCode>;
        if (part.type === "bold") return <strong key={i}>{part.content}</strong>;
        return <React.Fragment key={i}>{part.content}</React.Fragment>;
      })}
    </>
  );
};

// ─── SCORE BAR ────────────────────────────────────────────────────────────────

const ScoreBar = ({ score }: { score: number }) => {
  const color = getScoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontWeight: 700, color, fontSize: "0.85em", minWidth: 32, textAlign: "right" }}>{score}</span>
    </div>
  );
};

// ─── DATA TABLE ───────────────────────────────────────────────────────────────

const DataTable = ({ rows }: { rows: TableRow[] }) => {
  if (!rows?.length) return null;
  const isMultiCol = rows[0].length > 2;

  return (
    <div style={{ overflowX: "auto", margin: "12px 0", borderRadius: 6, border: "1px solid #1a1a1a" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84em" }}>
        {isMultiCol && (
          <thead>
            <tr>
              {rows[0].map((h, i) => (
                <th key={i} style={{
                  padding: "8px 12px", textAlign: "left", fontWeight: 600,
                  background: "#0a0a0a", borderBottom: "2px solid #1a1a1a",
                  color: "#cfcfcf", fontSize: "0.79em",
                  textTransform: "uppercase", letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}><RichText text={h} /></th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(isMultiCol ? rows.slice(1) : rows).map((row, ri) => (
            <tr key={ri} style={{ borderBottom: "1px solid #101010" }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "8px 12px",
                  fontWeight: !isMultiCol && ci === 0 ? 600 : 400,
                  color: !isMultiCol && ci === 0 ? "#cfcfcf" : "#b8b8b8",
                  background: ri % 2 === 0 ? "#070707" : "#0b0b0b",
                  verticalAlign: "top", wordBreak: "break-word",
                  maxWidth: !isMultiCol && ci === 0 ? 200 : undefined,
                }}><RichText text={cell} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── ISSUE BLOCK ──────────────────────────────────────────────────────────────

const IssueBlock = ({ issue }: { issue: AuditIssue }) => {
  const cfg = getPriorityConfig(issue.level);
  return (
    <div style={{
      margin: "14px 0", padding: "14px 16px",
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderLeft: `4px solid ${cfg.badge}`, borderRadius: "0 6px 6px 0",
    }}>
      <p style={{ margin: "0 0 10px", color: cfg.text, lineHeight: 1.65, fontSize: "0.875em" }}>
        <span style={{ fontWeight: 700 }}>{cfg.emoji} {cfg.label} Issue: </span>
        <RichText text={issue.text} />
      </p>
      <div style={{
        padding: "10px 12px", background: "#111111",
        borderRadius: 4, border: "1px solid #222222",
      }}>
        <p style={{ margin: 0, color: "#e0e0e0", fontSize: "0.85em", lineHeight: 1.65 }}>
          <strong>Fix: </strong><RichText text={issue.fix} />
        </p>
      </div>
    </div>
  );
};

// ─── SUBSECTION ───────────────────────────────────────────────────────────────

const Subsection = ({ sub }: { sub: PhaseSubsection }) => (
  <div style={{ marginBottom: 24 }}>
    <h4 style={{ margin: "18px 0 8px", fontSize: "0.93em", fontWeight: 700, color: "#e0e0e0", display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        background: "#1a1a1a", color: "#8a8a8a",
        padding: "2px 8px", borderRadius: 4,
        fontSize: "0.78em", fontWeight: 600, letterSpacing: "0.03em",
        flexShrink: 0,
      }}>{sub.id}</span>
      {sub.title}
    </h4>

    {sub.table && <DataTable rows={sub.table} />}
    {sub.issues?.map((issue, i) => <IssueBlock key={i} issue={issue} />)}

    {sub.naNote && (
      <div style={{
        padding: "10px 14px", background: "#0a0a0a",
        border: "1px solid #1a1a1a", borderRadius: 6, margin: "10px 0",
      }}>
        <p style={{ margin: 0, color: "#666", fontSize: "0.84em", lineHeight: 1.65 }}>
          <RichText text={sub.naNote} />
        </p>
      </div>
    )}

    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      marginTop: 10, paddingTop: 8,
      borderTop: "1px dashed #1a1a1a",
    }}>
      <span style={{ fontSize: "0.79em", color: "#8a8a8a", fontWeight: 600 }}>Section Score:</span>
      {sub.na && <span style={{ fontSize: "0.85em", color: "#8a8a8a", fontWeight: 700 }}>🟡 N/A — Not Applicable</span>}
      {sub.unknown && <span style={{ fontSize: "0.85em", color: "#8a8a8a", fontWeight: 700 }}>⚠️ Unknown — Data Unavailable</span>}
      {!sub.na && !sub.unknown && sub.score != null && (
        <span style={{ fontWeight: 700, color: getScoreColor(sub.score), fontSize: "0.88em" }}>
          {getScoreEmoji(sub.score)} {sub.score}/100
        </span>
      )}
    </div>
  </div>
);

// ─── PHASE SECTION ────────────────────────────────────────────────────────────

const PhaseSection = ({ phase }: { phase: AuditPhase }) => (
  <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #1a1a1a" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "#0f172a", color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.83em", fontWeight: 700, flexShrink: 0,
      }}>{phase.id}</div>
      <h3 style={{ margin: 0, fontSize: "1.05em", fontWeight: 700, color: "#e0e0e0" }}>
        Phase {phase.id} — {phase.title}
      </h3>
    </div>

    {phase.table && <DataTable rows={phase.table} />}

    {phase.findings && (
      <div style={{
        padding: "12px 16px", background: "#f0f9ff",
        border: "1px solid #bae6fd", borderRadius: 6, margin: "12px 0",
      }}>
        <p style={{ margin: 0, color: "#0c4a6e", fontSize: "0.87em", lineHeight: 1.7 }}>
          <strong>Findings: </strong><RichText text={phase.findings} />
        </p>
      </div>
    )}

    {phase.subsections?.map((sub, i) => <Subsection key={i} sub={sub} />)}
  </div>
);

// ─── NAV TABS ─────────────────────────────────────────────────────────────────

type TabId = "summary" | "scores" | "phases" | "matrix" | "quickwins" | "appendix";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "summary",   label: "Summary"    },
  { id: "scores",    label: "Scores"     },
  { id: "phases",    label: "Phases"     },
  { id: "matrix",    label: "Issues"     },
  { id: "quickwins", label: "Quick Wins" },
  { id: "appendix",  label: "Appendix"   },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function AuditReportRenderer({
  data,
  onDownloadPDF,
  className,
}: AuditReportRendererProps) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const reportRef = useRef<HTMLDivElement>(null);

  const d = data;
  const scoreColor = getScoreColor(d.weightedScore);
  const scoreEmoji = getScoreEmoji(d.weightedScore);

  // Priority counts from matrix
  const counts = {
    critical: d.priorityMatrix?.filter((i) => i.priority === "critical").length ?? 0,
    high:     d.priorityMatrix?.filter((i) => i.priority === "high").length ?? 0,
    medium:   d.priorityMatrix?.filter((i) => i.priority === "medium").length ?? 0,
    low:      d.priorityMatrix?.filter((i) => i.priority === "low").length ?? 0,
  };

  return (
    <div ref={reportRef} className={className} style={{ fontFamily: "monospace", background: "#0a0a0a", minHeight: "100vh" }}>

      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <div style={{
        background: "#060606", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
        borderBottom: "1px solid #1a1a1a",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#c8ff00", fontWeight: 800, fontSize: "0.93em" }}>HELIO · SEO AUDIT</span>
          <span style={{ color: "#334155" }}>|</span>
          <span style={{ color: "#666", fontSize: "0.82em", fontFamily: "monospace" }}>{d.meta.domain}</span>
          <span style={{ color: "#334155" }}>|</span>
          <span style={{ color: "#666", fontSize: "0.82em" }}>{formatAuditDate(d.meta.date)}</span>
        </div>

        {onDownloadPDF && (
          <button
            onClick={onDownloadPDF}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#c8ff00",
              border: "1px solid #c8ff00", borderRadius: 0, color: "#000",
              padding: "7px 14px", cursor: "pointer",
              fontSize: "0.8em", fontWeight: 700, letterSpacing: "0.02em",
            }}
          >
            ↓ Download PDF
          </button>
        )}
      </div>

      {/* ── NAV ───────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#060606", borderBottom: "1px solid #1a1a1a",
        padding: "0 24px", display: "flex", gap: 2, overflowX: "auto",
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "11px 16px", border: "none", background: "none",
              cursor: "pointer", fontSize: "0.82em",
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? "#c8ff00" : "#666",
              borderBottom: activeTab === tab.id ? "2px solid #c8ff00" : "2px solid transparent",
              whiteSpace: "nowrap", transition: "all 0.15s",
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── CONTENT ───────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px" }}>

        {/* ════ SUMMARY ════════════════════════════════════════════════════ */}
        {activeTab === "summary" && (
          <div>
            {/* Hero card */}
            <div style={{
              background: "linear-gradient(135deg,#10160a,#223312)",
              borderRadius: 12, padding: 28, marginBottom: 20, color: "white",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
                <div>
                  <p style={{ margin: "0 0 4px", color: "#8a8a8a", fontSize: "0.75em", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>HELIO Technical SEO Audit Report</p>
                  <h1 style={{ margin: "0 0 6px", fontSize: "1.5em", fontWeight: 800, letterSpacing: "-0.02em" }}>{d.meta.domain}</h1>
                  <p style={{ margin: 0, color: "#475569", fontSize: "0.8em" }}>{d.meta.skillVersion} · {d.meta.auditor}</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2.8em", fontWeight: 900, color: scoreColor, lineHeight: 1, letterSpacing: "-0.03em" }}>{d.weightedScore}</div>
                  <div style={{ color: "#8a8a8a", fontSize: "0.72em", fontWeight: 600, marginTop: 2 }}>/ 100 OVERALL</div>
                  <div style={{ fontSize: "1.3em", marginTop: 4 }}>{scoreEmoji}</div>
                </div>
              </div>

              {/* Issue count pills */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 22 }}>
                {([
                  ["Critical", counts.critical, "#ef4444"],
                  ["High",     counts.high,     "#f97316"],
                  ["Medium",   counts.medium,   "#eab308"],
                  ["Low",      counts.low,      "#22c55e"],
                ] as [string, number, string][]).map(([label, count, color]) => (
                  <div key={label} style={{ background: "#1a2612", borderRadius: 8, padding: "11px 14px", textAlign: "center", border: "1px solid #2e451b" }}>
                    <div style={{ fontSize: "1.5em", fontWeight: 800, color }}>{count}</div>
                    <div style={{ color: "#666", fontSize: "0.72em", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* GSC + GA4 */}
            {(d.executiveSummary.gsc || d.executiveSummary.ga4) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {d.executiveSummary.gsc && (
                  <div style={{ background: "#060606", borderRadius: 10, padding: 18, border: "1px solid #1a1a1a" }}>
                    <h4 style={{ margin: "0 0 12px", fontSize: "0.77em", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Google Search Console</h4>
                    {Object.entries(d.executiveSummary.gsc).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #101010" }}>
                        <span style={{ color: "#666", fontSize: "0.81em", textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, " $1").trim()}</span>
                        <span style={{ color: "#e0e0e0", fontSize: "0.81em", fontWeight: 600, maxWidth: "55%", textAlign: "right" }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {d.executiveSummary.ga4 && (
                  <div style={{ background: "#060606", borderRadius: 10, padding: 18, border: "1px solid #1a1a1a" }}>
                    <h4 style={{ margin: "0 0 12px", fontSize: "0.77em", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Google Analytics 4</h4>
                    {Object.entries(d.executiveSummary.ga4).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #101010" }}>
                        <span style={{ color: "#666", fontSize: "0.81em", textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, " $1").trim()}</span>
                        <span style={{ color: "#e0e0e0", fontSize: "0.81em", fontWeight: 600 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Top wins */}
            <div style={{ background: "#060606", borderRadius: 10, border: "1px solid #1a1a1a", padding: 20 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "0.93em", fontWeight: 700, color: "#e0e0e0" }}>🏆 Top 3 Wins If Fixed Immediately</h3>
              {d.executiveSummary.topWins.map((win, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: i < d.executiveSummary.topWins.length - 1 ? "1px solid #101010" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e9ece8", color: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.83em", flexShrink: 0 }}>{i + 1}</div>
                  <div>
                    <p style={{ margin: "0 0 3px", fontWeight: 700, color: "#e0e0e0", fontSize: "0.87em" }}>{win.title}</p>
                    <p style={{ margin: 0, color: "#666", fontSize: "0.82em", lineHeight: 1.65 }}><RichText text={win.desc} /></p>
                  </div>
                </div>
              ))}
            </div>

            {!!d.remediationSummary && (
              <div style={{ marginTop: 16, background: "#060606", borderRadius: 10, border: "1px solid #1a1a1a", padding: 16 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: "0.88em", fontWeight: 700, color: "#e0e0e0" }}>Remediation Status</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
                  <div style={{ border: "1px solid #1a1a1a", padding: "8px 10px" }}>
                    <div style={{ color: "#666", fontSize: "0.72em", textTransform: "uppercase" }}>Healthy Checks</div>
                    <div style={{ color: "#22c55e", fontWeight: 800, marginTop: 4 }}>{Number(d.remediationSummary.healthyChecks || 0)}</div>
                  </div>
                  <div style={{ border: "1px solid #1a1a1a", padding: "8px 10px" }}>
                    <div style={{ color: "#666", fontSize: "0.72em", textTransform: "uppercase" }}>Open Fixes</div>
                    <div style={{ color: "#ef4444", fontWeight: 800, marginTop: 4 }}>{Number(d.remediationSummary.openFixes || 0)}</div>
                  </div>
                  <div style={{ border: "1px solid #1a1a1a", padding: "8px 10px" }}>
                    <div style={{ color: "#666", fontSize: "0.72em", textTransform: "uppercase" }}>Executed Fixes</div>
                    <div style={{ color: "#c8ff00", fontWeight: 800, marginTop: 4 }}>{Number(d.remediationSummary.executedFixes || 0)}</div>
                  </div>
                  <div style={{ border: "1px solid #1a1a1a", padding: "8px 10px" }}>
                    <div style={{ color: "#666", fontSize: "0.72em", textTransform: "uppercase" }}>Approval Blocked</div>
                    <div style={{ color: "#f59e0b", fontWeight: 800, marginTop: 4 }}>{Number(d.remediationSummary.approvalBlockedFixes || 0)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ SCORES ═════════════════════════════════════════════════════ */}
        {activeTab === "scores" && (
          <div style={{ background: "#060606", borderRadius: 10, border: "1px solid #1a1a1a", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a1a" }}>
              <h3 style={{ margin: 0, fontSize: "1em", fontWeight: 700, color: "#e0e0e0" }}>Category Scoreboard</h3>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0a0a0a" }}>
                    {["Category", "Score", "Status", "Weight", "Visual"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.73em", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.categoryScores.map((row, i) => {
                    const color = getScoreColor(row.na || row.unknown ? null : row.score);
                    const label = getScoreLabel(row.score, row.na, row.unknown);
                    const emoji = getScoreEmoji(row.na || row.unknown ? null : row.score);
                    return (
                      <tr key={i} style={{ borderTop: "1px solid #101010" }}>
                        <td style={{ padding: "11px 16px", fontWeight: 600, color: "#e0e0e0", fontSize: "0.86em" }}>{row.category}</td>
                        <td style={{ padding: "11px 16px", fontWeight: 700, color, fontSize: "0.9em" }}>
                          {row.na ? "N/A" : row.unknown ? "?" : `${row.score}/100`}
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, background: `${color}20`, color, fontWeight: 600, fontSize: "0.8em" }}>
                            {emoji} {label}
                          </span>
                        </td>
                        <td style={{ padding: "11px 16px", color: "#666", fontSize: "0.82em" }}>{row.weight}</td>
                        <td style={{ padding: "11px 16px", minWidth: 120 }}>
                          {!row.na && !row.unknown && row.score != null && <ScoreBar score={row.score} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "14px 20px", background: "#0a0a0a", borderTop: "2px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#e0e0e0", fontSize: "0.88em" }}>Weighted Overall Score</span>
              <span style={{ fontWeight: 800, fontSize: "1.05em", color: scoreColor }}>{scoreEmoji} {d.weightedScore} / 100</span>
            </div>
          </div>
        )}

        {/* ════ PHASES ═════════════════════════════════════════════════════ */}
        {activeTab === "phases" && (
          <div>
            {d.phases.map((phase, i) => <PhaseSection key={i} phase={phase} />)}
          </div>
        )}

        {/* ════ ISSUES MATRIX ══════════════════════════════════════════════ */}
        {activeTab === "matrix" && (
          <div style={{ background: "#060606", borderRadius: 10, border: "1px solid #1a1a1a", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: "1em", fontWeight: 700, color: "#e0e0e0" }}>Issues Priority Matrix</h3>
              <div style={{ display: "flex", gap: 6 }}>
                {(["critical","high","medium","low"] as const).map((p) => {
                  const cfg = getPriorityConfig(p);
                  return (
                    <span key={p} style={{ padding: "3px 10px", borderRadius: 999, background: cfg.bg, color: cfg.badge, fontSize: "0.74em", fontWeight: 700, border: `1px solid ${cfg.border}` }}>
                      {cfg.emoji} {d.priorityMatrix.filter((i) => i.priority === p).length} {p}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82em" }}>
                <thead>
                  <tr style={{ background: "#0a0a0a" }}>
                    {["Priority","Issue","Pages","Impact","Fix"].map((h) => (
                      <th key={h} style={{ padding: "9px 13px", textAlign: "left", fontSize: "0.73em", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["critical","high","medium","low"] as const).flatMap((priority) =>
                    d.priorityMatrix
                      .filter((item) => item.priority === priority)
                      .map((item, i) => {
                        const cfg = getPriorityConfig(item.priority);
                        return (
                          <tr key={`${priority}-${i}`} style={{ borderTop: "1px solid #101010" }}>
                            <td style={{ padding: "10px 13px", whiteSpace: "nowrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, background: cfg.bg, color: cfg.badge, fontSize: "0.79em", fontWeight: 700, border: `1px solid ${cfg.border}` }}>
                                {cfg.emoji} {cfg.label}
                              </span>
                            </td>
                            <td style={{ padding: "10px 13px", fontWeight: 600, color: "#e0e0e0", maxWidth: 200 }}><RichText text={item.issue} /></td>
                            <td style={{ padding: "10px 13px", color: "#666" }}>{item.pages}</td>
                            <td style={{ padding: "10px 13px", color: "#666", maxWidth: 200 }}>{item.impact}</td>
                            <td style={{ padding: "10px 13px", color: "#475569", maxWidth: 220 }}><RichText text={item.fix} /></td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════ QUICK WINS ═════════════════════════════════════════════════ */}
        {activeTab === "quickwins" && (
          <div style={{ background: "#060606", borderRadius: 10, border: "1px solid #1a1a1a", padding: 20 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: "1em", fontWeight: 700, color: "#e0e0e0" }}>Quick Win Recommendations (Top 10)</h3>
            <p style={{ margin: "0 0 20px", color: "#8d8d8d", fontSize: "0.82em" }}>Ranked by <strong style={{ color: "#b8b8b8" }}>highest impact vs. lowest effort</strong></p>
            {d.quickWins.map((win, i) => (
              <div key={i} style={{ display: "flex", gap: 16, padding: "14px 0", borderBottom: i < d.quickWins.length - 1 ? "1px solid #171717" : "none" }}>
                <div style={{ flexShrink: 0, textAlign: "center" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: i < 3 ? "#10162a" : i < 6 ? "#121f14" : "#111111", border: i < 3 ? "1px solid #2f56a8" : i < 6 ? "1px solid #295130" : "1px solid #2a2a2a", color: "#c8ff00", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.83em", marginBottom: 4 }}>{i + 1}</div>
                  <span style={{ display: "block", background: "#121212", color: "#a0a0a0", border: "1px solid #252525", borderRadius: 4, padding: "2px 6px", fontSize: "0.67em", fontWeight: 700, whiteSpace: "nowrap" }}>{win.time}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#e0e0e0", fontSize: "0.88em" }}>{win.title}</p>
                  <p style={{ margin: 0, color: "#9a9a9a", fontSize: "0.83em", lineHeight: 1.65 }}><RichText text={win.desc} /></p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════ APPENDIX ═══════════════════════════════════════════════════ */}
        {activeTab === "appendix" && (
          <div>
            {/* Crawled URLs */}
            <div style={{ background: "#060606", borderRadius: 10, border: "1px solid #1a1a1a", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a1a1a" }}>
                <h3 style={{ margin: 0, fontSize: "0.93em", fontWeight: 700, color: "#e0e0e0" }}>Appendix A — Full Crawled URL List</h3>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.81em" }}>
                  <thead>
                    <tr style={{ background: "#0a0a0a" }}>
                      {["URL","Status","Load Time","Notes"].map((h) => (
                        <th key={h} style={{ padding: "8px 13px", textAlign: "left", fontSize: "0.73em", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.appendices.crawledUrls.map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #101010", background: i % 2 === 0 ? "#070707" : "#0b0b0b" }}>
                        <td style={{ padding: "8px 13px", fontFamily: "monospace", fontSize: "0.87em", color: "#e0e0e0", wordBreak: "break-all" }}>{row.url}</td>
                        <td style={{ padding: "8px 13px", whiteSpace: "nowrap" }}>{row.status}</td>
                        <td style={{ padding: "8px 13px", color: "#666", whiteSpace: "nowrap" }}>{row.loadTime}</td>
                        <td style={{ padding: "8px 13px", color: "#666" }}>{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sitemap / Schema notes */}
            {d.appendices.sitemapNote && (
              <div style={{ background: "#1a180f", border: "1px solid #4a3f1f", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                <h4 style={{ margin: "0 0 6px", fontSize: "0.83em", fontWeight: 700, color: "#e8cb7f" }}>Appendix B — Sitemap</h4>
                <p style={{ margin: 0, color: "#ccb071", fontSize: "0.82em", lineHeight: 1.6 }}><RichText text={d.appendices.sitemapNote} /></p>
              </div>
            )}
            {d.appendices.schemaNote && (
              <div style={{ background: "#1a1010", border: "1px solid #4a2222", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                <h4 style={{ margin: "0 0 6px", fontSize: "0.83em", fontWeight: 700, color: "#ff7474" }}>Appendix C — Structured Data</h4>
                <p style={{ margin: 0, color: "#f0a1a1", fontSize: "0.82em" }}><RichText text={d.appendices.schemaNote} /></p>
              </div>
            )}

            {/* Manual URLs */}
            <div style={{ background: "#060606", borderRadius: 10, border: "1px solid #1a1a1a", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a1a1a" }}>
                <h3 style={{ margin: 0, fontSize: "0.93em", fontWeight: 700, color: "#e0e0e0" }}>Appendix E — Manual Verification URLs</h3>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.81em" }}>
                  <thead>
                    <tr style={{ background: "#0a0a0a" }}>
                      {["Tool","URL","What to Check"].map((h) => (
                        <th key={h} style={{ padding: "8px 13px", textAlign: "left", fontSize: "0.73em", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.appendices.manualUrls.map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #101010", background: i % 2 === 0 ? "#070707" : "#0b0b0b" }}>
                        <td style={{ padding: "8px 13px", fontWeight: 600, color: "#e0e0e0", whiteSpace: "nowrap" }}>{row.tool}</td>
                        <td style={{ padding: "8px 13px" }}>
                          <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ color: "#c8ff00", fontSize: "0.83em", wordBreak: "break-all", textDecoration: "none" }}>
                            {row.url}
                          </a>
                        </td>
                        <td style={{ padding: "8px 13px", color: "#666" }}>{row.check}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 24, padding: "13px 16px", background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, textAlign: "center" }}>
              <p style={{ margin: 0, color: "#8a8a8a", fontSize: "0.76em", lineHeight: 1.7 }}>
                Audit completed: {formatAuditDate(d.meta.date)} · {d.meta.skillVersion} · {d.meta.auditor}<br />
                Metrics labeled "Estimated" require manual verification. Findings based on static HTML analysis.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
