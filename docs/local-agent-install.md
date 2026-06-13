# Helio Local Agent Installer

Helio is designed to run as a local autonomous agent with a browser dashboard and local worker supervisor.

Target public install command:

```bash
curl -fsSL https://get.helio.bot/install.sh | bash
helio start
```

Until `get.helio.bot` is pointed at the installer, use the GitHub raw URL:

```bash
curl -fsSL https://raw.githubusercontent.com/logicbaseio/HelioAgent/main/install.sh | bash
helio start
```

## What The Installer Does

- Clones or updates the Helio repository into `~/.helio/agent`.
- Installs Node dependencies.
- Creates `~/.local/bin/helio`.
- Creates a local `.env` from `.env.example` if one does not exist.
- Configures local runtime defaults:
  - `HELIO_PUBLIC_URL=http://127.0.0.1:5050`
  - `HELIO_CODE_AGENT_COMMAND=node ~/.helio/agent/scripts/helio-code-agent.mjs`
  - `HELIO_CODE_WORKSPACE_ROOT=~/.helio/workspaces`
  - `HELIO_CODE_AUTO_MIGRATE=true`

## CLI Commands

```bash
helio start          # Start dashboard and local workers
helio stop           # Stop dashboard and workers
helio restart        # Restart everything
helio status         # Show process status
helio doctor         # Check prerequisites and runtime state
helio update         # Pull latest code and reinstall dependencies
helio logs           # Tail dashboard and worker logs
helio open           # Open dashboard
```

## Important Repo Visibility Note

The one-command public installer can only clone from a public repository or a public release artifact.

If `logicbaseio/HelioAgent` stays private, installation still works for authenticated machines, but fresh users will need one of these:

- GitHub CLI/session already authenticated with repo access.
- `HELIO_REPO_URL` pointing to an authenticated URL.
- A public release tarball served from `get.helio.bot`.

Recommended product setup:

1. Keep active development private if needed.
2. Publish signed release artifacts for installers.
3. Point `https://get.helio.bot/install.sh` to the stable installer.
4. Have the installer download release assets instead of cloning private source for end users.

## Domain Setup For `get.helio.bot`

Host `install.sh` at:

```text
https://get.helio.bot/install.sh
```

This can be done with:

- Vercel static project.
- Cloudflare Pages.
- GitHub Pages with custom domain.
- Any static host/CDN.

The hosted script should be the same as `/install.sh` from this repo or a thin wrapper that downloads the latest signed release installer.
