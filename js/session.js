/**
 * Structured session + pause/resume
 */
(function (global) {
  "use strict";

  const Session = {
    /**
     * @param {string} track vocal | singing
     * @param {string} path basic | advanced | full
     */
    start(track, path = "basic") {
      const key = `${track}_${path}`;
      const legacy = track;
      const order =
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
      const path = s.path ? ` · ${s.path}` : "";
      return `Exercise ${Math.min(s.index + 1, s.order.length)} of ${s.order.length}${path}`;
    }
  };

  global.VTSession = Session;
})(window);
