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
        fetch(ep, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, props, t: new Date().toISOString() }),
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
