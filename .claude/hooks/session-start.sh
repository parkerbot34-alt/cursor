#!/bin/bash
# SessionStart hook: auto-loads THE-CODE.md into every agent's context.
# The agent never has to be told to read it — it arrives automatically, every
# session. This is what makes the code non-optional.
set -euo pipefail

CODE_FILE="${CLAUDE_PROJECT_DIR:-.}/THE-CODE.md"

[ -e "$CODE_FILE" ] || exit 0
RULES_TEXT="$(cat "$CODE_FILE")"

HEADER="MANDATORY OPERATING RULES — THE CODE.
These are not optional background. They are binding laws you follow on EVERY task,
without exception or reminder. Read them now and operate by them for the entire
session. The one-line version: Find a way. Tell the truth. Finish the job.
"

CONTEXT="${HEADER}"$'\n\n'"${RULES_TEXT}"

# Emit as SessionStart additionalContext so it is injected straight into context.
# Use python3 for safe JSON encoding; fall back to plain stdout if unavailable
# (SessionStart also adds raw stdout to context).
if command -v python3 >/dev/null 2>&1; then
  CONTEXT="$CONTEXT" python3 -c '
import json, os
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": os.environ["CONTEXT"],
    }
}))'
else
  printf '%s\n' "$CONTEXT"
fi
