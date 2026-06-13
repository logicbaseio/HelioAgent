# Helio Dashboard

## One-Command Local Agent Install

Target public installer:

```bash
curl -fsSL https://get.helio.bot/install.sh | bash
helio start
```

GitHub raw fallback while `get.helio.bot` is being wired:

```bash
curl -fsSL https://raw.githubusercontent.com/logicbaseio/HelioAgent/main/install.sh | bash
helio start
```

This installs Helio into `~/.helio/agent`, adds the `helio` CLI, starts the dashboard on `http://127.0.0.1:5050/dashboard`, and starts the local Helio Code worker.

## Run

```bash
npm install
npm run dev
```

## CLI

```bash
helio start
helio stop
helio restart
helio status
helio doctor
helio update
helio logs
```

## Current Structure

- `src/App.tsx`: app entry
- `src/features/dashboard/HelioDashboard.tsx`: current full dashboard implementation
- `src/main.tsx`: React bootstrap

## Next Refactor Targets

1. `src/features/integrations/*` for provider panels and auth
2. `src/features/modules/*` for Mission, Audit, Keywords, Content, etc.
3. `src/components/ui/*` for shared UI primitives (`Btn`, `Card`, `Input`, `Tabs`, `TermLog`)
4. `src/lib/*` for config, constants, API clients, and types

## Notes

- Original source file is kept at project root as `helio_dashboard.tsx` for reference.
- The app is now scaffolded so modular refactors can proceed incrementally.
