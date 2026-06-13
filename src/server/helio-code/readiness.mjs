import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export function helioCodeHeartbeatPath() {
  return process.env.HELIO_CODE_HEARTBEAT_PATH || path.join(process.cwd(), ".helio-code-worker-heartbeat.json");
}

export async function recordHelioCodeWorkerHeartbeat({ workerId = "", status = "idle" } = {}) {
  const payload = {
    ok: true,
    workerId: String(workerId || ""),
    status: String(status || "idle"),
    pid: process.pid,
    at: new Date().toISOString(),
  };
  await fs.writeFile(helioCodeHeartbeatPath(), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function readHelioCodeWorkerHeartbeat({ maxAgeMs = Number(process.env.HELIO_CODE_HEARTBEAT_MAX_AGE_MS || 120000) } = {}) {
  try {
    const raw = await fs.readFile(helioCodeHeartbeatPath(), "utf8");
    const data = JSON.parse(raw);
    const ageMs = Date.now() - Date.parse(String(data?.at || ""));
    return {
      ok: Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs,
      stale: !(Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs),
      ageMs: Number.isFinite(ageMs) ? ageMs : null,
      ...data,
    };
  } catch {
    return { ok: false, stale: true, ageMs: null, workerId: "", status: "missing", at: "" };
  }
}

export async function buildHelioCodeReadiness() {
  const hasDb = !!String(process.env.DATABASE_URL || "").trim();
  const hasWorkerCmd = !!String(process.env.HELIO_CODE_AGENT_COMMAND || "").trim();
  const hasGithubPrivateKey = !!String(process.env.GITHUB_APP_PRIVATE_KEY || "").trim();
  const hasGithubAppId = !!String(process.env.GITHUB_APP_ID || "").trim();
  const hasEnvGithubToken = !!String(process.env.GITHUB_TOKEN || "").trim();
  const hasRepoUrl = !!String(process.env.HELIO_CODE_REPO_URL || "").trim();
  const hasGithubAuth = (hasGithubPrivateKey && hasGithubAppId) || hasEnvGithubToken;
  const heartbeat = await readHelioCodeWorkerHeartbeat();
  const productionCapable = hasDb && hasWorkerCmd && hasGithubAuth;
  const productionReady = productionCapable && heartbeat.ok;
  const mode = productionReady
    ? "production-ready"
    : productionCapable
      ? "production-capable-no-worker"
      : "local-adapter";
  const checks = [
    { id: "database", label: "DATABASE_URL", pass: hasDb, detail: hasDb ? "Configured" : "Missing durable job queue" },
    { id: "worker_command", label: "HELIO_CODE_AGENT_COMMAND", pass: hasWorkerCmd, detail: hasWorkerCmd ? "Configured" : "Missing coding agent command" },
    {
      id: "github_auth",
      label: "GitHub Auth",
      pass: hasGithubAuth,
      detail: hasGithubAuth
        ? (hasEnvGithubToken ? "GITHUB_TOKEN configured" : "GitHub App credentials configured")
        : "Missing GITHUB_TOKEN or GitHub App ID + private key",
    },
    {
      id: "repo_source",
      label: "Repo Source",
      pass: hasRepoUrl || hasGithubAuth,
      detail: hasRepoUrl ? "HELIO_CODE_REPO_URL configured" : hasGithubAuth ? "Repo can be resolved from job payload" : "Missing repo URL/auth",
    },
    {
      id: "worker_heartbeat",
      label: "Worker Heartbeat",
      pass: heartbeat.ok,
      detail: heartbeat.ok
        ? `${heartbeat.workerId || "worker"} active ${Math.round(Number(heartbeat.ageMs || 0) / 1000)}s ago`
        : "No active worker heartbeat",
    },
  ];
  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  return {
    ok: true,
    mode,
    productionCapable,
    productionReady,
    score,
    heartbeat,
    checks,
    requirements: [
      "Set DATABASE_URL and run npm run helio-code:migrate.",
      "Set HELIO_CODE_AGENT_COMMAND to the real coding-agent command.",
      "Run npm run helio-code:worker continuously.",
      "Configure GitHub App credentials or GITHUB_TOKEN.",
      "Set repo in GitHub integration or HELIO_CODE_REPO_URL.",
    ],
  };
}
