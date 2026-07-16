/**
 * Progress (localStorage) + recordings (IndexedDB)
 * Multi-profile: free = 1 slot; Pro = up to 3 (enforced in app via billing.can).
 */
(function (global) {
  "use strict";

  const LS = {
    progress: "vt_progress_v1",
    session: "vt_session_v1",
    weekPlan: "vt_week_plan_v1",
    settings: "vt_settings_v1",
    reviews: "vt_reviews_v1",
    holdLogs: "vt_hold_logs_v1",
    profiles: "vt_profiles_v1",
    goals: "vt_goals_v1",
    achievements: "vt_achievements_v1"
  };

  const MAX_PROFILES_FREE = 1;
  const MAX_PROFILES_PRO = 3;

  const DB_NAME = "vt_recordings_db";
  const DB_STORE = "recordings";
  const DB_VERSION = 1;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function defaultProfiles() {
    return {
      activeId: "default",
      profiles: {
        default: { id: "default", name: "Default", createdAt: new Date().toISOString() }
      }
    };
  }

  function ensureProfiles() {
    let bag = read(LS.profiles, null);
    if (!bag || !bag.profiles || !bag.profiles.default) {
      bag = defaultProfiles();
      // One-time: legacy data already on unscoped keys = default profile
      write(LS.profiles, bag);
    }
    if (!bag.profiles[bag.activeId]) bag.activeId = "default";
    return bag;
  }

  /** Scoped key: default uses legacy keys (backward compatible). */
  function scopedKey(base) {
    const bag = ensureProfiles();
    const id = bag.activeId || "default";
    if (id === "default") return base;
    return `vt_prof_${id}_${base}`;
  }

  const Storage = {
    MAX_PROFILES_FREE,
    MAX_PROFILES_PRO,

    getProfiles() {
      const bag = ensureProfiles();
      return {
        activeId: bag.activeId,
        list: Object.values(bag.profiles).sort((a, b) =>
          a.id === "default" ? -1 : b.id === "default" ? 1 : (a.createdAt || "").localeCompare(b.createdAt || "")
        )
      };
    },

    getActiveProfileId() {
      return ensureProfiles().activeId || "default";
    },

    getActiveProfile() {
      const bag = ensureProfiles();
      return bag.profiles[bag.activeId] || bag.profiles.default;
    },

    /**
     * @param {string} id
     * @returns {{ ok: boolean, reason?: string }}
     */
    setActiveProfile(id) {
      const bag = ensureProfiles();
      if (!bag.profiles[id]) return { ok: false, reason: "missing" };
      bag.activeId = id;
      write(LS.profiles, bag);
      return { ok: true };
    },

    /**
     * Create profile. Caller must check Pro limit.
     * @param {string} name
     * @param {{ maxSlots?: number }} opts
     */
    createProfile(name, opts = {}) {
      const bag = ensureProfiles();
      const max = opts.maxSlots != null ? opts.maxSlots : MAX_PROFILES_PRO;
      const count = Object.keys(bag.profiles).length;
      if (count >= max) return { ok: false, reason: "limit", count, max };
      const id =
        "p_" +
        (crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : String(Date.now()).slice(-8));
      const label = String(name || "Profile").trim().slice(0, 32) || "Profile";
      bag.profiles[id] = { id, name: label, createdAt: new Date().toISOString() };
      bag.activeId = id;
      write(LS.profiles, bag);
      // Empty scoped stores start empty (read fallbacks)
      return { ok: true, id, profile: bag.profiles[id] };
    },

    renameProfile(id, name) {
      const bag = ensureProfiles();
      if (!bag.profiles[id]) return { ok: false, reason: "missing" };
      bag.profiles[id].name = String(name || bag.profiles[id].name).trim().slice(0, 32);
      write(LS.profiles, bag);
      return { ok: true, profile: bag.profiles[id] };
    },

    /** Cannot delete default. */
    deleteProfile(id) {
      if (id === "default") return { ok: false, reason: "default" };
      const bag = ensureProfiles();
      if (!bag.profiles[id]) return { ok: false, reason: "missing" };
      delete bag.profiles[id];
      if (bag.activeId === id) bag.activeId = "default";
      write(LS.profiles, bag);
      try {
        localStorage.removeItem(`vt_prof_${id}_${LS.progress}`);
        localStorage.removeItem(`vt_prof_${id}_${LS.holdLogs}`);
        localStorage.removeItem(`vt_prof_${id}_${LS.weekPlan}`);
        localStorage.removeItem(`vt_prof_${id}_${LS.reviews}`);
        localStorage.removeItem(`vt_prof_${id}_${LS.goals}`);
      } catch {
        /* ignore */
      }
      return { ok: true };
    },

    getProgress() {
      return read(scopedKey(LS.progress), {});
    },
    saveExerciseResult(exerciseId, result) {
      const all = this.getProgress();
      if (!all[exerciseId]) {
        all[exerciseId] = { completedCount: 0, history: [], lastScore: null, lastAt: null };
      }
      const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        at: new Date().toISOString(),
        metrics: result.metrics || {},
        score: result.score ?? null,
        notes: result.notes || "",
        durationSec: result.durationSec || 0
      };
      all[exerciseId].history.unshift(entry);
      all[exerciseId].history = all[exerciseId].history.slice(0, 50);
      all[exerciseId].completedCount += 1;
      all[exerciseId].lastScore = entry.score;
      all[exerciseId].lastAt = entry.at;
      write(scopedKey(LS.progress), all);
      return entry;
    },
    getSession() {
      return read(LS.session, null);
    },
    setSession(session) {
      if (!session) localStorage.removeItem(LS.session);
      else write(LS.session, session);
    },
    getWeekPlan() {
      return read(scopedKey(LS.weekPlan), {
        weekNumber: 1,
        element: null,
        status: "idle", // idle | active | review
        startedAt: null,
        checkIns: [],
        reviews: [],
        completedElements: []
      });
    },
    setWeekPlan(plan) {
      write(scopedKey(LS.weekPlan), plan);
    },
    getSettings() {
      return read(LS.settings, { lastTab: "vocal", maleRange: true });
    },
    setSettings(s) {
      write(LS.settings, s);
    },
    getReviews() {
      return read(scopedKey(LS.reviews), []);
    },
    saveReview(review) {
      const all = this.getReviews();
      all.unshift(review);
      write(scopedKey(LS.reviews), all.slice(0, 40));
    },
    getHoldLogs() {
      return read(scopedKey(LS.holdLogs), []);
    },
    addHoldLog(seconds) {
      const all = this.getHoldLogs();
      all.unshift({ at: new Date().toISOString(), seconds });
      write(scopedKey(LS.holdLogs), all.slice(0, 100));
      return all;
    },

    getGoals() {
      return read(scopedKey(LS.goals), {
        weeklySessionsTarget: 3,
        weekKey: null
      });
    },
    setGoals(g) {
      write(scopedKey(LS.goals), g || {});
    },

    getAchievementFlags() {
      return read(scopedKey(LS.achievements), {});
    },
    setAchievementFlags(f) {
      write(scopedKey(LS.achievements), f || {});
    },

    openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            const store = db.createObjectStore(DB_STORE, { keyPath: "id" });
            store.createIndex("exerciseId", "exerciseId", { unique: false });
            store.createIndex("createdAt", "createdAt", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async saveRecording({ exerciseId, blob, label, meta }) {
      const db = await this.openDb();
      const id = crypto.randomUUID ? crypto.randomUUID() : `rec_${Date.now()}`;
      const buffer = await blob.arrayBuffer();
      const record = {
        id,
        exerciseId,
        label: label || "Practice take",
        mimeType: blob.type || "audio/webm",
        createdAt: new Date().toISOString(),
        size: blob.size,
        meta: meta || {},
        data: buffer
      };
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(record);
        tx.oncomplete = () => resolve({ id, createdAt: record.createdAt, size: record.size, exerciseId, label: record.label });
        tx.onerror = () => reject(tx.error);
      });
    },

    async listRecordings(exerciseId = null) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const store = tx.objectStore(DB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          let rows = req.result || [];
          rows = rows
            .map((r) => ({
              id: r.id,
              exerciseId: r.exerciseId,
              label: r.label,
              mimeType: r.mimeType,
              createdAt: r.createdAt,
              size: r.size,
              meta: r.meta
            }))
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          if (exerciseId) rows = rows.filter((r) => r.exerciseId === exerciseId);
          resolve(rows);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async getRecordingBlob(id) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = () => {
          const r = req.result;
          if (!r) return resolve(null);
          resolve(new Blob([r.data], { type: r.mimeType || "audio/webm" }));
        };
        req.onerror = () => reject(req.error);
      });
    },

    async deleteRecording(id) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  };

  global.VTStorage = Storage;
})(window);
