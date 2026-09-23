/**
 * D1 schema for accounts, sessions, grants and saved progress.
 *
 * The entitlements KV store stays exactly as it was: it holds provider-driven
 * paid state, keyed by license id. D1 adds the things KV cannot do well —
 * "find the account for this email", "list every grant this person holds",
 * "which gift codes are still live" — and the account rows that tie the two
 * together.
 *
 * Every statement here is idempotent, so `ensureSchema` can run on any request
 * without a migration runner. D1 has no `CREATE INDEX CONCURRENTLY` and no
 * transactional DDL worth the trouble at this size; `IF NOT EXISTS` is enough.
 */

"use strict";

/**
 * Bump when a statement is added. Stored in `schema_meta` so `ensureSchema`
 * can skip the whole batch on the overwhelming majority of requests.
 */
export const SCHEMA_VERSION = 2;

/**
 * Table and index definitions, in dependency order.
 *
 * Design notes that are easy to lose:
 * - An account is identified by `email_normalized`, never by the display form.
 * - `sessions.token_hash` is SHA-256 of the bearer token. The token itself is
 *   shown to the browser once and never stored, so a database leak does not
 *   hand out live sessions.
 * - `grants` is the single mechanism behind the trial, gifted months and any
 *   manual comp. A grant entitles while `revoked_at IS NULL` and now is inside
 *   `[starts_at, ends_at)`. Revoking is one column, and granting again is one
 *   more row — which is exactly what "repeatable and cancelable" needs.
 * - `license_links` is what makes a paid subscription belong to a person: the
 *   KV entitlement keeps being the source of truth for whether the money is
 *   still arriving, and this table says whose it is.
 *
 * @type {string[]}
 */
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS accounts (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     email_normalized TEXT NOT NULL UNIQUE,
     display_name TEXT,
     locale TEXT,
     role TEXT NOT NULL DEFAULT 'member',
     trial_used_at INTEGER,
     disabled_at INTEGER,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS identities (
     id TEXT PRIMARY KEY,
     account_id TEXT NOT NULL,
     provider TEXT NOT NULL,
     subject TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     UNIQUE (provider, subject)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_identities_account ON identities (account_id)`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     account_id TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     last_seen_at INTEGER NOT NULL,
     revoked_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at)`,

  `CREATE TABLE IF NOT EXISTS login_codes (
     id TEXT PRIMARY KEY,
     email_normalized TEXT NOT NULL,
     code_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     consumed_at INTEGER,
     attempts INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes (email_normalized, created_at)`,

  `CREATE TABLE IF NOT EXISTS grants (
     id TEXT PRIMARY KEY,
     account_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     plan TEXT NOT NULL,
     starts_at INTEGER NOT NULL,
     ends_at INTEGER NOT NULL,
     source TEXT,
     note TEXT,
     issued_by TEXT,
     revoked_at INTEGER,
     revoked_by TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_grants_account ON grants (account_id, revoked_at, ends_at)`,

  `CREATE TABLE IF NOT EXISTS gift_codes (
     code_normalized TEXT PRIMARY KEY,
     code_display TEXT NOT NULL,
     plan TEXT NOT NULL,
     days INTEGER NOT NULL,
     max_redemptions INTEGER NOT NULL DEFAULT 1,
     redeemed_count INTEGER NOT NULL DEFAULT 0,
     note TEXT,
     created_by TEXT,
     expires_at INTEGER,
     revoked_at INTEGER,
     created_at INTEGER NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS gift_redemptions (
     id TEXT PRIMARY KEY,
     code_normalized TEXT NOT NULL,
     account_id TEXT NOT NULL,
     grant_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     UNIQUE (code_normalized, account_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_gift_redemptions_account ON gift_redemptions (account_id)`,

  `CREATE TABLE IF NOT EXISTS license_links (
     license_id TEXT PRIMARY KEY,
     account_id TEXT NOT NULL,
     provider TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_license_links_account ON license_links (account_id)`,

  `CREATE TABLE IF NOT EXISTS progress (
     account_id TEXT NOT NULL,
     profile_id TEXT NOT NULL,
     rev INTEGER NOT NULL,
     doc TEXT NOT NULL,
     size_bytes INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (account_id, profile_id)
   )`,

  `CREATE TABLE IF NOT EXISTS rate_limits (
     bucket TEXT PRIMARY KEY,
     count INTEGER NOT NULL,
     window_start INTEGER NOT NULL
   )`,

  // Version 2: anonymous usage events and A/B exposures (events.js). `cid` is
  // the random browser id the site keeps for experiments; nothing here joins
  // to an account, an email or an IP address.
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     received_at INTEGER NOT NULL,
     cid TEXT NOT NULL,
     name TEXT NOT NULL,
     day TEXT,
     tz INTEGER,
     props TEXT NOT NULL DEFAULT '{}'
   )`,
  `CREATE INDEX IF NOT EXISTS idx_events_cid_name ON events (cid, name, received_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_received ON events (received_at)`,

  // The first exposure a browser reports for an experiment is its arm for
  // good; INSERT OR IGNORE on this key is what makes that true.
  `CREATE TABLE IF NOT EXISTS exposures (
     experiment TEXT NOT NULL,
     cid TEXT NOT NULL,
     variant TEXT NOT NULL,
     first_at INTEGER NOT NULL,
     day TEXT,
     PRIMARY KEY (experiment, cid)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_exposures_arm ON exposures (experiment, variant, first_at)`
];
