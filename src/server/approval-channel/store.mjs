import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

let pool;
let migrated = false;

const approvalsDir = path.resolve(process.cwd(), ".helio-approvals");

export function createApprovalToken() {
  return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function dbEnabled() {
  return !!String(process.env.DATABASE_URL || "").trim();
}

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: Number(process.env.APPROVAL_CHANNEL_PG_POOL_MAX || 4),
  });
  return pool;
}

async function ensureDb() {
  if (!dbEnabled() || migrated) return;
  await getPool().query(`
    create table if not exists helio_approval_requests (
      token text primary key,
      provider text not null,
      org_id text not null default 'default',
      host text not null default '',
      action_id text not null default '',
      action_label text not null default '',
      action_detail text not null default '',
      title text not null default '',
      message text not null default '',
      dashboard_url text not null default '',
      status text not null default 'pending',
      decision text not null default '',
      requested_at timestamptz not null default now(),
      decided_at timestamptz
    );
    create index if not exists helio_approval_requests_org_host_idx on helio_approval_requests (org_id, host, requested_at desc);
    create index if not exists helio_approval_requests_action_idx on helio_approval_requests (action_id);
  `);
  migrated = true;
}

function mapRow(row) {
  return {
    token: row.token,
    provider: row.provider,
    orgId: row.org_id,
    host: row.host,
    actionId: row.action_id,
    actionLabel: row.action_label,
    actionDetail: row.action_detail,
    title: row.title,
    message: row.message,
    dashboardUrl: row.dashboard_url,
    status: row.status,
    decision: row.decision,
    requestedAt: row.requested_at instanceof Date ? row.requested_at.toISOString() : row.requested_at,
    decidedAt: row.decided_at instanceof Date ? row.decided_at.toISOString() : row.decided_at || "",
  };
}

function cleanToken(token) {
  return String(token || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

async function ensureFileDir() {
  await fs.mkdir(approvalsDir, { recursive: true });
}

function approvalFile(token) {
  return path.join(approvalsDir, `${cleanToken(token)}.json`);
}

export async function saveApprovalRequest(record) {
  const normalized = {
    token: String(record.token || ""),
    provider: String(record.provider || ""),
    orgId: String(record.orgId || "default"),
    host: String(record.host || ""),
    actionId: String(record.actionId || ""),
    actionLabel: String(record.actionLabel || ""),
    actionDetail: String(record.actionDetail || ""),
    title: String(record.title || ""),
    message: String(record.message || ""),
    dashboardUrl: String(record.dashboardUrl || ""),
    status: String(record.status || "pending"),
    decision: String(record.decision || ""),
    requestedAt: String(record.requestedAt || new Date().toISOString()),
    decidedAt: String(record.decidedAt || ""),
  };
  if (dbEnabled()) {
    await ensureDb();
    await getPool().query(
      `insert into helio_approval_requests
        (token, provider, org_id, host, action_id, action_label, action_detail, title, message, dashboard_url, status, decision, requested_at, decided_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (token) do update set
        status = excluded.status,
        decision = excluded.decision,
        decided_at = excluded.decided_at`,
      [
        normalized.token,
        normalized.provider,
        normalized.orgId,
        normalized.host,
        normalized.actionId,
        normalized.actionLabel,
        normalized.actionDetail,
        normalized.title,
        normalized.message,
        normalized.dashboardUrl,
        normalized.status,
        normalized.decision,
        normalized.requestedAt,
        normalized.decidedAt || null,
      ]
    );
    return normalized;
  }
  await ensureFileDir();
  await fs.writeFile(approvalFile(normalized.token), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function getApprovalRequest(token) {
  if (dbEnabled()) {
    await ensureDb();
    const result = await getPool().query(`select * from helio_approval_requests where token = $1`, [String(token || "")]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
  const raw = await fs.readFile(approvalFile(token), "utf8").catch(() => "");
  return raw ? JSON.parse(raw) : null;
}

export async function decideApprovalRequest(token, decision) {
  const status = decision === "approve" ? "approved" : "rejected";
  const decidedAt = new Date().toISOString();
  if (dbEnabled()) {
    await ensureDb();
    const result = await getPool().query(
      `update helio_approval_requests
       set status = case when status = 'pending' then $2 else status end,
           decision = case when decision = '' then $3 else decision end,
           decided_at = case when decided_at is null then $4 else decided_at end
       where token = $1
       returning *`,
      [String(token || ""), status, String(decision || ""), decidedAt]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
  const record = await getApprovalRequest(token);
  if (!record) return null;
  if (record.status === "pending") {
    record.status = status;
    record.decision = decision;
    record.decidedAt = decidedAt;
    await saveApprovalRequest(record);
  }
  return record;
}

export async function listApprovalRequests({ orgId = "", host = "" } = {}) {
  if (dbEnabled()) {
    await ensureDb();
    const params = [];
    const where = [];
    if (orgId) {
      params.push(orgId);
      where.push(`org_id = $${params.length}`);
    }
    if (host) {
      params.push(host);
      where.push(`host = $${params.length}`);
    }
    const result = await getPool().query(
      `select * from helio_approval_requests ${where.length ? `where ${where.join(" and ")}` : ""} order by coalesce(decided_at, requested_at) desc limit 200`,
      params
    );
    return result.rows.map(mapRow);
  }
  await ensureFileDir();
  const files = await fs.readdir(approvalsDir).catch(() => []);
  const records = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(approvalsDir, file), "utf8");
      const record = JSON.parse(raw);
      if (orgId && String(record.orgId || "") !== orgId) continue;
      if (host && String(record.host || "") !== host) continue;
      records.push(record);
    } catch {
      // Ignore malformed local approval artifacts.
    }
  }
  return records
    .sort((a, b) => String(b.decidedAt || b.requestedAt || "").localeCompare(String(a.decidedAt || a.requestedAt || "")))
    .slice(0, 200);
}
