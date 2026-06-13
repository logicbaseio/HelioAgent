import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { readHelioCodeWorkerHeartbeat } from "./readiness.mjs";

let workerProcess = null;
let lastStartError = "";

export async function getHelioCodeWorkerStatus() {
  const heartbeat = await readHelioCodeWorkerHeartbeat();
  return {
    ok: true,
    running: !!(workerProcess && !workerProcess.killed && workerProcess.exitCode == null),
    pid: workerProcess?.pid || null,
    heartbeat,
    lastStartError,
  };
}

export async function startHelioCodeWorker({ cwd = process.cwd() } = {}) {
  const current = await getHelioCodeWorkerStatus();
  if (current.running || current.heartbeat?.ok) {
    return { ...current, started: false, message: "Helio Code worker is already running." };
  }
  const script = path.join(cwd, "scripts", "helio-code-worker.mjs");
  const child = spawn(process.execPath, ["--env-file=.env", script, "worker"], {
    cwd,
    env: { ...process.env },
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  workerProcess = child;
  lastStartError = "";
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[helio-code-worker] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[helio-code-worker] ${chunk}`);
  });
  child.on("error", (error) => {
    lastStartError = error?.message || String(error);
  });
  child.on("exit", (code, signal) => {
    lastStartError = code || signal ? `Worker exited (${code || signal})` : "";
    workerProcess = null;
  });
  await new Promise((resolve) => setTimeout(resolve, 900));
  return { ...(await getHelioCodeWorkerStatus()), started: true, message: "Helio Code worker start requested." };
}
