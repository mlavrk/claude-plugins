#!/usr/bin/env bash
# Installs the status line: copies statusline.sh to a stable path and points
# statusLine in ~/.claude/settings.json at it.
# Usage: setup.sh [--force]
# Exit: 0 ok, 1 jq missing, 2 different statusLine exists (use --force),
#       3 settings.json is not valid JSON.
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

if [ -e "$SETTINGS" ]; then
  if ! jq empty "$SETTINGS" >/dev/null 2>&1; then
    echo "$SETTINGS is not valid JSON; not modified."
    exit 3
  fi
  existing="$(jq -c '.statusLine // empty' "$SETTINGS")"
  if [ -n "$existing" ] && [ "$existing" != "$ENTRY" ] && [ "$force" -eq 0 ]; then
    echo "existing statusLine: $existing"
    echo "Re-run with --force to replace it."
    exit 2
  fi
fi

mkdir -p "$(dirname "$DEST")"
cp "$SCRIPTS_DIR/statusline.sh" "$DEST"

if [ -e "$SETTINGS" ]; then
  cp "$SETTINGS" "$SETTINGS.bak"
  src="$SETTINGS"
else
  src=/dev/null
fi

tmp="$(mktemp "$CLAUDE_DIR/settings.XXXXXX")"
if [ "$src" = /dev/null ]; then
  jq -n --argjson sl "$ENTRY" '{statusLine: $sl}' > "$tmp"
else
  jq --argjson sl "$ENTRY" '.statusLine = $sl' "$src" > "$tmp"
fi

if [ -L "$SETTINGS" ]; then
  # Write through the symlink so dotfile setups keep their link.
  cat "$tmp" > "$SETTINGS"
  rm -f "$tmp"
else
  mv "$tmp" "$SETTINGS"
fi

echo "Installed. Restart Claude Code or start a new session to see the status line."
