/**
 * Structured session + pause/resume
 */
(function (global) {
  "use strict";

  const Session = {
    /**
     * @param {string} track vocal | singing
     * @param {string} path basic | advanced | full | daily | basics
     * @param {{ order?: string[], sec?: Object<string, number>, tier?: string }} [routine]
     *   A prepared sequence instead of a catalog route: today's basics are
     *   built per day (js/daily-loop.js), so they are handed in rather than
     *   looked up. `sec` gives each step its own timer.
     */
    start(track, path = "basic", routine = null) {
      const key = `${track}_${path}`;
      const legacy = track;
      const order =
        (routine && Array.isArray(routine.order) && routine.order.slice()) ||
        (global.VT_STRUCTURED && (global.VT_STRUCTURED[key] || global.VT_STRUCTURED[legacy])) ||
        [];
      const session = {
        mode: "structured",
        track,
        path,
        order,
        index: 0,
        status: "active", // active | paused | completed
        startedAt: new Date().toISOString(),
        pausedAt: null,
        completedIds: []
      };
      if (routine?.sec) session.sec = { ...routine.sec };
      if (routine?.tier) session.tier = routine.tier;
      global.VTStorage.setSession(session);
      return session;
    },

    get() {
      return global.VTStorage.getSession();
    },

    pause() {
      const s = this.get();
      if (!s || s.status !== "active") return s;
      s.status = "paused";
      s.pausedAt = new Date().toISOString();
      global.VTStorage.setSession(s);
      return s;
    },

    resume() {
      const s = this.get();
      if (!s || s.status !== "paused") return s;
      s.status = "active";
      s.pausedAt = null;
      global.VTStorage.setSession(s);
      return s;
    },

    currentExerciseId() {
      const s = this.get();
      if (!s || !s.order || s.index >= s.order.length) return null;
      return s.order[s.index];
    },

    markCurrentComplete() {
      const s = this.get();
      if (!s) return s;
      const id = s.order[s.index];
      if (id && !s.completedIds.includes(id)) s.completedIds.push(id);
      s.index += 1;
      if (s.index >= s.order.length) {
        s.status = "completed";
      }
      global.VTStorage.setSession(s);
      return s;
    },

    skip() {
      return this.markCurrentComplete();
    },

    clear() {
      global.VTStorage.setSession(null);
    },

    progressLabel() {
      const s = this.get();
      if (!s) return "";
      const t = (k, vars) => global.VTI18n?.t?.(k, vars) ?? k;
      // The banner already names these two ("Sesión diaria de clase", "Básicos
      // de hoy · Mínimo"); a path suffix only repeated it.
      if (s.path === "daily" || s.path === "basics") {
        return t("session.progress", { n: Math.min(s.index + 1, s.order.length), total: s.order.length });
      }
      // Route names follow the track (the picker's names, js/app.js pathName).
      const ownKey = `home.path.${s.track}.${s.path}`;
      const pathKey = t(ownKey) !== ownKey ? ownKey : `home.path.${s.path}`;
      const pathName = s.path ? t(pathKey) : "";
      const path = pathName && pathName !== pathKey ? ` · ${pathName}` : s.path ? ` · ${s.path}` : "";
      return (
        t("session.progress", {
          n: Math.min(s.index + 1, s.order.length),
          total: s.order.length
        }) + path
      );
    }
  };

  global.VTSession = Session;
})(window);
