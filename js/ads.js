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

  function pickNativeCard(slotId) {
    const cards = (cfg().nativeCards || []).filter((card) => {
      const slots = card.slots || [];
      return slots.includes(slotId);
    });
    if (!cards.length) return null;
    // Prefer cards with href or open-pricing action
    const usable = cards.filter(
      (c) => c.action === "open-pricing" || String(c.href || "").trim()
    );
    const pool = usable.length ? usable : cards;
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
    el.classList.remove("ad-slot--native", "ad-slot--adsense");
  }

  /**
   * @param {"home"|"history"|"post-session"} slotId
   */
  function renderSlot(slotId) {
    const map = {
      home: "ad-slot-home",
      history: "ad-slot-history",
      "post-session": "ad-slot-post-session"
    };
    const el = document.getElementById(map[slotId] || "");
    if (!el) return { ok: false, reason: "no_element" };

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

    const c = cfg();
    const freq = c.frequency || {};
    if (slotId === "home") {
      if (!throttleOk(LAST_HOME_KEY, Number(freq.homeMinIntervalMs || 60000))) {
        return { ok: false, reason: "throttled" };
      }
    }
    if (slotId === "post-session") {
      if (!throttleOk(LAST_POST_KEY, Number(freq.postSessionMinIntervalMs || 120000))) {
        return { ok: false, reason: "throttled" };
      }
    }

    const mode = c.mode || "native";
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

    clearSlot(el);
    return { ok: false, reason: "no_fill" };
  }

  function renderAdSensePlaceholder(el, client, slot, slotId) {
    el.hidden = false;
    el.classList.add("ad-slot", "ad-slot--adsense");
    el.setAttribute("aria-label", "Advertisement");
    el.innerHTML = `
      <ins class="adsbygoogle"
        style="display:block"
        data-ad-client="${escapeHtml(client)}"
        data-ad-slot="${escapeHtml(slot)}"
        data-ad-format="auto"
        data-full-width-responsive="true"></ins>
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
    try {
      (global.adsbygoogle = global.adsbygoogle || []).push({});
    } catch {
      /* ignore */
    }
    track("ad_impression", { slot: slotId, mode: "adsense" });
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
