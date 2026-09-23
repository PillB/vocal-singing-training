#!/usr/bin/env bash
#
# One-shot Cloudflare setup for the entitlements worker: stage A of
# docs/34-PERU-OPERATOR-RUNBOOK.md, done in a single command.
#
# Creates the KV namespaces and the D1 database if they do not exist, writes
# their ids into wrangler.toml, deploys, generates the licence signing key and
# pushes it straight into `wrangler secret put` without it ever touching the
# disk, the terminal or this repository.
#
# It is safe to run twice. Existing resources are reused, not duplicated.
#
# Needs, in the environment and never on the command line:
#   CLOUDFLARE_API_TOKEN   a token with exactly three account permissions:
#                            Workers Scripts    Edit
#                            Workers KV Storage Edit
#                            D1                 Edit
#                          Note "Workers Scripts", NOT "Workers AI" — the
#                          latter is model inference and cannot deploy a Worker.
#   ADMIN_EMAIL            the address allowed to gift and revoke months.
#                          Optional. Stored as a secret rather than in
#                          wrangler.toml, because this repository is public.
#   CLOUDFLARE_ACCOUNT_ID  the account id from the dashboard sidebar. Supply it
#                          and the token needs no Account Settings:Read at all,
#                          which is one fewer permission to hand out.
#
# Usage:
#   workers/entitlements/scripts/setup.sh
#   workers/entitlements/scripts/setup.sh --keep-key   (do not rotate an
#                                          existing licence signing key)

set -euo pipefail

cd "$(dirname "$0")/.."

TOML=wrangler.toml
WORKER_NAME=$(sed -n 's/^name *= *"\(.*\)"/\1/p' "$TOML" | head -1)
D1_NAME=$(sed -n 's/^database_name *= *"\(.*\)"/\1/p' "$TOML" | head -1)
KEEP_KEY=0
[ "${1:-}" = "--keep-key" ] && KEEP_KEY=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n%s\n' "$*" >&2; exit 1; }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die \
  "CLOUDFLARE_API_TOKEN is not set. Add it to the environment, not to a file."

wr() { npx --yes wrangler@4 "$@"; }

# `wrangler whoami` needs Account Settings:Read, which a minimum-permission
# token does not have and does not need. Treat it as informational: when the
# account id is supplied directly there is nothing to look up, and the real
# proof the token works is the first resource call below.
say "Account"
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "using CLOUDFLARE_ACCOUNT_ID from the environment"
else
  echo "no CLOUDFLARE_ACCOUNT_ID set; asking the API which account this token belongs to"
  wr whoami 2>&1 | grep -viE 'telemetry|^$' || die \
    "Could not list accounts. Either add Account Settings:Read to the token, or
set CLOUDFLARE_ACCOUNT_ID (Cloudflare dashboard, right-hand sidebar) and re-run."
fi

# --- KV ---------------------------------------------------------------------
# wrangler titles a namespace <worker>-<binding>, and <worker>-<binding>_preview
# for the preview one. Look them up by title so a second run reuses them.
kv_id_for() {
  wr kv namespace list 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        const j=s.slice(s.indexOf("["));
        try{const n=JSON.parse(j).find(x=>x.title===process.argv[1]);
        if(n)process.stdout.write(n.id)}catch(e){}})' "$1"
}

say "KV namespace"
KV_TITLE="${WORKER_NAME}-ENTITLEMENTS"
KV_ID=$(kv_id_for "$KV_TITLE")
if [ -z "$KV_ID" ]; then
  wr kv namespace create ENTITLEMENTS >/dev/null
  KV_ID=$(kv_id_for "$KV_TITLE")
  echo "created $KV_TITLE"
else
  echo "reusing $KV_TITLE"
fi
[ -n "$KV_ID" ] || die "Could not create or find the KV namespace $KV_TITLE."

KV_PREVIEW_TITLE="${KV_TITLE}_preview"
KV_PREVIEW_ID=$(kv_id_for "$KV_PREVIEW_TITLE")
if [ -z "$KV_PREVIEW_ID" ]; then
  wr kv namespace create ENTITLEMENTS --preview >/dev/null
  KV_PREVIEW_ID=$(kv_id_for "$KV_PREVIEW_TITLE")
  echo "created $KV_PREVIEW_TITLE"
else
  echo "reusing $KV_PREVIEW_TITLE"
fi
[ -n "$KV_PREVIEW_ID" ] || die "Could not create or find $KV_PREVIEW_TITLE."

# --- D1 ---------------------------------------------------------------------
say "D1 database"
D1_ID=$(wr d1 info "$D1_NAME" --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const i=s.indexOf("{");if(i<0)return;
      try{process.stdout.write(JSON.parse(s.slice(i)).uuid||"")}catch(e){}})' || true)
if [ -z "$D1_ID" ]; then
  wr d1 create "$D1_NAME" >/dev/null
  D1_ID=$(wr d1 info "$D1_NAME" --json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        const i=s.indexOf("{");if(i<0)return;
        try{process.stdout.write(JSON.parse(s.slice(i)).uuid||"")}catch(e){}})')
  echo "created $D1_NAME"
else
  echo "reusing $D1_NAME"
fi
[ -n "$D1_ID" ] || die "Could not create or find the D1 database $D1_NAME."

# --- write the ids in --------------------------------------------------------
say "Writing the ids into $TOML"
node - "$TOML" "$KV_ID" "$KV_PREVIEW_ID" "$D1_ID" <<'NODE'
const fs = require("node:fs");
const [file, kv, kvPreview, d1] = process.argv.slice(2);
let t = fs.readFileSync(file, "utf8");
t = t.replace(/^(id *= *)"[^"]*"/m, `$1"${kv}"`);
t = t.replace(/^(preview_id *= *)"[^"]*"/m, `$1"${kvPreview}"`);
t = t.replace(/^(database_id *= *)"[^"]*"/m, `$1"${d1}"`);
fs.writeFileSync(file, t);
NODE
grep -E '^(id|preview_id|database_id) *=' "$TOML"

# --- deploy ------------------------------------------------------------------
say "Deploying"
DEPLOY_LOG=$(mktemp)
wr deploy 2>&1 | tee "$DEPLOY_LOG"
WORKER_URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$DEPLOY_LOG" | head -1 || true)
rm -f "$DEPLOY_LOG"

# --- the signing key ---------------------------------------------------------
# Generated, piped into wrangler, and dropped. The private half is never
# written to a file and never printed. Only the public JWK comes back out.
JWK_OUT=jwk.public.json
if [ "$KEEP_KEY" = "1" ] && wr secret list 2>/dev/null | grep -q LICENSE_PRIVATE_KEY_PKCS8_B64; then
  say "Licence signing key: keeping the existing one (--keep-key)"
else
  say "Licence signing key"
  KEY_ID=$(sed -n 's/^LICENSE_KEY_ID *= *"\(.*\)"/\1/p' "$TOML" | head -1)
  node - "${KEY_ID:-k1}" "$JWK_OUT" <<'NODE' | wr secret put LICENSE_PRIVATE_KEY_PKCS8_B64
const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const [kid, jwkOut] = process.argv.slice(2);
webcrypto.subtle
  .generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
  .then(async (pair) => {
    const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", pair.privateKey);
    const pub = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
    fs.writeFileSync(jwkOut, JSON.stringify({
      kty: "EC", crv: "P-256", x: pub.x, y: pub.y,
      alg: "ES256", use: "sig", kid, key_ops: ["verify"]
    }, null, 2) + "\n");
    process.stdout.write(Buffer.from(new Uint8Array(pkcs8)).toString("base64"));
  })
  .catch((e) => { console.error(e); process.exit(1); });
NODE
  echo "private half pushed as a secret; public half written to $JWK_OUT"
fi

# --- admin email -------------------------------------------------------------
# A secret, not a [vars] entry, because this repository is public and a var
# would publish the address in git history forever.
if [ -n "${ADMIN_EMAIL:-}" ]; then
  say "Admin email"
  printf '%s' "$ADMIN_EMAIL" | wr secret put ADMIN_EMAILS
  echo "stored as a secret, not in $TOML"
fi

# --- prove it ----------------------------------------------------------------
say "Checking the worker answers"
if [ -n "$WORKER_URL" ]; then
  echo "$WORKER_URL"
  curl -fsS "$WORKER_URL/v1/health" && echo || echo "(no /v1/health route; try /v1/jwks)"
  curl -fsS "$WORKER_URL/v1/jwks" && echo || true
else
  echo "Could not read the worker URL out of the deploy output; check the dashboard."
fi

say "Done"
echo "Worker URL : ${WORKER_URL:-see above}"
echo "Public JWK : workers/entitlements/$JWK_OUT"
echo
echo "Next: paste both into js/billing-config.js (apiBaseUrl and publicKeyJwk)."
echo "The private key is not on this machine and not in this repository."
