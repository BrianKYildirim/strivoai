#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="/c/Projects/strive-ai-hired/.codex/hooks"
WIN_HOOK_DIR="C:\\Projects\\strive-ai-hired\\.codex\\hooks"
LOG_DIR="C:\\Projects\\strive-ai-hired\\.codex\\hook-debug"

mkdir -p "$HOOK_DIR" "$HOOK_DIR/../hook-debug"

make_node_wrapper() {
  local name="$1"
  local script="$2"

  cat > "$HOOK_DIR/$name.cmd" <<EOF2
@echo off
setlocal

set "LOG_DIR=$LOG_DIR"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "STDIN_FILE=%TEMP%\\gsd-$name-stdin.json"
more > "%STDIN_FILE%"

type "%STDIN_FILE%" | "C:\\Program Files\\nodejs\\node.exe" "$WIN_HOOK_DIR\\$script" >> "%LOG_DIR%\\$name.out.log" 2>> "%LOG_DIR%\\$name.err.log"

echo %ERRORLEVEL% >> "%LOG_DIR%\\$name.exitcode.log"

exit /b 0
EOF2
}

make_bash_wrapper() {
  local name="$1"
  local script="$2"

  cat > "$HOOK_DIR/$name.cmd" <<EOF2
@echo off
setlocal

set "LOG_DIR=$LOG_DIR"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "STDIN_FILE=%TEMP%\\gsd-$name-stdin.json"
more > "%STDIN_FILE%"

type "%STDIN_FILE%" | "C:\\Program Files\\Git\\bin\\bash.exe" "$WIN_HOOK_DIR\\$script" >> "%LOG_DIR%\\$name.out.log" 2>> "%LOG_DIR%\\$name.err.log"

echo %ERRORLEVEL% >> "%LOG_DIR%\\$name.exitcode.log"

exit /b 0
EOF2
}

make_node_wrapper "gsd-run-prompt-guard" "gsd-prompt-guard.cjs"
make_node_wrapper "gsd-run-read-guard" "gsd-read-guard.cjs"
make_node_wrapper "gsd-run-workflow-guard" "gsd-workflow-guard.cjs"
make_bash_wrapper "gsd-run-validate-commit" "gsd-validate-commit.sh"

make_node_wrapper "gsd-run-context-monitor" "gsd-context-monitor.cjs"
make_bash_wrapper "gsd-run-phase-boundary" "gsd-phase-boundary.sh"
make_node_wrapper "gsd-run-read-injection-scanner" "gsd-read-injection-scanner.cjs"

make_node_wrapper "gsd-run-check-update" "gsd-check-update.cjs"
make_bash_wrapper "gsd-run-session-state" "gsd-session-state.sh"

echo "Created GSD wrapper .cmd files."
