/**
 * Lightweight local analytics (no third-party by default).
 * Events support retention measurement: practice_start, session_save, reminder_enable, etc.
 *
 * Every event is kept in this browser (`vt_analytics_v1`). When
 * `window.VT_ANALYTICS_ENDPOINT` is set (js/experiments-config.js), events are
 * also sent, batched, to the entitlements worker's `/v1/events` route so an
 * A/B test can be read — unless the visitor has said no in any of the ways a
 * browser can say it: Global Privacy Control, Do Not Track, or the switch in
 * the guide's privacy section (`vt_analytics_optout_v1`). Automated browsers
 * never send.
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

  let queue = [];
  let timer = null;
  let bound = false;

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
   * Why this browser does not send events, or "" when it does.
   * @returns {"" | "no_endpoint" | "gpc" | "dnt" | "opted_out" | "automated"}
   */
  function remoteBlockedReason() {
    if (!endpoint()) return "no_endpoint";
    const nav = global.navigator || {};
    if (nav.globalPrivacyControl === true) return "gpc";
    if (nav.doNotTrack === "1" || nav.doNotTrack === "yes" || global.doNotTrack === "1") return "dnt";
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
    return "";
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
    while (queue.length) {
      const batch = queue.splice(0, BATCH);
      if (!ep || remoteBlockedReason()) {
        queue = [];
        return;
      }
      // text/plain is the only body a cross-site beacon may carry without a
      // preflight; the worker parses it as JSON regardless.
      const body = JSON.stringify({ v: 1, events: batch });
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

  function enqueue(name, props, now) {
    if (remoteBlockedReason()) return;
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
    const counts = {};
    (bag.events || []).forEach((e) => {
      counts[e.name] = (counts[e.name] || 0) + 1;
    });
    return { total: (bag.events || []).length, counts, recent: (bag.events || []).slice(-20) };
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
    if (out) queue = [];
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
})(window);
