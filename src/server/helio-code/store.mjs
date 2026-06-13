import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import pg from "pg";
import { createHelioCodeJobRecord } from "../../lib/helio-code.js";

const { Pool } = pg;

let pool;

export function getHelioCodePool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Helio Code production storage.");
  }
  pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: Number(process.env.HELIO_CODE_PG_POOL_MAX || 8),
  });
  return pool;
}

export async function migrateHelioCodeStore(client = getHelioCodePool()) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sqlPath = path.resolve(here, "../../../docs/helio-code-postgres.sql");
  const sql = await fs.readFile(sqlPath, "utf8");
  await client.query(sql);
}

export async function createHelioCodeJob(payload, client = getHelioCodePool()) {
  const created = createHelioCodeJobRecord(payload);
  if (!created.ok) return created;
  const job = created.job;
  await client.query(
    `insert into helio_code_jobs
      (id, org_id, mission_id, repo, domain, status, payload, result, attempts, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      job.id,
      job.payload.orgId,
      job.payload.missionId,
      job.payload.repo,
      job.payload.domain,
      job.status,
      job.payload,
      job.result,
      job.attempts,
      job.createdAt,
      job.updatedAt,
    ]
  );
  for (const log of job.logs || []) {
    await appendHelioCodeLog(job.id, log.level || "info", log.message || "", log, client);
  }
  return { ok: true, job: await getHelioCodeJob(job.id, client) };
}

export async function getHelioCodeJob(id, client = getHelioCodePool()) {
  const result = await client.query(`select * from helio_code_jobs where id = $1`, [id]);
  const row = result.rows[0];
  if (!row) return null;
  const logs = await client.query(`select level, message, metadata, created_at from helio_code_job_logs where job_id = $1 order by created_at asc, id asc`, [id]);
  return mapJobRow(row, logs.rows);
}

export async function listHelioCodeJobs({ orgId = "", missionId = "", limit = 50 } = {}, client = getHelioCodePool()) {
  const params = [];
  const where = [];
  if (orgId) {
    params.push(orgId);
    where.push(`org_id = $${params.length}`);
  }
  if (missionId) {
    params.push(missionId);
    where.push(`mission_id = $${params.length}`);
  }
  params.push(limit);
  const result = await client.query(
    `select * from helio_code_jobs ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit $${params.length}`,
    params
  );
  return result.rows.map((row) => mapJobRow(row, []));
}

export async function appendHelioCodeLog(jobId, level, message, metadata = {}, client = getHelioCodePool()) {
  await client.query(
    `insert into helio_code_job_logs (job_id, level, message, metadata) values ($1,$2,$3,$4)`,
    [jobId, level, message, metadata]
  );
}

export async function updateHelioCodeJob(id, patch, client = getHelioCodePool()) {
  const current = await getHelioCodeJob(id, client);
  if (!current) return null;
  const next = {
    status: patch.status || current.status,
    result: patch.result === undefined ? current.result : patch.result,
    attempts: patch.attempts === undefined ? current.attempts : patch.attempts,
    lockedAt: patch.lockedAt === undefined ? current.lockedAt : patch.lockedAt,
    lockedBy: patch.lockedBy === undefined ? current.lockedBy : patch.lockedBy,
    availableAt: patch.availableAt === undefined ? current.availableAt || new Date().toISOString() : patch.availableAt,
  };
  await client.query(
    `update helio_code_jobs
     set status = $2, result = $3, attempts = $4, locked_at = $5, locked_by = $6, available_at = $7, updated_at = now()
     where id = $1`,
    [id, next.status, next.result, next.attempts, next.lockedAt, next.lockedBy, next.availableAt]
  );
  return getHelioCodeJob(id, client);
}

export async function claimNextHelioCodeJob({ workerId, staleAfterMinutes = 30 } = {}, client = getHelioCodePool()) {
  const id = workerId || `worker-${process.pid}`;
  const result = await client.query(
    `with candidate as (
       select id
       from helio_code_jobs
       where status = 'code-queued'
         and available_at <= now()
         and (locked_at is null or locked_at < now() - ($2::text || ' minutes')::interval)
       order by created_at asc
       for update skip locked
       limit 1
     )
     update helio_code_jobs j
     set status = 'code-running', locked_at = now(), locked_by = $1, attempts = attempts + 1, updated_at = now()
     from candidate
     where j.id = candidate.id
     returning j.*`,
    [id, String(staleAfterMinutes)]
  );
  const row = result.rows[0];
  if (!row) return null;
  await appendHelioCodeLog(row.id, "info", `Claimed by ${id}.`, { workerId: id }, client);
  return getHelioCodeJob(row.id, client);
}

export async function failHelioCodeJob(job, error, client = getHelioCodePool()) {
  const maxAttempts = Number(process.env.HELIO_CODE_MAX_ATTEMPTS || 2);
  const retry = Number(job.attempts || 0) < maxAttempts;
  const status = retry ? "code-queued" : "code-failed";
  const availableAt = new Date(Date.now() + Number(process.env.HELIO_CODE_RETRY_DELAY_MS || 120000)).toISOString();
  await appendHelioCodeLog(job.id, "error", error?.message || String(error), { retry }, client);
  return updateHelioCodeJob(
    job.id,
    {
      status,
      result: retry ? job.result : { ...(job.result || {}), failureReason: error?.message || String(error) },
      lockedAt: null,
      lockedBy: null,
      availableAt: retry ? availableAt : new Date().toISOString(),
    },
    client
  );
}

function mapJobRow(row, logs = []) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    availableAt: row.available_at instanceof Date ? row.available_at.toISOString() : row.available_at,
    lockedAt: row.locked_at instanceof Date ? row.locked_at.toISOString() : row.locked_at,
    lockedBy: row.locked_by,
    attempts: row.attempts,
    payload: row.payload,
    result: row.result,
    logs: logs.map((log) => ({
      at: log.created_at instanceof Date ? log.created_at.toISOString() : log.created_at,
      level: log.level,
      message: log.message,
      metadata: log.metadata || {},
    })),
  };
}
