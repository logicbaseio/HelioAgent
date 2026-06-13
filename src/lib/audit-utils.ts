// ============================================================
// lib/audit-utils.ts
// Shared helpers used by both the dashboard renderer
// and the PDF generator.
// ============================================================

import type { IssueLevelType, PriorityType } from "./audit-types";

// ─── SCORE HELPERS ────────────────────────────────────────────────────────────

export const getScoreColor = (score: number | null | undefined): string => {
  if (score == null) return "#94a3b8";
  if (score >= 90) return "#22c55e";
  if (score >= 70) return "#eab308";
  if (score >= 50) return "#f97316";
  return "#ef4444";
};

export const getScoreEmoji = (score: number | null | undefined): string => {
  if (score == null) return "⚠️";
  if (score >= 90) return "✅";
  if (score >= 70) return "🟡";
  if (score >= 50) return "🟠";
  return "🔴";
};

export const getScoreLabel = (
  score: number | null,
  na?: boolean,
  unknown?: boolean
): string => {
  if (na) return "N/A";
  if (unknown) return "Unknown";
  if (score == null) return "Unknown";
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Improvement";
  return "Critical";
};

// ─── PRIORITY / ISSUE HELPERS ─────────────────────────────────────────────────

export interface PriorityConfig {
  emoji: string;
  label: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
}

export const getPriorityConfig = (
  level: IssueLevelType | PriorityType
): PriorityConfig => {
  const map: Record<string, PriorityConfig> = {
    critical: {
      emoji: "🔴", label: "Critical",
      bg: "#fef2f2", border: "#fecaca",
      text: "#991b1b", badge: "#ef4444",
    },
    high: {
      emoji: "🟠", label: "High",
      bg: "#fff7ed", border: "#fed7aa",
      text: "#9a3412", badge: "#f97316",
    },
    medium: {
      emoji: "🟡", label: "Medium",
      bg: "#fefce8", border: "#fef08a",
      text: "#854d0e", badge: "#eab308",
    },
    low: {
      emoji: "🟢", label: "Low",
      bg: "#f0fdf4", border: "#bbf7d0",
      text: "#14532d", badge: "#22c55e",
    },
  };
  return map[level] ?? map.low;
};

// ─── TEXT RENDERING ───────────────────────────────────────────────────────────
// Parses inline markdown: `code` → <code>, **bold** → <strong>
// Returns an array of strings and React elements.
// Import ReactNode from react in the component file.

export type TextPart =
  | { type: "text"; content: string }
  | { type: "code"; content: string }
  | { type: "bold"; content: string };

export const parseInlineText = (text: string): TextPart[] => {
  const parts: TextPart[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("`")) {
      parts.push({ type: "code", content: raw.slice(1, -1) });
    } else {
      parts.push({ type: "bold", content: raw.slice(2, -2) });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return parts;
};

// ─── DATE FORMATTING ──────────────────────────────────────────────────────────

export const formatAuditDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return dateStr;
  }
};

// ─── SCORE CALCULATION ────────────────────────────────────────────────────────

const CATEGORY_WEIGHTS: Record<string, number> = {
  "Crawlability & Indexation": 0.20,
  "HTTPS & Security": 0.10,
  "Page Speed & Core Web Vitals": 0.20,
  "On-Page SEO Signals": 0.15,
  "Structured Data / Schema": 0.10,
  "Mobile-Friendliness": 0.10,
  "Site Architecture": 0.10,
  "International SEO": 0.05,
};

const countIssuesByPriority = (
  matrix: Array<{ priority: string }>
) => ({
  critical: matrix.filter((i) => i.priority === "critical").length,
  high: matrix.filter((i) => i.priority === "high").length,
  medium: matrix.filter((i) => i.priority === "medium").length,
  low: matrix.filter((i) => i.priority === "low").length,
});
