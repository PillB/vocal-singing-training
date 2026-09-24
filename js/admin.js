/**
 * Admin page: give and take back Pro, gift codes, and server housekeeping.
 *
 * Everything here is a thin client over the worker's `/v1/admin/*` routes,
 * which check the caller against `ADMIN_EMAILS` on every request. This page
 * decides what to draw by asking one of those routes, never by trusting the
 * `role` in `/v1/me`: a worker deployed before that field followed the list
 * could say "member" to a real admin, or "admin" to someone since removed.
 *
 * Nothing a person typed is ever put into the page as HTML. Names, notes and
 * addresses go in through `textContent`.
 */
(function () {
  "use strict";

  const STR = {
    es: {
      brandSub: "Panel de admin",
      title: "Panel de admin",
      lede: "Da y quita Pro, crea códigos de regalo y revisa el servidor.",
      backToApp: "← Estudio",
      signOut: "Salir",
      langToggle: "English",
      gateChecking: "Comprobando tu cuenta…",
      gateUnconfigured: "Este sitio no tiene servidor de cuentas configurado.",
      gateUnreachable: "No se pudo contactar al servidor de cuentas.",
      retry: "Reintentar",
      gateSignedOut: "Entra con la cuenta de Google de administrador.",
      gateGoogleBlocked: "El botón de Google no cargó (a veces lo bloquea una extensión).",
      gateUseApp: "Entra desde el estudio, en Cuenta, y vuelve a esta página.",
      gateNotAdmin:
        "Esta cuenta no es administradora. Si debería serlo, su correo tiene que estar en la lista ADMIN_EMAILS del servidor (ver la guía de admin).",
      gateNotAdminWho: "Entraste como {email}.",
      signedInAs: "Administras como",
      navLookup: "Buscar",
      navGive: "Dar Pro",
      navCodes: "Códigos",
      navMaintenance: "Mantenimiento",
      navLabel: "Secciones",
      lookupTitle: "Buscar una cuenta",
      lookupHelp: "Escribe el correo con el que la persona entra al sitio.",
      email: "Correo",
      lookupSubmit: "Buscar",
      giveTitle: "Dar Pro a una persona",
      giveHelp:
        "Los días cuentan desde hoy. Si la cuenta aún no existe, se crea, y la persona tendrá Pro en cuanto entre con ese correo.",
      days: "Días",
      uses: "Usos",
      noteLabel: "Nota (solo la ven los admins)",
      giveSubmit: "Dar Pro",
      codesTitle: "Códigos de regalo",
      codesHelp:
        "Quien recibe el código lo escribe en Cuenta → «¿Tienes un código de regalo?». Sus días cuentan desde que lo canjea.",
      codeSubmit: "Crear código",
      copyCode: "Copiar código",
      copyMessage: "Copiar mensaje para enviar",
      codesListTitle: "Códigos creados",
      codesRefresh: "Actualizar lista",
      codesStale: "La lista de abajo puede estar desactualizada. {failure}",
      maintenanceTitle: "Mantenimiento",
      healthTitle: "Estado del servidor",
      healthRefresh: "Comprobar de nuevo",
      sweepTitle: "Limpiar datos vencidos",
      sweepHelp:
        "Borra sesiones vencidas, códigos de entrada usados y contadores viejos. No toca cuentas, regalos ni progreso.",
      sweepRun: "Limpiar ahora",
      guideLink: "Guía de admin (paso a paso)",

      working: "Un momento…",
      badEmail: "Escribe un correo válido.",
      badDays: "Escribe un número de días entre 1 y 3650.",
      badUses: "Escribe cuántas veces se puede usar, entre 1 y 1000.",
      notFound:
        "No hay ninguna cuenta con {email}. Nadie ha entrado con ese correo y nadie le ha dado Pro. Si le das Pro, la cuenta se crea.",
      forbidden: "Tu cuenta ya no es administradora. Recarga la página.",
      sessionGone: "Tu sesión terminó. Vuelve a entrar.",
      offline: "No se pudo contactar al servidor. Revisa la conexión y vuelve a intentarlo.",
      generic: "Algo falló ({reason}). Vuelve a intentarlo.",
      giveMaybe:
        "El servidor no respondió. Puede que el regalo se haya guardado igual: revisa la cuenta en «Buscar una cuenta» antes de volver a intentarlo.",
      codeMaybe:
        "El servidor no respondió. Puede que el código se haya creado igual: revisa «Códigos creados» antes de crear otro.",

      proUntil: "Tiene Pro hasta el {date}",
      proLeft: "{n} días más",
      proLeftOne: "1 día más",
      proOpenEnded: "Tiene Pro (suscripción sin fecha de fin)",
      noPro: "Sin Pro ahora mismo",
      via: "por {source}",
      created: "Cuenta creada el {date}",
      adminBadge: "Admin",
      trialUsed: "Ya usó su mes de prueba (no puede empezar otro)",
      trialFree: "No ha usado su mes de prueba",
      neverSignedIn:
        "Nunca ha entrado con este correo. Si dice que ya entró, lo hizo con otra dirección: pídele que te diga el correo que ve en Cuenta.",
      signedInWith: "Entra con {methods} · última vez: {date}",
      signedInWithNoDate: "Entra con {methods}",
      activeSessions: "Sesiones abiertas: {n}",
      grantsTitle: "Historial de acceso",
      noGrants: "No tiene regalos ni prueba.",
      paidTitle: "Suscripciones pagadas",
      paidLine: "{plan} · {provider} · {status}",
      paidHint: "Una suscripción pagada se cancela en {provider}, no aquí.",
      planMonthly: "Mensual",
      planYearly: "Anual",
      psActive: "activa",
      psPastDue: "pago atrasado",
      psCanceled: "cancelada",
      psPending: "pendiente",
      psPaused: "en pausa",
      colKind: "Tipo",
      colDates: "Fechas",
      colStatus: "Estado",
      colNote: "Nota",
      colAction: "Acción",
      colCode: "Código",
      colDays: "Días",
      colUsed: "Usos",
      colCreated: "Creado",
      range: "{from} → {to}",
      kindTrial: "Prueba gratis",
      kindGift: "Regalo",
      kindComp: "Cortesía",
      kindPaid: "Suscripción",
      fromCode: "con el código {code}",
      stActive: "Activo",
      stScheduled: "Programado",
      stExpired: "Vencido",
      stRevoked: "Quitado el {date}",
      revoke: "Quitar acceso",
      revokeConfirm:
        "¿Quitar este acceso a {email}?\n\n{kind} hasta el {date}.\n\n{others}Lo pierde la próxima vez que abra o recargue el sitio con conexión. Sin conexión puede conservarlo hasta 3 días.",
      revokeOthers: "Ojo: seguirá teniendo Pro por {list}. Quita eso también si quieres dejarle sin Pro.\n\n",
      otherUntil: "{kind} hasta el {date}",
      otherOpen: "{kind} sin fecha de fin",
      revoked: "Listo: se quitó el acceso. {summary}.",
      alreadyRevoked: "Ese acceso ya estaba quitado.",
      giveMore: "Dar más días a esta cuenta",
      given: "Listo: {email} tiene Pro hasta el {date}.",
      givenNoChange:
        "Se guardó el regalo, pero {email} ya tenía acceso hasta el {date}, así que su fecha final no cambia.",
      codeCreated: "Código creado: {days} días, {uses} uso(s).",
      codeMessage:
        "Te regalo {days} días de Estudio Vocal Pro. Entra en {url} , toca Cuenta, entra con Google y escribe este código en «¿Tienes un código de regalo?»: {code}",
      copied: "Copiado.",
      copyFailed: "No se pudo copiar. Selecciónalo y cópialo a mano.",
      noCodes: "Todavía no hay códigos.",
      codeActive: "Activo",
      codeUsedUp: "Agotado",
      codeRevoked: "Anulado",
      codeExpired: "Vencido",
      codeRevoke: "Anular",
      codeRevokeConfirm:
        "¿Anular el código {code}?\n\nNadie más podrá canjearlo. Quien ya lo canjeó conserva sus días (eso se quita buscando su cuenta).",
      codeRevokedMsg: "Código {code} anulado.",
      healthAccounts: "Cuentas y regalos",
      healthSigning: "Firma de licencias Pro",
      healthGoogle: "Entrar con Google",
      healthEmail: "Entrar con código por correo",
      healthPayments: "Pagos (Mercado Pago o Stripe)",
      healthOrigin: "Sitio permitido: {origin}",
      healthOn: "activo",
      healthOff: "apagado",
      healthUnreachable: "No se pudo leer el estado del servidor.",
      sweepDone: "Limpieza hecha.",
      notSet: "—"
    },
    en: {
      brandSub: "Admin panel",
      title: "Admin panel",
      lede: "Give and take back Pro, make gift codes and check the server.",
      backToApp: "← Studio",
      signOut: "Sign out",
      langToggle: "Español",
      gateChecking: "Checking your account…",
      gateUnconfigured: "This site has no account server configured.",
      gateUnreachable: "Could not reach the account server.",
      retry: "Try again",
      gateSignedOut: "Sign in with the admin Google account.",
      gateGoogleBlocked: "Google's button did not load (an extension sometimes blocks it).",
      gateUseApp: "Sign in from the studio, under Account, then come back to this page.",
      gateNotAdmin:
        "This account is not an admin. If it should be, its address has to be on the server's ADMIN_EMAILS list (see the admin guide).",
      gateNotAdminWho: "Signed in as {email}.",
      signedInAs: "Signed in as admin",
      navLookup: "Look up",
      navGive: "Give Pro",
      navCodes: "Codes",
      navMaintenance: "Maintenance",
      navLabel: "Sections",
      lookupTitle: "Look up an account",
      lookupHelp: "Type the address the person signs in to the site with.",
      email: "Email",
      lookupSubmit: "Look up",
      giveTitle: "Give Pro to a person",
      giveHelp:
        "Days count from today. If the account does not exist yet it is created, and the person has Pro as soon as they sign in with that address.",
      days: "Days",
      uses: "Uses",
      noteLabel: "Note (only admins see it)",
      giveSubmit: "Give Pro",
      codesTitle: "Gift codes",
      codesHelp:
        "Whoever gets the code types it under Account → “Have a gift code?”. Their days count from when they redeem it.",
      codeSubmit: "Create code",
      copyCode: "Copy code",
      copyMessage: "Copy message to send",
      codesListTitle: "Codes created",
      codesRefresh: "Refresh list",
      codesStale: "The list below may be out of date. {failure}",
      maintenanceTitle: "Maintenance",
      healthTitle: "Server status",
      healthRefresh: "Check again",
      sweepTitle: "Clean up expired data",
      sweepHelp:
        "Deletes expired sessions, used sign-in codes and old counters. Accounts, gifts and progress are untouched.",
      sweepRun: "Clean up now",
      guideLink: "Admin guide (step by step)",

      working: "One moment…",
      badEmail: "Type a valid email address.",
      badDays: "Type a number of days from 1 to 3650.",
      badUses: "Type how many times it can be used, from 1 to 1000.",
      notFound:
        "There is no account for {email}. Nobody has signed in with that address and nobody has given it Pro. Giving it Pro creates the account.",
      forbidden: "Your account is no longer an admin. Reload the page.",
      sessionGone: "Your session ended. Sign in again.",
      offline: "Could not reach the server. Check the connection and try again.",
      generic: "Something failed ({reason}). Try again.",
      giveMaybe:
        "The server did not answer. The gift may have been saved anyway: check the account under “Look up an account” before trying again.",
      codeMaybe:
        "The server did not answer. The code may have been created anyway: check “Codes created” before making another.",

      proUntil: "Has Pro until {date}",
      proLeft: "{n} more days",
      proLeftOne: "1 more day",
      proOpenEnded: "Has Pro (subscription with no end date)",
      noPro: "No Pro right now",
      via: "from {source}",
      created: "Account created {date}",
      adminBadge: "Admin",
      trialUsed: "Has used the free trial month (cannot start another)",
      trialFree: "Has not used the free trial month",
      neverSignedIn:
        "Has never signed in with this address. If they say they did, they used a different one: ask for the address shown under Account.",
      signedInWith: "Signs in with {methods} · last seen: {date}",
      signedInWithNoDate: "Signs in with {methods}",
      activeSessions: "Open sessions: {n}",
      grantsTitle: "Access history",
      noGrants: "No gifts or trial.",
      paidTitle: "Paid subscriptions",
      paidLine: "{plan} · {provider} · {status}",
      paidHint: "A paid subscription is cancelled in {provider}, not here.",
      planMonthly: "Monthly",
      planYearly: "Yearly",
      psActive: "active",
      psPastDue: "payment overdue",
      psCanceled: "cancelled",
      psPending: "pending",
      psPaused: "paused",
      colKind: "Kind",
      colDates: "Dates",
      colStatus: "Status",
      colNote: "Note",
      colAction: "Action",
      colCode: "Code",
      colDays: "Days",
      colUsed: "Uses",
      colCreated: "Created",
      range: "{from} → {to}",
      kindTrial: "Free trial",
      kindGift: "Gift",
      kindComp: "Comp",
      kindPaid: "Subscription",
      fromCode: "with code {code}",
      stActive: "Active",
      stScheduled: "Scheduled",
      stExpired: "Expired",
      stRevoked: "Removed {date}",
      revoke: "Remove access",
      revokeConfirm:
        "Remove this access from {email}?\n\n{kind} until {date}.\n\n{others}They lose it the next time they open or reload the site online. Offline they can keep it for up to 3 days.",
      revokeOthers: "Note: they keep Pro through {list}. Remove that too to leave them without Pro.\n\n",
      otherUntil: "{kind} until {date}",
      otherOpen: "{kind} with no end date",
      revoked: "Done: the access was removed. {summary}.",
      alreadyRevoked: "That access was already removed.",
      giveMore: "Give this account more days",
      given: "Done: {email} has Pro until {date}.",
      givenNoChange:
        "The gift was saved, but {email} already had access until {date}, so their end date does not change.",
      codeCreated: "Code created: {days} days, {uses} use(s).",
      codeMessage:
        "Here are {days} days of Vocal Studio Pro. Go to {url} , tap Account, sign in with Google and type this code under “Have a gift code?”: {code}",
      copied: "Copied.",
      copyFailed: "Could not copy. Select it and copy it by hand.",
      noCodes: "No codes yet.",
      codeActive: "Active",
      codeUsedUp: "Used up",
      codeRevoked: "Cancelled",
      codeExpired: "Expired",
      codeRevoke: "Cancel",
      codeRevokeConfirm:
        "Cancel code {code}?\n\nNobody else can redeem it. People who already redeemed it keep their days (remove those by looking up their account).",
      codeRevokedMsg: "Code {code} cancelled.",
      healthAccounts: "Accounts and gifts",
      healthSigning: "Pro licence signing",
      healthGoogle: "Sign in with Google",
      healthEmail: "Sign in with an emailed code",
      healthPayments: "Payments (Mercado Pago or Stripe)",
      healthOrigin: "Allowed site: {origin}",
      healthOn: "on",
      healthOff: "off",
      healthUnreachable: "Could not read the server status.",
      sweepDone: "Clean-up done.",
      notSet: "—"
    }
  };

  const LANG_KEY = "vt_lang";
  let lang = "es";
  try {
    lang = localStorage.getItem(LANG_KEY) === "en" ? "en" : "es";
  } catch {
    lang = "es";
  }

  /**
   * Translate a key, filling `{name}` placeholders.
   * @param {string} key String key.
   * @param {Object} [vars] Placeholder values.
   * @returns {string} Text.
   */
  function t(key, vars) {
    const table = STR[lang] || STR.es;
    let text = table[key] !== undefined ? table[key] : STR.es[key] !== undefined ? STR.es[key] : key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
    }
    return text;
  }

  const $ = (sel) => document.querySelector(sel);

  /**
   * Build an element with text and attributes, never HTML.
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

  function applyStaticText() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach((node) => {
      node.textContent = t(node.getAttribute("data-t"));
    });
    document.querySelectorAll("[data-t-aria]").forEach((node) => {
      node.setAttribute("aria-label", t(node.getAttribute("data-t-aria")));
    });
    const toggle = $("#admin-lang");
    if (toggle) {
      toggle.textContent = t("langToggle");
      toggle.setAttribute("lang", lang === "es" ? "en" : "es");
    }
    document.title = `${t("title")} · ${lang === "es" ? "Estudio Vocal" : "Vocal Studio"}`;
  }

  const locale = () => (lang === "es" ? "es-PE" : "en-US");

  /**
   * Format a unix time as a date.
   * @param {number|null} seconds Unix seconds.
   * @returns {string} Date text.
   */
  function fmtDate(seconds) {
    if (!Number.isFinite(seconds)) return t("notSet");
    return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(seconds * 1000)
    );
  }

  /**
   * Format a unix time as a date and time.
   * @param {number|null} seconds Unix seconds.
   * @returns {string} Date and time text.
   */
  function fmtDateTime(seconds) {
    if (!Number.isFinite(seconds)) return t("notSet");
    return new Intl.DateTimeFormat(locale(), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(seconds * 1000));
  }

  const nowSec = () => Math.floor(Date.now() / 1000);

  /** A gift code's normalized form back in display form, when it has the house shape. */
  function displayCode(normalized) {
    const raw = String(normalized || "");
    const m = /^VOCAL([A-Z0-9]{4})([A-Z0-9]{4})$/.exec(raw);
    return m ? `VOCAL-${m[1]}-${m[2]}` : raw;
  }

  function kindLabel(kind) {
    return kind === "trial" ? t("kindTrial") : kind === "comp" ? t("kindComp") : kind === "gift" ? t("kindGift") : t("kindPaid");
  }

  /** "Gift, with code VOCAL-…" for grants that came from a code. */
  function sourceLabel(grant) {
    const base = kindLabel(grant.kind);
    const src = String(grant.source || "");
    if (src.startsWith("gift_code:")) return `${base} (${t("fromCode", { code: displayCode(src.slice(10)) })})`;
    return base;
  }

  function planLabel(plan) {
    if (plan === "pro_monthly") return t("planMonthly");
    if (plan === "pro_yearly") return t("planYearly");
    return String(plan || t("notSet"));
  }

  function paidStatusLabel(status) {
    const key = { active: "psActive", past_due: "psPastDue", canceled: "psCanceled", cancelled: "psCanceled", pending: "psPending", paused: "psPaused" }[status];
    return key ? t(key) : String(status || t("notSet"));
  }

  function providerLabel(provider) {
    return provider === "mercadopago" ? "Mercado Pago" : provider === "stripe" ? "Stripe" : provider || "";
  }

  function grantStatusText(grant) {
    if (grant.status === "revoked") return t("stRevoked", { date: fmtDate(grant.revokedAt) });
    if (grant.status === "active") return t("stActive");
    if (grant.status === "scheduled") return t("stScheduled");
    return t("stExpired");
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(String(value || "").trim());
  }

  const api = (method, path, body, options) => window.VTAccount.request(method, path, body, options);

  /**
   * Turn a failed response into one sentence, and handle the two that change
   * what the page should show at all.
   * @param {{status: number, data: Object|null}} res Response.
   * @returns {string} Message.
   */
  function failureText(res) {
    if (!res || res.status === 0) return t("offline");
    if (res.status === 401) {
      // Drop the dead session locally too, so the sign-in drawn next is real.
      window.VTAccount.signOut().finally(() => showGate("signedOut", t("sessionGone")));
      return t("sessionGone");
    }
    if (res.status === 403) return t("forbidden");
    return t("generic", { reason: (res.data && res.data.reason) || res.status });
  }

  /**
   * Put one sentence in a message line. The line stays in the page even when
   * empty (CSS collapses it), so screen readers keep treating it as a live
   * region and announce what lands in it.
   * @param {HTMLElement|null} node Message element.
   * @param {string} text Text, or "" to clear.
   * @param {string} [tone] ok, error or info.
   */
  function setMessage(node, text, tone) {
    if (!node) return;
    node.hidden = false;
    node.textContent = text || "";
    node.dataset.tone = tone || "";
  }

  /**
   * Disable a form's submit button while a request is in flight.
   * @param {HTMLFormElement} form Form.
   * @param {boolean} busy Busy or not.
   */
  function setBusy(form, busy) {
    const button = form && form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    button.setAttribute("aria-busy", busy ? "true" : "false");
  }

  // ---------------------------------------------------------------- gate

  const GATES = ["checking", "unconfigured", "unreachable", "signedOut", "notAdmin", "admin"];
  let gate = "checking";
  let adminEmail = "";

  function showGate(name, detail) {
    gate = name;
    const ids = {
      checking: "#gate-checking",
      unconfigured: "#gate-unconfigured",
      unreachable: "#gate-unreachable",
      signedOut: "#gate-signed-out",
      notAdmin: "#gate-not-admin",
      admin: "#gate-admin"
    };
    GATES.forEach((key) => {
      const node = $(ids[key]);
      if (node) node.hidden = key !== name;
    });
    const tools = $("#admin-tools");
    if (tools) tools.hidden = name !== "admin";
    const signOut = $("#admin-signout");
    if (signOut) signOut.hidden = !(name === "admin" || name === "notAdmin");
    document.body.dataset.gate = name;
    if (name !== "admin") clearWork();
    if (name === "signedOut") drawSignIn(detail);
    if (name === "notAdmin") {
      const who = $("#gate-not-admin-who");
      if (who) who.textContent = t("gateNotAdminWho", { email: detail || "" });
    }
    if (name === "admin") {
      const who = $("#gate-admin-who");
      if (who) who.textContent = adminEmail;
    }
  }

  /**
   * Forget everything drawn for the last admin: results, the newest code,
   * typed addresses. Runs whenever the tools hide, so the next person at this
   * browser does not find them.
   */
  function clearWork() {
    lookupSeq += 1;
    lastLookup = null;
    newestCode = null;
    $("#lookup-result")?.replaceChildren();
    ["#give-result", "#code-result", "#code-copy-status", "#sweep-result"].forEach((sel) => setMessage($(sel), "", ""));
    const box = $("#code-new");
    if (box) box.hidden = true;
    ["#lookup-form", "#give-form", "#code-form"].forEach((sel) => $(sel)?.reset());
  }

  async function drawSignIn(errorText) {
    const box = $("#gate-google");
    const fallback = $("#gate-google-fallback");
    setMessage($("#gate-error"), errorText || "", "error");
    if (!box) return;
    box.hidden = false;
    const drawn = await window.VTAccount.renderGoogleButton(box, {
      onResult: (result) => {
        if (result && result.ok) boot();
        else setMessage($("#gate-error"), t("generic", { reason: (result && result.reason) || "error" }), "error");
      }
    });
    const ok = !!(drawn && drawn.ok);
    if (fallback) fallback.hidden = ok;
    box.hidden = !ok;
  }

  /**
   * Decide what this visitor may see. Asks an admin route, because the
   * route's answer is the only one that is always right.
   */
  async function boot() {
    const A = window.VTAccount;
    if (!A || !A.isConfigured()) {
      showGate("unconfigured");
      return;
    }
    showGate("checking");
    if (!A.getState().signedIn) {
      // Without this, a worker that is down reads as Google's button being
      // blocked, and the page points at browser extensions.
      const methods = await A.ensureMethods();
      if (!methods || !methods.ok) {
        showGate("unreachable");
        return;
      }
      showGate("signedOut");
      return;
    }
    // /v1/me has no timeout of its own; a worker that accepts and never
    // answers would leave this page on "Checking…" for good.
    const me = await Promise.race([
      A.refresh(),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: "timeout" }), 10000))
    ]);
    if (!A.getState().signedIn) {
      // refresh() drops a session the worker no longer knows.
      showGate("signedOut");
      return;
    }
    if (!me || !me.ok) {
      // Still signed in means the worker did not say no, it just did not answer.
      showGate("unreachable");
      return;
    }
    const state = A.getState();
    adminEmail = (state.account && state.account.email) || "";
    const probe = await api("GET", "/v1/admin/gift-codes", null, { timeoutMs: 8000 });
    if (probe.status === 403) {
      showGate("notAdmin", adminEmail);
      return;
    }
    if (probe.status === 401) {
      showGate("signedOut");
      return;
    }
    if (!probe.ok) {
      showGate("unreachable");
      return;
    }
    showGate("admin");
    renderCodes(probe.data && probe.data.giftCodes);
    loadHealth();
  }

  // -------------------------------------------------------------- lookup

  let lastLookup = null;
  // Each lookup takes a number; an answer that arrives after a newer lookup
  // started is dropped, so a slow reply never paints over the account the
  // admin is now looking at.
  let lookupSeq = 0;

  async function lookup(email, notice) {
    const out = $("#lookup-result");
    if (!out) return null;
    const seq = ++lookupSeq;
    lastLookup = null;
    const address = String(email || "").trim();
    if (!isEmail(address)) {
      out.replaceChildren(el("p", { className: "admin-message", "data-tone": "error", text: t("badEmail") }));
      return null;
    }
    out.replaceChildren(el("p", { className: "muted", text: t("working") }));
    const res = await api("GET", `/v1/admin/account?email=${encodeURIComponent(address)}`, null, { timeoutMs: 8000 });
    if (seq !== lookupSeq) return null;
    if (res.status === 404) {
      lastLookup = null;
      out.replaceChildren(
        el("p", { className: "admin-message", "data-tone": "info", text: t("notFound", { email: address }) }),
        giveMoreButton(address)
      );
      return null;
    }
    if (!res.ok || !res.data) {
      out.replaceChildren(el("p", { className: "admin-message", "data-tone": "error", text: failureText(res) }));
      return null;
    }
    lastLookup = res.data;
    renderAccount(res.data, notice);
    return res.data;
  }

  function giveMoreButton(email) {
    const button = el("button", { type: "button", className: "btn btn-sm", text: t("giveMore") });
    button.addEventListener("click", () => {
      const input = $("#give-email");
      if (input) input.value = email;
      $("#give")?.scrollIntoView({ behavior: "smooth", block: "start" });
      $("#give-days")?.focus();
    });
    return button;
  }

  function entitlementLine(ent) {
    if (!ent || !ent.pro) return { text: t("noPro"), tone: "off" };
    if (!Number.isFinite(ent.periodEnd)) return { text: t("proOpenEnded"), tone: "on" };
    const left = Math.max(0, Math.ceil((ent.periodEnd - nowSec()) / 86400));
    const leftText = left === 1 ? t("proLeftOne") : t("proLeft", { n: left });
    const source = ent.source === "paid" ? kindLabel("paid") : kindLabel(ent.source);
    return {
      text: `${t("proUntil", { date: fmtDate(ent.periodEnd) })} (${leftText}) · ${t("via", { source: source.toLowerCase() })}`,
      tone: "on"
    };
  }

  function renderAccount(data, notice) {
    const out = $("#lookup-result");
    const account = data.account || {};
    const status = entitlementLine(data.entitlement);

    const head = el("div", { className: "admin-account-head" }, [
      el("p", { className: "admin-account-email" }, [
        el("strong", { text: account.email || "" }),
        account.displayName ? el("span", { className: "muted", text: ` · ${account.displayName}` }) : null,
        account.role === "admin" ? el("span", { className: "admin-badge", text: t("adminBadge") }) : null
      ]),
      el("p", { className: "admin-status", "data-tone": status.tone, "data-testid": "lookup-status", text: status.text })
    ]);

    const facts = el("ul", { className: "admin-facts" });
    facts.appendChild(el("li", { text: t("created", { date: fmtDate(account.createdAt) }) }));
    facts.appendChild(el("li", { text: account.trialUsed ? t("trialUsed") : t("trialFree") }));
    // Present only once the worker reports it; an older deploy just omits the line.
    if (data.signIns) {
      const s = data.signIns;
      if (!s.methods || !s.methods.length) {
        facts.appendChild(el("li", { className: "admin-warn", "data-testid": "never-signed-in", text: t("neverSignedIn") }));
      } else {
        const methods = s.methods.map((m) => (m === "google" ? "Google" : m === "email" ? (lang === "es" ? "código por correo" : "emailed code") : m)).join(", ");
        facts.appendChild(
          el("li", {
            text: Number.isFinite(s.lastSeenAt)
              ? t("signedInWith", { methods, date: fmtDateTime(s.lastSeenAt) })
              : t("signedInWithNoDate", { methods })
          })
        );
        facts.appendChild(el("li", { text: t("activeSessions", { n: Number(s.activeSessions) || 0 }) }));
      }
    }

    // Newest first, and the same order every time for grants made in the
    // same second.
    const grants = (Array.isArray(data.grants) ? data.grants.slice() : []).sort(
      (a, b) => (b.startsAt || 0) - (a.startsAt || 0) || (b.endsAt || 0) - (a.endsAt || 0) || String(a.id).localeCompare(String(b.id))
    );
    const grantsBlock = el("div", { className: "admin-grants" }, [el("h3", { text: t("grantsTitle") })]);
    if (!grants.length) {
      grantsBlock.appendChild(el("p", { className: "muted", text: t("noGrants") }));
    } else {
      const table = el("table", { className: "admin-table", "data-testid": "grants-table" });
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { scope: "col", text: t("colKind") }),
            el("th", { scope: "col", text: t("colDates") }),
            el("th", { scope: "col", text: t("colStatus") }),
            el("th", { scope: "col", text: t("colNote") }),
            el("th", { scope: "col", text: t("colAction") })
          ])
        ])
      );
      const body = el("tbody");
      grants.forEach((grant) => {
        const canRevoke = grant.status === "active" || grant.status === "scheduled";
        let action = el("span", { className: "muted", text: t("notSet") });
        if (canRevoke) {
          action = el("button", {
            type: "button",
            className: "btn btn-danger btn-sm",
            "data-grant": grant.id,
            text: t("revoke")
          });
          action.addEventListener("click", () => revokeGrant(account.email, grant, action, data));
        }
        body.appendChild(
          el("tr", { "data-status": grant.status }, [
            el("td", { "data-label": t("colKind"), text: sourceLabel(grant) }),
            el("td", { "data-label": t("colDates"), text: t("range", { from: fmtDate(grant.startsAt), to: fmtDate(grant.endsAt) }) }),
            el("td", { "data-label": t("colStatus") }, [el("span", { className: `admin-pill st-${grant.status}`, text: grantStatusText(grant) })]),
            el("td", { "data-label": t("colNote"), text: grant.note || t("notSet") }),
            el("td", { "data-label": t("colAction") }, [action])
          ])
        );
      });
      table.appendChild(body);
      grantsBlock.appendChild(el("div", { className: "admin-table-wrap" }, [table]));
    }

    const paid = Array.isArray(data.paid) ? data.paid : [];
    let paidBlock = null;
    if (paid.length) {
      paidBlock = el("div", { className: "admin-paid" }, [el("h3", { text: t("paidTitle") })]);
      paid.forEach((p) => {
        const provider = providerLabel(p.provider);
        paidBlock.appendChild(
          el("p", {
            text: `${t("paidLine", { plan: planLabel(p.plan), provider, status: paidStatusLabel(p.status) })} · ${Number.isFinite(p.periodEnd) ? fmtDate(p.periodEnd) : t("notSet")}`
          })
        );
        paidBlock.appendChild(el("p", { className: "muted admin-small", text: t("paidHint", { provider }) }));
      });
    }

    const noticeNode = notice
      ? el("p", { className: "admin-message", "data-tone": notice.tone || "ok", role: "status", tabindex: "-1", text: notice.text })
      : null;

    out.replaceChildren(
      ...[noticeNode, head, facts, grantsBlock, paidBlock, el("div", { className: "controls-row" }, [giveMoreButton(account.email)])].filter(Boolean)
    );
  }

  /**
   * Whatever else keeps this person on Pro once one grant goes: other gifts
   * or a trial still running or yet to start, and paid subscriptions.
   * @param {Object} data The lookup the button was drawn from.
   * @param {Object} grant The grant about to go.
   * @returns {string[]} One phrase per other source of access.
   */
  function otherAccess(data, grant) {
    const now = nowSec();
    const phrases = [];
    (data && Array.isArray(data.grants) ? data.grants : []).forEach((g) => {
      if (g.id === grant.id || (g.status !== "active" && g.status !== "scheduled")) return;
      phrases.push(t("otherUntil", { kind: sourceLabel(g), date: fmtDate(g.endsAt) }));
    });
    (data && Array.isArray(data.paid) ? data.paid : []).forEach((p) => {
      const kind = `${kindLabel("paid")} ${providerLabel(p.provider)}`.trim();
      if (!Number.isFinite(p.periodEnd)) phrases.push(t("otherOpen", { kind }));
      else if (p.periodEnd > now) phrases.push(t("otherUntil", { kind, date: fmtDate(p.periodEnd) }));
    });
    return phrases;
  }

  async function revokeGrant(email, grant, button, data) {
    const others = otherAccess(data, grant);
    const question = t("revokeConfirm", {
      email,
      kind: sourceLabel(grant),
      date: fmtDate(grant.endsAt),
      others: others.length ? t("revokeOthers", { list: others.join("; ") }) : ""
    });
    if (!window.confirm(question)) return;
    button.disabled = true;
    const res = await api("POST", "/v1/admin/grants/revoke", { grantId: grant.id }, { timeoutMs: 8000 });
    if (!res.ok) {
      button.disabled = false;
      const out = $("#lookup-result");
      out?.prepend(el("p", { className: "admin-message", "data-tone": "error", role: "alert", text: failureText(res) }));
      return;
    }
    const already = res.data && res.data.reason === "already_revoked";
    const fresh = await lookup(email);
    if (fresh) {
      const summary = entitlementLine(fresh.entitlement).text;
      renderAccount(fresh, { text: already ? t("alreadyRevoked") : t("revoked", { summary }), tone: "ok" });
      // The button that had focus is gone; put the reader on the outcome.
      $("#lookup-result .admin-message")?.focus();
    }
  }

  // ---------------------------------------------------------------- give

  async function give(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = $("#give-result");
    const email = ($("#give-email")?.value || "").trim();
    const days = Number($("#give-days")?.value);
    const note = ($("#give-note")?.value || "").trim();
    if (!isEmail(email)) return setMessage(result, t("badEmail"), "error");
    if (!Number.isInteger(days) || days < 1 || days > 3650) return setMessage(result, t("badDays"), "error");
    setBusy(form, true);
    setMessage(result, t("working"), "");
    const res = await api("POST", "/v1/admin/grants", { email, days, note }, { timeoutMs: 8000 });
    setBusy(form, false);
    if (res.status === 0) {
      // The request may have reached the worker and only the answer got
      // lost. Show the account instead of inviting a second gift.
      setMessage(result, t("giveMaybe"), "info");
      const lookupInput = $("#lookup-email");
      if (lookupInput) lookupInput.value = email;
      lookup(email);
      return;
    }
    if (!res.ok || !res.data || !res.data.grant) {
      setMessage(result, failureText(res), "error");
      return;
    }
    const grant = res.data.grant;
    const account = res.data.account || { email };
    // Show the account as it now stands, so the admin sees the real end date
    // rather than this one gift's.
    const lookupInput = $("#lookup-email");
    if (lookupInput) lookupInput.value = account.email;
    const fresh = await lookup(account.email);
    const end = fresh && fresh.entitlement && fresh.entitlement.periodEnd;
    const noChange = Number.isFinite(end) && end > grant.endsAt;
    const text = noChange
      ? t("givenNoChange", { email: account.email, date: fmtDate(end) })
      : t("given", { email: account.email, date: fmtDate(grant.endsAt) });
    setMessage(result, text, noChange ? "info" : "ok");
    if (fresh) renderAccount(fresh, { text, tone: noChange ? "info" : "ok" });
    const noteInput = $("#give-note");
    if (noteInput) noteInput.value = "";
  }

  // --------------------------------------------------------------- codes

  let newestCode = null;

  function codeState(code) {
    if (code.revokedAt) return { key: "revoked", text: t("codeRevoked") };
    if (Number.isFinite(code.expiresAt) && code.expiresAt <= nowSec()) return { key: "expired", text: t("codeExpired") };
    if (code.redeemedCount >= code.maxRedemptions) return { key: "usedup", text: t("codeUsedUp") };
    return { key: "active", text: t("codeActive") };
  }

  function renderCodes(codes) {
    const box = $("#code-list");
    if (!box) return;
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      box.replaceChildren(el("p", { className: "muted", text: t("noCodes") }));
      return;
    }
    const table = el("table", { className: "admin-table", "data-testid": "codes-table" });
    table.appendChild(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { scope: "col", text: t("colCode") }),
          el("th", { scope: "col", text: t("colDays") }),
          el("th", { scope: "col", text: t("colUsed") }),
          el("th", { scope: "col", text: t("colStatus") }),
          el("th", { scope: "col", text: t("colNote") }),
          el("th", { scope: "col", text: t("colCreated") }),
          el("th", { scope: "col", text: t("colAction") })
        ])
      ])
    );
    const body = el("tbody");
    list.forEach((code) => {
      const state = codeState(code);
      let action = el("span", { className: "muted", text: t("notSet") });
      if (state.key === "active") {
        action = el("button", { type: "button", className: "btn btn-danger btn-sm", "data-code": code.code, text: t("codeRevoke") });
        action.addEventListener("click", () => revokeCode(code.code, action));
      }
      body.appendChild(
        el("tr", { "data-status": state.key }, [
          el("td", { "data-label": t("colCode") }, [el("code", { text: code.code })]),
          el("td", { "data-label": t("colDays"), text: String(code.days) }),
          el("td", { "data-label": t("colUsed"), text: `${code.redeemedCount}/${code.maxRedemptions}` }),
          el("td", { "data-label": t("colStatus") }, [el("span", { className: `admin-pill st-${state.key}`, text: state.text })]),
          el("td", { "data-label": t("colNote"), text: code.note || t("notSet") }),
          el("td", { "data-label": t("colCreated"), text: fmtDate(code.createdAt) }),
          el("td", { "data-label": t("colAction") }, [action])
        ])
      );
    });
    table.appendChild(body);
    box.replaceChildren(table);
  }

  /**
   * Re-read the codes list. When that fails, say so under the form, keeping
   * whatever the form already reported.
   * @param {string} [lead] Sentence to keep in front of the failure.
   * @returns {Promise<Object>} Response.
   */
  async function reloadCodes(lead) {
    const res = await api("GET", "/v1/admin/gift-codes", null, { timeoutMs: 8000 });
    if (res.ok) {
      renderCodes(res.data && res.data.giftCodes);
    } else {
      const stale = t("codesStale", { failure: failureText(res) });
      setMessage($("#code-result"), lead ? `${lead}\n${stale}` : stale, "error");
    }
    return res;
  }

  async function createCode(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = $("#code-result");
    const days = Number($("#code-days")?.value);
    const uses = Number($("#code-uses")?.value);
    const note = ($("#code-note")?.value || "").trim();
    if (!Number.isInteger(days) || days < 1 || days > 3650) return setMessage(result, t("badDays"), "error");
    if (!Number.isInteger(uses) || uses < 1 || uses > 1000) return setMessage(result, t("badUses"), "error");
    setBusy(form, true);
    const res = await api("POST", "/v1/admin/gift-codes", { days, maxRedemptions: uses, note }, { timeoutMs: 8000 });
    setBusy(form, false);
    if (res.status === 0) {
      setMessage(result, t("codeMaybe"), "info");
      await reloadCodes(t("codeMaybe"));
      return;
    }
    if (!res.ok || !res.data || !res.data.giftCode) {
      setMessage(result, failureText(res), "error");
      return;
    }
    newestCode = res.data.giftCode;
    const box = $("#code-new");
    if (box) box.hidden = false;
    const value = $("#code-new-value");
    if (value) value.textContent = newestCode.code;
    setMessage($("#code-copy-status"), "", "");
    const created = t("codeCreated", { days: newestCode.days, uses: newestCode.maxRedemptions });
    setMessage(result, created, "ok");
    const noteInput = $("#code-note");
    if (noteInput) noteInput.value = "";
    await reloadCodes(created);
  }

  async function copyText(text) {
    const status = $("#code-copy-status");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(status, t("copied"), "ok");
    } catch {
      setMessage(status, t("copyFailed"), "error");
    }
  }

  function siteUrl() {
    return new URL("./", window.location.href).href;
  }

  async function revokeCode(code, button) {
    if (!window.confirm(t("codeRevokeConfirm", { code }))) return;
    button.disabled = true;
    const res = await api("POST", "/v1/admin/gift-codes/revoke", { code }, { timeoutMs: 8000 });
    if (!res.ok) {
      button.disabled = false;
      setMessage($("#code-result"), failureText(res), "error");
      return;
    }
    const done = t("codeRevokedMsg", { code });
    setMessage($("#code-result"), done, "ok");
    // The button that had focus is about to be redrawn away.
    $("#code-result")?.focus();
    await reloadCodes(done);
  }

  // --------------------------------------------------------- maintenance

  async function loadHealth() {
    const list = $("#health-list");
    if (!list) return;
    const res = await api("GET", "/v1/health", null, { auth: false, timeoutMs: 8000 });
    if (!res.ok || !res.data) {
      list.replaceChildren(el("li", { "data-tone": "error", text: t("healthUnreachable") }));
      return;
    }
    const h = res.data;
    const methods = h.authMethods || {};
    const rows = [
      [t("healthAccounts"), !!h.accountsConfigured],
      [t("healthSigning"), !!h.signingKeyConfigured],
      [t("healthGoogle"), !!methods.google],
      [t("healthEmail"), !!methods.email],
      [t("healthPayments"), !!(h.mercadopagoConfigured || h.stripeConfigured)]
    ];
    list.replaceChildren(
      ...rows.map(([label, on]) =>
        el("li", { "data-tone": on ? "on" : "off" }, [
          el("span", { className: "admin-dot", "aria-hidden": "true" }),
          `${label}: `,
          el("strong", { text: on ? t("healthOn") : t("healthOff") })
        ])
      ),
      el("li", { className: "muted", text: t("healthOrigin", { origin: h.siteOrigin || t("notSet") }) })
    );
  }

  async function sweep() {
    const button = $("#sweep-run");
    const result = $("#sweep-result");
    if (button) button.disabled = true;
    const res = await api("POST", "/v1/admin/sweep", {}, { timeoutMs: 15000 });
    if (button) button.disabled = false;
    setMessage(result, res.ok ? t("sweepDone") : failureText(res), res.ok ? "ok" : "error");
  }

  // ---------------------------------------------------------------- wire

  function bind() {
    $("#admin-lang")?.addEventListener("click", () => {
      lang = lang === "es" ? "en" : "es";
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        /* private mode */
      }
      applyStaticText();
      // Redraw what was built from data in the old language.
      if (gate === "admin") {
        if (lastLookup) renderAccount(lastLookup);
        reloadCodes();
        loadHealth();
      } else {
        showGate(gate, gate === "notAdmin" ? adminEmail : undefined);
      }
    });
    $("#admin-signout")?.addEventListener("click", () => {
      // signOut() drops the session before it tells the worker, so the page
      // can move on without waiting for that call.
      window.VTAccount.signOut();
      showGate("signedOut");
    });
    $("#codes-refresh")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      setMessage($("#code-result"), "", "");
      await reloadCodes();
      button.disabled = false;
    });
    $("#gate-retry")?.addEventListener("click", () => boot());
    $("#lookup-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      lookup($("#lookup-email")?.value);
    });
    $("#give-form")?.addEventListener("submit", give);
    document.querySelectorAll(".admin-chips [data-days]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const input = $("#give-days");
        if (input) input.value = chip.getAttribute("data-days");
      });
    });
    $("#code-form")?.addEventListener("submit", createCode);
    $("#code-copy")?.addEventListener("click", () => newestCode && copyText(newestCode.code));
    $("#code-copy-message")?.addEventListener("click", () => {
      if (!newestCode) return;
      copyText(t("codeMessage", { days: newestCode.days, url: siteUrl(), code: newestCode.code }));
    });
    $("#health-refresh")?.addEventListener("click", loadHealth);
    $("#sweep-run")?.addEventListener("click", sweep);
  }

  applyStaticText();
  bind();
  boot();

  window.VTAdmin = { boot, lookup, t };
})();
