---
description: Install the usage status line into ~/.claude/settings.json
allowed-tools: Bash
---

Run this command:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"
```

Then act on its exit code:

- **0**: Tell the user it is installed and that the status line appears in a new session (or after restarting Claude Code). Mention `~/.claude/settings.json.bak` holds their previous settings, if that file was created.
- **1**: `jq` is missing. Show the install command the script printed and ask the user to run `/usage-statusline:setup` again afterwards.
- **2**: A different `statusLine` is already configured. Show the user the existing value the script printed and ask whether to replace it. Only if they explicitly say yes, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh" --force`. Otherwise change nothing.
- **3**: `settings.json` is not a valid JSON object or could not be written; it was left unchanged. Relay the error and suggest they fix the file and re-run.
