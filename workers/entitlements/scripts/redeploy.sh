#!/usr/bin/env bash
#
# Redeploy the entitlements worker, in the order that cannot hurt.
#
# The site on GitHub Pages redeploys itself when `main` changes. The worker does
# not: it is a separate thing that has to be pushed from a machine signed in to
# Cloudflare. This script is section 8.7 of docs/ADMIN-GUIDE.md done in one
# command, with every check that section asks for made automatically.
#
# Why two deploys instead of one
# ------------------------------
# The first one goes up with `EVENTS_ENABLED=false`, which is the only thing in
# this worker that writes a database row for every visitor action. D1's free
# plan stops accepting writes for the rest of the day past 100,000 of them, and
# those writes are the same ones a payment needs. So the sequence is: put the
# new code up with the firehose off, prove it is healthy, and only then turn
# statistics on with a plain deploy. If anything is wrong, it is wrong on a
# worker that is writing almost nothing, and `wrangler rollback` (8.10) puts the
# old one back.
#
# Deploying never touches secrets, the database or the KV store. Admins, the
# licence signing key and everybody's Pro survive it; Cloudflare's own docs say
# "Secrets are never deleted by a deployment". `--var EVENTS_ENABLED:false`
# overrides that one value from wrangler.toml for that one deploy, and the
# second, plain deploy puts wrangler.toml's `true` back.
#
# Usage, from anywhere in the repository:
#   workers/entitlements/scripts/redeploy.sh            the whole sequence
#   workers/entitlements/scripts/redeploy.sh --check    read the live worker
#                                                       and say what is on; no
#                                                       deploy, no credentials
#   workers/entitlements/scripts/redeploy.sh --yes      no questions (once you
#                                                       have done it by hand)
#   workers/entitlements/scripts/redeploy.sh --one-step skip the events-off
#                                                       stage; only for a
#                                                       redeploy that changes
#                                                       nothing about events
#
# Needs: node 22+, git, curl, and a terminal already signed in to Cloudflare
# (`npx --yes wrangler@4 login`, or CLOUDFLARE_API_TOKEN in the environment).

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT=$(cd ../.. && pwd)
TOML=wrangler.toml

CHECK_ONLY=0
ASSUME_YES=0
ONE_STEP=0
# `--probe FIELD VALUE` waits for one field of /v1/health to have one value and
# exits 0 or 1. It is the check the two deploys below hang on, exposed on its own
# so qa/check-redeploy.mjs can prove it says no when it should. Not in --help:
# it is a test hook, not a thing to run.
PROBE_FIELD=""
PROBE_WANT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --one-step) ONE_STEP=1 ;;
    --probe)
      [ $# -ge 3 ] || { printf '%s\n' "--probe needs a field and a value" >&2; exit 2; }
      PROBE_FIELD="$2"
      PROBE_WANT="$3"
      shift 2
      ;;
    -h|--help) sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'Unknown option: %s (try --help)\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32mok\033[0m    %s\n' "$*"; }
bad() { printf '  \033[31mno\033[0m    %s\n' "$*"; }
note() { printf '        %s\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

ask() {
  [ "$ASSUME_YES" = "1" ] && return 0
  printf '\n%s [y/N] ' "$1"
  read -r answer
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

wr() { npx --yes wrangler@4 "$@"; }

# ---------------------------------------------------------------- preflight

command -v node >/dev/null 2>&1 || die \
  "node is not installed. Install Node 22 or newer (https://nodejs.org) and re-run."
# wrangler 4 refuses to start on anything older; see the same guard in setup.sh.
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] 2>/dev/null || die \
  "node $(node --version) is too old. wrangler 4 needs Node 22 or newer."
command -v curl >/dev/null 2>&1 || die "curl is not installed."

# The worker's address lives in the site's own config, so there is one copy of
# it and this script cannot drift from what the site actually calls.
# VT_WORKER_URL overrides it, which is how the test in qa/check-redeploy.mjs
# points --check at a stub, and how you would check a second, staging worker.
API="${VT_WORKER_URL:-}"
[ -n "$API" ] || API=$(node -e '
  const fs = require("fs");
  const src = fs.readFileSync(process.argv[1], "utf8");
  const m = /apiBaseUrl:\s*"([^"]*)"/.exec(src);
  process.stdout.write(m ? m[1].replace(/\/+$/, "") : "");
' "$REPO_ROOT/js/billing-config.js")
API="${API%/}"
[ -n "$API" ] || die "No apiBaseUrl in js/billing-config.js, so there is no worker to check."

# Reads /v1/health and prints one line per thing, from the worker's own answer.
# A missing field is never read as "off": it means this worker is older than the
# field, which is a different problem with a different fix (this script).
health() {
  local body
  if ! body=$(curl -fsS --max-time 20 "$API/v1/health" 2>/dev/null); then
    bad "$API/v1/health did not answer"
    return 1
  fi
  printf '%s' "$body" | node -e '
    let raw = "";
    process.stdin.on("data", (d) => { raw += d; });
    process.stdin.on("end", () => {
      let h;
      try { h = JSON.parse(raw); } catch { console.log("  no    the answer was not JSON"); process.exit(3); }
      const a = h.authMethods || {};
      const line = (name, value) => {
        const state = value === undefined || value === null
          ? ["??", "not reported (this worker is older than the field)"]
          : value ? ["ok", "on"] : ["no", "off"];
        const colour = state[0] === "ok" ? 32 : state[0] === "no" ? 31 : 33;
        console.log(`  \u001b[${colour}m${state[0]}\u001b[0m    ${name}: ${state[1]}`);
      };
      line("accounts and gifts", h.accountsConfigured);
      line("licence signing", h.signingKeyConfigured);
      line("sign in with Google", a.google);
      line("sign in by emailed code", a.email);
      line("payments (Stripe)", h.stripeConfigured);
      line("payments (Mercado Pago)", h.mercadopagoConfigured);
      line("anonymous statistics", h.eventsEnabled);
      line("problem reports", h.reportsEnabled);
      const days = a.trialDays;
      console.log(`  ${days === 7 ? "\u001b[32mok\u001b[0m   " : "\u001b[33m??\u001b[0m   "} free trial: ${days === undefined ? "not reported" : days + " days"}`);
      console.log(`        site allowed: ${h.siteOrigin || "(none)"}`);
      // The machine-readable line the script greps for.
      console.log("HEALTH " + JSON.stringify({
        accounts: !!h.accountsConfigured,
        signing: !!h.signingKeyConfigured,
        events: h.eventsEnabled,
        reports: h.reportsEnabled,
        trialDays: a.trialDays,
        origin: h.siteOrigin || ""
      }));
    });
  '
}

# One field out of the machine-readable line above.
health_field() {
  printf '%s' "$1" | sed -n 's/^HEALTH //p' | node -e '
    let raw = "";
    process.stdin.on("data", (d) => { raw += d; });
    process.stdin.on("end", () => {
      let h = {};
      try { h = JSON.parse(raw); } catch { /* no line */ }
      const v = h[process.argv[1]];
      process.stdout.write(v === undefined || v === null ? "" : String(v));
    });
  ' "$2"
}

# Reads health until a field has the value we are waiting for. A deploy is live
# within a second or two, but asking once and giving up turns a slow edge into a
# false alarm.
wait_for() {
  local field="$1" want="$2" tries="${3:-12}" out=""
  local i=1
  while [ "$i" -le "$tries" ]; do
    out=$(health || true)
    if [ "$(health_field "$out" "$field")" = "$want" ]; then
      printf '%s\n' "$out" | grep -v '^HEALTH '
      return 0
    fi
    sleep 3
    i=$((i + 1))
  done
  printf '%s\n' "$out" | grep -v '^HEALTH '
  return 1
}

if [ -n "$PROBE_FIELD" ]; then
  if wait_for "$PROBE_FIELD" "$PROBE_WANT" "${VT_PROBE_TRIES:-12}" >/dev/null; then
    printf 'probe %s=%s held\n' "$PROBE_FIELD" "$PROBE_WANT"
    exit 0
  fi
  printf 'probe %s=%s did not hold\n' "$PROBE_FIELD" "$PROBE_WANT"
  exit 1
fi

say "The worker this script talks to"
note "$API"

say "What is live right now"
LIVE=$(health || true)
printf '%s\n' "$LIVE" | grep -v '^HEALTH ' || true

if [ "$CHECK_ONLY" = "1" ]; then
  say "Checked only. Nothing was deployed."
  exit 0
fi

# ------------------------------------------------------- the ids and the code

say "Checking wrangler.toml has the real ids"
# These stay as a local, uncommitted change on purpose: this repository is
# public, and the ids are account-specific.
grep -q 'TODO_REPLACE' "$TOML" && die \
  "wrangler.toml still has TODO_REPLACE placeholders. Section 8.0 of
docs/ADMIN-GUIDE.md says how to put the real KV and D1 ids back, and they must
stay a local change: never commit them."
ok "KV namespace and D1 database ids are filled in"

say "Checking the code is the merged code"
command -v git >/dev/null 2>&1 || die "git is not installed."
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
note "on branch $BRANCH, at $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
if [ "$BRANCH" != "main" ]; then
  note "That is not main. A worker deployed off a branch is whatever that branch says."
  ask "Deploy this branch anyway?" || die "Stopped. Run: git checkout -m main && git pull --ff-only --autostash --no-stat"
fi

# ------------------------------------------------------------ what to go back to

say "Writing down what is live, so you can go back to it (8.10)"
BEFORE=$(wr deployments status --json 2>/dev/null || true)
BEFORE_ID=$(printf '%s' "$BEFORE" | node -e '
  let raw = "";
  process.stdin.on("data", (d) => { raw += d; });
  process.stdin.on("end", () => {
    // wrangler prints banners and ANSI colour on the same stream as its JSON,
    // so take the first {...} that parses rather than the whole stream.
    const at = raw.indexOf("{");
    let out = "";
    if (at >= 0) {
      try {
        const d = JSON.parse(raw.slice(at));
        const v = (d.versions || d.deployment?.versions || [])[0] || {};
        out = v.version_id || v.id || d.id || "";
      } catch { /* fall through */ }
    }
    process.stdout.write(out);
  });
')
if [ -n "$BEFORE_ID" ]; then
  ok "live version now: $BEFORE_ID"
  note "Put that id in your private notes. 8.10 rolls back to it."
else
  bad "could not read the live version id"
  note "Run 'npx --yes wrangler@4 deployments status' yourself and note the id"
  note "after (100%) before going on. Without it a rollback has no target."
  ask "Go on without it?" || die "Stopped."
fi

# -------------------------------------------------------------- stage 1 of 2

if [ "$ONE_STEP" = "0" ]; then
  say "Stage 1 of 2: the new code, with statistics off"
  note "wrangler deploy --var EVENTS_ENABLED:false"
  note "Everything else goes live: the 7-day trial, the reports route, the"
  note "who-has-Pro list, the admin statistics route. Only the recording of"
  note "anonymous events stays off, so a mistake cannot spend the database's"
  note "daily write budget before you have looked at it."
  ask "Deploy stage 1?" || die "Stopped. Nothing was deployed."
  wr deploy --var EVENTS_ENABLED:false

  say "Checking stage 1 took"
  if ! wait_for events false; then
    die "The worker is not answering with statistics off.
Read the lines above. If the deploy itself failed, nothing changed and you can
re-run this script. If it deployed but health is wrong, roll back to
${BEFORE_ID:-the id you noted} with: npx --yes wrangler@4 rollback"
  fi
  AFTER1=$(health || true)
  [ "$(health_field "$AFTER1" accounts)" = "true" ] || die \
    "The worker says it has no database (accounts: off). The D1 binding did not
survive the deploy. Check [[d1_databases]] in wrangler.toml and section 8.0."
  [ "$(health_field "$AFTER1" signing)" = "true" ] || die \
    "The licence signing key is gone, so nobody can be Pro. That should be
impossible — a deploy keeps secrets — so stop here and roll back:
npx --yes wrangler@4 rollback"
  [ "$(health_field "$AFTER1" trialDays)" = "7" ] || die \
    "The free trial is not 7 days. TRIAL_DAYS in wrangler.toml should be \"7\"."
  [ "$(health_field "$AFTER1" reports)" = "true" ] || die \
    "The reports route is not answering. If you meant to switch it off, that is
REPORTS_ENABLED; otherwise this deploy is older than the route."
  ok "accounts, signing, the 7-day trial and reports are all live"
  ok "statistics are off, as intended for this stage"

  say "Look at the admin page before going on"
  note "https://pillb.github.io/vocal-singing-training/admin.html"
  note "  - Mantenimiento -> Estado del servidor matches the lines above"
  note "  - Buscar una cuenta finds somebody, with their sign-in line"
  note "  - Quién tiene Pro lists what you have handed out"
  note "  - Lo que nos cuenta la gente opens (empty is fine)"
  ask "Did all four look right?" || die \
    "Stopped with statistics still off. The worker is live and working; nothing
is lost. Roll back with 'npx --yes wrangler@4 rollback' if you want the old
code, or fix what looked wrong and re-run this script."
fi

# -------------------------------------------------------------- stage 2 of 2

say "Stage 2 of 2: the same code, with statistics on"
note "wrangler deploy"
note "This puts wrangler.toml's EVENTS_ENABLED=\"true\" back. From here the"
note "worker starts storing anonymous events, which is what the funnel in"
note "Estadísticas reads. Nothing about Pro, payments or accounts changes."
ask "Deploy stage 2?" || die \
  "Stopped. The worker is live on the new code with statistics off, which is a
fine place to stay. Re-run this script with --one-step to turn them on later."
wr deploy

say "Checking stage 2 took"
if ! wait_for events true; then
  die "The worker did not come back with statistics on. Read the lines above."
fi
AFTER2=$(health || true)
[ "$(health_field "$AFTER2" accounts)" = "true" ] || die "The database binding is gone. Roll back."
[ "$(health_field "$AFTER2" signing)" = "true" ] || die "The signing key is gone. Roll back."
[ "$(health_field "$AFTER2" trialDays)" = "7" ] || die "The free trial is not 7 days."
ok "everything the site needs is on"

AFTER_ID=$(wr deployments status --json 2>/dev/null | node -e '
  let raw = "";
  process.stdin.on("data", (d) => { raw += d; });
  process.stdin.on("end", () => {
    const at = raw.indexOf("{");
    let out = "";
    if (at >= 0) {
      try {
        const d = JSON.parse(raw.slice(at));
        const v = (d.versions || d.deployment?.versions || [])[0] || {};
        out = v.version_id || v.id || d.id || "";
      } catch { /* fall through */ }
    }
    process.stdout.write(out);
  });
' || true)

say "Done"
[ -n "$BEFORE_ID" ] && note "was:  $BEFORE_ID   (roll back target)"
[ -n "$AFTER_ID" ] && note "now:  $AFTER_ID"
note ""
note "Both ids belong in your private notes."
note ""
note "Last things to look at, on the admin page:"
note "  - Estadísticas -> Leer estadísticas answers (a table, or 'no data yet',"
note "    never an error)"
note "  - tomorrow, after 09:17 UTC, the worker's page in the Cloudflare"
note "    dashboard shows the daily clean-up ran"
note ""
note "If something is wrong: npx --yes wrangler@4 rollback"
note "and see section 8.10 of docs/ADMIN-GUIDE.md."
