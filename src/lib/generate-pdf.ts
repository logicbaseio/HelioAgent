// ============================================================
// lib/generate-pdf.ts
//
// PDF generation for the audit report.
// Uses the browser's built-in print-to-PDF capability —
// zero extra dependencies, works everywhere.
//
// For production-grade PDF with exact pixel control, see the
// optional @react-pdf/renderer section at the bottom.
// ============================================================

import type { AuditReport } from "./audit-types";
import { getScoreColor, getScoreEmoji, getScoreLabel, getPriorityConfig } from "./audit-utils";

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Generates a PDF of the audit report by opening a new window
 * with a print-optimised HTML version and triggering window.print().
 *
 * The browser's "Save as PDF" dialog handles the rest.
 * Works in Chrome, Firefox, Safari, Edge.
 */
export function generateAuditPDF(data: AuditReport): void {
  const html = buildPrintHTML(data);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups for this page to download the PDF.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  // Small delay to ensure styles load before print dialog
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

// ─── HTML BUILDER ─────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  if (!text) return "";
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function issueEmoji(level: string): string {
  const map: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
  return map[level] ?? "⚪";
}
function issueLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}
function issueBorderColor(level: string): string {
  const map: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
  return map[level] ?? "#94a3b8";
}
function issueBgColor(level: string): string {
  const map: Record<string, string> = { critical: "#fef2f2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4" };
  return map[level] ?? "#f8fafc";
}

function priorityBadgeStyle(priority: string): string {
  const colors: Record<string, [string, string]> = {
    critical: ["#fef2f2", "#ef4444"],
    high:     ["#fff7ed", "#f97316"],
    medium:   ["#fefce8", "#eab308"],
    low:      ["#f0fdf4", "#22c55e"],
  };
  const [bg, color] = colors[priority] ?? ["#f1f5f9", "#64748b"];
  return `background:${bg};color:${color};border:1px solid ${color}40;`;
}

function scoreColor(score: number | null): string {
  return getScoreColor(score);
}

function renderTable(rows: string[][], isMultiCol?: boolean): string {
  if (!rows?.length) return "";
  const multi = isMultiCol ?? rows[0].length > 2;
  const header = multi
    ? `<thead><tr>${rows[0].map((h) => `<th>${renderInline(h)}</th>`).join("")}</tr></thead>`
    : "";
  const body = (multi ? rows.slice(1) : rows)
    .map((row, ri) => `<tr class="${ri % 2 === 0 ? "" : "alt"}">${row.map((cell, ci) => `<td class="${!multi && ci === 0 ? "key" : ""}">${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${header}<tbody>${body}</tbody></table>`;
}

function buildPrintHTML(d: AuditReport): string {
  const sc = getScoreColor(d.weightedScore);
  const se = getScoreEmoji(d.weightedScore);
  const printedAt = new Date().toLocaleString();

  // ── PHASES HTML ─────────────────────────────────────────────────────────────
  const phasesHTML = d.phases.map((phase) => {
    const subHTML = (phase.subsections ?? []).map((sub) => {
      const tableHTML = sub.table ? renderTable(sub.table) : "";
      const issuesHTML = (sub.issues ?? []).map((issue) => `
        <div class="issue-block" style="border-left:4px solid ${issueBorderColor(issue.level)};background:${issueBgColor(issue.level)}">
          <p><strong>${issueEmoji(issue.level)} ${issueLabel(issue.level)} Issue:</strong> ${renderInline(issue.text)}</p>
          <div class="fix-box"><strong>Fix:</strong> ${renderInline(issue.fix)}</div>
        </div>`).join("");

      const scoreLine = sub.na
        ? `<div class="score-line">Section Score: 🟡 N/A</div>`
        : sub.unknown
        ? `<div class="score-line">Section Score: ⚠️ Unknown</div>`
        : sub.score != null
        ? `<div class="score-line">Section Score: <span style="color:${scoreColor(sub.score)};font-weight:700">${getScoreEmoji(sub.score)} ${sub.score}/100</span></div>`
        : "";

      const noteHTML = sub.naNote ? `<div class="note">${renderInline(sub.naNote)}</div>` : "";

      return `
        <div class="subsection">
          <h4><span class="sub-id">${sub.id}</span>${esc(sub.title)}</h4>
          ${tableHTML}${issuesHTML}${noteHTML}${scoreLine}
        </div>`;
    }).join("");

    const findingsHTML = phase.findings
      ? `<div class="findings"><strong>Findings:</strong> ${renderInline(phase.findings)}</div>`
      : "";
    const phaseTableHTML = phase.table ? renderTable(phase.table) : "";

    return `
      <div class="phase">
        <h3><span class="phase-num">${phase.id}</span>Phase ${phase.id} — ${esc(phase.title)}</h3>
        ${phaseTableHTML}${findingsHTML}${subHTML}
      </div>`;
  }).join("");

  // ── MATRIX HTML ─────────────────────────────────────────────────────────────
  const matrixRows = (["critical","high","medium","low"] as const).flatMap((p) =>
    d.priorityMatrix.filter((i) => i.priority === p).map((item) => {
      const cfg = getPriorityConfig(item.priority);
      return `<tr>
        <td><span class="badge" style="${priorityBadgeStyle(item.priority)}">${cfg.emoji} ${cfg.label}</span></td>
        <td><strong>${renderInline(item.issue)}</strong></td>
        <td>${esc(item.pages)}</td>
        <td>${esc(item.impact)}</td>
        <td>${renderInline(item.fix)}</td>
      </tr>`;
    })
  ).join("");

  // ── QUICK WINS HTML ─────────────────────────────────────────────────────────
  const winsHTML = d.quickWins.map((win, i) => `
    <div class="win-item">
      <div class="win-num">${i + 1}</div>
      <div>
        <div class="win-time">${esc(win.time)}</div>
        <strong>${esc(win.title)}</strong>
        <p>${renderInline(win.desc)}</p>
      </div>
    </div>`).join("");

  // ── SCORES HTML ─────────────────────────────────────────────────────────────
  const scoresHTML = d.categoryScores.map((row, i) => {
    const color = scoreColor(row.na || row.unknown ? null : row.score);
    const label = getScoreLabel(row.score, row.na, row.unknown);
    const emoji = getScoreEmoji(row.na || row.unknown ? null : row.score);
    const scoreStr = row.na ? "N/A" : row.unknown ? "?" : `${row.score}/100`;
    const barWidth = row.na || row.unknown || row.score == null ? 0 : row.score;
    return `<tr class="${i % 2 === 0 ? "" : "alt"}">
      <td><strong>${esc(row.category)}</strong></td>
      <td style="color:${color};font-weight:700">${scoreStr}</td>
      <td><span class="badge" style="background:${color}18;color:${color};border:1px solid ${color}40">${emoji} ${label}</span></td>
      <td>${esc(row.weight)}</td>
      <td><div class="bar-wrap"><div class="bar-fill" style="width:${barWidth}%;background:${color}"></div></div></td>
    </tr>`;
  }).join("");

  // ── CRAWLED URLs ─────────────────────────────────────────────────────────────
  const urlsHTML = d.appendices.crawledUrls.map((row, i) => `
    <tr class="${i % 2 === 0 ? "" : "alt"}">
      <td style="font-family:monospace;font-size:0.85em;word-break:break-all">${esc(row.url)}</td>
      <td>${esc(row.status)}</td>
      <td>${esc(row.loadTime)}</td>
      <td>${esc(row.notes)}</td>
    </tr>`).join("");

  const manualUrlsHTML = d.appendices.manualUrls.map((row, i) => `
    <tr class="${i % 2 === 0 ? "" : "alt"}">
      <td><strong>${esc(row.tool)}</strong></td>
      <td style="font-family:monospace;font-size:0.83em;color:#3b82f6;word-break:break-all">${esc(row.url)}</td>
      <td>${esc(row.check)}</td>
    </tr>`).join("");

  // ── GSC / GA4 ────────────────────────────────────────────────────────────────
  const gscHTML = d.executiveSummary.gsc
    ? Object.entries(d.executiveSummary.gsc).map(([k, v]) =>
        `<tr><td>${k.replace(/([A-Z])/g, " $1").trim()}</td><td><strong>${esc(String(v))}</strong></td></tr>`
      ).join("") : "";

  const ga4HTML = d.executiveSummary.ga4
    ? Object.entries(d.executiveSummary.ga4).map(([k, v]) =>
        `<tr><td>${k.replace(/([A-Z])/g, " $1").trim()}</td><td><strong>${esc(String(v))}</strong></td></tr>`
      ).join("") : "";

  // ── COUNTS ───────────────────────────────────────────────────────────────────
  const counts = {
    critical: d.priorityMatrix.filter((i) => i.priority === "critical").length,
    high:     d.priorityMatrix.filter((i) => i.priority === "high").length,
    medium:   d.priorityMatrix.filter((i) => i.priority === "medium").length,
    low:      d.priorityMatrix.filter((i) => i.priority === "low").length,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HELIO SEO Audit | ${esc(d.meta.domain)} | ${esc(d.meta.date)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1e293b; background: white; line-height: 1.55; position: relative; }

  @page { size: A4; margin: 16mm 14mm; }
  @media print {
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    a { color: inherit !important; text-decoration: none !important; }
    .print-top-strip {
      position: static !important;
      margin: 0 0 12px 0 !important;
      border-radius: 0 !important;
    }
    .report-wrap {
      padding-top: 0;
      padding-bottom: 0;
    }
  }

  /* ── PRINT BRANDING ── */
  .page-watermark {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1;
  }
  .page-watermark span {
    font-family: 'Inter', sans-serif;
    font-weight: 900;
    font-size: 82px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #a3b572;
    opacity: 0.045;
    transform: rotate(-24deg);
    user-select: none;
  }
  .report-wrap {
    position: relative;
    z-index: 2;
  }

  /* ── TOP STRIP (ABOVE REPORT HEADER) ── */
  .print-top-strip {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 0;
    border: 1px solid #334d1e;
    background: linear-gradient(135deg,#0a0f07,#1f2e11);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
  .print-top-strip .left {
    display: block;
    font-size: 12px;
    color: #a5b79a;
    font-weight: 500;
    text-align: left;
  }
  .print-top-strip .center {
    display: block;
    font-size: 12px;
    color: #d9e4d3;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
  }
  .print-top-strip .right {
    font-size: 16px;
    color: #c8ff00;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-align: right;
    text-transform: uppercase;
  }


  /* ── HEADER ── */
  .report-header { background: linear-gradient(135deg,#0a0f07,#1f2e11); color: white; padding: 24px 28px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; border: 1px solid #334d1e; }
  .report-header { background: linear-gradient(135deg,#0a0f07,#1f2e11); color: white; padding: 24px 28px; border-radius: 0; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; border: 1px solid #334d1e; }
  .report-header h1 { font-size: 1.5em; font-weight: 800; margin: 4px 0; letter-spacing: -0.02em; }
  .report-header .meta { color: #94a3b8; font-size: 0.78em; margin-top: 4px; }
  .score-hero { text-align: center; }
  .score-hero .num { font-size: 2.5em; font-weight: 900; line-height: 1; color: ${sc}; }
  .score-hero .denom { color: #64748b; font-size: 0.75em; font-weight: 600; }
  .score-hero .emoji { font-size: 1.2em; margin-top: 2px; }

  /* ── ISSUE COUNTS ── */
  .issue-counts { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin: 16px 0; }
  .count-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; text-align: center; }
  .count-card .n { font-size: 1.6em; font-weight: 800; }
  .count-card .l { font-size: 0.72em; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

  /* ── SECTION TITLES ── */
  h2 { font-size: 1.05em; font-weight: 800; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 24px 0 14px; letter-spacing: -0.01em; }
  h3 { font-size: 0.95em; font-weight: 700; color: #0f172a; margin: 20px 0 10px; display: flex; align-items: center; gap: 8px; }
  .phase-num { background: #0f172a; color: white; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78em; font-weight: 700; flex-shrink: 0; }
  h4 { font-size: 0.88em; font-weight: 700; color: #1e293b; margin: 14px 0 8px; display: flex; align-items: center; gap: 7px; }
  .sub-id { background: #e2e8f0; color: #475569; padding: 1px 7px; border-radius: 3px; font-size: 0.78em; font-weight: 600; }

  /* ── TABLES ── */
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 0.88em; }
  th { background: #f8fafc; padding: 7px 10px; text-align: left; font-size: 0.76em; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; word-break: break-word; }
  tr.alt td { background: #fafafa; }
  td.key { font-weight: 600; color: #374151; max-width: 180px; }
  code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 3px; padding: 1px 4px; font-family: ui-monospace, monospace; font-size: 0.85em; color: #0f172a; }

  /* ── ISSUE BLOCKS ── */
  .issue-block { padding: 11px 13px; margin: 10px 0; border-radius: 0 5px 5px 0; }
  .issue-block p { margin: 0 0 8px; font-size: 0.88em; line-height: 1.6; }
  .fix-box { background: rgba(255,255,255,0.75); border-radius: 3px; padding: 8px 10px; font-size: 0.86em; line-height: 1.6; }

  /* ── SCORE LINE ── */
  .score-line { font-size: 0.8em; color: #94a3b8; font-weight: 600; border-top: 1px dashed #e2e8f0; padding-top: 7px; margin-top: 10px; }

  /* ── FINDINGS BOX ── */
  .findings { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 5px; padding: 10px 13px; margin: 10px 0; font-size: 0.87em; line-height: 1.65; color: #0c4a6e; }
  .note { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 9px 12px; margin: 8px 0; font-size: 0.84em; color: #64748b; line-height: 1.6; }

  /* ── BADGE ── */
  .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 0.78em; font-weight: 700; white-space: nowrap; }

  /* ── SCORE BAR ── */
  .bar-wrap { background: #e2e8f0; border-radius: 3px; height: 5px; min-width: 80px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; }

  /* ── WINS ── */
  .win-item { display: flex; gap: 14px; padding: 11px 0; border-bottom: 1px solid #f1f5f9; }
  .win-num { width: 26px; height: 26px; border-radius: 50%; background: #dbeafe; color: #1d4ed8; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.82em; flex-shrink: 0; margin-top: 2px; }
  .win-time { display: inline-block; background: #f1f5f9; color: #64748b; border-radius: 3px; padding: 1px 6px; font-size: 0.72em; font-weight: 700; margin-bottom: 3px; }
  .win-item strong { font-size: 0.9em; }
  .win-item p { font-size: 0.83em; color: #64748b; line-height: 1.6; margin-top: 3px; }

  /* ── TOP WINS ── */
  .top-wins { margin: 14px 0; }
  .top-win { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
  .top-win-num { width: 24px; height: 24px; border-radius: 50%; background: #dbeafe; color: #1d4ed8; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.8em; flex-shrink: 0; }
  .top-win strong { font-size: 0.87em; display: block; }
  .top-win p { font-size: 0.82em; color: #64748b; line-height: 1.6; margin-top: 2px; }

  /* ── GSC/GA4 SIDE BY SIDE ── */
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0; }
  .data-card { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
  .data-card-title { background: #f8fafc; padding: 8px 12px; font-size: 0.75em; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #e2e8f0; }

  /* ── FOOTER ── */
  .report-footer { margin-top: 24px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; font-size: 0.76em; color: #94a3b8; line-height: 1.7; }

  /* ── PHASE SECTION ── */
  .phase { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; }
  .subsection { margin-bottom: 18px; }
</style>
</head>
<body>
<div class="page-watermark"><span>HELIO</span></div>
<div class="report-wrap">
<div class="print-top-strip">
  <div class="left">${esc(printedAt)}</div>
  <div class="center">HELIO SEO Audit | ${esc(d.meta.domain)} | ${esc(d.meta.date)}</div>
  <div class="right">HELIO</div>
</div>

<!-- HEADER -->
<div class="report-header">
  <div>
    <p style="color:#94a3b8;font-size:0.72em;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:4px">Technical SEO Audit Report</p>
    <h1>${esc(d.meta.domain)}</h1>
    <p class="meta">${esc(d.meta.date)} &nbsp;·&nbsp; ${esc(d.meta.auditor)} &nbsp;·&nbsp; ${esc(d.meta.skillVersion)}</p>
  </div>
  <div class="score-hero">
    <div class="num">${d.weightedScore}</div>
    <div class="denom">/ 100 OVERALL</div>
    <div class="emoji">${se}</div>
  </div>
</div>

<!-- ISSUE COUNTS -->
<div class="issue-counts">
  <div class="count-card"><div class="n" style="color:#ef4444">${counts.critical}</div><div class="l">Critical</div></div>
  <div class="count-card"><div class="n" style="color:#f97316">${counts.high}</div><div class="l">High</div></div>
  <div class="count-card"><div class="n" style="color:#eab308">${counts.medium}</div><div class="l">Medium</div></div>
  <div class="count-card"><div class="n" style="color:#22c55e">${counts.low}</div><div class="l">Low</div></div>
</div>

<!-- TOP WINS -->
<h2>🏆 Top 3 Wins If Fixed Immediately</h2>
<div class="top-wins">
  ${d.executiveSummary.topWins.map((win, i) => `
    <div class="top-win">
      <div class="top-win-num">${i + 1}</div>
      <div><strong>${esc(win.title)}</strong><p>${renderInline(win.desc)}</p></div>
    </div>`).join("")}
</div>

<!-- GSC + GA4 -->
${(d.executiveSummary.gsc || d.executiveSummary.ga4) ? `
<h2>Performance Data</h2>
<div class="data-grid">
  ${d.executiveSummary.gsc ? `
  <div class="data-card">
    <div class="data-card-title">Google Search Console</div>
    <table><tbody>${gscHTML}</tbody></table>
  </div>` : ""}
  ${d.executiveSummary.ga4 ? `
  <div class="data-card">
    <div class="data-card-title">Google Analytics 4</div>
    <table><tbody>${ga4HTML}</tbody></table>
  </div>` : ""}
</div>` : ""}

<!-- CATEGORY SCORES -->
<h2>Category Scoreboard</h2>
<table>
  <thead><tr><th>Category</th><th>Score</th><th>Status</th><th>Weight</th><th>Visual</th></tr></thead>
  <tbody>${scoresHTML}</tbody>
</table>
<p style="text-align:right;font-weight:800;font-size:1em;color:${sc};margin-top:8px">${se} Weighted Overall: ${d.weightedScore}/100</p>

<!-- PHASES -->
<div class="page-break"></div>
<h2>Detailed Phase Findings</h2>
${phasesHTML}

<!-- PRIORITY MATRIX -->
<div class="page-break"></div>
<h2>Issues Priority Matrix</h2>
<table>
  <thead><tr><th>Priority</th><th>Issue</th><th>Pages</th><th>Impact</th><th>Fix</th></tr></thead>
  <tbody>${matrixRows}</tbody>
</table>

<!-- QUICK WINS -->
<h2>Quick Win Recommendations (Top 10)</h2>
<p style="color:#64748b;font-size:0.85em;margin-bottom:12px">Ranked by <strong>highest impact vs. lowest effort</strong></p>
${winsHTML}

<!-- APPENDIX A -->
<div class="page-break"></div>
<h2>Appendix A — Crawled URL List</h2>
<table>
  <thead><tr><th>URL</th><th>Status</th><th>Load Time</th><th>Notes</th></tr></thead>
  <tbody>${urlsHTML}</tbody>
</table>

${d.appendices.sitemapNote ? `<h2>Appendix B — Sitemap</h2><div class="note">${renderInline(d.appendices.sitemapNote)}</div>` : ""}
${d.appendices.schemaNote  ? `<h2>Appendix C — Structured Data</h2><div class="note">${renderInline(d.appendices.schemaNote)}</div>` : ""}

<!-- APPENDIX E -->
<h2>Appendix E — Manual Verification URLs</h2>
<table>
  <thead><tr><th>Tool</th><th>URL</th><th>What to Check</th></tr></thead>
  <tbody>${manualUrlsHTML}</tbody>
</table>

<!-- FOOTER -->
<div class="report-footer">
  Audit completed: ${esc(d.meta.date)} &nbsp;·&nbsp; ${esc(d.meta.skillVersion)} &nbsp;·&nbsp; ${esc(d.meta.auditor)}<br>
  Metrics labeled "Estimated" require manual verification at the URLs listed in Appendix E.
</div>

</div>
</body>
</html>`;
}
