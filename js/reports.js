/**
 * Telling us something is broken, or missing.
 *
 * The site is static and has no inbox, so until this existed the only way to
 * report a bug was to open a GitHub issue — which nobody practising their voice
 * on a phone is going to do. This is a small dialog any page can open, posting
 * to the worker's `/v1/reports` (see workers/entitlements/src/reports.js).
 *
 * Three rules shaped it:
 *
 * 1. **A report is never lost.** If the worker is not configured, is switched
 *    off, is busy or cannot be reached, the dialog turns into the same report
 *    as plain text with a copy button and the issues link. What somebody typed
 *    does not disappear because our server had a bad day, and a draft is kept
 *    for the length of the browser session so closing the dialog by accident
 *    costs nothing either.
 * 2. **The reporter can see what we attach.** The browser line, the screen
 *    size and the page are the fields that make a bug report actionable, and
 *    they are listed in the dialog, under a disclosure, before anything is
 *    sent. privacy.html says the same thing in the same words.
 * 3. **It carries its own translations.** The dialog opens on pages that do
 *    not load js/i18n.js (the terms and privacy pages do not), so its strings
 *    live here, in the same shape js/admin.js uses, and it reads `vt_lang` for
 *    which language to draw.
 *
 * This module sends no statistics. The worker's event route takes a closed set
 * of event names and refuses anything else, so a new name here would need a
 * worker deploy to count for anything; the admin window's own counts are where
 * "how many reports this week" is answered.
 */
(function (global) {
  "use strict";

  /** Where an abandoned draft waits, for this browser session only. */
  const DRAFT_KEY = "vt_report_draft_v1";

  /** Longest values the worker will keep; the form stops typing at the same point. */
  const LIMITS = { summary: 140, detail: 4000, steps: 1000, contact: 254 };

  /** Where somebody goes when our own route cannot take the report. */
  const ISSUES_URL = "https://github.com/PillB/vocal-singing-training/issues/new";

  /** Areas offered, in the order they are drawn. Must match REPORT_AREAS in the worker. */
  const AREAS = ["practice", "audio", "exercises", "progress", "account", "payment", "site", "other"];

  const STR = {
    es: {
      open: "Reportar un problema",
      title: "Cuéntanos qué pasó",
      lede: "Lo leemos nosotros dos. No hace falta tener cuenta.",
      kindLegend: "¿Qué nos cuentas?",
      kindBug: "Algo no funciona",
      kindIdea: "Una idea para mejorar",
      areaLabel: "¿En qué parte?",
      areaPractice: "Practicar / grabar",
      areaAudio: "Micrófono o sonido",
      areaExercises: "Ejercicios y guías",
      areaProgress: "Mi progreso e historial",
      areaAccount: "Entrar y mi cuenta",
      areaPayment: "Pagos y Pro",
      areaSite: "La página en general",
      areaOther: "Otra cosa",
      severityLegend: "¿Qué tan grave?",
      sevBlocks: "No puedo seguir",
      sevAnnoying: "Molesta pero sigo",
      sevCosmetic: "Se ve raro",
      summaryLabel: "En una línea",
      summaryHintBug: "Ej.: el botón Empezar no hace nada en mi iPhone",
      summaryHintIdea: "Ej.: me gustaría poder repetir solo el último ejercicio",
      detailLabel: "Cuéntanos más",
      detailHintBug: "Qué esperabas, qué pasó en su lugar, y si pasa siempre.",
      detailHintIdea: "Qué te gustaría poder hacer, y para qué te serviría.",
      stepsLabel: "Cómo verlo (opcional)",
      stepsHint: "1. abrir el estudio · 2. tocar Empezar · 3. nada pasa",
      contactLabel: "Tu correo (opcional, para responderte)",
      contactHint: "Si lo dejas vacío igual recibimos el reporte; solo no podremos escribirte.",
      envSummary: "Qué adjuntamos automáticamente",
      envLede:
        "Esto va con el reporte para poder reproducir el problema. No adjuntamos tu nombre, tu grabación ni tu progreso.",
      envPage: "La página en la que estás",
      envBuild: "La versión del sitio",
      envBrowser: "Tu navegador y sistema (la línea que tu navegador envía a cualquier web, y la plataforma que declara)",
      envScreen: "El tamaño de tu pantalla y ventana, y su densidad de píxeles",
      envClock: "Tu zona horaria (solo la diferencia con UTC) y si tenías conexión",
      envLang: "El idioma en el que ves el sitio",
      envAccount: "Si estás con sesión iniciada, tu cuenta (para poder responderte)",
      send: "Enviar",
      sending: "Enviando…",
      cancel: "Cancelar",
      close: "Cerrar",
      needWords: "Escribe al menos una línea de qué pasó.",
      thanksTitle: "Gracias, lo tenemos",
      thanksBody: "Guardamos tu reporte. Si quieres preguntarnos por él, este es su número:",
      copyRef: "Copiar el número",
      copied: "Copiado.",
      copyFailed: "No se pudo copiar. Selecciónalo y cópialo a mano.",
      another: "Reportar otra cosa",
      mineTitle: "Lo que ya nos contaste",
      mineLoad: "Ver mis reportes",
      mineEmpty: "Todavía no nos has contado nada con esta cuenta.",
      mineNeedsAccount: "Entra en tu cuenta para ver los reportes que enviaste.",
      stNew: "Sin leer",
      stTriaged: "Lo estamos viendo",
      stFixed: "Arreglado",
      stWontfix: "No lo vamos a hacer",
      stDuplicate: "Ya estaba reportado",
      failTitle: "No pudimos guardarlo desde aquí",
      failUnconfigured: "Este sitio todavía no tiene servidor donde guardar reportes.",
      failDisabled: "Los reportes están apagados en el servidor ahora mismo.",
      failOffline: "No se pudo contactar al servidor. Revisa tu conexión.",
      failNoTransport: "Esta página no puede enviar reportes. Cópialo y pégalo en GitHub, o envíalo desde la app.",
      failBusy: "Hoy ya recibimos muchos reportes. Inténtalo mañana o pégalo en GitHub.",
      failRateLimited: "Enviaste varios reportes seguidos. Espera un rato e inténtalo otra vez.",
      failGeneric: "Algo falló al enviarlo ({reason}).",
      failLede: "Para que no pierdas lo que escribiste, aquí está tu reporte listo para copiar:",
      failPublic:
        "Ojo: lo que pegues en GitHub lo ve cualquiera. Por eso tu correo no va en este texto; no lo añadas ahí.",
      copyReport: "Copiar el reporte",
      openIssues: "Abrir una incidencia pública en GitHub",
      retry: "Intentar enviarlo otra vez",
      labelKind: "Tipo",
      labelArea: "Parte",
      labelSeverity: "Gravedad",
      labelWhat: "Qué pasa",
      labelSteps: "Cómo verlo",
      labelPage: "Página",
      labelBuild: "Versión",
      labelBrowser: "Navegador",
      labelScreen: "Pantalla",
      labelContact: "Contacto"
    },
    en: {
      open: "Report a problem",
      title: "Tell us what happened",
      lede: "The two of us read these. You do not need an account.",
      kindLegend: "What are you telling us?",
      kindBug: "Something is broken",
      kindIdea: "An idea to make it better",
      areaLabel: "Which part?",
      areaPractice: "Practising / recording",
      areaAudio: "Microphone or sound",
      areaExercises: "Exercises and guides",
      areaProgress: "My progress and history",
      areaAccount: "Signing in and my account",
      areaPayment: "Payments and Pro",
      areaSite: "The site in general",
      areaOther: "Something else",
      severityLegend: "How bad is it?",
      sevBlocks: "I cannot carry on",
      sevAnnoying: "Annoying but I can work around it",
      sevCosmetic: "It looks wrong",
      summaryLabel: "In one line",
      summaryHintBug: "e.g. the Start button does nothing on my iPhone",
      summaryHintIdea: "e.g. I would like to repeat just the last exercise",
      detailLabel: "Tell us more",
      detailHintBug: "What you expected, what happened instead, and whether it always happens.",
      detailHintIdea: "What you would like to be able to do, and what it would help with.",
      stepsLabel: "How to see it (optional)",
      stepsHint: "1. open the studio · 2. tap Start · 3. nothing happens",
      contactLabel: "Your email (optional, so we can reply)",
      contactHint: "Leave it empty and we still get the report; we just cannot write back.",
      envSummary: "What we attach automatically",
      envLede:
        "This goes with the report so we can reproduce the problem. We do not attach your name, your recordings or your progress.",
      envPage: "The page you are on",
      envBuild: "The version of the site",
      envBrowser: "Your browser and system (the line your browser sends to any website, and the platform it declares)",
      envScreen: "Your screen and window size, and their pixel density",
      envClock: "Your time zone (only its offset from UTC) and whether you were online",
      envLang: "The language you are reading the site in",
      envAccount: "If you are signed in, your account (so we can reply)",
      send: "Send",
      sending: "Sending…",
      cancel: "Cancel",
      close: "Close",
      needWords: "Write at least one line about what happened.",
      thanksTitle: "Thank you, we have it",
      thanksBody: "Your report is saved. If you want to ask us about it, this is its number:",
      copyRef: "Copy the number",
      copied: "Copied.",
      copyFailed: "Could not copy. Select it and copy it by hand.",
      another: "Report something else",
      mineTitle: "What you have told us",
      mineLoad: "See my reports",
      mineEmpty: "You have not told us anything from this account yet.",
      mineNeedsAccount: "Sign in to see the reports you sent.",
      stNew: "Unread",
      stTriaged: "We are looking at it",
      stFixed: "Fixed",
      stWontfix: "We are not going to do this",
      stDuplicate: "Already reported",
      failTitle: "We could not save it from here",
      failUnconfigured: "This site has no server to keep reports in yet.",
      failDisabled: "Reports are switched off on the server right now.",
      failOffline: "Could not reach the server. Check your connection.",
      failNoTransport: "This page cannot send reports. Copy it and paste it on GitHub, or send it from the app.",
      failBusy: "We have had a lot of reports today. Try tomorrow, or paste it on GitHub.",
      failRateLimited: "You sent several reports in a row. Wait a while and try again.",
      failGeneric: "Something went wrong sending it ({reason}).",
      failLede: "So you do not lose what you wrote, here is your report ready to copy:",
      failPublic:
        "Note: anything you paste on GitHub is public. That is why your email is not in this text; do not add it there.",
      copyReport: "Copy the report",
      openIssues: "Open a public issue on GitHub",
      retry: "Try sending it again",
      labelKind: "Kind",
      labelArea: "Area",
      labelSeverity: "Severity",
      labelWhat: "What happens",
      labelSteps: "How to see it",
      labelPage: "Page",
      labelBuild: "Version",
      labelBrowser: "Browser",
      labelScreen: "Screen",
      labelContact: "Contact"
    }
  };

  /**
   * The language of the part of the page whose button opened the dialog, when
   * that part declares one (the guide's English half is a `<section lang="en">`
   * inside a Spanish page). Without it, the guide's "Report a problem" opened a
   * Spanish dialog.
   */
  let partLang = null;

  /** Which language to draw in, read fresh so a switch in the app is honoured. */
  function lang() {
    if (partLang) return partLang;
    try {
      if (global.VTI18n && (global.VTI18n.lang === "en" || global.VTI18n.lang === "es")) {
        return global.VTI18n.lang;
      }
      return localStorage.getItem("vt_lang") === "en" ? "en" : "es";
    } catch {
      return "es";
    }
  }

  /**
   * Translate a key, filling `{name}` placeholders.
   * @param {string} key String key.
   * @param {Object} [vars] Placeholder values.
   * @returns {string} Text.
   */
  function t(key, vars) {
    const table = STR[lang()] || STR.es;
    let text = table[key] !== undefined ? table[key] : STR.es[key] !== undefined ? STR.es[key] : key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
    }
    return text;
  }

  /**
   * Build an element with text and attributes, never HTML. Nothing a person
   * typed is ever put into this page as markup.
   * @param {string} tag Tag name.
   * @param {Object} [attrs] Attributes; `text` sets textContent, `className` the class.
   * @param {Array<Node|string>} [children] Children.
   * @returns {HTMLElement} Element.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === "text") node.textContent = String(value);
      else if (key === "className") node.className = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  /**
   * The build stamp of the running site, read from this file's own `?v=`.
   * It is the one version string the browser already has, and it is exactly
   * what we need to know which deploy a report came from.
   * @returns {string} Stamp, or "".
   */
  function buildStamp() {
    try {
      const own = document.currentScript || document.querySelector('script[src*="reports.js"]');
      const src = own && own.getAttribute("src");
      const match = src && /[?&]v=([^&]+)/.exec(src);
      return match ? decodeURIComponent(match[1]).slice(0, 40) : "";
    } catch {
      return "";
    }
  }

  /** The stamp is read once, at parse time, while `document.currentScript` is still us. */
  const BUILD = buildStamp();

  /**
   * What the page can tell us about the browser without asking it anything:
   * the facts that decide whether a bug reproduces. No identifiers are made up
   * here and nothing is read from storage.
   * @returns {Object} A small object of primitives.
   */
  function environment() {
    const out = {};
    try {
      out.ua = String(navigator.userAgent || "").slice(0, 120);
      out.viewport = `${Math.round(global.innerWidth || 0)}x${Math.round(global.innerHeight || 0)}`;
      if (global.screen) out.screen = `${global.screen.width || 0}x${global.screen.height || 0}`;
      out.dpr = Number(global.devicePixelRatio || 1);
      out.lang = lang();
      if (navigator.platform) out.platform = String(navigator.platform).slice(0, 40);
      out.tz = new Date().getTimezoneOffset();
      if (typeof navigator.onLine === "boolean") out.net = navigator.onLine ? "online" : "offline";
      const account = global.VTAccount && global.VTAccount.getState ? global.VTAccount.getState() : null;
      out.signedIn = !!(account && account.signedIn);
    } catch {
      /* a browser that refuses any of this still gets to report a bug */
    }
    return out;
  }

  /** The page a report came from: path and hash, never the query string. */
  function pageRef() {
    try {
      return `${location.pathname}${location.hash}`.slice(0, 200);
    } catch {
      return "";
    }
  }

  /** The draft, or null. */
  function readDraft() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeDraft(draft) {
    try {
      if (!draft) sessionStorage.removeItem(DRAFT_KEY);
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode: the draft simply is not kept */
    }
  }

  /** The dialog's nodes, built once on first open. */
  let ui = null;
  /** What opened the dialog, so focus goes back there. */
  let opener = null;

  /**
   * The styles the dialog needs that css/styles.css does not already have.
   * Injected once, scoped to `.vt-report`, so no page's stylesheet changes.
   *
   * Every colour is a site token, with the token's own value as the fallback
   * so a page without styles.css is still readable. The dialog used to bring a
   * private slate palette and a `prefers-color-scheme: light` branch that
   * turned only its own card white: the site is dark-only, so the buttons,
   * focus ring and messages it borrows from styles.css went to about 1:1 on a
   * light-mode device (the default on most phones). `color-scheme: dark` keeps
   * the radios and fields dark on a page that does not declare it (qa/).
   * Targets and disclosures follow the site: 44px, and a caret on a summary.
   */
  function injectStyles() {
    if (document.getElementById("vt-report-styles")) return;
    const css = `
.vt-report-overlay{position:fixed;inset:0;z-index:130;display:flex;align-items:flex-start;justify-content:center;
  padding:1rem;background:rgba(6,10,16,.72);backdrop-filter:blur(6px);overflow:auto;-webkit-overflow-scrolling:touch}
.vt-report-overlay[hidden]{display:none}
.vt-report{width:min(40rem,100%);margin:auto;max-height:calc(100vh - 2rem);max-height:calc(100dvh - 2rem);overflow:auto;
  color-scheme:dark;background:var(--bg-card,#1a2433);color:var(--text,#f5f8fd);
  border:1px solid var(--border,#3d4f68);border-radius:var(--radius,14px);padding:1.25rem;
  box-shadow:var(--shadow,0 12px 40px rgba(0,0,0,.35))}
.vt-report h2{margin:0 0 .25rem;font-size:1.15rem}
.vt-report .vt-report-lede{margin:0 0 1rem;color:var(--text-muted,#c5d2e4);font-size:.9rem}
.vt-report fieldset{border:1px solid var(--border,#3d4f68);border-radius:var(--radius-sm,10px);margin:0 0 .85rem;
  padding:.6rem .75rem}
.vt-report legend{padding:0 .35rem;font-size:.82rem;color:var(--text-muted,#c5d2e4)}
.vt-report .vt-report-choices{display:flex;flex-wrap:wrap;gap:.5rem}
.vt-report .vt-report-choices label{display:inline-flex;align-items:center;gap:.4rem;min-height:var(--min-tap,44px);
  box-sizing:border-box;padding:.3rem .7rem;border:1px solid var(--border,#3d4f68);border-radius:2rem;
  cursor:pointer;font-size:.9rem}
.vt-report .vt-report-choices input{margin:0}
.vt-report label.vt-report-field{display:block;margin:0 0 .85rem;font-size:.9rem}
.vt-report label.vt-report-field > span{display:block;margin-bottom:.3rem}
.vt-report input[type=text],.vt-report input[type=email],.vt-report select,.vt-report textarea{
  width:100%;box-sizing:border-box;min-height:var(--min-tap,44px);padding:.5rem .6rem;font:inherit;
  font-size:max(16px,1rem);color:inherit;
  background:var(--bg-elevated,#161e2a);border:1px solid var(--border,#3d4f68);border-radius:var(--radius-sm,10px)}
.vt-report textarea{min-height:6rem;resize:vertical}
.vt-report .vt-report-hint{display:block;margin-top:.25rem;font-size:.78rem;color:var(--text-muted,#c5d2e4)}
.vt-report details{margin:0 0 .9rem;font-size:.85rem}
.vt-report details summary{cursor:pointer;min-height:var(--min-tap,44px);display:flex;align-items:center;gap:.4rem;
  list-style:none}
.vt-report details summary::-webkit-details-marker{display:none}
.vt-report details summary::before{content:"▸";color:var(--accent,#6eb4e8)}
.vt-report details[open] summary::before{content:"▾"}
.vt-report details ul{margin:.4rem 0 0;padding-left:1.1rem;color:var(--text-muted,#c5d2e4)}
.vt-report .vt-report-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem}
.vt-report .vt-report-actions button,.vt-report .vt-report-actions a{min-height:var(--min-tap,44px)}
.vt-report .vt-report-msg{margin:.6rem 0 0;font-size:.88rem;min-height:1.2rem}
.vt-report .vt-report-msg[data-tone=error]{color:var(--danger,#f07a82)}
.vt-report .vt-report-msg[data-tone=ok]{color:var(--success,#4fd492)}
.vt-report code.vt-report-ref{display:inline-block;padding:.3rem .5rem;font-size:1.05rem;letter-spacing:.08em;
  background:var(--bg-soft,#243041);border-radius:.4rem;user-select:all}
.vt-report .vt-report-mine{list-style:none;margin:.5rem 0 0;padding:0;font-size:.88rem}
.vt-report .vt-report-mine li{padding:.45rem 0;border-top:1px solid var(--border,#3d4f68)}
.vt-report-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);
  white-space:nowrap;border:0}
.vt-report .vt-report-pill{display:inline-block;margin-left:.4rem;padding:.1rem .45rem;border-radius:1rem;
  font-size:.75rem;background:var(--bg-soft,#243041)}
/* The entry point reads as a link in a line of footer text, but it is a real
   control, so it gets the site's 44px floor rather than the height of its own
   type. inline-flex keeps it in the sentence it sits in. */
.vt-report-open{display:inline-flex;align-items:center;vertical-align:middle;min-height:44px;padding:0 .15rem;
  background:none;border:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}
.vt-report-open:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:.25rem}
`;
    document.head.appendChild(el("style", { id: "vt-report-styles", text: css }));
  }

  /** The `<button>`s a radio group is drawn as. */
  function choices(name, options, selected, onPick) {
    const wrap = el("div", { className: "vt-report-choices" });
    options.forEach((option) => {
      const input = el("input", {
        type: "radio",
        name,
        value: option.value,
        ...(option.value === selected ? { checked: true } : {})
      });
      input.addEventListener("change", () => onPick && onPick(option.value));
      wrap.appendChild(el("label", {}, [input, el("span", { text: option.label })]));
    });
    return wrap;
  }

  /** A labelled field. */
  function field(id, labelText, control, hintText) {
    control.id = id;
    return el("label", { className: "vt-report-field", for: id }, [
      el("span", { text: labelText }),
      control,
      hintText ? el("span", { className: "vt-report-hint", text: hintText }) : null
    ]);
  }

  /** Build the dialog once. */
  function build() {
    const overlay = el("div", {
      className: "modal-overlay vt-report-overlay",
      id: "vt-report-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "vt-report-title",
      hidden: true
    });
    const card = el("div", { className: "modal-card vt-report" });
    // One status node that outlives every redraw of the card. The thanks and
    // failure panels replace the card wholesale and move focus to a button, so
    // a screen reader heard "Enviando…" and then "Cerrar, botón": never whether
    // it was saved, its reference, or why it was not.
    const status = el("p", { className: "vt-report-sr", role: "status", "aria-live": "polite" });
    overlay.append(card, status);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    ui = { overlay, card, status, kind: "bug", severity: "annoying", area: "practice" };
    return ui;
  }

  /** Say `text` once through the dialog's status node (emptied first, so a repeat is spoken again). */
  function announce(text) {
    ui.status.textContent = "";
    setTimeout(() => {
      ui.status.textContent = text;
    }, 50);
  }

  /** Close on Escape, while the dialog is open. */
  function onKeyDown(event) {
    if (event.key === "Escape" && ui && !ui.overlay.hidden) {
      event.stopPropagation();
      close();
    }
  }

  /** Read the form into the shape the worker takes. */
  function readForm() {
    const value = (id) => {
      const node = ui.card.querySelector(`#${id}`);
      return node ? String(node.value || "").trim() : "";
    };
    return {
      kind: ui.kind,
      area: ui.area,
      severity: ui.kind === "bug" ? ui.severity : undefined,
      summary: value("vt-report-summary").slice(0, LIMITS.summary),
      detail: value("vt-report-detail").slice(0, LIMITS.detail),
      steps: ui.kind === "bug" ? value("vt-report-steps").slice(0, LIMITS.steps) : "",
      contact: value("vt-report-contact").slice(0, LIMITS.contact),
      page: pageRef(),
      build: BUILD,
      locale: lang(),
      environment: environment()
    };
  }

  /** Save what has been typed so far. */
  function saveDraft() {
    if (!ui || ui.overlay.hidden) return;
    const form = readForm();
    if (!form.summary && !form.detail && !form.steps) {
      writeDraft(null);
      return;
    }
    writeDraft({
      kind: form.kind,
      area: form.area,
      severity: form.severity,
      summary: form.summary,
      detail: form.detail,
      steps: form.steps,
      contact: form.contact
    });
  }

  /** The report as plain text, for the copy-it-yourself way out. */
  function asText(form) {
    const lines = [
      `${t("labelKind")}: ${form.kind === "idea" ? t("kindIdea") : t("kindBug")}`,
      `${t("labelArea")}: ${t(`area${form.area.charAt(0).toUpperCase()}${form.area.slice(1)}`)}`
    ];
    if (form.kind === "bug" && form.severity) {
      lines.push(`${t("labelSeverity")}: ${t(`sev${form.severity.charAt(0).toUpperCase()}${form.severity.slice(1)}`)}`);
    }
    if (form.summary) lines.push("", form.summary);
    if (form.detail) lines.push("", `${t("labelWhat")}:`, form.detail);
    if (form.steps) lines.push("", `${t("labelSteps")}:`, form.steps);
    lines.push("", `${t("labelPage")}: ${form.page}`);
    if (form.build) lines.push(`${t("labelBuild")}: ${form.build}`);
    if (form.environment.ua) lines.push(`${t("labelBrowser")}: ${form.environment.ua}`);
    if (form.environment.viewport) {
      lines.push(`${t("labelScreen")}: ${form.environment.viewport}${form.environment.screen ? ` (${form.environment.screen})` : ""}`);
    }
    // No contact line: the way out this text is for is a public GitHub issue,
    // and the contact is prefilled with a signed-in reporter's own address.
    return lines.join("\n");
  }

  /**
   * Copy text, telling the truth about whether it worked.
   * @param {string} text Text to copy.
   * @param {HTMLElement} message Where to say what happened.
   * @returns {Promise<void>} Resolves when said.
   */
  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      message.textContent = t("copied");
      message.dataset.tone = "ok";
    } catch {
      message.textContent = t("copyFailed");
      message.dataset.tone = "error";
    }
  }

  /** The sentence for a refusal, by the worker's reason code. */
  function failureText(res) {
    const reason = (res && res.data && res.data.reason) || "";
    // No transport on this page is not the visitor's connection: blaming it
    // sent a reader to check a network that was fine (the guide, before it
    // loaded account.js).
    if (!global.VTAccount || !global.VTAccount.request) return t("failNoTransport");
    if (!res || res.status === 0) {
      return global.VTAccount.isConfigured() ? t("failOffline") : t("failUnconfigured");
    }
    if (reason === "reports_disabled" || reason === "accounts_not_configured") return t("failDisabled");
    if (reason === "too_busy") return t("failBusy");
    if (reason === "rate_limited") return t("failRateLimited");
    return t("failGeneric", { reason: reason || res.status });
  }

  /** Take kind, area and severity from the draft (defaults for anything unknown); returns the draft, or {}. */
  function restoreChoices() {
    const draft = readDraft() || {};
    ui.kind = draft.kind === "idea" ? "idea" : "bug";
    ui.area = AREAS.includes(draft.area) ? draft.area : "practice";
    ui.severity = ["blocks", "annoying", "cosmetic"].includes(draft.severity) ? draft.severity : "annoying";
    return draft;
  }

  /** The signed-in reporter's address, to prefill the contact field, or "". */
  function signedInEmail() {
    const account = global.VTAccount && global.VTAccount.getState ? global.VTAccount.getState() : null;
    return (account && account.account && account.account.email) || "";
  }

  /** Put the cursor in the summary, but only while the dialog is showing. */
  function focusSummary() {
    const first = ui.card.querySelector("#vt-report-summary");
    if (first && !ui.overlay.hidden) {
      try {
        first.focus();
      } catch {
        /* ignore */
      }
    }
  }

  /** Draw the form, from the draft when there is one. */
  function drawForm(notice) {
    const draft = restoreChoices();
    const myEmail = signedInEmail();

    const form = el("form", { novalidate: true, id: "vt-report-form" });
    const title = el("h2", { id: "vt-report-title", text: t("title") });
    const lede = el("p", { className: "vt-report-lede", text: t("lede") });

    const kindBox = el("fieldset", {}, [
      el("legend", { text: t("kindLegend") }),
      choices(
        "vt-report-kind",
        [
          { value: "bug", label: t("kindBug") },
          { value: "idea", label: t("kindIdea") }
        ],
        ui.kind,
        (value) => {
          ui.kind = value;
          saveDraft();
          applyKind();
        }
      )
    ]);

    const areaSelect = el("select", {});
    AREAS.forEach((area) => {
      const label = t(`area${area.charAt(0).toUpperCase()}${area.slice(1)}`);
      const option = el("option", { value: area, text: label });
      if (area === ui.area) option.selected = true;
      areaSelect.appendChild(option);
    });
    areaSelect.addEventListener("change", () => {
      ui.area = areaSelect.value;
      saveDraft();
    });

    // Built whether or not this is a bug, and hidden for an idea. Rebuilding
    // the form on the kind switch was the obvious way and the wrong one: it
    // destroys the radio the keyboard is on, so arrow keys through the group
    // threw focus out of it and the second option could not be reached.
    // js/focus-trap.js skips anything inside [hidden], so a hidden field is
    // out of the tab order too, and `readForm` ignores it by kind.
    const severityBox = el("fieldset", {}, [
      el("legend", { text: t("severityLegend") }),
      choices(
        "vt-report-severity",
        [
          { value: "blocks", label: t("sevBlocks") },
          { value: "annoying", label: t("sevAnnoying") },
          { value: "cosmetic", label: t("sevCosmetic") }
        ],
        ui.severity,
        (value) => {
          ui.severity = value;
          saveDraft();
        }
      )
    ]);

    const summary = el("input", {
      type: "text",
      maxlength: String(LIMITS.summary),
      autocomplete: "off",
      value: draft.summary || ""
    });
    const detail = el("textarea", { maxlength: String(LIMITS.detail), rows: "5" });
    detail.value = draft.detail || "";
    const steps = el("textarea", { maxlength: String(LIMITS.steps), rows: "3" });
    steps.value = draft.steps || "";
    const contact = el("input", {
      type: "email",
      maxlength: String(LIMITS.contact),
      autocomplete: "email",
      spellcheck: "false",
      value: draft.contact || myEmail
    });

    const envList = el("ul", {}, [
      el("li", { text: t("envPage") }),
      BUILD ? el("li", { text: t("envBuild") }) : null,
      el("li", { text: t("envBrowser") }),
      el("li", { text: t("envScreen") }),
      el("li", { text: t("envClock") }),
      el("li", { text: t("envLang") }),
      el("li", { text: t("envAccount") })
    ]);

    const message = el("p", { className: "vt-report-msg", "aria-live": "polite", role: "status" });
    const submit = el("button", { type: "submit", className: "btn btn-primary", text: t("send") });
    const cancel = el("button", { type: "button", className: "btn btn-ghost", text: t("cancel") });
    cancel.addEventListener("click", () => close());

    const summaryField = field("vt-report-summary", t("summaryLabel"), summary, t("summaryHintBug"));
    const detailField = field("vt-report-detail", t("detailLabel"), detail, t("detailHintBug"));
    const stepsField = field("vt-report-steps", t("stepsLabel"), steps, t("stepsHint"));
    ui.severityBox = severityBox;
    ui.stepsField = stepsField;
    ui.summaryHint = summaryField.querySelector(".vt-report-hint");
    ui.detailHint = detailField.querySelector(".vt-report-hint");

    form.append(
      kindBox,
      field("vt-report-area", t("areaLabel"), areaSelect),
      severityBox,
      summaryField,
      detailField,
      stepsField,
      field("vt-report-contact", t("contactLabel"), contact, t("contactHint")),
      el("details", {}, [
        el("summary", { text: t("envSummary") }),
        el("p", { text: t("envLede") }),
        envList
      ]),
      el("div", { className: "vt-report-actions" }, [submit, cancel]),
      message
    );
    form.addEventListener("input", saveDraft);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      send(submit, message);
    });

    ui.card.replaceChildren(title, lede, form, mineSection());
    applyKind();
    if (notice) {
      message.textContent = notice;
      message.dataset.tone = "error";
    }
    focusSummary();
  }

  /**
   * Show only the parts the chosen kind needs, in place.
   *
   * An idea has no severity and no steps to reproduce — asking for them makes
   * the form look like a bug report and puts people off writing the idea down.
   */
  function applyKind() {
    if (!ui || !ui.severityBox) return;
    const bug = ui.kind === "bug";
    ui.severityBox.hidden = !bug;
    ui.stepsField.hidden = !bug;
    if (ui.summaryHint) ui.summaryHint.textContent = bug ? t("summaryHintBug") : t("summaryHintIdea");
    if (ui.detailHint) ui.detailHint.textContent = bug ? t("detailHintBug") : t("detailHintIdea");
  }

  /** The "what you already told us" block, for a signed-in reporter. */
  function mineSection() {
    const box = el("details", { className: "vt-report-mine-box" });
    const list = el("div", {});
    const message = el("p", { className: "vt-report-msg", "aria-live": "polite" });
    const load = el("button", { type: "button", className: "btn btn-sm", text: t("mineLoad") });
    load.addEventListener("click", async () => {
      const account = global.VTAccount && global.VTAccount.getState ? global.VTAccount.getState() : null;
      if (!account || !account.signedIn) {
        message.textContent = t("mineNeedsAccount");
        message.dataset.tone = "error";
        return;
      }
      load.disabled = true;
      const res = await global.VTAccount.request("GET", "/v1/reports/mine", null, { timeoutMs: 8000 });
      load.disabled = false;
      if (!res || !res.ok) {
        // A session that ran out is not a failed send: it used to read
        // "Algo falló al enviarlo (no_session)" on a list nobody was sending.
        message.textContent = res && res.status === 401 ? t("mineNeedsAccount") : failureText(res);
        message.dataset.tone = "error";
        return;
      }
      message.textContent = "";
      const reports = (res.data && res.data.reports) || [];
      if (!reports.length) {
        list.replaceChildren(el("p", { className: "vt-report-hint", text: t("mineEmpty") }));
        return;
      }
      const items = el("ul", { className: "vt-report-mine" });
      reports.forEach((report) => {
        const key = `st${report.status.charAt(0).toUpperCase()}${report.status.slice(1)}`;
        items.appendChild(
          el("li", {}, [
            el("span", { text: report.summary }),
            el("span", { className: "vt-report-pill", text: t(key) }),
            el("br"),
            el("code", { className: "vt-report-ref", text: report.reference })
          ])
        );
      });
      list.replaceChildren(items);
    });
    box.append(el("summary", { text: t("mineTitle") }), load, message, list);
    return box;
  }

  /** Post the report, or fall back to the copy-it-yourself panel. */
  async function send(submit, message) {
    const form = readForm();
    if (!form.summary && !form.detail) {
      message.textContent = t("needWords");
      message.dataset.tone = "error";
      const first = ui.card.querySelector("#vt-report-summary");
      if (first) first.focus();
      return;
    }
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    message.textContent = t("sending");
    message.dataset.tone = "";
    const body = { ...form };
    if (body.severity === undefined) delete body.severity;
    if (!body.contact) delete body.contact;

    let res = null;
    if (global.VTAccount && global.VTAccount.isConfigured && global.VTAccount.isConfigured()) {
      res = await global.VTAccount.request("POST", "/v1/reports", body, { timeoutMs: 12000 });
    }
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    if (res && res.ok && res.data && res.data.reference) {
      writeDraft(null);
      drawThanks(res.data.reference);
      return;
    }
    drawFailure(form, res);
  }

  /** What a reporter sees when it worked. */
  function drawThanks(reference) {
    const message = el("p", { className: "vt-report-msg", "aria-live": "polite" });
    const copy = el("button", { type: "button", className: "btn btn-sm", text: t("copyRef") });
    copy.addEventListener("click", () => copyText(reference, message));
    const again = el("button", { type: "button", className: "btn btn-ghost btn-sm", text: t("another") });
    again.addEventListener("click", () => drawForm());
    const done = el("button", { type: "button", className: "btn btn-primary", text: t("close") });
    done.addEventListener("click", () => close());
    announce(`${t("thanksTitle")}. ${reference}`);
    ui.card.replaceChildren(
      el("h2", { id: "vt-report-title", text: t("thanksTitle") }),
      el("p", { text: t("thanksBody") }),
      el("p", {}, [el("code", { className: "vt-report-ref", text: reference })]),
      el("div", { className: "vt-report-actions" }, [done, copy, again]),
      message
    );
    try {
      done.focus();
    } catch {
      /* ignore */
    }
  }

  /**
   * What a reporter sees when our route could not take it: the same report as
   * text, a copy button, and the issues page. Nothing they typed is lost, and
   * the draft stays so "try again" is a real option.
   */
  function drawFailure(form, res) {
    const text = asText(form);
    const area = el("textarea", { rows: "10", readonly: true, "aria-label": t("failTitle") });
    area.value = text;
    const message = el("p", { className: "vt-report-msg", "aria-live": "polite" });
    const copy = el("button", { type: "button", className: "btn btn-primary", text: t("copyReport") });
    copy.addEventListener("click", () => copyText(text, message));
    const issues = el("a", {
      className: "btn btn-sm",
      href: ISSUES_URL,
      target: "_blank",
      rel: "noopener",
      text: t("openIssues")
    });
    const retry = el("button", { type: "button", className: "btn btn-ghost btn-sm", text: t("retry") });
    retry.addEventListener("click", () => drawForm());
    const back = el("button", { type: "button", className: "btn btn-ghost btn-sm", text: t("close") });
    back.addEventListener("click", () => close());
    announce(`${t("failTitle")}. ${failureText(res)}`);
    ui.card.replaceChildren(
      el("h2", { id: "vt-report-title", text: t("failTitle") }),
      el("p", { text: failureText(res) }),
      el("p", { className: "vt-report-lede", text: t("failLede") }),
      area,
      el("p", { className: "vt-report-hint", text: t("failPublic") }),
      el("div", { className: "vt-report-actions" }, [copy, issues, retry, back]),
      message
    );
    try {
      copy.focus();
    } catch {
      /* ignore */
    }
  }

  /**
   * Open the dialog.
   *
   * The options are written into the draft rather than passed to the form, so
   * that a preselected kind survives the redraw the kind switch triggers, and
   * so the QA page can hand over the name of the check that failed as the
   * first line of the report.
   *
   * @param {{kind?: string, area?: string, summary?: string}} [options] What to preselect.
   */
  function open(options) {
    if (!ui) build();
    opener = document.activeElement;
    partLang = options && (options.lang === "en" || options.lang === "es") ? options.lang : null;
    ui.overlay.lang = lang();
    if (options) seedDraft(options);
    ui.overlay.hidden = false;
    drawForm();
    document.addEventListener("keydown", onKeyDown, true);
    if (global.VTFocusTrap && global.VTFocusTrap.activate) {
      global.VTFocusTrap.activate(ui.overlay, { initialFocus: "#vt-report-summary" });
    }
  }

  /** Put what the opener suggested (kind, area, a first summary) into the draft. */
  function seedDraft(options) {
    if (!options.kind && !options.area && !options.summary) return;
    const draft = readDraft() || {};
    writeDraft({
      ...draft,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.area ? { area: options.area } : {}),
      // Only when there is nothing typed yet: a suggestion must never
      // overwrite somebody's own words.
      ...(options.summary && !draft.summary ? { summary: String(options.summary).slice(0, LIMITS.summary) } : {})
    });
  }

  /** Close the dialog, keeping whatever is typed as a draft. */
  function close() {
    if (!ui || ui.overlay.hidden) return;
    saveDraft();
    ui.overlay.hidden = true;
    document.removeEventListener("keydown", onKeyDown, true);
    if (global.VTFocusTrap && global.VTFocusTrap.release) {
      global.VTFocusTrap.release(ui.overlay);
    }
    try {
      if (opener && opener.focus) opener.focus();
    } catch {
      /* ignore */
    }
    opener = null;
  }

  /**
   * Wire every `[data-vt-report]` control on the page, and fill in the text of
   * any that is empty — a page without js/i18n.js has nothing else to put it
   * there.
   */
  /** "en" or "es" when the node sits in a part of the page that declares its language, else undefined. */
  function partLanguage(node) {
    const part = node.parentElement && node.parentElement.closest("[lang]");
    if (!part || part === document.documentElement) return undefined;
    const code = String(part.getAttribute("lang") || "").slice(0, 2).toLowerCase();
    return code === "en" || code === "es" ? code : undefined;
  }

  function wire() {
    // Before the first click, not on first open: the entry point in the footer
    // is styled from the same block, and a page where nothing is ever opened
    // still has to draw it as a link rather than as a raw button.
    injectStyles();
    document.querySelectorAll("[data-vt-report]").forEach((node) => {
      if (node.dataset.vtReportBound === "1") return;
      node.dataset.vtReportBound = "1";
      if (!node.textContent.trim()) node.textContent = t("open");
      node.addEventListener("click", (event) => {
        event.preventDefault();
        const kind = node.getAttribute("data-vt-report");
        open({
          kind: kind === "idea" || kind === "bug" ? kind : undefined,
          area: node.getAttribute("data-vt-report-area") || undefined,
          lang: partLanguage(node)
        });
      });
    });
  }

  global.VTReports = {
    open,
    close,
    wire,
    t,
    /** For tests and the QA page: what would be attached, without sending anything. */
    environment,
    isOpen: () => !!(ui && !ui.overlay.hidden)
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wire, { once: true });
    } else {
      wire();
    }
  }
})(window);
