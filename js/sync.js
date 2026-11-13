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
  /**
   * Which account this browser's practice was last synced with. A browser is
   * often shared, so the next account to sign in here must not be handed the
   * last one's practice, nor push it to itself, without being asked.
   */
  const LS_OWNER = "vt_sync_owner_v1";
  /**
   * Practice put aside on this browser when somebody chose to use only their
   * own account's copy: [{owner, at, bags: {profileId: bag}}]. It stays on this
   * browser and is merged back when its account signs in here again.
   */
  const LS_ASIDE = "vt_sync_aside_v1";
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
  /**
   * Failures worth trying again. A signed-out or oversized bag is not, nor a
   * write the worker turned down (a fourth profile): it would say the same.
   */
  const RETRYABLE = new Set(["offline", "error", "conflict"]);
  /** Failures every profile would meet alike, so a sync of several stops at one. */
  const STOPS_ALL = new Set(["offline", "signed_out"]);
  /**
   * Largest body sent as the page closes. Browsers refuse a keepalive request
   * over 64 KiB (shared with anything else leaving at the same moment), so a
   * bigger bag waits for the next visit's sync instead.
   */
  const KEEPALIVE_MAX_BYTES = 60000;
  /**
   * Longest a read or write may take before it counts as a dropped connection
   * and goes to the retry. Without a limit, a request that never answers holds
   * up every sync after it, the retry included. Above the slowest D1 round
   * trips operators report (39 s, docs/34), so a slow write is not cut off.
   */
  const REQUEST_TIMEOUT_MS = 45000;
  /** The weekly goal a profile has until somebody sets one (VTStorage.getGoals). */
  const DEFAULT_WEEKLY_TARGET = 3;

  let timer = null;
  let running = null;
  let runningFor = null;
  let lastError = null;
  // The worker's own word for a refused write ("profile_limit"), so the panel
  // can say why instead of promising a retry that will not come.
  let refusedReason = null;
  let lastSyncedAt = null;
  let failures = 0;

  // Which profiles hold changes the account has not had yet. Every synced write
  // bumps `version`; a profile is pushed up to the version that was current
  // when its bag was read, so a write that lands mid-sync is not forgotten.
  let version = 0;
  const changedAt = new Map();
  const pushedAt = new Map();
  // What this page itself last wrote or read for each profile, the revision and
  // the copy the account held at it, for the one write a closing page gets.
  // Kept in memory only, so it can never be a number left behind by another
  // account or another tab.
  const confirmed = new Map();
  // Profiles whose last write the worker turned down (a fourth profile), with
  // the version current when that cycle began and the worker's reason. The
  // same write would be turned down again, so no automatic sync (a save's
  // timer still pending, the connection coming back, the tab shown again)
  // sends it until the profile changes here; "Sincronizar ahora" still asks.
  // Kept in memory: the next visit tries once, in case the account has room.
  const refusals = new Map();

  function unpushed(profileId) {
    return (changedAt.get(profileId) || 0) > (pushedAt.get(profileId) || 0);
  }

  /**
   * A profile's refusal while it still stands: nothing written to the profile
   * since its cycle began. A change made while that cycle was out may not be
   * in what was turned down, so it ends the refusal and is sent.
   * @param {string} profileId Profile.
   * @returns {{before: number, reason: string|null}|null} The refusal, or null.
   */
  function standingRefusal(profileId) {
    const refusal = refusals.get(profileId);
    return refusal && (changedAt.get(profileId) || 0) <= refusal.before ? refusal : null;
  }

  /**
   * Remember a cycle that was turned down, or forget the refusal once the
   * profile went up.
   * @param {string} profileId Profile the cycle was for.
   * @param {{ok: boolean, reason?: string}|null} result The cycle's result.
   * @param {number} before The version current when the cycle began.
   */
  function noteRefusal(profileId, result, before) {
    if (result && result.ok) refusals.delete(profileId);
    else if (result && result.reason === "refused") refusals.set(profileId, { before, reason: refusedReason });
  }

  /** Whether a profile is no longer on this browser (deleted). */
  function deleted(profileId) {
    const list = global.VTStorage.getProfiles?.().list;
    return Array.isArray(list) && !list.some((p) => p.id === profileId);
  }

  /** Profiles other than the active one still holding changes, if they still exist. */
  function otherUnpushed(active) {
    return [...changedAt.keys()].filter((id) => id !== active && !deleted(id) && unpushed(id));
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

  /** The signed-in account's id, once /v1/me has said; null before. */
  function accountId() {
    try {
      return global.VTAccount?.getState?.().account?.id || null;
    } catch {
      return null;
    }
  }

  function readOwner() {
    try {
      return localStorage.getItem(LS_OWNER) || null;
    } catch {
      return null;
    }
  }

  function writeOwner(id) {
    if (!id) return;
    try {
      localStorage.setItem(LS_OWNER, id);
    } catch {
      /* private mode: every sync then asks again, which is the safe side */
    }
  }

  /** The put-aside list, dropping anything malformed. */
  function readAside() {
    try {
      const raw = localStorage.getItem(LS_ASIDE);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list)
        ? list.filter((e) => e && typeof e.owner === "string" && e.bags && typeof e.bags === "object")
        : [];
    } catch {
      return [];
    }
  }

  /** @returns {boolean} Whether the list was stored. */
  function writeAside(list) {
    try {
      if (!list.length) localStorage.removeItem(LS_ASIDE);
      else localStorage.setItem(LS_ASIDE, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  /** Every profile on this browser. */
  function localProfileIds() {
    const list = global.VTStorage.getProfiles?.().list;
    return Array.isArray(list) && list.length ? list.map((p) => p.id) : [global.VTStorage.getActiveProfileId()];
  }

  /**
   * Whether a bag holds anything somebody did: a take, a day practised, a
   * plan, a goal, a review. A first visit writes an empty day ledger, which
   * is nobody's practice.
   */
  function bagHasPractice(bag) {
    if (!bag) return false;
    const rows = Object.values(bag.progress || {});
    if (rows.some((r) => r && ((r.history || []).length || Number(r.completedCount) > 0))) return true;
    if ((bag.reviews || []).length || (bag.holdLogs || []).length) return true;
    if (bag.weekPlan || bag.goals || bag.loop) return true;
    if (bag.achievements && Object.values(bag.achievements).some(Boolean)) return true;
    return !!(bag.days && bag.days.days && Object.keys(bag.days.days).length);
  }

  function deviceHasPractice() {
    return localProfileIds().some((id) => bagHasPractice(global.VTStorage.readSyncBag(id)));
  }

  /**
   * Whose this browser's practice is, as far as a sync may act on it.
   *   mine     the signed-in account synced it last; or nobody has (practice
   *            from before any sign-in, which merges on the first sign-in as
   *            it always has); or there is no practice here at all.
   *   other    another account synced it last and it holds practice. Nothing
   *            is merged or sent until the person signed in chooses.
   *   unknown  an owner is on file and the account has not said who it is.
   * @returns {{state: "mine"|"other"|"unknown", owner: string|null, me: string|null}} Answer.
   */
  function ownerState() {
    const owner = readOwner();
    const me = accountId();
    if (!owner) return { state: "mine", owner, me };
    if (!me) return { state: "unknown", owner, me };
    if (owner === me || !deviceHasPractice()) return { state: "mine", owner, me };
    return { state: "other", owner, me };
  }

  /** True while the signed-in account has to choose before anything syncs. */
  function otherOwner() {
    try {
      return isAvailable() && ownerState().state === "other";
    } catch {
      return false;
    }
  }

  /**
   * Merge back whatever was put aside for this account on this browser, and
   * mark it to be pushed: it is that account's own practice.
   * @param {string} me Signed-in account id.
   */
  function restoreAside(me) {
    const list = readAside();
    const entry = list.find((e) => e.owner === me);
    if (!entry) return;
    const left = {};
    for (const [profileId, bag] of Object.entries(entry.bags)) {
      // A profile no longer on this browser keeps its copy aside.
      if (deleted(profileId)) {
        left[profileId] = bag;
        continue;
      }
      const merged = mergeBag(global.VTStorage.readSyncBag(profileId), bag);
      global.VTStorage.writeSyncBag(merged, profileId);
      version += 1;
      changedAt.set(profileId, version);
      dataChanged(profileId);
    }
    const rest = list.filter((e) => e !== entry);
    if (Object.keys(left).length) rest.push({ ...entry, bags: left });
    writeAside(rest);
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
   * first, then on how many elements it finished, then on when the week
   * started, then on check-ins.
   *
   * Two plans still level after that differ at most in the element picked for
   * a week not started yet. Nothing unpicks an element, so a plan with one is
   * ahead of a plan without; between two picks, the plan changed last wins.
   * Plans saved before they carried a time cannot say when, so the account's
   * copy decides, and every device ends up with the same plan rather than each
   * keeping its own.
   *
   * @param {object|null} local This browser's plan, or null if never written.
   * @param {object|null} remote The account's plan.
   * @returns {object|null} The further-along plan.
   */
  function mergeWeekPlan(local, remote) {
    if (!remote) return local || null;
    if (!local) return remote;
    // When the week started comes before check-ins: changing a week's focus
    // starts it again with none, and that restart is the newer state. Only
    // plans saved before 23 Sep 2026 carry check-ins at all.
    const rank = (plan) => [
      Number(plan.weekNumber) || 0,
      (plan.completedElements || []).length,
      ms(plan.startedAt),
      (plan.checkIns || []).length
    ];
    const [aw, ae, as, ac] = rank(local);
    const [bw, be, bs, bc] = rank(remote);
    if (aw !== bw) return aw > bw ? local : remote;
    if (ae !== be) return ae > be ? local : remote;
    if (as !== bs) return as > bs ? local : remote;
    if (ac !== bc) return ac > bc ? local : remote;
    if (!local.element !== !remote.element) return local.element ? local : remote;
    return ms(local.updatedAt) > ms(remote.updatedAt) ? local : remote;
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
   * Record the signed-in account as this browser's owner after a write it
   * accepted. If /v1/me has not answered yet, ask it, and record the answer
   * only if the same session is still the one signed in.
   */
  function noteOwner() {
    const me = accountId();
    if (me) {
      writeOwner(me);
      return;
    }
    const token = global.VTAccount?.getSessionToken?.();
    Promise.resolve(global.VTAccount?.refresh?.())
      .then(() => {
        const id = accountId();
        if (id && !readOwner() && global.VTAccount?.getSessionToken?.() === token) writeOwner(id);
      })
      .catch(() => {});
  }

  /**
   * What a cycle stops on after reading the account's copy, or null to merge it.
   * @param {object} pulled The GET's answer.
   * @param {string} profileId Whose copy.
   * @returns {{ok: false, reason: string}|null} Result.
   */
  function pullStop(pulled, profileId) {
    if (pulled.status === 401) return { ok: false, reason: "signed_out" };
    if (!pulled.ok) {
      // Usually the whole of an offline sync: the read fails before any
      // write is tried. Say so, or the panel keeps "saved" from last time.
      lastError = pulled.offline ? "offline" : "error";
      return { ok: false, reason: lastError };
    }
    // Deleted while the read was out: what came back is nobody's here now.
    if (deleted(profileId)) return { ok: false, reason: "deleted" };
    return null;
  }

  /**
   * Merge the account's copy into this profile's bag and keep the result here.
   * @param {string} profileId Whose bag.
   * @param {object} pulled The GET's answer.
   * @returns {{serverRev: number, seen: number, merged: object}} The revision
   *   read, the local version merged, and what to push.
   */
  function mergePulled(profileId, pulled) {
    const serverRev = Number(pulled.data?.rev) || 0;
    const seen = version;
    const local = localBag(profileId);
    const merged = mergeBag(local, pulled.data?.doc || null);

    // Write the merged result locally first: even if the push fails, this
    // device now holds everything both sides knew.
    global.VTStorage.writeSyncBag(merged, profileId);
    if (recordOf(merged) !== recordOf(local)) dataChanged(profileId);
    return { serverRev, seen, merged };
  }

  /**
   * The account took the write: remember the revision and what it holds.
   * @param {string} profileId Whose bag.
   * @param {object} pushed The PUT's answer.
   * @param {{serverRev: number, seen: number, merged: object}} step What mergePulled() returned.
   * @returns {{ok: true, rev: number|null}} Result.
   */
  function pushAccepted(profileId, pushed, { serverRev, seen, merged }) {
    noteOwner();
    writeRev(profileId, Number(pushed.data?.rev) || serverRev + 1);
    confirmed.set(profileId, { rev: Number(pushed.data?.rev) || serverRev + 1, doc: merged });
    pushedAt.set(profileId, Math.max(pushedAt.get(profileId) || 0, seen));
    lastError = null;
    refusedReason = null;
    lastSyncedAt = new Date().toISOString();
    emit();
    return { ok: true, rev: Number(pushed.data?.rev) || null };
  }

  /**
   * The account did not take the write: the result, or null when somebody else
   * wrote first and the cycle merges again.
   * @param {object} pushed The PUT's answer.
   * @returns {{ok: false, reason: string}|null} Result.
   */
  function pushFailed(pushed) {
    if (pushed.status === 401) return { ok: false, reason: "signed_out" };
    if (pushed.status === 409) return null; // somebody else wrote; merge again
    if (pushed.status === 413) {
      lastError = "too_large";
      emit();
      return { ok: false, reason: "too_large" };
    }
    if (pushed.status === 400) {
      // Turned down for what it is (a fourth profile on the account), not
      // for when it was sent: the same write would be turned down again.
      lastError = "refused";
      refusedReason = pushed.data?.reason || null;
      emit();
      return { ok: false, reason: "refused" };
    }
    lastError = pushed.offline ? "offline" : "error";
    emit();
    return { ok: false, reason: lastError };
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
    // A profile deleted while this waited has nothing left to sync, and its bag
    // written back would leave keys behind that no profile owns.
    if (deleted(profileId)) return { ok: false, reason: "deleted" };

    // Every change up to here can be in what this cycle sends; one made while
    // it is out may not be (see standingRefusal).
    const before = version;
    runningFor = profileId;
    running = (async () => {
      // Whose practice this is comes first: nothing of another account's is
      // read into, merged with or sent to this one until somebody chooses.
      let who = ownerState();
      if (who.state === "unknown") {
        const me = await global.VTAccount.refresh();
        if (!isAvailable()) return { ok: false, reason: "signed_out" };
        who = ownerState();
        if (who.state === "unknown") {
          lastError = me && me.reason === "offline" ? "offline" : "error";
          return { ok: false, reason: lastError };
        }
      }
      if (who.state === "other") return { ok: false, reason: "other_owner" };
      if (who.me) {
        writeOwner(who.me);
        restoreAside(who.me);
      }
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const pulled = await global.VTAccount.request(
          "GET",
          `/v1/me/progress?profileId=${encodeURIComponent(profileId)}`,
          null,
          { timeoutMs: REQUEST_TIMEOUT_MS }
        );
        const stop = pullStop(pulled, profileId);
        if (stop) return stop;

        const step = mergePulled(profileId, pulled);
        const pushed = await global.VTAccount.request(
          "PUT",
          "/v1/me/progress",
          { profileId, doc: step.merged, baseRev: step.serverRev },
          { timeoutMs: REQUEST_TIMEOUT_MS }
        );
        if (pushed.ok) return pushAccepted(profileId, pushed, step);
        const failed = pushFailed(pushed);
        if (failed) return failed;
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
      noteRefusal(profileId, result, before);
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
   * A failure that belongs to one profile (a write turned down, a bag too
   * large) does not keep the others back; only one every profile would meet
   * alike, offline or signed out, ends the round. A profile that did go up
   * after one that failed does not make the panel say all is saved.
   * A profile whose write was turned down and has not changed since is not
   * sent again: it would be turned down again. It still counts as not saved,
   * and the panel goes on saying why.
   * @returns {Promise<void>}
   */
  async function syncScheduled() {
    const active = global.VTStorage.getActiveProfileId();
    let failed = null;
    for (const id of [active, ...otherUnpushed(active)]) {
      // Deleted while an earlier profile synced.
      if (deleted(id)) continue;
      const res = standingRefusal(id) ? { ok: false, reason: "refused" } : await syncNow(id);
      if (res.ok || res.reason === "deleted") continue;
      if (STOPS_ALL.has(res.reason)) return;
      // Waiting for the owner question is not a failed save: the panel asks it.
      if (res.reason === "other_owner") continue;
      failed = failed || { reason: res.reason, id };
    }
    if (failed && !lastError) {
      lastError = failed.reason;
      // A profile that went up later in the round cleared why; it still holds.
      refusedReason = failed.reason === "refused" ? refusals.get(failed.id)?.reason || null : null;
      emit();
    }
  }

  /**
   * Push what is waiting now, because the page may not be here in 8 seconds.
   *
   * Hidden (a phone locking, another tab): the page usually lives on a little,
   * so the whole read-merge-write cycle starts at once instead of after the
   * quiet period. Closing: there is no time to read first, so each profile
   * with changes the account has not had goes up in one request the browser
   * finishes on its own, written on top of the revision this page last saw and
   * merged with the copy the account held at it. While that revision stands,
   * that copy is what a read would bring back, so anything removed here since
   * (progress cleared from the admin panel) is merged back, not wiped from the
   * account. If anyone else wrote since, the server refuses it and nothing is
   * lost: the changes are still here, and the next visit's sync merges them.
   *
   * @param {{unloading?: boolean}} [opts] Whether the page is going away.
   * @returns {Promise<void>|void} When not unloading, settles once what was
   *   waiting has been tried.
   */
  function flush(opts) {
    if (!isAvailable()) return Promise.resolve();
    if (!(opts && opts.unloading)) {
      // Signing out waits on this, so the last changes reach the account that
      // made them before the session is gone.
      if (!timer) return running ? running.then(() => {}, () => {}) : Promise.resolve();
      clearTimeout(timer);
      timer = null;
      return syncScheduled().catch(() => {
        /* reported through getStatus */
      });
    }
    const active = global.VTStorage.getActiveProfileId();
    for (const profileId of [active, ...otherUnpushed(active)]) {
      const last = confirmed.get(profileId);
      if (!unpushed(profileId) || !last) continue;
      const body = { profileId, doc: mergeBag(localBag(profileId), last.doc), baseRev: last.rev };
      let bytes = Infinity;
      try {
        bytes = new Blob([JSON.stringify(body)]).size;
      } catch {
        bytes = Infinity;
      }
      if (bytes > KEEPALIVE_MAX_BYTES) continue;
      // Not sent twice on the same base if the page closes again after a
      // back-forward cache brought it back.
      confirmed.delete(profileId);
      const seen = version;
      global.VTAccount.request("PUT", "/v1/me/progress", body, { keepalive: true })
        .then((res) => {
          // Only read when the page was kept after all.
          if (!res.ok) return;
          const rev = Number(res.data?.rev) || body.baseRev + 1;
          writeRev(profileId, rev);
          confirmed.set(profileId, { rev, doc: body.doc });
          pushedAt.set(profileId, Math.max(pushedAt.get(profileId) || 0, seen));
        })
        .catch(() => {});
    }
  }

  /**
   * Current sync status, synchronously.
   * @returns {{available: boolean, syncing: boolean, lastSyncedAt: string|null,
   *            lastError: string|null, refusedReason: string|null, rev: number,
   *            otherOwner: boolean}} Status. `otherOwner`: this browser holds
   *            another account's practice and the one signed in has to choose.
   */
  function getStatus() {
    let rev = 0;
    try {
      // A revision on file is only this account's if this account synced here.
      const owner = readOwner();
      if (!owner || owner === accountId()) rev = revFor(global.VTStorage.getActiveProfileId());
    } catch {
      rev = 0;
    }
    return {
      available: isAvailable(),
      syncing: !!running,
      lastSyncedAt,
      lastError,
      refusedReason,
      rev,
      otherOwner: otherOwner()
    };
  }

  /**
   * Pull the account's copy over this browser's, discarding local state.
   * Used deliberately from the account panel ("use my saved progress"), never
   * automatically — losing local work should always be somebody's choice.
   * @param {string} [id] Profile to pull; the active one when omitted.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  async function pullOverwrite(id) {
    if (!isAvailable()) return { ok: false, reason: "signed_out" };
    const profileId = id || global.VTStorage.getActiveProfileId();
    const pulled = await global.VTAccount.request(
      "GET",
      `/v1/me/progress?profileId=${encodeURIComponent(profileId)}`,
      null,
      { timeoutMs: REQUEST_TIMEOUT_MS }
    );
    if (!pulled.ok) return { ok: false, reason: pulled.offline ? "offline" : "error" };
    if (!pulled.data?.doc) return { ok: false, reason: "empty" };
    if (deleted(profileId)) return { ok: false, reason: "deleted" };
    // Into the profile that asked, even if the learner has switched since.
    global.VTStorage.writeSyncBag(pulled.data.doc, profileId);
    pushedAt.set(profileId, version);
    writeRev(profileId, Number(pulled.data.rev) || 0);
    confirmed.set(profileId, { rev: Number(pulled.data.rev) || 0, doc: pulled.data.doc });
    lastError = null;
    lastSyncedAt = new Date().toISOString();
    dataChanged(profileId);
    emit();
    return { ok: true };
  }

  /**
   * "Añadir la práctica de este dispositivo a esta cuenta": the account signed
   * in takes this browser's practice as its own, and it syncs as any other.
   * @returns {Promise<{ok: boolean, reason?: string}>} The active profile's sync.
   */
  async function addDeviceToAccount() {
    const me = accountId();
    if (!isAvailable() || !me) return { ok: false, reason: "signed_out" };
    writeOwner(me);
    if (lastError === "other_owner") lastError = null;
    emit();
    const active = global.VTStorage.getActiveProfileId();
    const ids = localProfileIds().filter((id) => id === active || bagHasPractice(global.VTStorage.readSyncBag(id)));
    let first = null;
    for (const id of [active, ...ids.filter((x) => x !== active)]) {
      const res = await syncNow(id);
      if (!first) first = res;
    }
    return first || { ok: true };
  }

  /**
   * "Usar solo la de mi cuenta": this browser's practice is put aside, on this
   * browser, under the account that last synced it, and the signed-in
   * account's own copy is brought down in its place. Nothing is cleared unless
   * the copy put aside was stored first.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  async function useAccountOnly() {
    const me = accountId();
    if (!isAvailable() || !me) return { ok: false, reason: "signed_out" };
    const owner = readOwner();
    const ids = localProfileIds();
    if (owner && owner !== me) {
      const bags = {};
      ids.forEach((id) => {
        const bag = global.VTStorage.readSyncBag(id);
        if (bagHasPractice(bag)) bags[id] = bag;
      });
      const list = readAside();
      const prev = list.find((e) => e.owner === owner);
      if (prev) {
        for (const [id, bag] of Object.entries(prev.bags)) bags[id] = bags[id] ? mergeBag(bags[id], bag) : bag;
      }
      const next = list.filter((e) => e.owner !== owner).concat([{ owner, at: new Date().toISOString(), bags }]);
      if (!writeAside(next)) return { ok: false, reason: "storage" };
      ids.forEach((id) => {
        global.VTStorage.clearProfileData(id);
        pushedAt.set(id, version);
      });
    }
    writeOwner(me);
    if (lastError === "other_owner") lastError = null;
    restoreAside(me);
    let result = { ok: true };
    for (const id of ids) {
      const res = await pullOverwrite(id);
      if (!res.ok && res.reason !== "empty" && result.ok) result = res;
    }
    dataChanged(global.VTStorage.getActiveProfileId());
    emit();
    return result;
  }

  global.VTSync = {
    syncNow,
    schedule,
    flush,
    pullOverwrite,
    addDeviceToAccount,
    useAccountOnly,
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
      else {
        confirmed.clear();
        // "Guardado en tu cuenta" was about the account that just left.
        lastError = null;
        refusedReason = null;
        // What that account turned down says nothing about the next one's.
        refusals.clear();
        lastSyncedAt = null;
        failures = 0;
      }
    });
    // The account may have answered while this file was still downloading
    // (its check starts as account.js runs): that sign-in was announced
    // before anyone here listened, and the sync it asks for never ran.
    if (global.VTAccount.getState?.().signedIn) schedule();
    // A failed sync need not wait out its retry once the connection is back.
    global.addEventListener?.("online", () => {
      if (lastError) schedule();
    });
  }
})(window);
