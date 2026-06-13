#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  buildHelioCodeEvidence,
  buildHelioCodePrBody,
  createHelioCodeJobRecord,
  selectHelioCodeSkill,
} from "../src/lib/helio-code.js";
import { getDefaultBranch, getInstallationAccessToken, buildAuthenticatedRepoUrl, openGitHubPullRequest } from "../src/server/helio-code/github-app.mjs";
import {
  appendHelioCodeLog,
  claimNextHelioCodeJob,
  failHelioCodeJob,
  getHelioCodePool,
  migrateHelioCodeStore,
  updateHelioCodeJob,
} from "../src/server/helio-code/store.mjs";
import { recordHelioCodeWorkerHeartbeat } from "../src/server/helio-code/readiness.mjs";

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      opts.onLog?.(chunk.toString(), "stdout");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      opts.onLog?.(chunk.toString(), "stderr");
    });
    child.on("close", (code) => resolve({ code, stdout, stderr, ok: code === 0 }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message, ok: false }));
  });

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function profileRepository(repoDir) {
  const files = await fs.readdir(repoDir);
  const has = async (name) => fileExists(path.join(repoDir, name));
  const packageJsonPath = path.join(repoDir, "package.json");
  const pkg = (await has("package.json")) ? JSON.parse(await fs.readFile(packageJsonPath, "utf8")) : {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const framework = deps.next
    ? (await has("app")) ? "nextjs-app-router" : "nextjs-pages-router"
    : deps.astro
      ? "astro"
      : deps.vite
        ? "vite-static"
        : deps.react
          ? "generic-react"
          : "unknown";
  const packageManager = (await has("pnpm-lock.yaml")) ? "pnpm" : (await has("yarn.lock")) ? "yarn" : (await has("bun.lockb")) ? "bun" : "npm";
  const scripts = pkg.scripts || {};
  return {
    framework,
    packageManager,
    buildCommand: scripts.build ? `${packageManager} run build` : "",
    testCommand: scripts.test ? `${packageManager} test` : "",
    lintCommand: scripts.lint ? `${packageManager} run lint` : "",
    seoFiles: files.filter((file) => ["public", "app", "pages", "src", "astro.config.mjs", "next.config.js", "next.config.mjs"].includes(file)),
  };
}

async function runRepoChecks(repoDir, profile) {
  const checks = [];
  const commands = [
    ["lint", profile.lintCommand],
    ["test", profile.testCommand],
    ["build", profile.buildCommand],
  ].filter(([, command]) => command);

  for (const [name, command] of commands) {
    const [bin, ...args] = command.split(/\s+/);
    const result = await run(bin, args, { cwd: repoDir });
    checks.push({
      name,
      status: result.ok ? "passed" : "failed",
      details: (result.stderr || result.stdout || "").slice(0, 1600),
    });
    if (!result.ok) break;
  }
  if (!checks.length) checks.push({ name: "repo-checks", status: "passed", details: "No package checks were declared." });
  return checks;
}

async function runAgent(repoDir, job, skill, profile) {
  const safePayload = { ...(job.payload || {}) };
  if (safePayload.githubToken) safePayload.githubToken = "[redacted]";
  if (safePayload.agent?.apiKey) safePayload.agent = { ...safePayload.agent, apiKey: "[redacted]" };
  const prompt = [
    `You are Helio Code, a senior SEO/AEO/GEO coding agent.`,
    `Mission payload:`,
    JSON.stringify(safePayload, null, 2),
    ``,
    `Repo profile:`,
    JSON.stringify(profile, null, 2),
    ``,
    `Skill:`,
    JSON.stringify(skill, null, 2),
    ``,
    `Make the smallest code-backed remediation. Do not merge. Leave a clean git diff.`,
  ].join("\n");
  await fs.writeFile(path.join(repoDir, ".helio-code-prompt.md"), prompt, "utf8");

  const agentCommand = process.env.HELIO_CODE_AGENT_COMMAND;
  if (!agentCommand) {
    return {
      ok: false,
      reason: "HELIO_CODE_AGENT_COMMAND is not configured. Set it to a Codex-compatible CLI command for production execution.",
    };
  }

  const [bin, ...args] = agentCommand.split(/\s+/);
  const agentCfg = job?.payload?.agent || {};
  const env = {
    ...process.env,
    ...(agentCfg?.provider ? { HELIO_CODE_LLM_PROVIDER: String(agentCfg.provider) } : {}),
    ...(agentCfg?.model ? { HELIO_CODE_LLM_MODEL: String(agentCfg.model) } : {}),
    ...(agentCfg?.apiKey ? { HELIO_CODE_LLM_API_KEY: String(agentCfg.apiKey) } : {}),
  };
  const result = await run(bin, [...args, path.join(repoDir, ".helio-code-prompt.md")], { cwd: repoDir, env });
  return { ok: result.ok, reason: result.stderr || result.stdout };
}

async function resolveRepoAccess(payload, options = {}) {
  const payloadToken = String(payload.githubToken || "").trim();
  const envToken = String(process.env.GITHUB_TOKEN || "").trim();
  const token = envToken || payloadToken;
  if (options.repoUrl || process.env.HELIO_CODE_REPO_URL) {
    return {
      repoUrl: options.repoUrl || process.env.HELIO_CODE_REPO_URL,
      token,
      defaultBranch: process.env.HELIO_CODE_DEFAULT_BRANCH || "main",
    };
  }
  if (token && payload.repo) {
    return {
      repoUrl: buildAuthenticatedRepoUrl(payload.repo, token),
      token,
      defaultBranch: await getDefaultBranch(payload.repo, token),
    };
  }
  const installationId = payload.githubInstallationId || payload.installationId || process.env.GITHUB_APP_INSTALLATION_ID;
  const appToken = await getInstallationAccessToken(installationId);
  const repoUrl = buildAuthenticatedRepoUrl(payload.repo, appToken);
  const defaultBranch = await getDefaultBranch(payload.repo, appToken);
  return { repoUrl, token: appToken, defaultBranch };
}

async function heartbeat(workerId, status = "idle") {
  try {
    await recordHelioCodeWorkerHeartbeat({ workerId, status });
  } catch {}
}

export async function executeHelioCodeJob(payloadOrJob, options = {}) {
  const job = payloadOrJob?.payload
    ? { ...payloadOrJob, status: "code-running" }
    : (() => {
        const created = createHelioCodeJobRecord(payloadOrJob);
        if (!created.ok) return { invalid: true, errors: created.errors };
        return { ...created.job, status: "code-running", attempts: 1 };
      })();
  if (job.invalid) return { ok: false, errors: job.errors };
  const payload = job.payload;
  const skill = selectHelioCodeSkill({ issueType: payload.issueType, skillId: payload.skillId });
  const root = options.workspaceRoot || process.env.HELIO_CODE_WORKSPACE_ROOT || path.join(os.tmpdir(), "helio-code");
  const workspace = path.join(root, job.id);
  await fs.mkdir(workspace, { recursive: true });

  const access = await resolveRepoAccess(payload, options);

  const clone = await run("git", ["clone", "--depth", "1", access.repoUrl, "repo"], { cwd: workspace });
  if (!clone.ok) {
    return { ok: false, job: { ...job, status: "code-failed", result: { failureReason: clone.stderr || "Repo clone failed." } } };
  }

  const repoDir = path.join(workspace, "repo");
  const branch = `helio-code/${payload.missionId}-${Date.now().toString().slice(-6)}`;
  await run("git", ["checkout", "-b", branch], { cwd: repoDir });
  await run("git", ["config", "user.name", process.env.HELIO_CODE_GIT_USER_NAME || "Helio Code"], { cwd: repoDir });
  await run("git", ["config", "user.email", process.env.HELIO_CODE_GIT_USER_EMAIL || "helio-code@users.noreply.github.com"], { cwd: repoDir });
  const repoProfile = await profileRepository(repoDir);
  const agent = await runAgent(repoDir, job, skill, repoProfile);
  if (!agent.ok) {
    return { ok: false, job: { ...job, status: "code-failed", result: { failureReason: agent.reason } } };
  }

  const changed = await run("git", ["diff", "--name-only"], { cwd: repoDir });
  const changedFiles = changed.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!changedFiles.length) {
    return { ok: false, job: { ...job, status: "code-failed", result: { failureReason: "Agent completed without code changes." } } };
  }

  const checks = await runRepoChecks(repoDir, repoProfile);
  let evidence = buildHelioCodeEvidence({ job, repoProfile, changedFiles, checks, branch, pullRequestUrl: "" });
  if (evidence.status === "code-checks-failed") {
    return {
      ok: false,
      job: {
        ...job,
        status: "code-checks-failed",
        result: evidence,
        updatedAt: new Date().toISOString(),
        logs: [...job.logs, { at: new Date().toISOString(), level: "error", message: "Repo checks failed; PR was not opened." }],
      },
    };
  }
  const prBody = buildHelioCodePrBody({ payload, skill, evidence });
  await fs.writeFile(path.join(repoDir, ".helio-code-pr.md"), prBody, "utf8");
  await run("git", ["add", "-A"], { cwd: repoDir });
  const commit = await run("git", ["commit", "-m", `fix(seo): ${payload.issueType} remediation via Helio Code`], { cwd: repoDir });
  if (!commit.ok) {
    return { ok: false, job: { ...job, status: "code-failed", result: { failureReason: commit.stderr || "Git commit failed." } } };
  }

  let pullRequestUrl = "";
  if (access.token && payload.repo) {
    const push = await run("git", ["push", "origin", branch], { cwd: repoDir });
    if (!push.ok) {
      return { ok: false, job: { ...job, status: "code-failed", result: { failureReason: push.stderr || "Git push failed." } } };
    }
    const pr = await openGitHubPullRequest({
      repo: payload.repo,
      token: access.token,
      title: `[Helio Code] ${payload.auditEvidence?.title || payload.issueType}`,
      head: branch,
      base: access.defaultBranch,
      body: prBody,
      draft: evidence.status !== "code-pr-opened",
    });
    pullRequestUrl = pr.html_url || "";
  }
  evidence = { ...evidence, pullRequestUrl };

  return {
    ok: evidence.status === "code-pr-opened",
    job: {
      ...job,
      status: evidence.status,
      result: evidence,
      updatedAt: new Date().toISOString(),
      logs: [...job.logs, { at: new Date().toISOString(), level: "info", message: `Prepared branch ${branch}.` }],
    },
  };
}

export async function runWorkerLoop({
  once = false,
  workerId = process.env.HELIO_CODE_WORKER_ID || `helio-code-${process.pid}`,
  pollMs = Number(process.env.HELIO_CODE_POLL_MS || 5000),
} = {}) {
  if (process.env.HELIO_CODE_AUTO_MIGRATE === "true") await migrateHelioCodeStore();
  getHelioCodePool();
  await heartbeat(workerId, "started");
  do {
    await heartbeat(workerId, "polling");
    const job = await claimNextHelioCodeJob({ workerId });
    if (!job) {
      if (once) return null;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }
    try {
      await heartbeat(workerId, `running:${job.id}`);
      await appendHelioCodeLog(job.id, "info", "Starting repo remediation.", { workerId });
      const result = await executeHelioCodeJob(job);
      if (!result.ok) {
        if (result.job?.status === "code-checks-failed") {
          await updateHelioCodeJob(job.id, {
            status: "code-checks-failed",
            result: result.job.result,
            lockedAt: null,
            lockedBy: null,
            availableAt: new Date().toISOString(),
          });
          await appendHelioCodeLog(job.id, "error", "Repo checks failed; PR was not opened.", result.job.result);
          continue;
        }
        await failHelioCodeJob(job, new Error(result.job?.result?.failureReason || "Helio Code execution failed."));
        continue;
      }
      await updateHelioCodeJob(job.id, {
        status: result.job.status,
        result: result.job.result,
        lockedAt: null,
        lockedBy: null,
        availableAt: new Date().toISOString(),
      });
      await appendHelioCodeLog(job.id, "info", `Completed with status ${result.job.status}.`, result.job.result);
      await heartbeat(workerId, "completed-job");
    } catch (error) {
      await failHelioCodeJob(job, error);
      await heartbeat(workerId, "failed-job");
    }
  } while (!once);
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || "worker";
  if (mode === "worker") {
    await runWorkerLoop({ once: process.argv.includes("--once") });
    process.exit(0);
  }
  const payloadPath = mode;
  if (!payloadPath || payloadPath === "--help") {
    console.error("Usage: node scripts/helio-code-worker.mjs worker [--once]");
    console.error("   or: node scripts/helio-code-worker.mjs /path/to/job-payload.json");
    process.exit(1);
  }
  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const result = await executeHelioCodeJob(payload);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
