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
#   workers/entitlements/scripts/setup.sh --rotate-key  (replace an existing
#                          licence signing key — this invalidates every licence
#                          already issued, so it is never the default)

set -euo pipefail

cd "$(dirname "$0")/.."

TOML=wrangler.toml
D1_NAME=$(sed -n 's/^database_name *= *"\(.*\)"/\1/p' "$TOML" | head -1)
ROTATE_KEY=0
[ "${1:-}" = "--rotate-key" ] && ROTATE_KEY=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n%s\n' "$*" >&2; exit 1; }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die \
  "CLOUDFLARE_API_TOKEN is not set. Add it to the environment, not to a file."

# wrangler 4 needs Node 20 or newer, and so does the key generation below. A
# Mac with an older Homebrew node fails several steps later with a much
# less obvious message, so say it here instead.
command -v node >/dev/null 2>&1 || die \
  "node is not installed. Install Node 20 or newer (https://nodejs.org) and re-run."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] 2>/dev/null || die \
  "node $(node --version) is too old. wrangler 4 needs Node 20 or newer."

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

# --- reading ids back out of wrangler ----------------------------------------
# wrangler writes banners, warnings and ANSI colour to the same stream as its
# JSON, and at least one of those banners contains a literal "[":
#   ▲ [WARNING] Proxy environment variables detected.
# So "slice from the first bracket" picks the wrong offset and the parse fails.
# extract_json strips ANSI, then tries every plausible start offset in turn and
# keeps the first one that parses into the shape asked for.
extract_json() {
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      s = s.replace(/\x1b\[[0-9;]*m/g, "");
      const want = process.argv[1];          // "array" | "object"
      const open = want === "array" ? "[" : "{";
      for (let i = s.indexOf(open); i !== -1; i = s.indexOf(open, i + 1)) {
        for (let j = s.length; j > i; j--) {
          const close = s.lastIndexOf(want === "array" ? "]" : "}", j);
          if (close <= i) break;
          try {
            const v = JSON.parse(s.slice(i, close + 1));
            if (want === "array" ? Array.isArray(v) : v && typeof v === "object") {
              process.stdout.write(JSON.stringify(v));
              return;
            }
          } catch (e) { /* keep trying */ }
          j = close;
        }
      }
    });
  ' "$1"
}

say "KV namespace"
# The positional argument to `kv namespace create` is the namespace NAME, not a
# binding — wrangler 4 takes the binding separately, via --binding. Read the id
# straight out of the create output, and fall back to an exact title match
# against the list when the namespace already exists.
kv_lookup() { # $1 = exact title to match
  wr kv namespace list 2>/dev/null | extract_json array \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        let a=[];try{a=JSON.parse(s)}catch(e){return}
        const n=a.find(x=>x&&x.title===process.argv[1]);
        if(n&&n.id)process.stdout.write(n.id)})' "$1"
}
# `create --preview` prints `preview_id = "..."`, plain create prints
# `id = "..."` — wrangler builds the key as `${preview ? "preview_" : ""}id`.
# Anchoring on `^id` therefore matched the live create and silently extracted
# nothing from the preview one, which is exactly how the first real run failed.
kv_create() { # $1 = namespace name, $2... = extra flags; prints the new id
  wr kv namespace create "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
    | sed -n 's/^[[:space:]]*\(preview_\)\?id[[:space:]]*=[[:space:]]*"\([0-9a-f]\{32\}\)".*/\2/p' \
    | head -1
}

# wrangler titles the namespace `${env-}${name}${_preview}` and prefixes
# nothing else, so the title is exactly the name passed in. Guessing a
# "<worker>-<name>" title meant the lookup never matched, so a second run
# would try to create a namespace that already exists and be refused.
KV_NAME=ENTITLEMENTS
KV_TITLE="$KV_NAME"
KV_ID=$(kv_lookup "$KV_TITLE")
if [ -n "$KV_ID" ]; then
  echo "reusing $KV_TITLE"
else
  KV_ID=$(kv_create "$KV_NAME")
  [ -n "$KV_ID" ] || KV_ID=$(kv_lookup "$KV_TITLE")
  [ -n "$KV_ID" ] || die "Could not create or find the KV namespace $KV_TITLE."
  echo "created $KV_TITLE"
fi

KV_PREVIEW_TITLE="${KV_TITLE}_preview"
KV_PREVIEW_ID=$(kv_lookup "$KV_PREVIEW_TITLE")
if [ -n "$KV_PREVIEW_ID" ]; then
  echo "reusing $KV_PREVIEW_TITLE"
else
  KV_PREVIEW_ID=$(kv_create "$KV_NAME" --preview)
  [ -n "$KV_PREVIEW_ID" ] || KV_PREVIEW_ID=$(kv_lookup "$KV_PREVIEW_TITLE")
  [ -n "$KV_PREVIEW_ID" ] || die "Could not create or find $KV_PREVIEW_TITLE."
  echo "created $KV_PREVIEW_TITLE"
fi
[ "$KV_ID" != "$KV_PREVIEW_ID" ] || die \
  "The live and preview KV namespaces came back with the same id — refusing to
continue, because that would point preview writes at production data."

# --- D1 ---------------------------------------------------------------------
say "D1 database"
# NOT `d1 info`: that resolves the database through wrangler.toml first, and
# `hasUuid` is a plain truthiness check, so the literal TODO_REPLACE placeholder
# sitting in the file counts as an id. wrangler then asks the API for a database
# whose id is "TODO_REPLACE_WITH_D1_DATABASE_ID", gets a 404, and the lookup
# comes back empty both before AND after the create — which would have stopped
# this script dead every run, and every re-run after it.
# `d1 list` reads no config at all, and with --json prints a bare JSON array
# and suppresses the banner.
d1_lookup() {
  wr d1 list --json 2>/dev/null | extract_json array \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        let a=[];try{a=JSON.parse(s)}catch(e){return}
        const d=a.find(x=>x&&x.name===process.argv[1]);
        if(d&&d.uuid)process.stdout.write(d.uuid)})' "$D1_NAME"
}
# `d1 create` prints the same TOML snippet the KV creates do, carrying
# `database_id = "<uuid>"`. A D1 id is a hyphenated UUID, not 32 bare hex.
d1_create() {
  wr d1 create "$D1_NAME" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
    | sed -n 's/^[[:space:]]*database_id[[:space:]]*=[[:space:]]*"\([0-9a-fA-F-]\{36\}\)".*/\1/p' \
    | head -1
}
D1_ID=$(d1_lookup)
if [ -n "$D1_ID" ]; then
  echo "reusing $D1_NAME"
else
  D1_ID=$(d1_create)
  [ -n "$D1_ID" ] || D1_ID=$(d1_lookup)
  [ -n "$D1_ID" ] || die "Could not create or find the D1 database $D1_NAME."
  echo "created $D1_NAME"
fi

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

# A placeholder surviving to this point means a lookup silently returned nothing
# and the deploy would bind the Worker to a namespace that does not exist.
! grep -q 'TODO_REPLACE' "$TOML" || die \
  "$TOML still contains a TODO_REPLACE placeholder. Stopping before the deploy
rather than shipping a Worker bound to a resource that does not exist."

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
if [ "$ROTATE_KEY" != "1" ] && wr secret list 2>/dev/null | grep -q LICENSE_PRIVATE_KEY_PKCS8_B64; then
  say "Licence signing key: one already exists, keeping it"
  echo "every licence already issued stays valid. Pass --rotate-key to replace it."
  # The file is not regenerated: the public half must keep matching the private
  # half already deployed, and the private half is not on this machine. But a
  # re-run from a fresh clone has no file at all, and the operator still needs
  # the public key. The deployed worker publishes it, so fetch it back.
  if [ ! -f "$JWK_OUT" ] && [ -n "$WORKER_URL" ]; then
    echo "$JWK_OUT is missing here; recovering the public half from $WORKER_URL/v1/jwks"
    curl -fsS "$WORKER_URL/v1/jwks" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
          try{const k=JSON.parse(s).keys[0];
            require("node:fs").writeFileSync(process.argv[1],JSON.stringify(k,null,2)+"\n")}
          catch(e){process.exit(1)}})' "$JWK_OUT" \
      && echo "recovered into $JWK_OUT" \
      || echo "could not recover it; read it from $WORKER_URL/v1/jwks yourself"
  else
    echo "NOTE: $JWK_OUT is NOT rewritten, because the public half must keep"
    echo "matching the private half already deployed."
  fi
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
if [ -f "$JWK_OUT" ]; then
  echo "Public JWK : workers/entitlements/$JWK_OUT"
else
  echo "Public JWK : not on this machine — read it from ${WORKER_URL:-the worker}/v1/jwks"
fi
echo
echo "Next: paste both into js/billing-config.js (apiBaseUrl and publicKeyJwk)."
echo "The private key is not on this machine and not in this repository."
