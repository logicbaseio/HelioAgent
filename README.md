# Helio Dashboard

## Run

```bash
npm install
npm run dev
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
