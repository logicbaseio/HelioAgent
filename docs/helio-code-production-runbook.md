# Helio Code Production Runbook

Goal: make Helio Code perform real repo edits, run checks, push a branch, and open a GitHub PR.

## Required Environment

```bash
DATABASE_URL="postgres://..."
HELIO_CODE_AGENT_COMMAND="node /Users/Hamzaa/Documents/Helio/scripts/helio-code-agent.mjs"
GITHUB_TOKEN="ghp_or_github_app_installation_token"
HELIO_CODE_REPO_URL=""
HELIO_CODE_AUTO_MIGRATE="true"
```

Preferred production auth is GitHub App:

```bash
GITHUB_APP_ID="123456"
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
GITHUB_APP_INSTALLATION_ID="12345678"
```

Use either GitHub App credentials or `GITHUB_TOKEN`. The dashboard can also pass the GitHub integration PAT fallback to the worker job.

## Helio Code LLM

The built-in Helio Code agent uses the provider/model/API key saved in the dashboard under:

```text
Integrations -> Helio Code LLM
```

When a job is queued, the dashboard sends that provider config to the worker. The worker exposes it to the built-in agent as:

```bash
HELIO_CODE_LLM_PROVIDER
HELIO_CODE_LLM_MODEL
HELIO_CODE_LLM_API_KEY
```

Recommended provider for code edits: Anthropic Claude.

## Startup

```bash
npm run helio-code:migrate
npm run helio-code:worker
npm run dev -- --host 127.0.0.1 --port 5050
```

## Readiness Check

```bash
curl -s http://127.0.0.1:5050/api/helio-code/readiness
```

Expected 80+ runtime state:

- `DATABASE_URL`: pass
- `HELIO_CODE_AGENT_COMMAND`: pass
- `GitHub Auth`: pass
- `Repo Source`: pass
- `Worker Heartbeat`: pass
- `mode`: `production-ready`
- `score`: `100`

## Real Execution Flow

1. Create or select an AEO/GEO action.
2. Click `Run Helio Code`.
3. Dashboard posts a durable job to `/api/helio-code/jobs`.
4. Worker claims the job from Postgres.
5. Worker clones the repo.
6. Worker writes a redacted `.helio-code-prompt.md`.
7. Worker runs `HELIO_CODE_AGENT_COMMAND`, which calls the Helio Code LLM and writes safe repo edits.
8. Worker validates diff and runs available lint/test/build commands.
9. Worker commits, pushes a branch, and opens a PR.
10. Dashboard polls the job and displays logs, changed files, checks, and PR URL.

## Failure Rules

- No DB: execution is blocked.
- No worker heartbeat: execution is blocked.
- No agent command: execution is blocked.
- No GitHub auth: execution is blocked.
- Agent creates no diff: job fails with `Agent completed without code changes`.
- Repo checks fail: job ends as `code-checks-failed`; PR is not opened.

## Development Escape Hatch

Only for local experiments:

```bash
HELIO_CODE_ALLOW_MEMORY_FALLBACK=true
HELIO_CODE_DEV_SIMULATE_SUCCESS=true
```

Do not use this in production. It is intentionally not counted as real Helio Code execution.
