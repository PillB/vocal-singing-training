/**
 * Lightweight local analytics (no third-party by default).
 * Events support retention measurement: practice_start, session_save, reminder_enable, etc.
 * Optional: window.VT_ANALYTICS_ENDPOINT for future beacon POST.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_analytics_v1";
  const MAX = 500;

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

  /**
   * @param {string} name
   * @param {Record<string, unknown>} [props]
   */
  function track(name, props) {
    if (!name) return;
    const bag = read();
    bag.events = bag.events || [];
    bag.events.push({
      name: String(name),
      props: props || {},
      t: new Date().toISOString()
    });
    if (bag.events.length > MAX) bag.events = bag.events.slice(-MAX);
    write(bag);

    // Optional remote (never blocks UI)
    try {
      const ep = global.VT_ANALYTICS_ENDPOINT;
      if (ep && typeof fetch === "function") {
        // An event nobody can tie to a browser, an arm or a local day cannot
        // answer an A/B question, so the beacon carries all three. The id is
        // the random one js/experiments.js already keeps; nothing personal.
        const now = new Date();
        fetch(ep, {
          method: "POST",
          // no-cors only allows "simple" content types; a JSON header was
          // silently dropped, so say what actually arrives.
          headers: { "content-type": "text/plain" },
          body: JSON.stringify({
            name,
            props,
            t: now.toISOString(),
            cid: global.VTExperiments?.clientId?.() || null,
            day: global.VTDays?.dayKey?.(now) || null,
            tz: -now.getTimezoneOffset()
          }),
          keepalive: true,
          mode: "no-cors"
        }).catch(() => {});
      }
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

  global.VTAnalytics = { track, summary, clear };
})(window);
