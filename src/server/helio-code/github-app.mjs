import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function createGitHubAppJwt({
  appId = process.env.GITHUB_APP_ID,
  privateKey = process.env.GITHUB_APP_PRIVATE_KEY,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  if (!appId) throw new Error("GITHUB_APP_ID is required.");
  if (!privateKey) throw new Error("GITHUB_APP_PRIVATE_KEY is required.");
  const normalizedKey = privateKey.replace(/\\n/g, "\n");
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const body = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(body).sign(normalizedKey);
  return `${body}.${base64url(signature)}`;
}

export async function getInstallationAccessToken(installationId, opts = {}) {
  if (!installationId) throw new Error("GitHub App installation id is required.");
  const jwt = createGitHubAppJwt(opts);
  const res = await globalThis.fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `GitHub installation token failed: ${res.status}`);
  return data.token;
}

export function buildAuthenticatedRepoUrl(repo, token) {
  if (!repo || !repo.includes("/")) throw new Error("Repo must be in owner/name format.");
  if (!token) throw new Error("GitHub access token is required.");
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repo}.git`;
}

async function githubApi(repo, token, path, options = {}) {
  const res = await globalThis.fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `GitHub API failed: ${res.status}`);
  return data;
}

export async function openGitHubPullRequest({ repo, token, title, head, base, body, draft = true }) {
  return githubApi(repo, token, "/pulls", {
    method: "POST",
    body: JSON.stringify({ title, head, base, body, draft }),
  });
}

export async function getDefaultBranch(repo, token) {
  const data = await githubApi(repo, token, "");
  return data.default_branch || "main";
}
