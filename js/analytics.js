/**
 * Lightweight local analytics (no third-party by default).
 * Events support retention measurement: practice_start, session_save, reminder_enable, etc.
 *
 * Every event is kept in this browser (`vt_analytics_v1`). When
 * `window.VT_ANALYTICS_ENDPOINT` is set (js/experiments-config.js), events are
 * also sent, batched, to the entitlements worker's `/v1/events` route so the
 * funnel can be read — unless the visitor has said no: Global Privacy Control,
 * or the switch in the guide's privacy section (`vt_analytics_optout_v1`).
 * Automated browsers never send.
 *
 * In the countries whose law requires being asked first (js/region-gate.js: the
 * EEA) nothing is kept or sent until the visitor says yes. Events raised in the
 * meantime wait in memory — not in `localStorage`, because writing to the device
 * is the very thing being asked about — and are written and sent together when
 * the answer is yes, or thrown away when it is no. Everywhere else that gate is
 * a single synchronous `false` and nothing about this file changes.
 *
 * Do Not Track was honoured until 2026-09-24 and is not any more. No law
 * anywhere requires it, the W3C discontinued the specification in 2019, and
 * Safari removed the header that year because sending it narrowed a browser's
 * fingerprint rather than protecting anybody. GPC stays: it is a deliberate
 * opt-out with legal force in several US states, it is what Brave and
 * DuckDuckGo actually send, and the switch below is the same choice made by
 * hand.
 *
 * What is sent is exactly what the guide and privacy.html list: the event
 * name, its flat props, the random browser id, the local day and the time
 * zone. The worker adds the time it arrived. tests/ab-events.spec.js holds the
 * two to each other.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_analytics_v1";
  const OPTOUT_KEY = "vt_analytics_optout_v1";
  const MAX = 500;
  /** The worker accepts at most this many events per request. */
  const BATCH = 25;
  /** Wait this long for more events before sending a batch. */
  const FLUSH_MS = 4000;

  /**
   * Events raised while a visitor in an ask-first country has not answered yet.
   * Memory only, and capped: holding them on the device would be the very
   * storage the answer is about, and the first events are the ones a funnel
   * needs, so an overflow drops the newest rather than the oldest.
   */
  let held = [];
  const MAX_HELD = 50;
  /** Region reasons that mean "not yet", as opposed to "no". */
  const HELD_REASONS = ["eu_pending", "eu_unanswered"];

  let queue = [];
  let timer = null;
  let bound = false;
  let regionBound = false;

  function read() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { events: [] };
    } catch {
      return { events: [] };
    }
  }

  function write(bag) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(bag));
    } catch {
      /* ignore */
    }
  }

  function endpoint() {
    const ep = global.VT_ANALYTICS_ENDPOINT;
    return typeof ep === "string" && /^https:\/\//.test(ep.trim()) ? ep.trim() : "";
  }

  /**
   * Why this browser does not send events, or "" when it does. The two reasons
   * in HELD_REASONS mean an answer is still outstanding, so events are kept
   * rather than dropped; every other reason means they are dropped.
   * @returns {"" | "no_endpoint" | "gpc" | "opted_out" | "automated" | "eu_pending"
   *           | "eu_unanswered" | "eu_refused"}
   */
  function remoteBlockedReason() {
    if (!endpoint()) return "no_endpoint";
    const nav = global.navigator || {};
    if (nav.globalPrivacyControl === true) return "gpc";
    try {
      if (localStorage.getItem(OPTOUT_KEY) === "1") return "opted_out";
    } catch {
      /* storage blocked: fall through */
    }
    if (nav.webdriver) return "automated";
    try {
      if (sessionStorage.getItem("vt_e2e") === "1") return "automated";
    } catch {
      /* ignore */
    }
    // Last, because a browser that sends nothing for any of the reasons above
    // needs no consent bar and no question asked. The order matters: an
    // automated browser is answered by "automated" here rather than by the
    // region, which settles one as out of scope so the suite runs the ordinary
    // path. Moving the region read above these would change that.
    return regionReason();
  }

  /**
   * What the region gate says, or "" when it has nothing to say.
   *
   * Read separately from remoteBlockedReason() because this one governs the
   * write to the device, which Global Privacy Control, the guide's switch and
   * automation do not: those three stop events leaving, not being kept here.
   * @returns {"" | "eu_pending" | "eu_unanswered" | "eu_refused" | "no_region_gate"} Reason.
   */
  function regionReason() {
    if (global.VT_REGION_REQUIRED && typeof global.VTRegion?.blockedReason !== "function") {
      // The page says the gate belongs here and it is not: js/region-gate.js
      // 404ed, was blocked, or failed to parse. Keep nothing and send nothing.
      // An absent gate must never read as permission, and a funnel that falls
      // to zero is a failure somebody notices.
      return "no_region_gate";
    }
    return global.VTRegion?.blockedReason?.() || "";
  }

  /**
   * The one field the worker needs to accept a batch from an ask-first country.
   * Null everywhere else, which is what the worker sees today.
   * @returns {"granted" | null} Marker.
   */
  function consentMarker() {
    return global.VTRegion?.consent?.() === "granted" ? "granted" : null;
  }

  /**
   * Send what is queued. `unloading` prefers sendBeacon, which the browser
   * finishes even as the page goes away.
   * @param {boolean} [unloading]
   */
  function flush(unloading) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const ep = endpoint();
    const reason = remoteBlockedReason();
    if (!ep || reason) {
      // Checked once, before the loop. Inside it, a queue emptied on the way
      // out of a tab threw away events that were only waiting for an answer.
      if (!HELD_REASONS.includes(reason)) queue = [];
      return;
    }
    while (queue.length) {
      const batch = queue.splice(0, BATCH);
      // text/plain is the only body a cross-site beacon may carry without a
      // preflight; the worker parses it as JSON regardless. The consent marker
      // is added only where it is needed, so a batch from anywhere else is the
      // same bytes it has always been.
      const payload = { v: 1, events: batch };
      const marker = consentMarker();
      if (marker) payload.consent = marker;
      const body = JSON.stringify(payload);
      try {
        if (unloading && typeof global.navigator?.sendBeacon === "function") {
          if (global.navigator.sendBeacon(ep, body)) continue;
        }
        if (typeof fetch === "function") {
          fetch(ep, {
            method: "POST",
            headers: { "content-type": "text/plain" },
            body,
            keepalive: true,
            mode: "no-cors",
            credentials: "omit"
          }).catch(() => {});
        }
      } catch {
        /* never let analytics break the page */
      }
    }
  }

  function bindFlushOnHide() {
    if (bound) return;
    bound = true;
    try {
      global.addEventListener?.("pagehide", () => flush(true));
      global.document?.addEventListener?.("visibilitychange", () => {
        if (global.document.visibilityState === "hidden") flush(true);
      });
    } catch {
      /* ignore */
    }
  }

  /**
   * Keep an event until the visitor answers. No id is minted here: minting one
   * writes to the device, which is the thing being asked about, so the id is
   * stamped on at replay.
   */
  function hold(name, props, now) {
    watchRegion();
    if (held.length >= MAX_HELD) return;
    held.push({
      name,
      props,
      // The clock time the local log would have kept, so the answer "yes" can
      // write the session down as it actually happened rather than as one
      // instant. It is not sent: the worker records when a batch arrives.
      t: now.toISOString(),
      day: global.VTDays?.dayKey?.(now) || null,
      tz: -now.getTimezoneOffset()
    });
  }

  /**
   * Send or drop what was held, once the region gate settles or the visitor
   * answers. Bound once; the gate calls it on every change.
   */
  function watchRegion() {
    if (regionBound || typeof global.VTRegion?.onChange !== "function") return;
    regionBound = true;
    global.VTRegion.onChange(() => {
      const reason = remoteBlockedReason();
      if (HELD_REASONS.includes(reason)) return;
      if (reason) {
        held = [];
        return;
      }
      if (!held.length) return;
      const waiting = held;
      held = [];
      // The device first, because that is what was being asked about.
      const bag = read();
      bag.events = bag.events || [];
      waiting.forEach((e) => bag.events.push({ name: e.name, props: e.props, t: e.t }));
      if (bag.events.length > MAX) bag.events = bag.events.slice(-MAX);
      write(bag);
      // Then the worker, with the id minted only now.
      const cid = global.VTExperiments?.clientId?.() || null;
      waiting.forEach((e) => queue.push({ name: e.name, props: e.props, cid, day: e.day, tz: e.tz }));
      bindFlushOnHide();
      flush(false);
    });
  }

  function enqueue(name, props, now) {
    const reason = remoteBlockedReason();
    if (HELD_REASONS.includes(reason)) {
      hold(name, props, now);
      return;
    }
    if (reason) return;
    bindFlushOnHide();
    // An event nobody can tie to a browser, an arm or a local day cannot
    // answer an A/B question, so each one carries all three. The id is the
    // random one js/experiments.js already keeps; nothing personal. The clock
    // time is not sent: the worker records when the event arrived.
    queue.push({
      name,
      props,
      cid: global.VTExperiments?.clientId?.() || null,
      day: global.VTDays?.dayKey?.(now) || null,
      tz: -now.getTimezoneOffset()
    });
    if (queue.length >= BATCH) flush(false);
    else if (!timer) timer = setTimeout(() => flush(false), FLUSH_MS);
  }

  /**
   * @param {string} name
   * @param {Record<string, unknown>} [props]
   */
  function track(name, props) {
    if (!name) return;
    const now = new Date();
    const region = regionReason();
    // Where the law wants the visitor asked first, keeping the event on the
    // device is the thing being asked about, so it waits in memory with
    // everything else. Nothing in the product reads this log — the streaks, the
    // heatmap and the history all come from VTStorage and VTDays under their own
    // keys — so holding it costs the visitor nothing.
    if (HELD_REASONS.includes(region)) {
      hold(String(name), props || {}, now);
      return;
    }
    // A refusal, or a gate that should be on this page and is not.
    if (region) return;
    const bag = read();
    bag.events = bag.events || [];
    bag.events.push({
      name: String(name),
      props: props || {},
      t: now.toISOString()
    });
    if (bag.events.length > MAX) bag.events = bag.events.slice(-MAX);
    write(bag);

    // Optional remote (never blocks UI)
    try {
      enqueue(String(name), props || {}, now);
    } catch {
      /* ignore */
    }
  }

  function summary() {
    const bag = read();
    // Held events are part of this session even though nothing has been written
    // down yet, so the console report shows them rather than an empty log.
    const events = (bag.events || []).concat(
      held.map((e) => ({ name: e.name, props: e.props, t: e.t, held: true }))
    );
    const counts = {};
    events.forEach((e) => {
      counts[e.name] = (counts[e.name] || 0) + 1;
    });
    return { total: events.length, counts, recent: events.slice(-20) };
  }

  function clear() {
    write({ events: [] });
  }

  /**
   * Stop (or resume) sending from this browser. Local events are unaffected:
   * they never leave the device either way.
   * @param {boolean} out
   */
  function setOptOut(out) {
    try {
      if (out) localStorage.setItem(OPTOUT_KEY, "1");
      else localStorage.removeItem(OPTOUT_KEY);
    } catch {
      /* ignore */
    }
    if (out) {
      queue = [];
      held = [];
    }
  }

  /**
   * Ask the worker to delete everything it holds for this browser id
   * (POST /v1/events/forget). Sent whenever there is an endpoint, whatever the
   * privacy signals say: deleting is always allowed.
   * @param {string} cid the browser id to forget
   * @returns {boolean} whether a request went out
   */
  function forget(cid) {
    const ep = endpoint();
    if (!ep || typeof cid !== "string" || !cid) return false;
    try {
      if (typeof fetch !== "function") return false;
      fetch(`${ep.replace(/\/+$/, "")}/forget`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ cid }),
        keepalive: true,
        mode: "no-cors",
        credentials: "omit"
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /** For the privacy section: is anything being sent, and if not, why not. */
  function remoteState() {
    const reason = remoteBlockedReason();
    let optedOut = false;
    try {
      optedOut = localStorage.getItem(OPTOUT_KEY) === "1";
    } catch {
      /* ignore */
    }
    return { sending: !reason, reason: reason || null, optedOut };
  }

  global.VTAnalytics = { track, summary, clear, setOptOut, remoteState, flush, forget };

  // So an answer given before any event is raised still releases the hold.
  watchRegion();
})(window);
