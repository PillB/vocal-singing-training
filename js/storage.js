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
    achievements: "vt_achievements_v1",
    // Daily loop: the local-day practice ledger (js/practice-days.js) and the
    // loop's own memory — surprises found, milestones marked (js/daily-loop.js).
    days: "vt_days_v1",
    loop: "vt_loop_v1"
  };

  const MAX_PROFILES_FREE = 1;
  const MAX_PROFILES_PRO = 3;

  const DB_NAME = "vt_recordings_db";
  const DB_STORE = "recordings";
  const DB_VERSION = 1;

  /** "null" and "array" are kinds of their own: typeof says "object" for both. */
  function kindOf(value) {
    if (value === null) return "null";
    return Array.isArray(value) ? "array" : typeof value;
  }

  /**
   * A stored value, or `fallback` when it is missing, is not JSON, or is JSON of
   * another kind than the fallback: null, a number or an array where an object
   * belongs (an import, a sync write, another build's schema, an extension) is as
   * unusable as invalid JSON, and used to stop the app booting until the site's
   * data was cleared (QA-35). A null fallback stands for "an object or nothing".
   * The kind is checked, not the fields inside.
   */
  function read(key, fallback) {
    try {
      const raw = unsaved.has(key) ? unsaved.get(key) : localStorage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return kindOf(value) === kindOf(fallback === null ? {} : fallback) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * QA-47. localStorage can refuse a write: the site's quota is full (pillb.github.io is one origin for every
   * project page of the account, so 5 MB is shared), storage is switched off, an old Safari private window.
   * The throw used to escape ensureProfiles() on the first read and the app never booted. A refused value is
   * kept here for the life of the page and read before localStorage, so the page works; nothing survives a
   * reload, which the learner is told once (`vt:storage-unsaved`, js/app.js). Only what goes through this
   * file is held: modules that keep their own keys (days ledger, analytics) manage their own failure.
   */
  const unsaved = new Map();
  let unsavedAnnounced = false;

  function noteUnsaved() {
    try {
      global.document.documentElement.dataset.storage = "memory";
    } catch {
      /* no document */
    }
    if (unsavedAnnounced) return;
    unsavedAnnounced = true;
    try {
      global.dispatchEvent(new CustomEvent("vt:storage-unsaved"));
    } catch {
      /* no events */
    }
  }

  function write(key, value) {
    const raw = JSON.stringify(value);
    try {
      localStorage.setItem(key, raw);
      unsaved.delete(key);
    } catch {
      unsaved.set(key, raw);
      noteUnsaved();
    }
  }

  function remove(key) {
    unsaved.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage is off: there is nothing stored to remove */
    }
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

  /**
   * Scoped key: default uses legacy keys (backward compatible).
   * @param {string} base Unscoped key.
   * @param {string} [profileId] Whose key; the active profile when omitted.
   */
  function scopedKey(base, profileId) {
    const id = profileId || ensureProfiles().activeId || "default";
    if (id === "default") return base;
    return `vt_prof_${id}_${base}`;
  }

  // Told whenever something a sync carries is written (js/sync.js listens), so
  // no caller has to remember to ask for a sync after saving. writeSyncBag
  // writes what a sync brought back and deliberately does not tell them.
  const syncedListeners = new Set();

  function writeSynced(base, value) {
    const id = ensureProfiles().activeId || "default";
    write(scopedKey(base, id), value);
    syncedListeners.forEach((fn) => {
      try {
        fn(id);
      } catch (err) {
        console.warn(err);
      }
    });
  }

  function defaultWeekPlan() {
    return {
      weekNumber: 1,
      element: null,
      status: "idle", // idle | active | review
      startedAt: null,
      checkIns: [],
      reviews: [],
      completedElements: []
    };
  }

  const Storage = {
    MAX_PROFILES_FREE,
    MAX_PROFILES_PRO,

    /** Whether the browser has refused a save, so some of this page's data lives only until it is closed. */
    isUnsaved() {
      return unsaved.size > 0;
    },

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
        remove(`vt_prof_${id}_${LS.progress}`);
        remove(`vt_prof_${id}_${LS.holdLogs}`);
        remove(`vt_prof_${id}_${LS.weekPlan}`);
        remove(`vt_prof_${id}_${LS.reviews}`);
        remove(`vt_prof_${id}_${LS.goals}`);
        remove(`vt_prof_${id}_${LS.achievements}`);
        remove(`vt_prof_${id}_${LS.days}`);
        remove(`vt_prof_${id}_${LS.loop}`);
      } catch {
        /* ignore */
      }
      return { ok: true };
    },

    getProgress() {
      return read(scopedKey(LS.progress), {});
    },
    /**
     * Save one take.
     *
     * `replaceId` updates an entry in place instead of adding one: practice that
     * was recorded automatically (a guided step, a finished timer) and is then
     * rated with Save is the same take, not a second one. The day it happened
     * never moves; `updatedAt` lets a sync pick the newer copy of one id.
     *
     * `auto: true` marks a take that was recorded without a rating. It has no
     * score, so it must not overwrite the last real score.
     */
    saveExerciseResult(exerciseId, result) {
      const all = this.getProgress();
      if (!all[exerciseId]) {
        all[exerciseId] = { completedCount: 0, history: [], lastScore: null, lastAt: null };
      }
      const row = all[exerciseId];
      const now = new Date().toISOString();
      const i = result.replaceId ? row.history.findIndex((h) => h && h.id === result.replaceId) : -1;
      const prev = i >= 0 ? row.history[i] : null;
      const entry = {
        id: prev ? prev.id : crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        at: prev ? prev.at : now,
        metrics: result.metrics || {},
        score: result.score ?? null,
        notes: result.notes || "",
        durationSec: result.durationSec || 0
      };
      if (prev) entry.updatedAt = now;
      if (result.auto) entry.auto = true;
      if (prev) row.history[i] = entry;
      else {
        row.history.unshift(entry);
        row.completedCount += 1;
      }
      row.history = row.history.slice(0, 50);
      if (entry.score != null) row.lastScore = entry.score;
      if (!row.lastAt || entry.at > row.lastAt) row.lastAt = entry.at;
      writeSynced(LS.progress, all);
      return entry;
    },
    getSession() {
      return read(LS.session, null);
    },
    setSession(session) {
      if (!session) remove(LS.session);
      else write(LS.session, session);
    },
    getWeekPlan() {
      return read(scopedKey(LS.weekPlan), defaultWeekPlan());
    },
    /**
     * `updatedAt` is when the plan last changed: between two copies at the same
     * point of the plan, a sync keeps the one changed last (js/sync.js).
     */
    setWeekPlan(plan) {
      writeSynced(LS.weekPlan, { ...(plan || {}), updatedAt: new Date().toISOString() });
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
      writeSynced(LS.reviews, all.slice(0, 40));
    },
    getHoldLogs() {
      return read(scopedKey(LS.holdLogs), []);
    },
    addHoldLog(seconds) {
      const all = this.getHoldLogs();
      all.unshift({ at: new Date().toISOString(), seconds });
      writeSynced(LS.holdLogs, all.slice(0, 100));
      return all;
    },

    getGoals() {
      return read(scopedKey(LS.goals), {
        weeklySessionsTarget: 3,
        weekKey: null
      });
    },
    /**
     * Goals are one value with nothing to union, so a sync keeps the one chosen
     * last; `updatedAt` is when it was chosen. The default above has none, so
     * it never wins over a goal somebody actually set.
     */
    setGoals(g) {
      writeSynced(LS.goals, { ...(g || {}), updatedAt: new Date().toISOString() });
    },

    /** Local-day practice ledger; shape owned by js/practice-days.js. */
    getDays() {
      return read(scopedKey(LS.days), null);
    },
    setDays(bag) {
      writeSynced(LS.days, bag);
    },

    /** Daily-loop memory; shape owned by js/daily-loop.js. */
    getLoop() {
      return read(scopedKey(LS.loop), null);
    },
    setLoop(bag) {
      writeSynced(LS.loop, bag);
    },

    getAchievementFlags() {
      return read(scopedKey(LS.achievements), {});
    },
    setAchievementFlags(f) {
      writeSynced(LS.achievements, f || {});
    },

    /**
     * Subscribe to writes of anything a sync carries.
     * @param {function(string): void} fn Called with the profile id written to.
     * @returns {function} Unsubscribe.
     */
    onSyncedChange(fn) {
      syncedListeners.add(fn);
      return () => syncedListeners.delete(fn);
    },

    /**
     * Everything about one profile that is worth carrying to another device,
     * as one plain object.
     *
     * A sync names its profile rather than following the active one, because
     * the learner can switch profile while a sync is waiting on the network.
     *
     * Goals and the week plan are left out until somebody sets them: the
     * default is not a choice, and must not travel as one.
     *
     * Recordings are deliberately left out: they live in IndexedDB, run to
     * megabytes each, and belong to a storage tier this sync is not.
     *
     * @param {string} [profileId] Whose bag; the active profile when omitted.
     * @returns {object} Sync bag for that profile.
     */
    readSyncBag(profileId) {
      const id = profileId || this.getActiveProfileId();
      const key = (base) => scopedKey(base, id);
      return {
        v: 1,
        profileId: id,
        progress: read(key(LS.progress), {}),
        weekPlan: read(key(LS.weekPlan), null),
        reviews: read(key(LS.reviews), []),
        holdLogs: read(key(LS.holdLogs), []),
        goals: read(key(LS.goals), null),
        achievements: read(key(LS.achievements), {}),
        days: read(key(LS.days), null),
        loop: read(key(LS.loop), null)
      };
    },

    /**
     * Write a sync bag back over one profile.
     *
     * Each section is written only when the bag actually carries it, so a bag
     * from an older build cannot blank out a section it never knew about.
     *
     * @param {object} bag Sync bag, as produced by readSyncBag.
     * @param {string} [profileId] Whose bag; the active profile when omitted.
     * @returns {{ ok: boolean }} Result.
     */
    writeSyncBag(bag, profileId) {
      if (!bag || typeof bag !== "object") return { ok: false };
      const key = (base) => scopedKey(base, profileId || this.getActiveProfileId());
      if (bag.progress && typeof bag.progress === "object") {
        write(key(LS.progress), bag.progress);
      }
      if (bag.weekPlan && typeof bag.weekPlan === "object") {
        write(key(LS.weekPlan), bag.weekPlan);
      }
      if (Array.isArray(bag.reviews)) write(key(LS.reviews), bag.reviews.slice(0, 40));
      if (Array.isArray(bag.holdLogs)) write(key(LS.holdLogs), bag.holdLogs.slice(0, 100));
      if (bag.goals && typeof bag.goals === "object") write(key(LS.goals), bag.goals);
      if (bag.achievements && typeof bag.achievements === "object") {
        write(key(LS.achievements), bag.achievements);
      }
      if (bag.days && typeof bag.days === "object") write(key(LS.days), bag.days);
      if (bag.loop && typeof bag.loop === "object") write(key(LS.loop), bag.loop);
      return { ok: true };
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
