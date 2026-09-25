/**
 * Where the visitor is, and whether their law wants to be asked before we keep
 * anything for statistics.
 *
 * The rule the owner set on 2026-09-24: the site is not built for the EU, and
 * nothing the EU requires may cost a visitor anywhere else anything. So:
 *
 * - A browser that does not look European gets a verdict synchronously, at the
 *   first line of this file. No banner, no extra request, no waiting, nothing
 *   held back. A visitor in Lima sees exactly the site as it was.
 * - A browser that does look European (its time zone is one of the EEA / UK
 *   zones below, or one of its languages carries an EEA / UK region) is
 *   "pending": statistics are held in memory, not sent and not stored, while
 *   the worker is asked what country the request actually came from
 *   (GET /v1/geo, answered from Cloudflare's own edge signal). The worker is
 *   the authority; the guesses here only decide whether it is worth asking.
 * - If the worker says a country outside that list, the hold is lifted and the
 *   visitor never sees a banner.
 * - If it says a country inside it, or cannot be reached, the visitor is asked.
 *   Failing closed is the whole point: asking afterwards is not asking first.
 *
 * Why the EEA and the UK together: ePrivacy art. 5(3) as read by EDPB
 * Guidelines 2/2023 wants consent *before* anything non-essential is stored on
 * the device, and the UK keeps the same rule in PECR reg. 6 after leaving the
 * EU. The list is the set of places that require being asked first, not a
 * political one — docs/38-AB-TESTING.md says so in more detail.
 *
 * What is NOT gated: everything the visitor came for. Practice history,
 * streaks, recordings and the local event log js/analytics.js keeps stay
 * exactly as they are, in this browser, because they are what the visitor
 * asked the site to do (art. 5(3), second limb: storage strictly necessary for
 * the service explicitly requested). What is gated is sending anything to our
 * worker and the A/B id, which serve us, not them.
 *
 * This file carries its own Spanish and English strings and its own styles, the
 * way js/privacy-switch.js does: guide.html loads neither js/i18n.js nor the
 * app, and a consent bar has to work on every page that can send an event.
 */
(function (global) {
  "use strict";

  /**
   * The visitor's answer, the only thing this file ever stores:
   * `{"v":1,"a":"y"|"n","t":<epoch seconds>}`. Nothing else goes in it — no id,
   * no country — and it is never sent anywhere, which is what keeps it inside
   * the exemption for storage that only records the choice about storage
   * (CNIL's published exempt list; PECR Schedule A1 para 4).
   */
  const CHOICE_KEY = "vt_eu_consent_v1";

  /**
   * How long an answer holds, either way. Six months is CNIL's published good
   * practice and the only figure any regulator has put in writing; a refusal is
   * kept exactly as long as a consent, because remembering the no is what stops
   * the bar coming back on the next visit.
   */
  const CHOICE_TTL_SECONDS = 183 * 86400;

  /** How long to wait for the worker before assuming the stricter answer. */
  const ASK_TIMEOUT_MS = 2500;

  /**
   * IANA zones of the places that require consent first: the EEA (EU 27 plus
   * Iceland, Liechtenstein and Norway), the EU's outermost regions, and the
   * Crown dependencies and Gibraltar, which keep PECR-shaped rules of their
   * own. Link names ICU does not canonicalize are listed too (Eire, Poland,
   * Portugal, Iceland, Atlantic/Jan_Mayen), because a browser may report any of
   * them.
   *
   * The United Kingdom is deliberately absent. Its DUAA amendment to PECR
   * Schedule A1, in force 5 February 2026, exempts first-party statistics from
   * consent where the visitor is told clearly and has a simple free way to
   * object — which privacy.html and the guide's switch are. docs/38-AB-TESTING.md
   * records the one risk in that reading and says it is a one-line change.
   */
  const ASK_FIRST_ZONES = new Set([
    "Africa/Ceuta",
    "America/Cayenne",
    "America/Guadeloupe",
    "America/Marigot",
    "America/Martinique",
    "Arctic/Longyearbyen",
    "Asia/Famagusta",
    "Asia/Nicosia",
    "Atlantic/Azores",
    "Atlantic/Canary",
    "Atlantic/Jan_Mayen",
    "Atlantic/Madeira",
    "Atlantic/Reykjavik",
    "Eire",
    "Europe/Amsterdam",
    "Europe/Athens",
    "Europe/Berlin",
    "Europe/Bratislava",
    "Europe/Brussels",
    "Europe/Bucharest",
    "Europe/Budapest",
    "Europe/Busingen",
    "Europe/Copenhagen",
    "Europe/Dublin",
    "Europe/Gibraltar",
    "Europe/Guernsey",
    "Europe/Helsinki",
    "Europe/Isle_of_Man",
    "Europe/Jersey",
    "Europe/Lisbon",
    "Europe/Ljubljana",
    "Europe/Luxembourg",
    "Europe/Madrid",
    "Europe/Malta",
    "Europe/Mariehamn",
    "Europe/Nicosia",
    "Europe/Oslo",
    "Europe/Paris",
    "Europe/Prague",
    "Europe/Riga",
    "Europe/Rome",
    "Europe/Sofia",
    "Europe/Stockholm",
    "Europe/Tallinn",
    "Europe/Vaduz",
    "Europe/Vienna",
    "Europe/Vilnius",
    "Europe/Warsaw",
    "Europe/Zagreb",
    "Iceland",
    "Indian/Mayotte",
    "Indian/Reunion",
    "Poland",
    "Portugal"
  ]);

  /**
   * European zones that are provably NOT in that list, so a browser reporting
   * one is settled without asking anybody. Both spellings of every rename are
   * here, because ICU canonicalizes some of them in one direction and browsers
   * with newer CLDR data report the other.
   */
  const CLEAR_EUROPEAN_ZONES = new Set([
    "America/Godthab",
    "America/Nuuk",
    "Asia/Istanbul",
    "Atlantic/Faeroe",
    "Atlantic/Faroe",
    "Europe/Andorra",
    "Europe/Astrakhan",
    "Europe/Belfast",
    "Europe/Belgrade",
    "Europe/Chisinau",
    "Europe/Istanbul",
    "Europe/Kaliningrad",
    "Europe/Kiev",
    "Europe/Kirov",
    "Europe/Kyiv",
    "Europe/London",
    "Europe/Minsk",
    "Europe/Monaco",
    "Europe/Moscow",
    "Europe/Podgorica",
    "Europe/Samara",
    "Europe/San_Marino",
    "Europe/Sarajevo",
    "Europe/Saratov",
    "Europe/Simferopol",
    "Europe/Skopje",
    "Europe/Tirane",
    "Europe/Tiraspol",
    "Europe/Ulyanovsk",
    "Europe/Uzhgorod",
    "Europe/Vatican",
    "Europe/Volgograd",
    "Europe/Zaporozhye",
    "Europe/Zurich",
    "GB",
    "GB-Eire",
    "Turkey"
  ]);

  /**
   * Zones that say nothing about where the browser is. A hardened browser
   * (Firefox with resistFingerprinting, Tor) reports UTC on purpose, and so
   * does a machine with no time zone set, so these must mean "ask the worker"
   * rather than "not in Europe" — otherwise the visitors most likely to care
   * are the ones never asked.
   */
  const NO_ZONE_SIGNAL = new Set([
    "+00:00",
    "Etc/GMT",
    "Etc/GMT+0",
    "Etc/GMT-0",
    "Etc/GMT0",
    "Etc/UCT",
    "Etc/Universal",
    "Etc/UTC",
    "Etc/Unknown",
    "Etc/Zulu",
    "GMT",
    "GMT+0",
    "GMT-0",
    "GMT0",
    "Greenwich",
    "UCT",
    "UTC",
    "Universal",
    "Z",
    "Zulu"
  ]);

  /** Old European abbreviations that name an offset, not a country. */
  const AMBIGUOUS_ZONES = new Set(["CET", "EET", "MET", "WET"]);

  /**
   * The same places as region subtags, for `navigator.languages`. Identical to
   * the worker's own ASK_FIRST_COUNTRIES, which is the list that decides;
   * tests/region-gate.spec.js asserts the two are equal in both directions.
   * Cloudflare reports the outermost regions under their own codes (GP, MQ, GF,
   * RE, YT, MF), not their member state's, so they need entries of their own.
   */
  const ASK_FIRST_REGIONS = new Set([
    "AT", "AX", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GF",
    "GG", "GI", "GP", "GR", "HR", "HU", "IE", "IM", "IS", "IT", "JE", "LI", "LT",
    "LU", "LV", "MF", "MQ", "MT", "NL", "NO", "PL", "PT", "RE", "RO", "SE", "SI",
    "SJ", "SK", "YT"
  ]);

  const T = {
    es: {
      title: "Estadísticas anónimas",
      body:
        "Donde estás, la ley pide permiso antes de que guardemos estadísticas de uso. " +
        "Practicar funciona igual si dices que no.",
      accept: "Aceptar",
      reject: "Rechazar",
      more: "Qué guardamos"
    },
    en: {
      title: "Anonymous statistics",
      body:
        "Where you are, the law asks for permission before we keep usage statistics. " +
        "Practising works the same if you say no.",
      accept: "Accept",
      reject: "Reject",
      more: "What we keep"
    }
  };

  /** "non_eu" | "eu" | "pending" — "pending" only ever for a European-looking browser. */
  let verdict = "pending";
  /** Two-letter country the worker reported, or null while nobody has asked. */
  let country = null;
  /** How `verdict` was reached, for the console and the tests. */
  let source = "guess";
  const listeners = [];
  let barShown = false;
  let styled = false;

  function timeZone() {
    try {
      return String(global.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || "");
    } catch {
      return "";
    }
  }

  function languageRegions() {
    const nav = global.navigator || {};
    const tags = [];
    if (Array.isArray(nav.languages)) tags.push(...nav.languages);
    if (nav.language) tags.push(nav.language);
    const out = [];
    tags.forEach((tag) => {
      const parts = String(tag || "").split("-");
      parts.slice(1).forEach((part) => {
        if (/^[A-Za-z]{2}$/.test(part)) out.push(part.toUpperCase());
      });
    });
    return out;
  }

  /**
   * An automated browser: headless Chrome, Playwright, a crawler. js/analytics.js
   * sends nothing from one and nobody is sitting at it, so there is nothing to
   * ask and nothing to protect. Settling it as out of scope keeps the site's own
   * suite on the ordinary path — which is the path worth testing — and stops
   * every spec making a request to a route it has no reason to call.
   * @returns {boolean} True when this is not a person's browser.
   */
  function automated() {
    if (global.navigator?.webdriver) return true;
    try {
      return sessionStorage.getItem("vt_e2e") === "1";
    } catch {
      return false;
    }
  }

  /**
   * What this browser's clock says about where it is.
   * @returns {"ask" | "unknown" | "clear"} Verdict from the time zone alone.
   */
  function zoneVerdict() {
    const tz = timeZone();
    if (!tz || NO_ZONE_SIGNAL.has(tz) || AMBIGUOUS_ZONES.has(tz)) return "unknown";
    if (ASK_FIRST_ZONES.has(tz)) return "ask";
    if (CLEAR_EUROPEAN_ZONES.has(tz)) return "clear";
    // A European zone this file has never heard of: a rename, or a new id. The
    // worker knows; guessing "not Europe" here is the one wrong answer.
    if (tz.indexOf("Europe/") === 0) return "unknown";
    return "clear";
  }

  /**
   * Is it worth asking the worker where this browser is? Deliberately generous:
   * a false yes costs one small request and a second of held statistics, a
   * false no costs asking somebody after the fact, which is not asking.
   * @returns {boolean} True when the browser might be somewhere that asks first.
   */
  function looksEuropean() {
    if (zoneVerdict() !== "clear") return true;
    return languageRegions().some((r) => ASK_FIRST_REGIONS.has(r));
  }

  function storedChoice() {
    try {
      const raw = localStorage.getItem(CHOICE_KEY);
      if (!raw) return null;
      const bag = JSON.parse(raw);
      const answer = bag && bag.a;
      if (answer !== "y" && answer !== "n") return null;
      const at = Number(bag.t);
      if (!Number.isFinite(at) || at <= 0) return null;
      if (Math.floor(Date.now() / 1000) - at > CHOICE_TTL_SECONDS) return null;
      return answer === "y" ? "granted" : "denied";
    } catch {
      return null;
    }
  }

  /** @returns {"granted" | "denied" | null} What the visitor answered. */
  function consent() {
    return storedChoice();
  }

  /**
   * Why statistics may not leave this browser yet, as far as the region is
   * concerned. "" means the region has nothing to say — which is the answer
   * everywhere outside the list above, and inside it once somebody says yes.
   *
   * The two "still outstanding" answers are separate from the refusal on
   * purpose: something raised while the question is open is kept, and sent if
   * the answer turns out to be yes, whereas a refusal throws it away. Without
   * `eu_unanswered` everything raised while the bar was on screen was dropped,
   * so a visitor who read it before agreeing arrived at the worker already
   * missing the visit that brought them there.
   * @returns {"" | "eu_pending" | "eu_unanswered" | "eu_refused"} Reason.
   */
  function blockedReason() {
    const choice = consent();
    // A no is a no wherever they go next: somebody who refused in Madrid and
    // then opens the site on a trip does not get counted because their time
    // zone changed.
    if (choice === "denied") return "eu_refused";
    if (verdict === "non_eu") return "";
    if (choice === "granted") return "";
    if (verdict === "pending") return "eu_pending";
    return "eu_unanswered";
  }

  /**
   * Whether the A/B machinery must do nothing at all: no id minted, no arm
   * stored, no exposure recorded. Serving `variants[0]` is the way to be inert;
   * an empty id would put every European visitor in one arm and quietly poison
   * the result.
   * @returns {boolean} True when experiments must stay inert.
   */
  function inert() {
    return blockedReason() !== "";
  }

  function notify() {
    listeners.slice().forEach((fn) => {
      try {
        fn({ verdict, country, consent: consent(), reason: blockedReason() });
      } catch {
        /* a listener must never break the page */
      }
    });
  }

  /** @param {(state: Object) => void} fn Called whenever the verdict or the answer changes. */
  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

  /**
   * The worker to ask. An explicit `VT_ANALYTICS_ENDPOINT` wins, because that is
   * what a test or a split deployment sets and it is where the events would go
   * anyway; otherwise the worker URL js/billing-config.js already holds, so the
   * address lives in one place. On index.html this file loads before
   * js/experiments-config.js derives the first from the second, which is why
   * both are read rather than one.
   * @returns {string} Origin with no trailing slash, or "".
   */
  function apiBase() {
    let base = String(global.VT_ANALYTICS_ENDPOINT || "").trim().replace(/\/v1\/events\/?$/, "");
    if (!base) {
      const cfg = global.VT_BILLING_CONFIG;
      base = String((cfg && cfg.verification && cfg.verification.apiBaseUrl) || "").trim();
    }
    base = base.replace(/\/+$/, "");
    return /^https:\/\//.test(base) ? base : "";
  }

  /**
   * Settle the verdict and tell everybody who is waiting.
   * @param {"eu" | "non_eu"} next The verdict.
   * @param {string|null} cc Two-letter country, when the worker gave one.
   * @param {string} how Where the answer came from.
   */
  function settle(next, cc, how) {
    if (verdict === next && country === (cc || null)) return;
    verdict = next;
    country = cc || null;
    source = how;
    notify();
    maybeShowBar();
  }

  async function askWorker() {
    const base = apiBase();
    // Nothing to ask, and nowhere for an event to go either: keep the stricter
    // verdict so the A/B id is not minted, and let maybeShowBar() decide that a
    // banner asking about statistics nobody sends would be noise.
    if (!base) {
      settle("eu", null, "no_endpoint");
      return;
    }
    let timer = null;
    try {
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      if (ctl) timer = setTimeout(() => ctl.abort(), ASK_TIMEOUT_MS);
      const res = await fetch(`${base}/v1/geo`, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        signal: ctl ? ctl.signal : undefined
      });
      // A worker that has not been redeployed yet has no such route. That is a
      // fact about the deployment, not a privacy signal, so fall back to what
      // the clock says rather than putting a bar in front of everybody whose
      // only European signal was a language or a blank time zone.
      if (res.status === 404) {
        settle(zoneVerdict() === "ask" ? "eu" : "non_eu", null, "route_missing");
        return;
      }
      const data = res.ok ? await res.json() : null;
      const cc = typeof data?.country === "string" ? data.country.toUpperCase() : "";
      const placed = data ? data.placed === true || /^[A-Z]{2}$/.test(cc) : false;
      // Tor and an address the edge cannot map answer "no country", which is not
      // the same as "not in Europe": keep the stricter verdict for those.
      if (!placed) {
        settle("eu", null, "worker_silent");
        return;
      }
      if (typeof data.askFirst === "boolean") {
        settle(data.askFirst ? "eu" : "non_eu", cc || null, "worker");
        return;
      }
      settle(ASK_FIRST_REGIONS.has(cc) ? "eu" : "non_eu", cc, "worker");
    } catch {
      settle("eu", null, "unreachable");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Record the answer. Saying yes replays what was held; saying no throws it
   * away. Either way the answer itself is stored, because honouring it on the
   * next visit is the one thing that does need to be remembered.
   * @param {boolean} granted Whether the visitor accepted.
   */
  function setConsent(granted) {
    try {
      localStorage.setItem(
        CHOICE_KEY,
        JSON.stringify({ v: 1, a: granted ? "y" : "n", t: Math.floor(Date.now() / 1000) })
      );
    } catch {
      /* private mode: the answer holds for this page only */
    }
    hideBar();
    notify();
  }

  /** Forget the answer, so the bar comes back. For the console and the tests. */
  function resetConsent() {
    try {
      localStorage.removeItem(CHOICE_KEY);
    } catch {
      /* ignore */
    }
    notify();
    maybeShowBar();
  }

  function lang() {
    const l = String(global.VTI18n?.lang || global.document?.documentElement?.lang || "es");
    return l.toLowerCase().startsWith("en") ? "en" : "es";
  }

  function injectStyles() {
    if (styled || !global.document) return;
    styled = true;
    const css = `
.region-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;
  background:var(--bg-elevated,#161e2a);color:var(--text,#f5f8fd);
  border-top:1px solid var(--border,#3d4f68);box-shadow:0 -8px 30px rgba(0,0,0,.35);
  padding:0.7rem calc(0.9rem + var(--safe-right,0px)) calc(0.7rem + var(--safe-bottom,0px)) calc(0.9rem + var(--safe-left,0px));
  font-family:var(--font,system-ui,sans-serif);font-size:0.9rem;line-height:1.35}
.region-consent-inner{max-width:var(--max,1100px);margin:0 auto;display:flex;flex-wrap:wrap;
  gap:0.6rem 1rem;align-items:center;justify-content:space-between}
.region-consent p{margin:0;flex:1 1 20rem;min-width:0}
.region-consent strong{display:block;font-size:0.95rem}
.region-consent span{color:var(--text-muted,#c5d2e4)}
.region-consent-actions{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center}
.region-consent button{font:inherit;cursor:pointer;min-height:var(--min-tap,44px);
  padding:0.45rem 1.1rem;border-radius:var(--radius-sm,10px);
  border:1px solid var(--border,#3d4f68);background:var(--bg-soft,#243041);color:inherit}
.region-consent button:hover{border-color:var(--accent,#6eb4e8)}
.region-consent a{color:var(--accent,#6eb4e8);text-decoration:underline}
@media (max-width:480px){.region-consent-inner{justify-content:stretch}
  .region-consent-actions{width:100%}
  .region-consent button{flex:1 1 8rem}}`;
    const el = global.document.createElement("style");
    el.setAttribute("data-region-consent-style", "1");
    el.textContent = css;
    global.document.head?.appendChild(el);
  }

  function renderBar() {
    const doc = global.document;
    const bar = doc?.querySelector("[data-region-consent]");
    if (!bar) return;
    const t = T[lang()];
    bar.setAttribute("lang", lang());
    const text = bar.querySelector("[data-region-consent-text]");
    if (text) text.innerHTML = "";
    if (text) {
      const strong = doc.createElement("strong");
      strong.textContent = t.title;
      const span = doc.createElement("span");
      span.textContent = t.body;
      text.append(strong, span);
    }
    const yes = bar.querySelector("[data-region-accept]");
    const no = bar.querySelector("[data-region-reject]");
    const more = bar.querySelector("[data-region-more]");
    if (yes) yes.textContent = t.accept;
    if (no) no.textContent = t.reject;
    if (more) more.textContent = t.more;
  }

  function hideBar() {
    const bar = global.document?.querySelector("[data-region-consent]");
    if (bar) bar.remove();
    barShown = false;
  }

  /**
   * Show the bar only when there is a real question to ask: a country that
   * requires asking, no answer yet, something that would actually be sent, and
   * no browser-level refusal already on the record — Global Privacy Control is
   * a no, and asking again after a no is what the law calls a dark pattern.
   */
  function maybeShowBar() {
    const doc = global.document;
    if (!doc || barShown) return;
    if (verdict !== "eu" || consent()) return;
    if (global.navigator?.globalPrivacyControl === true) return;
    const state = global.VTAnalytics?.remoteState?.();
    // Nothing is sent from an automated browser or a deployment with no worker,
    // so there is nothing to consent to and the bar would be pure noise.
    const mine = ["eu_pending", "eu_unanswered", "eu_refused"];
    if (state && state.reason && !mine.includes(state.reason)) return;
    if (!doc.body) {
      doc.addEventListener("DOMContentLoaded", maybeShowBar, { once: true });
      return;
    }
    injectStyles();
    const bar = doc.createElement("div");
    bar.className = "region-consent";
    bar.setAttribute("data-region-consent", "1");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", T[lang()].title);
    bar.innerHTML =
      '<div class="region-consent-inner">' +
      '<p data-region-consent-text></p>' +
      '<div class="region-consent-actions">' +
      '<button type="button" data-region-accept></button>' +
      '<button type="button" data-region-reject></button>' +
      '<a href="privacy.html" data-region-more></a>' +
      "</div></div>";
    doc.body.appendChild(bar);
    barShown = true;
    renderBar();
    bar.querySelector("[data-region-accept]")?.addEventListener("click", () => setConsent(true));
    bar.querySelector("[data-region-reject]")?.addEventListener("click", () => setConsent(false));
    // The app switches language under the bar's feet; i18n writes <html lang>.
    try {
      const obs = new MutationObserver(() => renderBar());
      obs.observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
    } catch {
      /* no MutationObserver: the bar keeps the language it opened in */
    }
  }

  /** Everything this file decided, for whoever is sitting at the browser. */
  function report() {
    return {
      verdict,
      country,
      source,
      timeZone: timeZone(),
      zoneVerdict: zoneVerdict(),
      languageRegions: languageRegions(),
      consent: consent(),
      reason: blockedReason(),
      inert: inert()
    };
  }

  global.VTRegion = {
    verdict: () => verdict,
    country: () => country,
    consent,
    setConsent,
    resetConsent,
    blockedReason,
    inert,
    onChange,
    report,
    looksEuropean,
    zoneVerdict,
    // Exposed so a test can hold this list to the worker's own
    // (events.js ASK_FIRST_COUNTRIES), which is the one that decides.
    regions: () => [...ASK_FIRST_REGIONS].sort()
  };

  // The synchronous half, and the whole of it for most of the world.
  if (automated()) {
    verdict = "non_eu";
    source = "automated";
  } else if (!looksEuropean()) {
    verdict = "non_eu";
    source = "guess";
  } else if (consent()) {
    // Already answered: no request, no bar, and blockedReason() follows the
    // answer. Still worth knowing the country for the console, but not urgent.
    verdict = "eu";
    source = "stored_choice";
  } else {
    askWorker();
    if (global.document) maybeShowBar();
  }
})(window);
