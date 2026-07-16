/**
 * Client-side auth for internal admins + friends/family testers.
 * Static GH Pages: salted SHA-256 only in client; plaintext never shipped.
 * Not a substitute for real server auth for production multi-tenant SaaS.
 */
(function (global) {
  "use strict";

  const SESSION_KEY = "vt_auth_session_v1";
  const MAX_ATTEMPTS = 8;
  const LOCK_MS = 60_000;
  let failCount = 0;
  let lockedUntil = 0;

  function users() {
    return Array.isArray(global.VT_AUTH_USERS) ? global.VT_AUTH_USERS : [];
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.username || !s.role) return null;
      // Soft expiry 12h
      if (s.at && Date.now() - s.at > 12 * 3600_000) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  function writeSession(s) {
    try {
      if (!s) sessionStorage.removeItem(SESSION_KEY);
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* private mode */
    }
  }

  async function sha256Hex(text) {
    if (global.crypto?.subtle) {
      const data = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    // Fallback — should not hit modern browsers
    throw new Error("Web Crypto unavailable");
  }

  async function hashPassword(password, salt) {
    return sha256Hex(`${salt}:${password}`);
  }

  function current() {
    return readSession();
  }

  function isLoggedIn() {
    return !!current();
  }

  function isAdmin() {
    return current()?.role === "admin";
  }

  function isTester() {
    const r = current()?.role;
    return r === "tester" || r === "admin";
  }

  async function login(username, password) {
    const now = Date.now();
    if (now < lockedUntil) {
      return {
        ok: false,
        error: "locked",
        retryInMs: lockedUntil - now
      };
    }
    const u = String(username || "")
      .trim()
      .toLowerCase();
    const p = String(password || "");
    if (!u || !p) return { ok: false, error: "empty" };
    if (u.length > 64 || p.length > 128) return { ok: false, error: "invalid" };

    const rec = users().find((x) => String(x.username).toLowerCase() === u);
    if (!rec) {
      failCount++;
      if (failCount >= MAX_ATTEMPTS) {
        lockedUntil = now + LOCK_MS;
        failCount = 0;
        return { ok: false, error: "locked", retryInMs: LOCK_MS };
      }
      // Constant-ish delay
      await new Promise((r) => setTimeout(r, 120 + Math.random() * 80));
      return { ok: false, error: "credentials" };
    }

    const h = await hashPassword(p, rec.salt);
    if (h !== rec.hash) {
      failCount++;
      if (failCount >= MAX_ATTEMPTS) {
        lockedUntil = now + LOCK_MS;
        failCount = 0;
        return { ok: false, error: "locked", retryInMs: LOCK_MS };
      }
      return { ok: false, error: "credentials" };
    }

    failCount = 0;
    const session = {
      username: rec.username,
      role: rec.role,
      displayName: rec.displayName || rec.username,
      pro: rec.pro !== false,
      at: Date.now()
    };
    writeSession(session);

    // Internal accounts get Pro for QA (soft entitlement, tagged source)
    if (session.pro && global.VTBilling?.activate) {
      try {
        global.VTBilling.activate("pro_monthly", {
          source: "internal_account",
          provider: "auth",
          region: global.VTBilling.detectRegion?.() || "WW"
        });
      } catch {
        /* ignore */
      }
    }
    emit();
    return { ok: true, session };
  }

  function logout() {
    writeSession(null);
    emit();
  }

  const listeners = new Set();
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit() {
    const s = current();
    listeners.forEach((fn) => {
      try {
        fn(s);
      } catch (e) {
        console.warn(e);
      }
    });
  }

  /** Escape text for safe HTML insertion (XSS mitigation) */
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function listPublicUsers() {
    // No hashes/salts exposed in admin UI dump
    return users().map((u) => ({
      username: u.username,
      role: u.role,
      displayName: u.displayName,
      pro: u.pro !== false
    }));
  }

  global.VTAuth = {
    login,
    logout,
    current,
    isLoggedIn,
    isAdmin,
    isTester,
    onChange,
    escapeHtml,
    listPublicUsers,
    hashPassword
  };
})(window);
