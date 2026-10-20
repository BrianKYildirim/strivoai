#!/usr/bin/env bash
#
# Cross-platform (Linux/macOS/CI) twin of run-edge-tests.ps1.
#
# The canonical offline test list lives in supabase/functions/deno.json as the
# `test:ci` task (single source of truth) — this script simply defers to it, so
# the offline allowlist (and the unconditional exclusion of the live-Supabase
# _tests/test-04..06 files) holds identically on Linux CI and Windows.
#
# Usage: ./scripts/run-edge-tests.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FN_DIR="${REPO_ROOT}/supabase/functions"

echo "Running offline edge function tests (deno task test:ci) in ${FN_DIR}"
cd "${FN_DIR}"

# Force the offline path: remote/live-Supabase tests stay behind
# DENO_TEST_SUPABASE_REMOTE=1 and are NOT part of this CI set.
DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci

echo "All offline edge function tests passed."
