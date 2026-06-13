#!/usr/bin/env bash
set -euo pipefail

HELIO_REPO_URL="${HELIO_REPO_URL:-https://github.com/logicbaseio/HelioAgent.git}"
HELIO_HOME="${HELIO_HOME:-$HOME/.helio}"
HELIO_APP_DIR="${HELIO_APP_DIR:-$HELIO_HOME/agent}"
HELIO_BIN_DIR="${HELIO_BIN_DIR:-$HOME/.local/bin}"
HELIO_CLI="$HELIO_BIN_DIR/helio"

log() {
  printf 'Helio installer: %s\n' "$*"
}

fail() {
  printf 'Helio installer error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required. Install $1 and rerun this installer."
}

ensure_path_hint() {
  case ":$PATH:" in
    *":$HELIO_BIN_DIR:"*) ;;
    *)
      log "Add this to your shell profile if 'helio' is not found:"
      log "  export PATH=\"$HELIO_BIN_DIR:\$PATH\""
      ;;
  esac
}

install_repo() {
  mkdir -p "$HELIO_HOME"
  if [ -d "$HELIO_APP_DIR/.git" ]; then
    log "Updating existing Helio checkout at $HELIO_APP_DIR"
    git -C "$HELIO_APP_DIR" pull --ff-only
  elif [ -d "$HELIO_APP_DIR" ] && [ "$(find "$HELIO_APP_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')" != "0" ]; then
    fail "$HELIO_APP_DIR exists and is not empty. Set HELIO_APP_DIR to another path or move the existing directory."
  else
    log "Cloning Helio from $HELIO_REPO_URL"
    git clone "$HELIO_REPO_URL" "$HELIO_APP_DIR"
  fi
}

install_dependencies() {
  log "Installing Node dependencies"
  npm --prefix "$HELIO_APP_DIR" install
}

install_cli() {
  mkdir -p "$HELIO_BIN_DIR"
  if [ ! -f "$HELIO_APP_DIR/bin/helio" ]; then
    fail "CLI not found at $HELIO_APP_DIR/bin/helio"
  fi
  chmod +x "$HELIO_APP_DIR/bin/helio"
  ln -sf "$HELIO_APP_DIR/bin/helio" "$HELIO_CLI"
  log "Installed CLI at $HELIO_CLI"
}

bootstrap_env() {
  if [ ! -f "$HELIO_APP_DIR/.env" ]; then
    if [ -f "$HELIO_APP_DIR/.env.example" ]; then
      cp "$HELIO_APP_DIR/.env.example" "$HELIO_APP_DIR/.env"
    else
      touch "$HELIO_APP_DIR/.env"
    fi
    {
      echo ""
      echo "# Local Helio Agent runtime"
      echo "HELIO_PUBLIC_URL=http://127.0.0.1:5050"
      echo "HELIO_CODE_AGENT_COMMAND=\"node $HELIO_APP_DIR/scripts/helio-code-agent.mjs\""
      echo "HELIO_CODE_WORKSPACE_ROOT=$HELIO_HOME/workspaces"
      echo "HELIO_CODE_AUTO_MIGRATE=true"
    } >> "$HELIO_APP_DIR/.env"
    log "Created local env file at $HELIO_APP_DIR/.env"
  else
    log "Existing env file preserved at $HELIO_APP_DIR/.env"
  fi
}

main() {
  need_cmd git
  need_cmd node
  need_cmd npm

  install_repo
  install_dependencies
  install_cli
  bootstrap_env
  ensure_path_hint

  log "Install complete."
  log "Start a fresh Helio Agent with:"
  log "  helio start"
  log "Dashboard will open at:"
  log "  http://127.0.0.1:5050/dashboard"
}

main "$@"
