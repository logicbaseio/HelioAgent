# Helio macOS DMG

Helio ships a macOS launcher app that starts the local Helio Agent runtime and opens the dashboard.

## Build

Apple Silicon DMG:

```bash
npm run desktop:release
```

Output:

```text
dist/HelioAgent-<version>-arm64.dmg
```

## Runtime Behavior

On launch, the app:

1. Downloads/runs the public installer from `https://get.helio.bot/install.sh`.
2. Ensures the `helio` CLI is installed.
3. Runs `helio start`.
4. Waits for `http://127.0.0.1:5050/dashboard`.
5. Loads the local dashboard inside the desktop app.

This keeps the real local agent/worker architecture intact. The DMG is a launcher, not a static dashboard-only shell.

## Release

Create a GitHub release and upload:

```bash
gh release create v0.1.0 dist/HelioAgent-0.1.0-arm64.dmg \
  --repo logicbaseio/HelioAgent \
  --title "Helio Agent v0.1.0" \
  --notes "Initial macOS Apple Silicon DMG release."
```

## Signing / Notarization

The current local build is unsigned. For public distribution beyond internal testing, add:

- Apple Developer ID Application certificate.
- Notarization credentials.
- `hardenedRuntime: true`.
- Signed universal builds for both Apple Silicon and Intel Macs.
