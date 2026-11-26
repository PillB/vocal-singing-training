/**
 * The pending link on a browser more than one person buys on (red team round
 * two: states-2).
 *
 * The defect: a checkout whose link to the account the worker had not made
 * yet (the webhook later than the buyer) was kept in one slot,
 * vt_pending_link_v1, naming its account. Since round one, signing out drops
 * the claim, so for a buyer who paid by a pasted link and signed out before
 * the webhook, that slot was the only way back to their purchase. The next
 * account to buy on that browser wrote its own reference over it, and when
 * the first buyer signed in again there was nothing left to link: charged by
 * Creem every month, Pro nowhere.
 *
 * Round two's verification found two more ways to lose a reference:
 * - The list was kept under the same key as the one object, so a tab still
 *   running the shipped page (opened before the deploy) read the list as
 *   nothing pending, wrote its one object over everybody's entries, and
 *   removed the key on a link. The list now has a key of its own
 *   (vt_pending_links_v2); the old one is read, merged in and removed.
 * - Past the cap, the entry that went was the first in the stored order,
 *   which is not age order, and it could be somebody else's while the
 *   writer had entries of their own to give up.
 *
 * The oracle is what the browser keeps (the list, read as stored, and the
 * old key) and what reaches the worker under whose session. The first
 * buyer's record is seeded in the shape the shipped page writes (one object
 * under the old key), so the same cases show such a record is read, not lost.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense } = require("./helpers/billing");
const W = require("./helpers/rt2-p1-worker");

test.use({ locale: "en-US", timezoneId: "America/New_York" });

const ANA_REF = { provider: "creem", sessionId: "ch_p1_ana_paid" };
const BRUNO_REF = { provider: "creem", sessionId: "ch_p1_bruno_paid" };
const MINUTE = 60000;

/** Ana's reference as the shipped page kept it: one object, naming her account and a session that has ended. */
const anaRecord = () => ({ ...ANA_REF, at: Date.now() - 10 * MINUTE, acct: W.ANA.id, sess: "0badc0de" });

/** The links that reached the worker under `person`'s session. */
const linksBy = (worker, person) => W.sentTo(worker, "/v1/me/link").filter((r) => r.who === person.id).map((r) => r.body);

test.describe("states-2: one browser, two buyers, two pending links", () => {
  test("Bruno's purchase keeps Ana's pending link beside his, and Ana's sign-in links hers and only hers", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    // Neither webhook has landed: both links are told to wait.
    const worker = W.freshWorker();
    await W.install(page, worker, license, { session: W.BRUNO, pending: anaRecord() });
    await W.open(page, `?billing=success&checkout_id=${BRUNO_REF.sessionId}`);
    await W.accountIs(page, W.BRUNO);
    await expect.poll(() => linksBy(worker, W.BRUNO), { timeout: 5000 }).toContainEqual(BRUNO_REF);
    // Wrong (before): Bruno's reference replaced Ana's, and hers was gone.
    await expect.poll(() => W.pendingLinks(page)).toEqual([
      expect.objectContaining({ ...ANA_REF, acct: W.ANA.id }),
      expect.objectContaining({ ...BRUNO_REF, acct: W.BRUNO.id })
    ]);
    expect(await W.legacyPending(page), "the old key, merged into the list, is gone").toBeNull();
    expect(linksBy(worker, W.BRUNO).filter((b) => b.sessionId === ANA_REF.sessionId), "Ana's is never sent under Bruno").toEqual([]);

    // Both webhooks land; Bruno leaves, and Ana signs in on this browser.
    worker.landed.add(ANA_REF.sessionId);
    worker.landed.add(BRUNO_REF.sessionId);
    await W.switchTo(page, W.ANA);
    await expect.poll(() => linksBy(worker, W.ANA), { timeout: 5000 }).toEqual([ANA_REF]);
    await expect.poll(() => W.licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: W.ANA.id });
    // Hers is linked and forgotten; Bruno's stays for Bruno, untouched by her sign-in.
    await expect.poll(() => W.pendingLinks(page)).toEqual([expect.objectContaining({ ...BRUNO_REF, acct: W.BRUNO.id })]);
    expect(linksBy(worker, W.ANA), "nothing of Bruno's sent under Ana").toEqual([ANA_REF]);
  });

  test("control: the same person asking again for the same reference keeps one entry, which names their account", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    await W.install(page, worker, license, { session: W.ANA });
    await W.open(page, `?billing=success&checkout_id=${ANA_REF.sessionId}`);
    await W.accountIs(page, W.ANA);
    await expect.poll(() => linksBy(worker, W.ANA), { timeout: 5000 }).toContainEqual(ANA_REF);
    // Asked again (the in-page schedule does this), each ask writing the reference first.
    await page.evaluate(() => window.VTAccount.retryPendingLink());
    await page.evaluate(() => window.VTAccount.retryPendingLink());
    expect(linksBy(worker, W.ANA).length, "precondition: asked more than once").toBeGreaterThan(1);
    // Wrong: an entry per ask, each retried on every load.
    expect(await W.pendingLinks(page)).toEqual([expect.objectContaining({ ...ANA_REF, acct: W.ANA.id })]);
  });

  test("Bruno's page asking for Ana's reference (her return address opened again) neither takes her entry over nor clears it with the worker's no", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    // Ana's purchase is hers on the worker already (linked from her phone),
    // so a link of it by anybody else is refused for good: 409.
    worker.answers["/v1/me/link"] = (person, body) =>
      body.sessionId === ANA_REF.sessionId && person?.id !== W.ANA.id ? [409, { ok: false, reason: "already_linked" }] : [202, { ok: false, reason: "pending" }];
    const seeded = anaRecord();
    await W.install(page, worker, license, { session: W.BRUNO, pending: seeded });
    // Her return address, opened again in Bruno's sign-in (the back button, history, a shared link).
    await W.open(page, `?billing=success&checkout_id=${ANA_REF.sessionId}`);
    await W.accountIs(page, W.BRUNO);
    await expect.poll(() => linksBy(worker, W.BRUNO), { timeout: 5000 }).toContainEqual(ANA_REF);
    // Bruno's own ask for it is settled by the 409 and goes; Ana's entry stays
    // exactly as it was, still hers and still dated when she first asked.
    // Wrong: Bruno's ask took her entry over (it named him), or his 409
    // cleared every entry for the reference, hers too.
    await expect.poll(() => W.pendingLinks(page)).toEqual([{ ...seeded }]);

    // Ana signs in on this browser: hers is still there to link.
    delete worker.answers["/v1/me/link"];
    worker.landed.add(ANA_REF.sessionId);
    await W.switchTo(page, W.ANA);
    await expect.poll(() => linksBy(worker, W.ANA), { timeout: 5000 }).toEqual([ANA_REF]);
    await expect.poll(() => W.licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: W.ANA.id });
    await expect.poll(() => W.pendingLinks(page)).toBeNull();
  });

  test("the list keeps four at most: past that the oldest of other people's goes, not the first stored, and never the one being written", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    // Four other buyers' references on this browser, an hour apart, stored
    // out of age order (an entry written again moves to the end and keeps
    // its first date): ch_other_1 is the oldest, ch_other_3 is first.
    const other = (n) => ({ provider: "creem", sessionId: `ch_other_${n}`, at: Date.now() - (6 - n) * 60 * MINUTE, acct: `acct_other_${n}`, sess: "0badc0de" });
    await W.install(page, worker, license, { session: W.BRUNO, pendingList: [3, 1, 4, 2].map(other) });
    await W.open(page, "");
    await W.accountIs(page, W.BRUNO);
    await page.evaluate((ref) => window.VTAccount.linkCheckout(ref, { persist: true }), BRUNO_REF);
    expect(linksBy(worker, W.BRUNO), "precondition: Bruno's own link was asked for, and nobody else's").toEqual([BRUNO_REF]);
    // Wrong: a list that grows without bound, one that drops the reference
    // just written, or one that drops the first stored (ch_other_3) rather
    // than the oldest.
    const ids = await W.pendingLinks(page).then((list) => (list || []).map((r) => r.sessionId).sort());
    expect(ids).toEqual([BRUNO_REF.sessionId, "ch_other_2", "ch_other_3", "ch_other_4"].sort());
  });

  test("past the cap the writer's own oldest entry goes before anybody else's, however old theirs is", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    // Ana's paid reference is the oldest on the browser; Bruno has three of
    // his own still waiting, stored out of age order (ch_bruno_1 is his oldest).
    const bruno = (n, hours) => ({ provider: "creem", sessionId: `ch_bruno_${n}`, at: Date.now() - hours * 60 * MINUTE, acct: W.BRUNO.id, sess: "0badc0de" });
    const seeded = [{ ...anaRecord(), at: Date.now() - 6 * 60 * MINUTE }, bruno(2, 2), bruno(1, 4), bruno(3, 1)];
    await W.install(page, worker, license, { session: W.BRUNO, pendingList: seeded });
    await W.open(page, "");
    await W.accountIs(page, W.BRUNO);
    // Bruno's own three were sent on the load (and are still waiting); Ana's was not.
    await expect.poll(() => linksBy(worker, W.BRUNO).map((b) => b.sessionId).sort(), { timeout: 5000 }).toEqual(["ch_bruno_1", "ch_bruno_2", "ch_bruno_3"]);
    await page.evaluate((ref) => window.VTAccount.linkCheckout(ref, { persist: true }), BRUNO_REF);
    // Wrong: Ana's, the oldest, went (her only way back to a purchase on this
    // browser), or Bruno's first stored (ch_bruno_2) rather than his oldest.
    const ids = await W.pendingLinks(page).then((list) => (list || []).map((r) => r.sessionId).sort());
    expect(ids).toEqual([ANA_REF.sessionId, BRUNO_REF.sessionId, "ch_bruno_2", "ch_bruno_3"].sort());
  });
});

test.describe("round two: a tab still running the page from before the list", () => {
  test("its one object, written under the old key after the list exists, is merged in beside the list and the old key removed; its later write and removal touch nobody's entry", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const BRUNO_OLD = { provider: "creem", sessionId: "ch_p1_bruno_old_tab" };
    // The list holds Ana's reference; an old tab, signed in as Bruno (the
    // session is shared through storage), has written Bruno's purchase under
    // the old key, as one object.
    const ana = anaRecord();
    await W.install(page, worker, license, {
      session: W.BRUNO,
      pendingList: [ana],
      pending: { ...BRUNO_OLD, at: Date.now() - MINUTE, acct: W.BRUNO.id, sess: "0ldtab00" }
    });
    await W.open(page, "");
    await W.accountIs(page, W.BRUNO);
    // Wrong (one key): the old tab's object had replaced the list, and Ana's
    // reference was gone. Both are kept, and Bruno's (his own) is sent.
    await expect.poll(() => linksBy(worker, W.BRUNO), { timeout: 5000 }).toEqual([BRUNO_OLD]);
    expect(await W.pendingLinks(page)).toEqual([ana, expect.objectContaining({ ...BRUNO_OLD, acct: W.BRUNO.id })]);
    expect(await W.legacyPending(page), "the old key is removed once merged").toBeNull();

    // It writes again, as its retry does, the reference the list already
    // holds for Bruno: still one entry. Wrong: one more each time, each sent.
    await page.evaluate((rec) => localStorage.setItem("vt_pending_link_v1", JSON.stringify(rec)), { ...BRUNO_OLD, at: Date.now() - MINUTE, acct: W.BRUNO.id, sess: "0ldtab00" });
    await page.evaluate(() => window.VTAccount.retryPendingLink());
    expect((await W.pendingLinks(page)).map((r) => r.sessionId)).toEqual([ANA_REF.sessionId, BRUNO_OLD.sessionId]);
    expect(await W.legacyPending(page)).toBeNull();

    // The old tab links a purchase and removes the old key, as its code does:
    // the list is not under that key, so nothing of anybody's goes with it.
    await page.evaluate(() => localStorage.removeItem("vt_pending_link_v1"));
    expect(await W.pendingLinks(page)).toEqual([ana, expect.objectContaining({ ...BRUNO_OLD, acct: W.BRUNO.id })]);
    // It writes another of Bruno's purchases, one object over the old key
    // again: the next read here takes it in beside both.
    const BRUNO_NEXT = { provider: "creem", sessionId: "ch_p1_bruno_old_tab_2" };
    await page.evaluate((rec) => localStorage.setItem("vt_pending_link_v1", JSON.stringify(rec)), { ...BRUNO_NEXT, at: Date.now(), acct: W.BRUNO.id, sess: "0ldtab00" });
    await page.evaluate(() => window.VTAccount.retryPendingLink());
    expect((await W.pendingLinks(page)).map((r) => r.sessionId).sort()).toEqual([ANA_REF.sessionId, BRUNO_OLD.sessionId, BRUNO_NEXT.sessionId].sort());
    expect(await W.legacyPending(page)).toBeNull();

    // Bruno's purchases land and are linked and forgotten; Ana's stays for
    // her. Wrong (the old key left in place): a linked reference was read
    // back from it and sent again on every load.
    worker.landed.add(BRUNO_OLD.sessionId);
    worker.landed.add(BRUNO_NEXT.sessionId);
    await page.evaluate(() => window.VTAccount.retryPendingLink());
    await expect.poll(() => W.pendingLinks(page)).toEqual([ana]);
    const sent = linksBy(worker, W.BRUNO).length;
    await page.evaluate(() => window.VTAccount.retryPendingLink());
    expect(linksBy(worker, W.BRUNO), "nothing linked is sent again").toHaveLength(sent);
    expect(linksBy(worker, W.BRUNO).filter((b) => b.sessionId === ANA_REF.sessionId), "Ana's is never sent under Bruno").toEqual([]);
  });
});

test.describe("round two: storage that will not take the list", () => {
  test("the old key is kept until the list holding its entry is stored, so the next load still has it", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    // Writes of the list are refused (quota full); the old key can still be read and removed.
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "vt_pending_links_v2") throw new DOMException("full", "QuotaExceededError");
        return set.call(this, key, value);
      };
    });
    const ana = anaRecord();
    await W.install(page, worker, license, { session: W.ANA, pending: ana });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    // This page still sends it, from the copy it holds.
    await expect.poll(() => linksBy(worker, W.ANA), { timeout: 5000 }).toEqual([ANA_REF]);
    expect(await W.pendingLinks(page), "precondition: the list was not stored").toBeNull();
    // Wrong: the old key removed once read, though the list holding its
    // entry was not stored, so the purchase was gone on the next load.
    expect(await W.legacyPending(page)).toEqual(ana);
  });
});

test.describe("round two: what retryPendingLink reports", () => {
  /** Ana signed in, with two of her own references stored after the load: ch_a1, the older, then ch_a2. */
  async function twoOfAnas(page, worker) {
    const license = await mintLicense({ origin: W.BASE });
    await W.install(page, worker, license, { session: W.ANA });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    const mine = (id, minutes) => ({ provider: "creem", sessionId: id, at: Date.now() - minutes * MINUTE, acct: W.ANA.id, sess: "0badc0de" });
    await page.evaluate((list) => localStorage.setItem("vt_pending_links_v2", JSON.stringify(list)), [mine("ch_a1", 20), mine("ch_a2", 10)]);
  }

  test("the answer that linked one, though it came second, so the page redraws the account as Pro", async ({ page }) => {
    const worker = W.freshWorker();
    await twoOfAnas(page, worker);
    worker.landed.add("ch_a2");
    const release = W.hold(worker, "/v1/me/link");
    const asked = page.evaluate(() => window.VTAccount.retryPendingLink());
    // One at a time: the second is not sent until the first has answered.
    await expect.poll(() => linksBy(worker, W.ANA).map((b) => b.sessionId)).toEqual(["ch_a1"]);
    await page.waitForTimeout(300);
    expect(linksBy(worker, W.ANA).map((b) => b.sessionId), "no burst against the worker").toEqual(["ch_a1"]);
    release();
    // Wrong: the first answer (ch_a1, still waiting: 202), so app.js's
    // "settled" never redrew the account after ch_a2 linked.
    expect(await asked).toMatchObject({ ok: true, status: 200 });
    expect(linksBy(worker, W.ANA).map((b) => b.sessionId)).toEqual(["ch_a1", "ch_a2"]);
  });

  test("control: with neither linked, the first answer", async ({ page }) => {
    const worker = W.freshWorker();
    await twoOfAnas(page, worker);
    expect(await page.evaluate(() => window.VTAccount.retryPendingLink())).toMatchObject({ ok: false, status: 202 });
    expect(linksBy(worker, W.ANA).map((b) => b.sessionId)).toEqual(["ch_a1", "ch_a2"]);
  });
});
