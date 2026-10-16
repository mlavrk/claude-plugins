#!/usr/bin/env bash
# Installs the status line: copies statusline.sh to a stable path and points
# statusLine in ~/.claude/settings.json at it.
# Usage: setup.sh [--force]
# Exit: 0 ok, 1 jq missing, 2 different statusLine exists (use --force),
#       3 settings.json is not a JSON object or could not be written (unchanged).
set -u

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"
DEST="$CLAUDE_DIR/statusline/usage.sh"
ENTRY='{"type":"command","command":"bash ~/.claude/statusline/usage.sh"}'

force=0
[ "${1:-}" = "--force" ] && force=1

if ! command -v jq >/dev/null 2>&1; then
  echo "usage-statusline needs jq. Install jq:"
  case "${OSTYPE:-}" in
    darwin*) echo "  brew install jq" ;;
    *)       echo "  sudo apt install jq   # or: sudo dnf install jq" ;;
  esac
  exit 1
fi

tmp=""
fail() {
  [ -n "$tmp" ] && rm -f "$tmp"
  echo "$1; $SETTINGS not modified."
  exit 3
}

install_script() {
  mkdir -p "$(dirname "$DEST")" && cp "$SCRIPTS_DIR/statusline.sh" "$DEST" \
    || fail "could not copy the script to $DEST"
}

# A missing or empty settings.json is treated as {}.
if [ -s "$SETTINGS" ]; then
  if ! err="$(jq -e 'type == "object"' "$SETTINGS" 2>&1 >/dev/null)"; then
    fail "$SETTINGS is not a valid JSON object${err:+ ($err)}"
  fi
  existing="$(jq -c '.statusLine // empty' "$SETTINGS")"
  if [ "$existing" = "$ENTRY" ]; then
    # Already installed: refresh the script, keep settings and backup as-is.
    install_script
    echo "Already installed; script refreshed."
    exit 0
  fi
  if [ -n "$existing" ] && [ "$force" -eq 0 ]; then
    echo "existing statusLine: $existing"
    echo "Re-run with --force to replace it."
    exit 2
  fi
  has_settings=1
else
  has_settings=0
fi

install_script

tmp="$(mktemp "$CLAUDE_DIR/settings.XXXXXX")" || fail "could not create a temp file"
if [ "$has_settings" -eq 1 ]; then
  cp "$SETTINGS" "$SETTINGS.bak" || fail "could not back up settings"
  jq --argjson sl "$ENTRY" '.statusLine = $sl' "$SETTINGS" > "$tmp" || fail "could not update settings"
else
  jq -n --argjson sl "$ENTRY" '{statusLine: $sl}' > "$tmp" || fail "could not create settings"
fi

if [ -L "$SETTINGS" ]; then
  # Write through the symlink so dotfile setups keep their link.
  cat "$tmp" > "$SETTINGS" 2>/dev/null || fail "could not write through symlink"
  rm -f "$tmp"
else
  mv "$tmp" "$SETTINGS" || fail "could not replace settings"
fi

echo "Installed. Restart Claude Code or start a new session to see the status line."
