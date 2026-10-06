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
  /**
   * Waits before trying a failed sync again, the last one repeating while it
   * keeps failing: soon enough for a dropped connection that comes straight
   * back, sparse enough not to hammer a worker that is down.
   */
  const RETRY_MS = [30000, 120000, 600000];
  /** Failures worth trying again; a signed-out or oversized bag is not. */
  const RETRYABLE = new Set(["offline", "error", "conflict"]);
  /**
   * Largest body sent as the page closes. Browsers refuse a keepalive request
   * over 64 KiB (shared with anything else leaving at the same moment), so a
   * bigger bag waits for the next visit's sync instead.
   */
  const KEEPALIVE_MAX_BYTES = 60000;
  /** The weekly goal a profile has until somebody sets one (VTStorage.getGoals). */
  const DEFAULT_WEEKLY_TARGET = 3;

  let timer = null;
  let running = null;
  let runningFor = null;
  let lastError = null;
  let lastSyncedAt = null;
  let failures = 0;

  // Which profiles hold changes the account has not had yet. Every synced write
  // bumps `version`; a profile is pushed up to the version that was current
  // when its bag was read, so a write that lands mid-sync is not forgotten.
  let version = 0;
  const changedAt = new Map();
  const pushedAt = new Map();
  // The revision this page itself last wrote or read for each profile, for the
  // one write a closing page gets. Kept in memory only, so it can never be a
  // number left behind by another account or another tab.
  const confirmedRev = new Map();

  function unpushed(profileId) {
    return (changedAt.get(profileId) || 0) > (pushedAt.get(profileId) || 0);
  }

  /** Profiles other than the active one still holding changes, if they still exist. */
  function otherUnpushed(active) {
    const known = new Set((global.VTStorage.getProfiles?.().list || []).map((p) => p.id));
    return [...changedAt.keys()].filter((id) => id !== active && known.has(id) && unpushed(id));
  }

  const listeners = new Set();
  const dataListeners = new Set();

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

  /**
   * Subscribe to syncs that changed what this device holds for the active
   * profile: another device's practice arrived, so whatever shows the record
   * is out of date. Not called when a sync only pushed.
   * @param {function} fn Listener.
   * @returns {function} Unsubscribe.
   */
  function onDataChange(fn) {
    dataListeners.add(fn);
    return () => dataListeners.delete(fn);
  }

  /**
   * Tell the data listeners, when the profile written to is the one on screen.
   * @param {string} profileId The profile just written to.
   */
  function dataChanged(profileId) {
    if (profileId !== global.VTStorage.getActiveProfileId()) return;
    dataListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn(err);
      }
    });
  }

  /**
   * JSON with every object's keys in order and empty fields dropped, so two
   * bags holding the same things compare equal however they were built.
   * @param {unknown} value Any JSON value.
   * @returns {string} Canonical text.
   */
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      const keys = Object.keys(value)
        .filter((k) => value[k] !== null && value[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  /** The parts of a bag that are the learner's record, as canonical text. */
  function recordOf(bag) {
    const { v, profileId, savedAt, ...record } = bag || {};
    return canonical(record);
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
   * Pick between two copies of a setting by when each was chosen.
   *
   * A setting has no history to union, so the one chosen last wins, and one
   * never chosen (a default) loses to one that was. Copies saved before
   * settings carried the time cannot say when: back then every device pushed
   * its own, untouched defaults included, so the account often holds the
   * default of a device where nobody chose anything. Between two of those, one
   * that differs from the default is the one somebody chose. When that still
   * cannot tell, the account's copy decides, so every device ends up with the
   * same value rather than each keeping its own.
   *
   * @param {object|null} local This browser's copy.
   * @param {object|null} remote The account's copy.
   * @param {function(object): boolean} isDefault Whether a copy holds the default.
   * @returns {object|null} The copy to keep.
   */
  function newerSetting(local, remote, isDefault) {
    if (!local) return remote || null;
    if (!remote) return local;
    const a = ms(local.updatedAt);
    const b = ms(remote.updatedAt);
    if (a || b) return a > b ? local : remote;
    return isDefault(remote) && !isDefault(local) ? local : remote;
  }

  /** Whether a copy of the goals still holds the weekly goal nobody set. */
  function isDefaultGoals(goals) {
    return (Number(goals.weeklySessionsTarget) || DEFAULT_WEEKLY_TARGET) === DEFAULT_WEEKLY_TARGET;
  }

  /**
   * Merge a whole sync bag.
   * @param {object} local This browser's bag.
   * @param {object} remote The account's bag, or null.
   * @returns {object} Merged bag.
   */
  function mergeBag(local, remote) {
    if (!remote || typeof remote !== "object") return local;
    return {
      v: 1,
      profileId: local.profileId,
      savedAt: new Date().toISOString(),
      progress: mergeProgress(local.progress, remote.progress),
      weekPlan: mergeWeekPlan(local.weekPlan, remote.weekPlan),
      reviews: mergeLog(local.reviews, remote.reviews, 40),
      holdLogs: mergeLog(local.holdLogs, remote.holdLogs, 100),
      // Not the bag's own savedAt: that is "now" on whichever device is
      // syncing, so this device's goal always won and never came down.
      goals: newerSetting(local.goals, remote.goals, isDefaultGoals),
      achievements: {
        ...(remote.achievements || {}),
        ...(local.achievements || {})
      },
      days: global.VTDays?.merge ? global.VTDays.merge(local.days, remote.days) : local.days || remote.days || null,
      loop: global.VTLoop?.merge ? global.VTLoop.merge(local.loop, remote.loop) : local.loop || remote.loop || null
    };
  }

  /**
   * Read one profile's bag, stamped with when this copy was made.
   * @param {string} profileId Whose bag.
   * @returns {object} Sync bag.
   */
  function localBag(profileId) {
    const bag = global.VTStorage.readSyncBag(profileId);
    return { ...bag, savedAt: new Date().toISOString() };
  }

  /**
   * Run one read-merge-write cycle for one profile.
   *
   * The server's `409` is the whole concurrency story: it means the stored
   * revision moved while we were thinking, so we take its copy, merge, and try
   * again rather than overwriting somebody's evening.
   *
   * The cycle reads and writes the profile it started for, by name. Following
   * the active profile instead mixed two people's practice when the learner
   * switched profile while the request was out.
   *
   * @param {string} [id] Profile to sync; the active one when omitted.
   * @returns {Promise<{ok: boolean, reason?: string, rev?: number}>} Result.
   */
  async function syncNow(id) {
    const profileId = id || global.VTStorage.getActiveProfileId();
    // One cycle at a time: one for another profile waits for the one in flight
    // to finish. A second ask for the same profile shares it, unless something
    // was written after it read the bag. That write is not in what it pushes,
    // and this ask is the write's own timer running out (or the hidden-tab
    // flush that cancelled it), so nothing else would ask again: go round once
    // more for it.
    while (running) {
      const cycle = running;
      const same = runningFor === profileId;
      const result = await cycle.catch(() => null);
      if (same && !(result && result.ok && unpushed(profileId))) return cycle;
    }
    if (!isAvailable()) return { ok: false, reason: "signed_out" };

    runningFor = profileId;
    running = (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const pulled = await global.VTAccount.request(
          "GET",
          `/v1/me/progress?profileId=${encodeURIComponent(profileId)}`,
          null
        );
        if (pulled.status === 401) return { ok: false, reason: "signed_out" };
        if (!pulled.ok) {
          // Usually the whole of an offline sync: the read fails before any
          // write is tried. Say so, or the panel keeps "saved" from last time.
          lastError = pulled.offline ? "offline" : "error";
          return { ok: false, reason: lastError };
        }

        const serverRev = Number(pulled.data?.rev) || 0;
        const seen = version;
        const local = localBag(profileId);
        const merged = mergeBag(local, pulled.data?.doc || null);

        // Write the merged result locally first: even if the push fails, this
        // device now holds everything both sides knew.
        global.VTStorage.writeSyncBag(merged, profileId);
        if (recordOf(merged) !== recordOf(local)) dataChanged(profileId);

        const pushed = await global.VTAccount.request("PUT", "/v1/me/progress", {
          profileId,
          doc: merged,
          baseRev: serverRev
        });
        if (pushed.ok) {
          writeRev(profileId, Number(pushed.data?.rev) || serverRev + 1);
          confirmedRev.set(profileId, Number(pushed.data?.rev) || serverRev + 1);
          pushedAt.set(profileId, Math.max(pushedAt.get(profileId) || 0, seen));
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

    let result = null;
    try {
      result = await running;
      return result;
    } finally {
      running = null;
      runningFor = null;
      retryIfFailed(result);
      // The emits above run while `running` is still set, so every listener
      // was last told "syncing" and the account panel said "Guardando…" after
      // the save had finished. Tell them once more, now that it has.
      emit();
    }
  }

  /**
   * After a failed cycle, try again later, waiting longer each time it fails.
   * The panel promises exactly this ("Lo intentaremos de nuevo"). A change
   * already waiting to be pushed keeps its own, sooner, timer.
   * @param {{ok: boolean, reason?: string}|null} result The cycle's result.
   * @returns {void}
   */
  function retryIfFailed(result) {
    if (result && result.ok) {
      failures = 0;
      return;
    }
    if (result && !RETRYABLE.has(result.reason)) return;
    failures += 1;
    if (!timer) schedule(RETRY_MS[Math.min(failures, RETRY_MS.length) - 1]);
  }

  /**
   * Ask for a sync once the practising has settled down.
   * Called on every write of synced data (see the listener below): the timer
   * collapses a burst into one write, which matters on a free-tier database.
   * @param {number} [delayMs] How long to wait; the quiet period by default.
   * @returns {void}
   */
  function schedule(delayMs = DEBOUNCE_MS) {
    if (!isAvailable()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      syncScheduled().catch(() => {
        /* reported through getStatus */
      });
    }, delayMs);
  }

  /**
   * The active profile, then any other profile still holding changes: a take
   * saved just before the learner switched profile is pushed for its owner.
   * @returns {Promise<void>}
   */
  async function syncScheduled() {
    const active = global.VTStorage.getActiveProfileId();
    for (const id of [active, ...otherUnpushed(active)]) {
      const res = await syncNow(id);
      if (!res.ok) return;
    }
  }

  /**
   * Push what is waiting now, because the page may not be here in 8 seconds.
   *
   * Hidden (a phone locking, another tab): the page usually lives on a little,
   * so the whole read-merge-write cycle starts at once instead of after the
   * quiet period. Closing: there is no time to read first, so each profile
   * with changes the account has not had goes up in one request the browser
   * finishes on its own, written on top of the revision this page last saw.
   * If anyone else wrote since, the server refuses it and nothing is lost: the
   * changes are still here, and the next visit's sync merges them.
   *
   * @param {{unloading?: boolean}} [opts] Whether the page is going away.
   * @returns {void}
   */
  function flush(opts) {
    if (!isAvailable()) return;
    if (!(opts && opts.unloading)) {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      syncScheduled().catch(() => {
        /* reported through getStatus */
      });
      return;
    }
    const active = global.VTStorage.getActiveProfileId();
    for (const profileId of [active, ...otherUnpushed(active)]) {
      if (!unpushed(profileId) || !confirmedRev.has(profileId)) continue;
      const body = { profileId, doc: localBag(profileId), baseRev: confirmedRev.get(profileId) };
      let bytes = Infinity;
      try {
        bytes = new Blob([JSON.stringify(body)]).size;
      } catch {
        bytes = Infinity;
      }
      if (bytes > KEEPALIVE_MAX_BYTES) continue;
      // Not sent twice on the same base if the page closes again after a
      // back-forward cache brought it back.
      confirmedRev.delete(profileId);
      const seen = version;
      global.VTAccount.request("PUT", "/v1/me/progress", body, { keepalive: true })
        .then((res) => {
          // Only read when the page was kept after all.
          if (!res.ok) return;
          const rev = Number(res.data?.rev) || body.baseRev + 1;
          writeRev(profileId, rev);
          confirmedRev.set(profileId, rev);
          pushedAt.set(profileId, Math.max(pushedAt.get(profileId) || 0, seen));
        })
        .catch(() => {});
    }
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
    // Into the profile that asked, even if the learner has switched since.
    global.VTStorage.writeSyncBag(pulled.data.doc, profileId);
    pushedAt.set(profileId, version);
    writeRev(profileId, Number(pulled.data.rev) || 0);
    confirmedRev.set(profileId, Number(pulled.data.rev) || 0);
    lastError = null;
    lastSyncedAt = new Date().toISOString();
    dataChanged(profileId);
    emit();
    return { ok: true };
  }

  global.VTSync = {
    syncNow,
    schedule,
    flush,
    pullOverwrite,
    getStatus,
    onChange,
    onDataChange,
    isAvailable,
    // Exported for the test-suite: these are the whole correctness story.
    mergeBag,
    mergeProgress,
    mergeWeekPlan,
    mergeLog
  };

  // Anything a sync carries was just written: a take, a day's practice, the
  // plan, a goal. Asking here, once, means no screen has to remember to.
  global.VTStorage?.onSyncedChange?.((profileId) => {
    version += 1;
    changedAt.set(profileId, version);
    schedule();
  });

  if (typeof document !== "undefined" && global.VTAccount?.onChange) {
    // Signing in on a fresh device is the moment a sync is most wanted.
    global.VTAccount.onChange((state) => {
      if (state.signedIn) schedule();
      else confirmedRev.clear();
    });
    // A failed sync need not wait out its retry once the connection is back.
    global.addEventListener?.("online", () => {
      if (lastError) schedule();
    });
  }
})(window);
