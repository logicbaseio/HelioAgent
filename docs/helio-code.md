# Helio Code

Helio Code is the repo-remediation agent boundary for SEO, AEO, and GEO fixes.

## Runtime Shape

- The dashboard creates Helio Code jobs through `POST /api/helio-code/jobs`.
- Local Vite dev uses an in-memory adapter so the UI can exercise the flow.
- Production runs `scripts/helio-code-worker.mjs` as a dedicated worker service backed by Postgres and a durable queue.
- The worker is responsible for cloning repos, running the coding agent, running checks, and opening PRs through a GitHub App.

## Required Production Services

- Postgres job store for job records, logs, evidence, retries, and status. Apply `docs/helio-code-postgres.sql` with `npm run helio-code:migrate`.
- Queue runner with retries, timeout, workspace cleanup boundary, and stuck-job recovery through `for update skip locked`.
- GitHub App credentials and installation access token minting.
- Isolated workspace root for repo clones.
- Codex-compatible command configured as `HELIO_CODE_AGENT_COMMAND`.

## Job Contract

Required payload fields:

- `missionId`
- `orgId`
- `domain`
- `repo`
- `issueType`
- `priority`
- `severity`
- `auditEvidence`
- `affectedUrls`
- `expectedOutcome`
- `constraints`
- `skillId`

Result evidence:

- `status`
- `branch`
- `pullRequestUrl`
- `changedFiles`
- `checks`
- `riskScore`
- `rollbackNotes`
- `agentSummary`
- `failureReason`

## Safety Rules

- Helio Code opens branches and PRs only. It does not merge in V1.
- Mission status `code-pr-opened` is not resolution.
- Only post-deploy Helio Core verification can move a mission to `resolved-verified`.
- AEO/GEO v1 is limited to code-backed markup and structural enhancements. It must not invent facts, reviews, ratings, or large content rewrites.

## Local Worker Usage

```bash
HELIO_CODE_REPO_URL=https://github.com/owner/repo.git \
HELIO_CODE_AGENT_COMMAND="codex exec" \
node scripts/helio-code-worker.mjs ./job-payload.json
```

The worker writes `.helio-code-prompt.md` in the cloned repo, lets the configured agent produce a diff, runs available package checks, and returns a JSON job result.

## Production Worker Usage

```bash
npm run helio-code:migrate
npm run helio-code:worker
```

Required environment:

- `DATABASE_URL`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_INSTALLATION_ID` or per-job `githubInstallationId`
- `HELIO_CODE_AGENT_COMMAND`

The production worker claims queued jobs from Postgres, clones the target repo with a short-lived GitHub App installation token, creates a `helio-code/*` branch, runs the configured coding agent, runs package checks, commits passing changes, pushes the branch, and opens a draft PR with evidence. If checks fail, the job becomes `code-checks-failed` and no PR is opened.
