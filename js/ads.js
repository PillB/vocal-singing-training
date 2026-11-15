/**
 * Unobtrusive ads / native tips for free tier.
 * Hard rules: never during live practice; Pro/trial suppressed; master kill switch.
 * @see docs/19-AD-MONETIZATION-ORCHESTRATION.md
 */
(function (global) {
  "use strict";

  const LAST_HOME_KEY = "vt_ads_last_home_v1";
  const LAST_POST_KEY = "vt_ads_last_post_v1";

  function cfg() {
    return global.VT_ADS_CONFIG || {};
  }

  function isEs() {
    try {
      return (
        (global.VTI18n?.getLang?.() || document.documentElement.lang || "es")
          .toString()
          .toLowerCase()
          .startsWith("es")
      );
    } catch {
      return true;
    }
  }

  function isProUser() {
    try {
      if (!cfg().suppressForPro) return false;
      return !!global.VTBilling?.isPro?.();
    } catch {
      return false;
    }
  }

  /**
   * Practice / live session must never host ads.
   * View id is #view-exercise (not view-practice). Live flag is practiceLive.
   */
  function isPracticeActive() {
    const exercise = document.getElementById("view-exercise");
    if (exercise && exercise.classList.contains("active")) {
      // On exercise view: block new ad renders except post-session slot after save
      // (post-session is opt-in via onPostSession after metrics save, practice stopped)
      if (global.VTApp?.getState) {
        try {
          const st = global.VTApp.getState();
          if (st && (st.practiceLive || st.practiceStarting || st.running || st.recording)) {
            return true;
          }
        } catch {
          /* ignore */
        }
      }
      // If still live practice UI (stop button visible) treat as active
      const stopBtn = document.getElementById("btn-practice-stop");
      if (stopBtn && !stopBtn.hidden) return true;
    }
    if (document.body.classList.contains("view-exercise")) {
      try {
        const st = global.VTApp?.getState?.();
        if (st && (st.practiceLive || st.practiceStarting)) return true;
      } catch {
        /* ignore */
      }
    }
    if (global.VTApp?.getState) {
      try {
        const st = global.VTApp.getState();
        if (st && (st.practiceLive || st.practiceStarting || st.running || st.recording)) {
          return true;
        }
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  function shouldShowAds() {
    const c = cfg();
    if (!c.adsEnabled) return false;
    if (isProUser()) return false;
    if (isPracticeActive()) return false;
    return true;
  }

  /**
   * A card for this slot, or null when none of them has anywhere to go.
   *
   * The second half of this used to read `usable.length ? usable : cards`, and
   * that fallback undid the filter above it in exactly the configuration we
   * ship. Reproduced on 4 November 2026 by changing one value, `adsEnabled`,
   * which is the single switch the go-live gate names: the home slot rendered
   * "Micrófono USB de estudio" with a "Ver opciones" button that called
   * nothing (`window.open` 0 times, no pricing panel), because both cards that
   * name the home slot ship with `href: ""` until real partner links exist. It
   * also recorded an `ad_click` for the press. A dead button in the most
   * prominent slot on the free tier is worse than an empty slot, so an empty
   * slot is what this returns now.
   *
   * The legitimate use of that fallback — seeing the layout before any partner
   * link exists — is `mode: "preview"`, where it is asked for explicitly and
   * the card says what it is.
   * @param {"home"|"history"|"post-session"} slotId Slot being filled.
   * @param {{allowUnusable?: boolean}} [opts] Preview mode passes true.
   * @returns {Object|null} A card, or null.
   */
  function pickNativeCard(slotId, opts) {
    const cards = (cfg().nativeCards || []).filter((card) => {
      const slots = card.slots || [];
      return slots.includes(slotId);
    });
    if (!cards.length) return null;
    const usable = cards.filter(
      (c) => c.action === "open-pricing" || String(c.href || "").trim()
    );
    const pool = opts && opts.allowUnusable ? cards : usable;
    // This guard survives mutation on purpose: deleting it leaves `pool[0]` of an
    // empty array, which is `undefined`, and the only caller writes `if (card)`,
    // so nothing observable changes and no test fails. It is kept because the
    // documented return type above would otherwise be a lie, and because a second
    // caller should not have to know that the first one got away with it.
    if (!pool.length) return null;
    const i = Math.floor(Math.random() * pool.length);
    return pool[i];
  }

  function throttleOk(key, minMs) {
    try {
      const last = Number(localStorage.getItem(key) || 0);
      if (Date.now() - last < minMs) return false;
      localStorage.setItem(key, String(Date.now()));
      return true;
    } catch {
      return true;
    }
  }

  function track(event, payload) {
    try {
      global.VTAnalytics?.track?.(event, payload || {});
    } catch {
      /* ignore */
    }
  }

  function renderNativeCard(el, card, slotId) {
    if (!el || !card) return;
    const es = isEs();
    const title = es ? card.titleEs || card.titleEn : card.titleEn || card.titleEs;
    const body = es ? card.bodyEs || card.bodyEn : card.bodyEn || card.bodyEs;
    const cta = es ? card.ctaEs || card.ctaEn : card.ctaEn || card.ctaEs;
    const label = es ? cfg().labelEs : cfg().labelEn;
    const disc = es ? cfg().disclosureEs : cfg().disclosureEn;
    const href = String(card.href || "").trim();
    const isPricing = card.action === "open-pricing" || href === "#pricing";

    el.hidden = false;
    el.classList.add("ad-slot", "ad-slot--native");
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", label);

    el.innerHTML = `
      <div class="ad-native-card">
        <span class="ad-native-label">${escapeHtml(label)}</span>
        <strong class="ad-native-title">${escapeHtml(title || "")}</strong>
        <p class="ad-native-body">${escapeHtml(body || "")}</p>
        <div class="ad-native-actions">
          <button type="button" class="btn btn-sm btn-ghost ad-native-cta" data-ad-cta="1">
            ${escapeHtml(cta || (es ? "Más" : "More"))}
          </button>
          <button type="button" class="btn btn-sm btn-ghost ad-native-dismiss" data-ad-dismiss="1" aria-label="Dismiss">
            ✕
          </button>
        </div>
        <p class="ad-native-disc muted">${escapeHtml(disc || "")}</p>
      </div>
    `;

    el.querySelector("[data-ad-cta]")?.addEventListener("click", () => {
      track("ad_click", { slot: slotId, id: card.id, mode: "native" });
      if (isPricing) {
        document.getElementById("btn-pricing")?.click();
        return;
      }
      if (href) {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    });
    el.querySelector("[data-ad-dismiss]")?.addEventListener("click", () => {
      el.hidden = true;
      el.innerHTML = "";
      track("ad_dismiss", { slot: slotId, id: card.id });
    });

    track("ad_impression", { slot: slotId, id: card.id, mode: "native" });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clearSlot(el) {
    if (!el) return;
    el.hidden = true;
    el.innerHTML = "";
    el.classList.remove("ad-slot--native", "ad-slot--adsense", "ad-slot--preview");
  }

  const SLOT_ELEMENT_IDS = {
    home: "ad-slot-home",
    history: "ad-slot-history",
    "post-session": "ad-slot-post-session"
  };

  /**
   * @param {"home"|"history"|"post-session"} slotId
   */
  function renderSlot(slotId) {
    const el = document.getElementById(SLOT_ELEMENT_IDS[slotId] || "");
    if (!el) return { ok: false, reason: "no_element" };
    const blocked = slotBlocked(el, slotId);
    if (blocked) return blocked;
    const c = cfg();
    if (slotThrottled(slotId, c.frequency || {})) return { ok: false, reason: "throttled" };
    const filled = fillSlot(el, slotId, c);
    if (filled) return filled;
    clearSlot(el);
    return { ok: false, reason: "no_fill" };
  }

  /**
   * Why a slot stays empty whatever is configured: practice under way, or a
   * visitor who sees no ads. Clears the slot and says why, or returns null.
   * @param {Element} el Slot element.
   * @param {string} slotId Slot name.
   * @returns {{ok: false, reason: string}|null} Refusal.
   */
  function slotBlocked(el, slotId) {
    // Post-session is only allowed after completeExercise (practice already stopped).
    // Home/history still fully blocked when practice is live.
    const practiceLive = isPracticeActive();
    if (practiceLive && slotId !== "post-session") {
      clearSlot(el);
      track("ad_suppressed_practice", { slot: slotId });
      return { ok: false, reason: "practice_active" };
    }

    if (!shouldShowAds()) {
      clearSlot(el);
      if (isProUser()) track("ad_suppressed_pro", { slot: slotId });
      return { ok: false, reason: "suppressed" };
    }
    return null;
  }

  /**
   * Whether this slot showed something too recently to show again. Only home
   * and post-session are rate-limited; history is not.
   * @param {string} slotId Slot name.
   * @param {Object} freq The config's `frequency` block.
   * @returns {boolean} True when it must wait.
   */
  function slotThrottled(slotId, freq) {
    if (slotId === "home") {
      return !throttleOk(LAST_HOME_KEY, Number(freq.homeMinIntervalMs || 60000));
    }
    if (slotId === "post-session") {
      return !throttleOk(LAST_POST_KEY, Number(freq.postSessionMinIntervalMs || 120000));
    }
    return false;
  }

  /**
   * Fill the slot the way the configured mode says: the preview, a native
   * card, or an AdSense unit. Returns what was drawn, or null for no fill.
   * @param {Element} el Slot element.
   * @param {string} slotId Slot name.
   * @param {Object} c Ads config.
   * @returns {Object|null} Result.
   */
  function fillSlot(el, slotId, c) {
    const mode = c.mode || "native";

    // Preview: what the slots look like, with no third-party script, no network
    // and no AdSense account. This is the mode to switch on to decide whether
    // ads belong here at all; nothing in it is an advertisement, so nothing in
    // it is tracked as one.
    if (mode === "preview") {
      renderPreview(el, slotId);
      return { ok: true, mode: "preview" };
    }

    if (mode === "native" || mode === "hybrid") {
      const card = pickNativeCard(slotId);
      if (card) {
        renderNativeCard(el, card, slotId);
        return { ok: true, mode: "native", id: card.id };
      }
    }

    // AdSense path: only when client + slot configured (lazy; no script if empty)
    if ((mode === "adsense" || mode === "hybrid") && c.adsense?.client) {
      const unit = c.adsense.slots?.[slotId === "post-session" ? "home" : slotId];
      if (unit) {
        renderAdSensePlaceholder(el, c.adsense.client, unit, slotId);
        return { ok: true, mode: "adsense" };
      }
    }
    return null;
  }

  /**
   * Track what AdSense actually did with the unit, rather than that we asked.
   *
   * Google documents the signal: "AdSense adds a parameter to the `<ins>`
   * element called `data-ad-status`" once "an ad unit has finished requesting
   * an ad", and its values are `filled` ("An ad was returned to the ad unit and
   * is now showing"), `unfilled` ("No ads were returned and the ad unit is
   * empty") and `unfill-optimized`
   * (support.google.com/adsense/answer/10762946, read 4 November 2026).
   *
   * This exists because the impression was recorded at request time, which
   * counts an ad that was never returned and an ad an extension blocked before
   * the script ran. If the script never runs the attribute is never set and
   * nothing is tracked, which is right: nothing was shown.
   * @param {Element|null} ins The ad unit.
   * @param {string} slotId Slot name, for the event.
   * @returns {void}
   */
  function watchAdStatus(ins, slotId) {
    if (!ins || typeof MutationObserver !== "function") return;
    let reported = false;
    let observer = null;
    const report = () => {
      const status = ins.getAttribute("data-ad-status");
      if (reported || !status) return;
      reported = true;
      try {
        if (observer) observer.disconnect();
      } catch {
        /* ignore */
      }
      if (status === "filled") {
        track("ad_impression", { slot: slotId, mode: "adsense" });
        return;
      }
      track("ad_unfilled", { slot: slotId, mode: "adsense", status });
    };
    try {
      observer = new MutationObserver(report);
      observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    } catch {
      return;
    }
    // In case it was already decided before we started watching.
    report();
  }

  /**
   * Render a real AdSense unit, with the label and the disclosure the native
   * card already carried and this path did not.
   *
   * What was wrong: `aria-label="Advertisement"` was hard-coded English in a
   * Spanish-first product, there was no `role`, and there was no visible label
   * or disclosure at all — so the one slot that is actually an advertisement
   * was the one slot that did not say so, in either language. Measured on
   * 4 November 2026: `aria-label` "Advertisement", `role` null, no
   * `.ad-native-label`, no `.ad-native-disc`.
   *
   * A label above the unit and a disclosure below it are not among the
   * modifications AdSense prohibits (support.google.com/adsense/answer/1354736
   * lists hiding units, covering them, overlapping content on mobile, hidden
   * keyword targeting, email or software distribution, and anything that
   * "artificially inflates ad performance"). Nothing here covers the unit.
   *
   * One thing this cannot fix, recorded rather than pretended away: once
   * `adsbygoogle.js` has loaded it stays for the life of the page, so a learner
   * who buys Pro mid-session has the slot emptied — measured, the `<ins>` is
   * removed rather than hidden — while Google's script and its `adsbygoogle`
   * global remain until they navigate. Removing a script tag does not unload a
   * script, so the only honest remedies are not to load it (which is what
   * `mode: "native"`, the default, does) or a reload the product does not
   * currently do. docs/40-GO-LIVE-GATE.md step 9 says so where the switch is.
   * @param {Element} el Slot element.
   * @param {string} client Publisher id.
   * @param {string} slot Ad unit id.
   * @param {string} slotId Slot name.
   * @returns {void}
   */
  function renderAdSensePlaceholder(el, client, slot, slotId) {
    const es = isEs();
    const c = cfg();
    const label = (es ? c.labelEs : c.labelEn) || (es ? "Publicidad" : "Advertisement");
    const disc = (es ? c.disclosureEs : c.disclosureEn) || "";
    el.hidden = false;
    el.classList.add("ad-slot", "ad-slot--adsense");
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", label);
    el.innerHTML = `
      <span class="ad-native-label">${escapeHtml(label)}</span>
      <ins class="adsbygoogle"
        style="display:block"
        data-ad-client="${escapeHtml(client)}"
        data-ad-slot="${escapeHtml(slot)}"
        data-ad-format="auto"
        data-full-width-responsive="true"></ins>
      <p class="ad-native-disc muted">${escapeHtml(disc)}</p>
    `;
    // Lazy-load script once
    if (!document.getElementById("vt-adsense-script")) {
      const s = document.createElement("script");
      s.id = "vt-adsense-script";
      s.async = true;
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);
    }
    watchAdStatus(el.querySelector("ins.adsbygoogle"), slotId);
    try {
      (global.adsbygoogle = global.adsbygoogle || []).push({});
    } catch {
      /* ignore */
    }
  }

  /**
   * The slot as it would look, without being one.
   *
   * `mode: "preview"` answers the question you cannot otherwise answer without
   * an approved AdSense account and real ad requests from the live site: what
   * do these slots do to the page? It renders the native card from whatever is
   * configured — including a card with no partner link yet, which is the
   * legitimate use of the fallback `pickNativeCard` no longer has — with an
   * inert call to action and a chip saying it is a preview, and under it a
   * stand-in the exact minimum height of an AdSense unit so the layout shift is
   * visible. No third-party script is loaded, no network request is made, no
   * account is needed, and nothing is tracked, because none of it is an
   * impression.
   * @param {Element} el Slot element.
   * @param {string} slotId Slot name.
   * @returns {void}
   */
  function renderPreview(el, slotId) {
    const es = isEs();
    const c = cfg();
    const card = pickNativeCard(slotId, { allowUnusable: true });
    const label = (es ? c.labelEs : c.labelEn) || "";
    const disc = (es ? c.disclosureEs : c.disclosureEn) || "";
    const chip = es ? "Vista previa" : "Preview";
    const unitNote = es
      ? "Aquí iría un bloque de AdSense (90 px mínimo)"
      : "An AdSense block would sit here (90 px minimum)";

    el.hidden = false;
    el.classList.add("ad-slot", "ad-slot--preview");
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", `${chip}: ${label}`);
    el.innerHTML = `
      <div class="ad-native-card ad-preview-card">
        <span class="ad-preview-chip">${escapeHtml(chip)}</span>
        <span class="ad-native-label">${escapeHtml(label)}</span>
        ${previewCardHtml(card, es)}
        <p class="ad-native-disc muted">${escapeHtml(disc)}</p>
      </div>
      <div class="ad-preview-unit" aria-hidden="true">${escapeHtml(unitNote)}</div>
    `;
  }

  /**
   * A card's own text in the page's language, else in the other one.
   * @param {Object} card Native card.
   * @param {"title"|"body"|"cta"} field Field name without its language.
   * @param {boolean} es Spanish page.
   * @returns {string|undefined} Text.
   */
  function cardText(card, field, es) {
    return card[field + (es ? "Es" : "En")] || card[field + (es ? "En" : "Es")];
  }

  /**
   * The preview's card: its words and an inert call to action that says when
   * it has no destination yet, or a line saying no card names this slot.
   * @param {Object|null} card Native card, unusable ones included.
   * @param {boolean} es Spanish page.
   * @returns {string} HTML.
   */
  function previewCardHtml(card, es) {
    if (!card) {
      return `<p class="ad-native-body">${escapeHtml(
        es ? "Ninguna tarjeta nombra este espacio." : "No card names this slot."
      )}</p>`;
    }
    const inert = es ? "sin destino todavía" : "no destination yet";
    const cta = cardText(card, "cta", es);
    const hasHref = card.action === "open-pricing" || !!String(card.href || "").trim();
    return `<strong class="ad-native-title">${escapeHtml(cardText(card, "title", es) || "")}</strong>
             <p class="ad-native-body">${escapeHtml(cardText(card, "body", es) || "")}</p>
             <div class="ad-native-actions">
               <button type="button" class="btn btn-sm btn-ghost" disabled data-ad-preview-cta="1">
                 ${escapeHtml(cta || (es ? "Más" : "More"))}${hasHref ? "" : ` (${escapeHtml(inert)})`}
               </button>
             </div>`;
  }

  function refreshAllSafe() {
    if (!shouldShowAds()) {
      clearSlot(document.getElementById("ad-slot-home"));
      clearSlot(document.getElementById("ad-slot-history"));
      clearSlot(document.getElementById("ad-slot-post-session"));
      return;
    }
    // Only refresh home when home view active
    const home = document.getElementById("view-home");
    if (home && home.classList.contains("active")) {
      renderSlot("home");
    }
  }

  function onPostSession() {
    return renderSlot("post-session");
  }

  global.VTAds = {
    cfg,
    shouldShowAds,
    renderSlot,
    refreshAllSafe,
    onPostSession,
    isPracticeActive,
    clearSlot
  };
})(window);
