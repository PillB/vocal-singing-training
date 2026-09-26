/**
 * Saved progress: keep this browser and the account's copy in step.
 *
 * The rule that shapes everything here: practice history is append-only in
 * spirit, so a sync must never be able to lose a session somebody actually
 * did. Two devices are therefore merged, not chosen between — union the takes,
 * keep the furthest-along plan — and the server refuses any write that was not
 * based on the revision the client last read. A refusal is not an error; it
 * means somebody else got there first, so we merge their copy in and write
 * again.
 *
 * Recordings stay in IndexedDB. They are megabytes each and are not what
 * "don't lose my progress" means.
 */
(function (global) {
  "use strict";

  const LS_REV = "vt_sync_rev_v1";
  /** Most entries kept per exercise, matching the browser's own history cap. */
  const HISTORY_CAP = 50;
  /** Attempts at the read-merge-write cycle before giving up until next time. */
  const MAX_ATTEMPTS = 3;
  /** Quiet period after a change before pushing, so a session does not write per rep. */
  const DEBOUNCE_MS = 8000;

  let timer = null;
  let running = null;
  let lastError = null;
  let lastSyncedAt = null;

  const listeners = new Set();

  function emit() {
    const status = getStatus();
    listeners.forEach((fn) => {
      try {
        fn(status);
      } catch (err) {
        console.warn(err);
      }
    });
  }

  /**
   * Subscribe to sync status changes.
   * @param {function} fn Listener.
   * @returns {function} Unsubscribe.
   */
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** Revision bookkeeping, per profile, so several profiles can sync separately. */
  function readRevs() {
    try {
      const raw = localStorage.getItem(LS_REV);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeRev(profileId, rev) {
    try {
      const all = readRevs();
      all[profileId] = rev;
      localStorage.setItem(LS_REV, JSON.stringify(all));
    } catch {
      /* private mode */
    }
  }

  function revFor(profileId) {
    const rev = readRevs()[profileId];
    return Number.isFinite(rev) ? rev : 0;
  }

  /** True when there is a signed-in account to sync with. */
  function isAvailable() {
    try {
      return !!global.VTAccount?.getSessionToken?.();
    } catch {
      return false;
    }
  }

  /**
   * Parse an ISO date into milliseconds, or 0.
   * @param {unknown} value ISO string.
   * @returns {number} Milliseconds.
   */
  function ms(value) {
    const t = Date.parse(String(value || ""));
    return Number.isFinite(t) ? t : 0;
  }

  /**
   * Merge two exercise-progress maps.
   *
   * Histories are unioned by entry id, because the same take can legitimately
   * arrive from two devices and must not be counted twice, and a take only one
   * device has must survive. `completedCount` takes the larger of the two: the
   * history is capped, so it cannot be recomputed from the entries.
   *
   * @param {object} local This browser's map.
   * @param {object} remote The account's map.
   * @returns {object} Merged map.
   */
  function mergeProgress(local, remote) {
    const out = {};
    const ids = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
    for (const id of ids) {
      const a = (local && local[id]) || null;
      const b = (remote && remote[id]) || null;
      if (!a) {
        out[id] = b;
        continue;
      }
      if (!b) {
        out[id] = a;
        continue;
      }
      const byId = new Map();
      // The same id can differ between devices when an automatically recorded
      // take was rated later on one of them; the newer copy is the rated one.
      for (const entry of [...(b.history || []), ...(a.history || [])]) {
        if (!entry || !entry.id) continue;
        const prev = byId.get(entry.id);
        if (!prev || ms(entry.updatedAt || entry.at) > ms(prev.updatedAt || prev.at)) {
          byId.set(entry.id, entry);
        }
      }
      const history = Array.from(byId.values())
        .sort((x, y) => ms(y.at) - ms(x.at))
        .slice(0, HISTORY_CAP);
      const newest = ms(a.lastAt) >= ms(b.lastAt) ? a : b;
      out[id] = {
        completedCount: Math.max(Number(a.completedCount) || 0, Number(b.completedCount) || 0),
        history,
        lastScore: newest.lastScore ?? null,
        lastAt: newest.lastAt || null
      };
    }
    return out;
  }

  /**
   * Merge two 12-week plans by picking the one that is further along.
   *
   * Plans are a single state machine, not a list, so they cannot be unioned:
   * the honest answer is "whichever device got further", compared on the week
   * first, then on how many elements it finished, then on check-ins.
   *
   * @param {object} local This browser's plan.
   * @param {object} remote The account's plan.
   * @returns {object} The further-along plan.
   */
  function mergeWeekPlan(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    const rank = (plan) => [
      Number(plan.weekNumber) || 0,
      (plan.completedElements || []).length,
      (plan.checkIns || []).length,
      ms(plan.startedAt)
    ];
    const [aw, ae, ac, as] = rank(local);
    const [bw, be, bc, bs] = rank(remote);
    if (aw !== bw) return aw > bw ? local : remote;
    if (ae !== be) return ae > be ? local : remote;
    if (ac !== bc) return ac > bc ? local : remote;
    return as >= bs ? local : remote;
  }

  /**
   * Union two append-only lists that carry an `at` timestamp.
   * @param {Array} local This browser's list.
   * @param {Array} remote The account's list.
   * @param {number} cap Most entries to keep.
   * @returns {Array} Merged list, newest first.
   */
  function mergeLog(local, remote, cap) {
    const seen = new Set();
    const out = [];
    for (const entry of [...(local || []), ...(remote || [])]) {
      if (!entry) continue;
      // `at` plus the payload is a good enough identity for a log line: two
      // real entries that share both are indistinguishable anyway.
      const key = JSON.stringify(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    return out.sort((x, y) => ms(y.at) - ms(x.at)).slice(0, cap);
  }

  /**
   * Merge a whole sync bag.
   * @param {object} local This browser's bag.
   * @param {object} remote The account's bag, or null.
   * @returns {object} Merged bag.
   */
  function mergeBag(local, remote) {
    if (!remote || typeof remote !== "object") return local;
    const localNewer = ms(local.savedAt) >= ms(remote.savedAt);
    return {
      v: 1,
      profileId: local.profileId,
      savedAt: new Date().toISOString(),
      progress: mergeProgress(local.progress, remote.progress),
      weekPlan: mergeWeekPlan(local.weekPlan, remote.weekPlan),
      reviews: mergeLog(local.reviews, remote.reviews, 40),
      holdLogs: mergeLog(local.holdLogs, remote.holdLogs, 100),
      // Settings are a single value with no history to union, so the bag that
      // was saved more recently wins.
      goals: localNewer ? local.goals : remote.goals,
      achievements: {
        ...(remote.achievements || {}),
        ...(local.achievements || {})
      },
      days: global.VTDays?.merge ? global.VTDays.merge(local.days, remote.days) : local.days || remote.days || null,
      loop: global.VTLoop?.merge ? global.VTLoop.merge(local.loop, remote.loop) : local.loop || remote.loop || null
    };
  }

  /**
   * Read this browser's bag, stamped so settings can be compared later.
   * @returns {object} Sync bag.
   */
  function localBag() {
    const bag = global.VTStorage.readSyncBag();
    return { ...bag, savedAt: new Date().toISOString() };
  }

  /**
   * Run one read-merge-write cycle.
   *
   * The server's `409` is the whole concurrency story: it means the stored
   * revision moved while we were thinking, so we take its copy, merge, and try
   * again rather than overwriting somebody's evening.
   *
   * @returns {Promise<{ok: boolean, reason?: string, rev?: number}>} Result.
   */
  async function syncNow() {
    if (running) return running;
    if (!isAvailable()) return { ok: false, reason: "signed_out" };

    running = (async () => {
      const profileId = global.VTStorage.getActiveProfileId();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const pulled = await global.VTAccount.request(
          "GET",
          `/v1/me/progress?profileId=${encodeURIComponent(profileId)}`,
          null
        );
        if (pulled.status === 401) return { ok: false, reason: "signed_out" };
        if (!pulled.ok) return { ok: false, reason: pulled.offline ? "offline" : "error" };

        const serverRev = Number(pulled.data?.rev) || 0;
        const merged = mergeBag(localBag(), pulled.data?.doc || null);

        // Write the merged result locally first: even if the push fails, this
        // device now holds everything both sides knew.
        global.VTStorage.writeSyncBag(merged);

        const pushed = await global.VTAccount.request("PUT", "/v1/me/progress", {
          profileId,
          doc: merged,
          baseRev: serverRev
        });
        if (pushed.ok) {
          writeRev(profileId, Number(pushed.data?.rev) || serverRev + 1);
          lastError = null;
          lastSyncedAt = new Date().toISOString();
          emit();
          return { ok: true, rev: Number(pushed.data?.rev) || null };
        }
        if (pushed.status === 401) return { ok: false, reason: "signed_out" };
        if (pushed.status === 409) continue; // somebody else wrote; merge again
        if (pushed.status === 413) {
          lastError = "too_large";
          emit();
          return { ok: false, reason: "too_large" };
        }
        lastError = pushed.offline ? "offline" : "error";
        emit();
        return { ok: false, reason: lastError };
      }
      lastError = "conflict";
      emit();
      return { ok: false, reason: "conflict" };
    })();

    try {
      return await running;
    } finally {
      running = null;
    }
  }

  /**
   * Ask for a sync once the practising has settled down.
   * Safe to call after every saved result: the timer collapses a burst into one
   * write, which matters on a free-tier database.
   * @returns {void}
   */
  function schedule() {
    if (!isAvailable()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      syncNow().catch(() => {
        /* reported through getStatus */
      });
    }, DEBOUNCE_MS);
  }

  /**
   * Current sync status, synchronously.
   * @returns {{available: boolean, syncing: boolean, lastSyncedAt: string|null,
   *            lastError: string|null, rev: number}} Status.
   */
  function getStatus() {
    let rev = 0;
    try {
      rev = revFor(global.VTStorage.getActiveProfileId());
    } catch {
      rev = 0;
    }
    return {
      available: isAvailable(),
      syncing: !!running,
      lastSyncedAt,
      lastError,
      rev
    };
  }

  /**
   * Pull the account's copy over this browser's, discarding local state.
   * Used deliberately from the account panel ("use my saved progress"), never
   * automatically — losing local work should always be somebody's choice.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  async function pullOverwrite() {
    if (!isAvailable()) return { ok: false, reason: "signed_out" };
    const profileId = global.VTStorage.getActiveProfileId();
    const pulled = await global.VTAccount.request(
      "GET",
      `/v1/me/progress?profileId=${encodeURIComponent(profileId)}`,
      null
    );
    if (!pulled.ok) return { ok: false, reason: pulled.offline ? "offline" : "error" };
    if (!pulled.data?.doc) return { ok: false, reason: "empty" };
    global.VTStorage.writeSyncBag(pulled.data.doc);
    writeRev(profileId, Number(pulled.data.rev) || 0);
    lastSyncedAt = new Date().toISOString();
    emit();
    return { ok: true };
  }

  global.VTSync = {
    syncNow,
    schedule,
    pullOverwrite,
    getStatus,
    onChange,
    isAvailable,
    // Exported for the test-suite: these are the whole correctness story.
    mergeBag,
    mergeProgress,
    mergeWeekPlan,
    mergeLog
  };

  if (typeof document !== "undefined" && global.VTAccount?.onChange) {
    // Signing in on a fresh device is the moment a sync is most wanted.
    global.VTAccount.onChange((state) => {
      if (state.signedIn) schedule();
    });
  }
})(window);
