#!/usr/bin/env bash
set -u

LOG_DIR="/c/Projects/strive-ai-hired/.codex/hook-debug"
mkdir -p "$LOG_DIR"

NAME="$1"
shift

TS="$(date +%Y%m%d-%H%M%S)"
STDIN_FILE="$LOG_DIR/${NAME}-${TS}.stdin.json"
OUT_FILE="$LOG_DIR/${NAME}-${TS}.out.log"
ERR_FILE="$LOG_DIR/${NAME}-${TS}.err.log"
ENV_FILE="$LOG_DIR/${NAME}-${TS}.env.log"

cat > "$STDIN_FILE"
env | sort > "$ENV_FILE"

cat "$STDIN_FILE" | "$@" > "$OUT_FILE" 2> "$ERR_FILE"
CODE=$?

echo "$CODE" > "$LOG_DIR/${NAME}-${TS}.exitcode"

exit "$CODE"
