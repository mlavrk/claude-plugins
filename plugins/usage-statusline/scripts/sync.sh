#!/usr/bin/env bash
# SessionStart hook: if setup was run, refresh the installed status line
# script when the plugin's copy changed (e.g. after a plugin update).
# Never touches settings.json, prints nothing, always exits 0.

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/statusline.sh"
dest="$HOME/.claude/statusline/usage.sh"

if [ -f "$dest" ] && ! cmp -s "$src" "$dest"; then
  cp "$src" "$dest"
fi >/dev/null 2>&1

exit 0
