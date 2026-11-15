/**
 * A/B assignment — deterministic, local, and inert until somebody turns an
 * experiment on in js/experiments-config.js.
 *
 * Assignment is a hash of (experiment key, client id), so a visitor sees the
 * same variant on every reload without anything being stored per experiment
 * and without a server round trip. The client id is a random string in
 * `vt_ab_v1`; it is not tied to an account. It leaves the device only with the
 * anonymous statistics js/analytics.js sends, and only when sending is on.
 *
 * `?ab_<key>=<variant>` forces a variant for the rest of the page. That is how
 * you look at both versions yourself — it is the "show me the other one"
 * switch, not a user-facing feature.
 *
 * Where the law wants to be asked first (js/region-gate.js) this whole file
 * goes inert until the visitor says yes: everybody is served `variants[0]`,
 * nothing is stored and no exposure is recorded. Inert has to mean the control,
 * not an empty client id — an empty id hashes identically, so every visitor in
 * those countries would land in the same arm and the result would look real
 * while being worthless.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_ab_v1";

  /**
   * Must this file do nothing at all — no id, no split, no exposure? True in a
   * country that asks first until the visitor says yes, and true as well when the
   * page says the region gate belongs on it and the gate is not there, because an
   * absent gate must never read as permission.
   * @returns {boolean} True when everything here must stay inert.
   */
  function inert() {
    if (global.VT_REGION_REQUIRED && typeof global.VTRegion?.inert !== "function") return true;
    return !!global.VTRegion?.inert?.();
  }

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
    // Minting one writes to the device, which is exactly what an ask-first
    // country wants permission for first. The only caller that needs an id is
    // the statistics sender, and it holds its events until the answer comes;
    // assignment() below never gets this far while inert.
    if (inert()) return "";
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
      // A forced link is somebody looking at the other arm on purpose and
      // stores nothing, so it works wherever they are.
      return { variant: forced, forced: true, enabled: !!(def && def.enabled) };
    }
    // Asked-first country, not answered yet: the control, and no split. Placed
    // before anything that could read or write the client id.
    if (inert()) {
      return { variant: control, forced: false, enabled: false, inert: true };
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
    // A switched-off experiment serves everybody the control and splits
    // nobody, so there is nothing to be exposed to. Recording it anyway spent
    // each browser's one exposure on the control arm months before the test
    // was turned on, and those browsers would have entered the real test
    // already counted — in the wrong arm half the time.
    if (!a.enabled) return a.variant;
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
   * Record an arm somebody else chose.
   *
   * One experiment's arm is not this file's to pick: the trial-length test
   * decides how many days of Pro an account is given, so the worker assigns it
   * from the account id and tells the page which arm it got
   * (workers/entitlements/src/grants.js `trialArmFor`). This records that arm as
   * the browser's exposure so the result can be read, without letting anything
   * here choose it.
   *
   * Server arms are kept in their own slot rather than alongside the ones
   * `assignment()` produced. They are two different claims — "this is the arm I
   * computed" and "this is the arm I was given" — and `enabled` in
   * js/experiments-config.js governs only the first, so a server arm has to
   * survive that flag being false.
   *
   * The first arm a browser is handed is its arm, and a second one is ignored.
   * That is not an edge case to tidy away: two accounts signing in on one
   * browser can be in different arms, and the worker's exposure row is
   * `INSERT OR IGNORE` on (experiment, browser), so the first one is what the
   * result will be computed from. Keeping a different arm here would make this
   * browser re-assert, on every later app_open, an arm the worker has already
   * refused to store.
   *
   * @param {string} key Experiment key.
   * @param {string} armId The arm the worker assigned.
   * @returns {string|null} The arm this browser is recorded in, or null when
   *   nothing was recorded.
   */
  function exposeServerArm(key, armId) {
    // An ask-first country that has not answered: no id, no storage, no beacon.
    if (inert()) return null;
    const def = defs()[key];
    const variants = def && Array.isArray(def.variants) ? def.variants : [];
    // An arm this build has never heard of is a mismatched deploy, not data.
    if (!variants.some((v) => v.id === armId)) return null;
    const bag = readBag() || {};
    bag.server = bag.server && typeof bag.server === "object" ? bag.server : {};
    if (typeof bag.server[key] === "string") return bag.server[key];
    bag.server[key] = armId;
    writeBag(bag);
    global.VTAnalytics?.track?.("experiment_expose", {
      experiment: key,
      variant: armId,
      forced: false,
      enabled: true
    });
    return armId;
  }

  /**
   * The arm this browser was exposed to, for each switched-on experiment it has
   * been exposed to. js/daily-loop.js repeats these on every app_open, so an
   * exposure whose first beacon never reached the worker is recorded late
   * rather than lost; the worker keeps whichever arrives first.
   *
   * Server-assigned arms are always included. Their experiment is switched on
   * in the worker, which is the only place that knows, so filtering them on the
   * local `enabled` flag would silently drop the re-assertion for the one
   * experiment whose arm this file did not choose.
   * @returns {Record<string, string>} experiment key -> arm id
   */
  function exposedArms() {
    const bag = readBag() || {};
    const seen = bag.seen && typeof bag.seen === "object" ? bag.seen : {};
    const server = bag.server && typeof bag.server === "object" ? bag.server : {};
    const out = {};
    Object.keys(defs()).forEach((key) => {
      if (defs()[key]?.enabled && typeof seen[key] === "string") out[key] = seen[key];
      if (typeof server[key] === "string") out[key] = server[key];
    });
    return out;
  }

  /**
   * What this browser has seen, for the one person who can read it: whoever is
   * sitting at it. Paste `VTExperiments.report()` into the console.
   */
  function report() {
    const bag = readBag() || {};
    const out = {
      clientId: bag.cid || null,
      inert: inert(),
      region: global.VTRegion?.report?.() || null,
      experiments: {}
    };
    Object.keys(defs()).forEach((key) => {
      const a = assignment(key);
      out.experiments[key] = {
        enabled: a.enabled,
        assigned: a.variant,
        forced: a.forced,
        exposed: (bag.seen && bag.seen[key]) || null,
        // Set only for an experiment the worker assigns; when it is set, it is
        // the arm that counts and `assigned` above means nothing.
        fromServer: (bag.server && bag.server[key]) || null
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

  global.VTExperiments = { assignment, variant, exposeOnce, exposeServerArm, exposedArms, report, reset, clientId };
})(window);
