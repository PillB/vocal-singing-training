# Cloudflare frontend — PyArcana deployment adaptation

Evidence date: 2026-11-26 (America/Lima). The new
[Cloudflare frontend](https://vocal-studio.pablo-illescas-buendia.workers.dev/)
is an explicitly labeled **local-practice preview**. Existing accounts,
purchases and sync remain on the [current app](https://pillb.github.io/vocal-singing-training/).
This does not migrate users, licenses, recordings, local storage or Google
OAuth authorization to another origin.

## Reference and route selection

The user's [PyArcana web route](https://pyarcana.dev/#ruta-web) was inspected
through its actual deployed JavaScript, including `despliegue.cloudflare`.
Its relevant model is a static asset directory published by Wrangler to a
Worker, with server-dependent work kept separate. Do not infer that the course
itself uses the same hosting architecture merely because it teaches this.

Alternatives reviewed before execution:

| Route | Decision / expert objection | Trade-off |
| --- | --- | --- |
| Serve the complete repository as static assets | Reject: private operator records, server files, tests and tools can become public | Build an explicit public package from committed files only. New asset types need deliberate authoring changes. |
| Add frontend files to the existing entitlements Worker | Reject for this release: mixes frontend publishing with unresolved account/data/key continuity | A separate static Worker has an independent version and does not touch D1/KV/secrets. Two services need separate deployment records. |
| Point the new origin at the old backend immediately | Reject: CORS, token audience, OAuth origins, browser storage and payer continuity are not established | Preview closes account/API configuration and tightens outgoing CSP; existing users keep the current URL. |
| Static Worker preview, with clear local-only scope | Selected: minimal runtime and no new server handler, database or account migration | Full account/sync/admin sign-in is unavailable in this preview until the recovery/origin gates pass. |

## Reproducible release package

`qa/build-cloudflare-site.mjs` reads an exact commit with `git show`, not the
operator's working tree. It permits the six public HTML pages, manifest-listed
JS/CSS assets and the explicitly required curriculum JSON. It rejects symlinks,
path traversal, server paths, stale asset hashes and unexpected backend config.
Dirty/untracked files cannot enter. An existing output directory is refused.

The preview empties the API base without disabling signature verification or
turning on demo Pro. It updates that script's hash/version and every page's
reference, adds the ES/EN local-practice notice, noindex and security headers,
and emits `release.json`. Response CSP blocks off-origin APIs and identity
frames; local microphone, audio and recordings remain permitted. Missing
assets return404 rather than an HTML fallback that could hide broken scripts.
HTML uses Cloudflare's automatic trailing-slash handling; `.html` links can
redirect to their equivalent clean paths.

The output has **88 public files, including77 versioned assets**. Neither
`.git`, `.env`, `workers/`, private inventory nor repository-root contents are
uploaded wholesale. The generated auth filename contains multiple dots; an
initial validator wrongly rejected it. The corrected rule accepts dotted
basenames while rejecting dot-segment/traversal paths, with a positive fixture
and actual-main packaging regression.

Example preparation from a reviewed checkout containing the packager:

```sh
git fetch https://github.com/PillB/vocal-singing-training.git refs/heads/main
git rev-parse FETCH_HEAD
# Supply that full verified SHA and a new empty/nonexistent output path:
node qa/build-cloudflare-site.mjs <exact-main-sha> <new-output-directory>
npx wrangler@4.144.0 deploy --dry-run --config <new-output-directory>/wrangler.json
```

Before a real deploy, verify the selected login/account, actual subdomain and
existing Worker/version; record the rollback target and source. Use the
account from the private inventory, not an inferred email/author association.
The first creation verified that `vocal-studio` did not exist. An update must
record and check its current version instead of reusing an empty-target claim.
Do not auto-retry an uncertain deployment.

## Deployment and validation evidence

- Source main: `8c87acc4627b0308bd19c5145fdce37ef1cd4e9c`.
- Static Worker: `vocal-studio`, selected account subdomain
  `pablo-illescas-buendia`; verified identity and absent target before creation.
- Deployed version: `29b171b5-afc0-495d-a9b7-5f64d520a4b8`.
- Wrangler4.144.0 dry-run passed; no server bindings were present.
- Independent QA packaged real main and verified all166 local HTML
  src/href references. The billing config evaluates to API empty, required
  signatures true, demo unlock false.
- Independent HTTPS verification matched index and all77 asset hashes.
  Index SHA256: `61e83138cc37f58f4a2c1c5c8a4686913e64bf5a743b4cc1deb9b24e0afca865`.
- Response CSP/noindex checked; `.env`, `.git/config`, Worker TOML,
  a missing JS asset and `_headers` each returned404.
- Packager fixtures pass; OP10–OP12 mutations are killed (backend left on,
  forbidden server path admitted, outgoing CSP widened). OP11's first control
  was reordered so it fails on an actual attempted server-file publication,
  not merely a changed error message.

Hosted Chromium **9/9 passed** on the actual preview, including disabled
sign-in and no off-origin requests: [run45936989152, job140302364504](https://github.com/PillB/vocal-singing-training/actions/runs/45936989152/job/140302364504).
That job also rebuilt the declared source and verified deployed bytes.
The existing GitHub Pages site independently matched current main's HTML and
all77 assets. Actual iOS, acoustic audio, mobile/zoom/assistive-technology
inspection and authenticated migration remain unverified.

`Deployed Pages verification` now has
a `cloudflare-preview` target and exact `source_sha` input. It rebuilds that
ancestor commit, checks deployed bytes, and runs the live Playwright suite.
The configuration test requires the local-practice notice, disabled sign-in
state and no external request; current Pages instead requires the original
API config. A matching static package is not proof of microphone acoustics or
physical iOS behavior.

## Remaining gates and maintenance

Keep the preview distinct until source ownership/backup recovery, explicit
data/license strategy, Worker origin/audience, Google authorized origin,
authenticated admin/progress tests and real-device audio pass. Browser-local
data on GitHub Pages does not appear on `workers.dev` automatically. Payments
stay off while the documented PR54 authorization/concurrency blockers remain.

Update the public inventory, private receipt, ledger and wiki after each
deploy. Private identity/resource details and the full deployment output are
under ignored `.deployment-local/`; they are not encrypted external backups.
Record a real restore drill before claiming recovery readiness.

Primary platform references rechecked this round:
[static assets](https://developers.cloudflare.com/workers/static-assets/),
[asset directory and ignores](https://developers.cloudflare.com/workers/static-assets/binding/),
[HTML routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/),
[response headers](https://developers.cloudflare.com/workers/static-assets/headers/),
[URI path segments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Path).
