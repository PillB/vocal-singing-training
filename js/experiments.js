/**
 * A/B assignment — deterministic, local, and inert until somebody turns an
 * experiment on in js/experiments-config.js.
 *
 * Assignment is a hash of (experiment key, client id), so a visitor sees the
 * same variant on every reload without anything being stored per experiment
 * and without a server round trip. The client id is a random string in
 * `vt_ab_v1`; it is not tied to an account and never leaves the device.
 *
 * `?ab_<key>=<variant>` forces a variant for the rest of the page. That is how
 * you look at both versions yourself — it is the "show me the other one"
 * switch, not a user-facing feature.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_ab_v1";

  function readBag() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const bag = raw ? JSON.parse(raw) : null;
      if (bag && typeof bag === "object") return bag;
    } catch {
      /* private mode, corrupt JSON */
    }
    return null;
  }

  function writeBag(bag) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(bag));
    } catch {
      /* private mode — assignment still works, it just won't persist */
    }
  }

  /**
   * Client id. Random rather than derived from anything about the person, so
   * two people on the same machine profile are the same visitor and nothing
   * about them is encoded in it.
   */
  function clientId() {
    const bag = readBag() || {};
    if (typeof bag.cid === "string" && bag.cid.length >= 8) return bag.cid;
    let cid = "";
    try {
      const buf = new Uint8Array(8);
      (global.crypto || global.msCrypto).getRandomValues(buf);
      cid = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      cid = String(Math.floor(Math.random() * 1e15)) + "x";
    }
    bag.cid = cid;
    writeBag(bag);
    return cid;
  }

  /** FNV-1a, 32-bit. Small, stable across engines, good enough to split a bucket. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function defs() {
    const all = global.VT_EXPERIMENTS;
    return all && typeof all === "object" ? all : {};
  }

  function forcedVariant(key) {
    try {
      const q = new URLSearchParams(location.search).get(`ab_${key}`);
      return q || null;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} key experiment key from js/experiments-config.js
   * @returns {{ variant: string, forced: boolean, enabled: boolean }}
   */
  function assignment(key) {
    const def = defs()[key];
    const variants = def && Array.isArray(def.variants) ? def.variants : [];
    if (!variants.length) return { variant: "control", forced: false, enabled: false };

    const control = variants[0].id;
    const forced = forcedVariant(key);
    if (forced && variants.some((v) => v.id === forced)) {
      return { variant: forced, forced: true, enabled: !!(def && def.enabled) };
    }
    // Disabled experiments still run this far, so the code path is exercised.
    if (!def.enabled) return { variant: control, forced: false, enabled: false };

    const total = variants.reduce((n, v) => n + (Number(v.weight) || 0), 0);
    if (total <= 0) return { variant: control, forced: false, enabled: true };

    let point = (hash(`${key}:${clientId()}`) % 10000) / 10000;
    for (const v of variants) {
      const share = (Number(v.weight) || 0) / total;
      if (point < share) return { variant: v.id, forced: false, enabled: true };
      point -= share;
    }
    return { variant: control, forced: false, enabled: true };
  }

  /** @returns {string} the variant id alone — the common case. */
  function variant(key) {
    return assignment(key).variant;
  }

  /**
   * Record that this visitor was actually shown the experiment. Called at the
   * point of exposure, not at assignment, so a variant nobody reached is not
   * counted against it. Fires once per experiment per browser.
   */
  function exposeOnce(key) {
    const a = assignment(key);
    // A forced `?ab_<key>=...` link is somebody looking at the other arm on
    // purpose. Recording it as this browser's one exposure dropped that visitor
    // out of the experiment for good — and left the stored exposure disagreeing
    // with the arm they are actually served on every later visit. Report the
    // forced view, but do not spend the exposure on it.
    if (a.forced) {
      global.VTAnalytics?.track?.("experiment_forced_view", {
        experiment: key,
        variant: a.variant,
        enabled: a.enabled
      });
      return a.variant;
    }
    const bag = readBag() || {};
    bag.seen = bag.seen && typeof bag.seen === "object" ? bag.seen : {};
    if (!bag.seen[key]) {
      bag.seen[key] = a.variant;
      writeBag(bag);
      global.VTAnalytics?.track?.("experiment_expose", {
        experiment: key,
        variant: a.variant,
        forced: false,
        enabled: a.enabled
      });
    }
    return a.variant;
  }

  /**
   * What this browser has seen, for the one person who can read it: whoever is
   * sitting at it. Paste `VTExperiments.report()` into the console.
   */
  function report() {
    const bag = readBag() || {};
    const out = { clientId: bag.cid || null, experiments: {} };
    Object.keys(defs()).forEach((key) => {
      const a = assignment(key);
      out.experiments[key] = {
        enabled: a.enabled,
        assigned: a.variant,
        forced: a.forced,
        exposed: (bag.seen && bag.seen[key]) || null
      };
    });
    out.events = global.VTAnalytics?.summary?.() || null;
    return out;
  }

  function reset() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }

  global.VTExperiments = { assignment, variant, exposeOnce, report, reset, clientId };
})(window);
