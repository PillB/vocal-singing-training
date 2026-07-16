# Auth (internal) + vibe-coded app hardening

## Internal accounts

| Role | Count | Purpose |
|------|------:|---------|
| **admin** | 2 | `admin.pablo`, `admin.ops` — admin tools + Pro |
| **tester** | 10 | `tester.ff01` … `tester.ff10` — friends & family QA + Pro |

### Secrets file (never commit)

- Path: **`docs/INTERNAL-TEST-ACCOUNTS.md`**
- Listed in **`.gitignore`**
- Contains plaintext usernames + passwords for you to share privately
- Regenerate: `node qa/generate-test-accounts.mjs`
  - Generates **one strong password per account** via `crypto.randomBytes`
  - Updates the secrets MD + `js/auth-users.generated.js` (hashes only)

### What is committed

`js/auth-users.generated.js` — username, role, displayName, salt, **SHA-256(salt:password)** only.

### How sign-in works (static SPA)

1. Header **Cuenta** → login overlay  
2. Password checked with Web Crypto SHA-256 against salt+hash  
3. Session in **sessionStorage** (12h soft expiry) — not localStorage for slightly less persistence XSS surface  
4. Internal accounts activate **Pro** entitlement (`source: internal_account`)  

**Honest limit:** client-side auth is for internal testing and soft gates. Anyone can bypass with DevTools. Production multi-tenant needs a real backend (Auth0/Clerk/Supabase + RLS).

---

## Subscriptions (recap)

See **`docs/10-SUBSCRIPTIONS.md`** — Stripe (US/EU/global) + Mercado Pago (Perú/LATAM).

---

## Vibe-coded app issues we preempted

| Risk (common in AI/vibe apps) | Mitigation in this codebase |
|-------------------------------|-----------------------------|
| Secrets in repo | Passwords only in gitignored MD; no API keys in client for live charge until you paste Payment Links |
| Plaintext passwords in code | Salted hashes only |
| XSS via innerHTML | `VTAuth.escapeHtml` for user-facing strings; prefer `textContent` in auth UI |
| Auth tokens forever in localStorage | Auth session → **sessionStorage** + 12h expiry |
| Brute-force login | 8 fails → 60s lockout |
| Open redirect on billing return | Only activates known `plan` ids; no external redirect from query |
| Over-broad demo Pro | `demoUnlockEnabled` flag; disable when Payment Links live |
| Missing auth on “admin” actions | Admin panel gated with `VTAuth.isAdmin()` |
| Catalog silently deleted | `qa/check-catalog.mjs` + Playwright catalog regression |
| Layout collisions | Python AABB geometry forensics |
| `innerHTML` with exercise content | Exercise content is author-controlled; still avoid piping raw user notes into HTML without escape |
| Untracked large binaries | Prefer not committing PDFs; secrets never committed |

---

## Admin tools (when signed in as admin)

- Force demo Pro / clear billing entitlement  
- Export progress  
- List internal usernames (no password hashes)  
- Clear local practice progress (localStorage keys for progress only)  

---

## Tests

- Auth login success/fail, admin gate, secrets file not present in git  
- Billing suite remains  
- Catalog regression  

---

## File map

| File | Role |
|------|------|
| `qa/generate-test-accounts.mjs` | Strong password generator + writers |
| `docs/INTERNAL-TEST-ACCOUNTS.md` | **Gitignored** plaintext sheet |
| `js/auth-users.generated.js` | Hashes (committed) |
| `js/auth.js` | Login / session / roles |
| `docs/11-AUTH-AND-HARDENING.md` | This doc |
