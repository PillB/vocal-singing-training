#!/usr/bin/env bash
# Deploy a freshly fetched main snapshot; keep account details outside git.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
exec node "$ROOT/workers/entitlements/scripts/deploy-main.mjs" "$@"
