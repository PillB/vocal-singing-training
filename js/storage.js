/**
 * Progress (localStorage) + recordings (IndexedDB)
 */
(function (global) {
  "use strict";

  const LS = {
    progress: "vt_progress_v1",
    session: "vt_session_v1",
    weekPlan: "vt_week_plan_v1",
    settings: "vt_settings_v1",
    reviews: "vt_reviews_v1",
    holdLogs: "vt_hold_logs_v1"
  };

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

  const Storage = {
    getProgress() {
      return read(LS.progress, {});
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
      write(LS.progress, all);
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
      return read(LS.weekPlan, {
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
      write(LS.weekPlan, plan);
    },
    getSettings() {
      return read(LS.settings, { lastTab: "vocal", maleRange: true });
    },
    setSettings(s) {
      write(LS.settings, s);
    },
    getReviews() {
      return read(LS.reviews, []);
    },
    saveReview(review) {
      const all = this.getReviews();
      all.unshift(review);
      write(LS.reviews, all.slice(0, 40));
    },
    getHoldLogs() {
      return read(LS.holdLogs, []);
    },
    addHoldLog(seconds) {
      const all = this.getHoldLogs();
      all.unshift({ at: new Date().toISOString(), seconds });
      write(LS.holdLogs, all.slice(0, 100));
      return all;
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
