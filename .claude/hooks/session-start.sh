#!/bin/bash
# SessionStart hook: auto-loads the warband rules into every agent's context.
# The agent never has to be told to read them — they arrive automatically,
# every session, every time. This is what makes the rules non-optional.
set -euo pipefail

RULES_DIR="${CLAUDE_PROJECT_DIR:-.}/rules"

# Build the rules text from every file in rules/, in order (lowest number first).
RULES_TEXT=""
if [ -d "$RULES_DIR" ]; then
  for f in "$RULES_DIR"/*.md; do
    [ -e "$f" ] || continue
    RULES_TEXT+="$(cat "$f")"$'\n\n'
  done
fi

HEADER="MANDATORY OPERATING RULES — THE WARBAND CODE.
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
