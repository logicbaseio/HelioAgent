export type StoredAuditEnvelope = {
  id: string;
  createdAt: string;
  domain: string;
  data: any;
};

const INDEX_KEY = "helio:audit-report:index:v1";
const ITEM_PREFIX = "helio:audit-report:item:v1:";

function slugify(input: string) {
  return String(input || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function createReportId(domain: string) {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slugify(domain)}-${yyyy}-${mm}-${dd}-${rand}`;
}

function saveAuditReport(data: any, id?: string): { id: string; reportUrl: string } {
  const reportId = id || createReportId(data?.meta?.domain || data?.domain || "audit-report");
  const envelope: StoredAuditEnvelope = {
    id: reportId,
    createdAt: new Date().toISOString(),
    domain: String(data?.meta?.domain || data?.domain || "unknown-domain"),
    data,
  };

  localStorage.setItem(`${ITEM_PREFIX}${reportId}`, JSON.stringify(envelope));
  const index = getAuditReportIndex();
  const deduped = [envelope, ...index.filter((x) => x.id !== reportId)].slice(0, 200);
  localStorage.setItem(INDEX_KEY, JSON.stringify(deduped.map((x) => ({ id: x.id, createdAt: x.createdAt, domain: x.domain }))));
  return { id: reportId, reportUrl: `/reports/${reportId}` };
}

export async function saveAuditReportViaApi(data: any, id?: string): Promise<{ id: string; reportUrl: string }> {
  const reportId = id || createReportId(data?.meta?.domain || data?.domain || "audit-report");
  try {
    const res = await fetch("/api/audit-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reportId, data }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error || "API save failed");
    return { id: reportId, reportUrl: String(payload?.reportUrl || `/reports/${reportId}`) };
  } catch {
    return saveAuditReport(data, reportId);
  }
}

function loadAuditReport(id: string): StoredAuditEnvelope | null {
  try {
    const raw = localStorage.getItem(`${ITEM_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as StoredAuditEnvelope;
  } catch {
    return null;
  }
}

export async function loadAuditReportViaApi(id: string): Promise<StoredAuditEnvelope | null> {
  try {
    const res = await fetch(`/api/audit-report?id=${encodeURIComponent(id)}`);
    const payload = await res.json();
    if (!res.ok) return loadAuditReport(id);
    return (payload?.envelope as StoredAuditEnvelope) || loadAuditReport(id);
  } catch {
    return loadAuditReport(id);
  }
}

function getAuditReportIndex(): Array<{ id: string; createdAt: string; domain: string }> {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
