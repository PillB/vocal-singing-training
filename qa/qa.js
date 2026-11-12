/**
 * The QA page (qa/index.html): what is live, what to test, and what you found.
 *
 * Three jobs, in the order a tester needs them:
 *
 * 1. **Say what is live.** The build stamp, the browser, and what the worker
 *    answers at `/v1/health`. A tester should never have to ask whether a fix
 *    is deployed or whether sign-in is switched on in this build, and neither
 *    should we.
 * 2. **Say what to look at.** The charters below are short sessions written for
 *    somebody who knows nothing about the code. Each check is a thing you can
 *    see, not a thing you have to reason about. What you tick is kept in this
 *    browser, so a pass can be done over several sittings.
 * 3. **Make the finding easy to send.** Every check has a button that opens the
 *    same report dialog as the rest of the site, with that check's words
 *    already in the first line and the right area selected.
 *
 * This page sends no statistics, exactly like admin.html: what a tester does
 * here must not enter the funnel the admin panel reads.
 */
(function (global) {
  "use strict";

  /** Where the ticks live. Per browser, never sent anywhere. */
  const RUN_KEY = "vt_qa_run_v1";

  /**
   * The charters. Each is five to ten minutes. `area` is the report area the
   * dialog opens on, so a finding lands filed correctly without the tester
   * having to choose.
   */
  const CHARTERS = [
    {
      id: "arranque",
      area: "site",
      title: "Llegar y entender qué es esto",
      titleEn: "Arriving, and understanding what this is",
      goal: "Alguien que llega por primera vez entiende en medio minuto para qué sirve el sitio y qué tocar primero.",
      goalEn: "Somebody arriving for the first time understands in half a minute what the site is for and what to tap first.",
      checks: [
        "Abre el sitio en una ventana nueva o en privado: el recorrido guiado aparece y se puede cerrar.",
        "Sin leer nada más, sabrías cuál es el primer botón que hay que tocar.",
        "Cambia el idioma con el botón de arriba: todo el texto cambia y no queda nada en el otro idioma.",
        "Recarga la página: sigue en el idioma que elegiste.",
        "Nada se sale de la pantalla a lo ancho: no hay que desplazar en horizontal en ningún momento.",
        "Los botones son lo bastante grandes para tocarlos con el pulgar sin fallar."
      ],
      checksEn: [
        "Open the site in a new or private window: the guided tour appears and can be closed.",
        "Without reading anything else, you would know which button to tap first.",
        "Switch the language with the button at the top: all the text changes, with nothing left in the other language.",
        "Reload the page: it is still in the language you chose.",
        "Nothing runs off the side of the screen: you never have to scroll sideways.",
        "The buttons are big enough to hit with a thumb without missing."
      ]
    },
    {
      id: "primera",
      area: "practice",
      title: "Tu primera práctica, de principio a fin",
      titleEn: "Your first practice, start to finish",
      goal: "Se puede grabar un ejercicio sin ayuda y ver qué tal salió.",
      goalEn: "You can record an exercise unaided and see how it went.",
      checks: [
        "Elige un ejercicio del catálogo: se abre su pantalla con la guía.",
        "Abre la guía plegada: los pasos están en el idioma del sitio, completos, no a medias en inglés.",
        "Toca Empezar: el navegador pide permiso al micrófono.",
        "Da el permiso y habla o canta: algo se mueve en pantalla y reacciona a tu voz.",
        "Habla a volumen normal: el medidor no se queda clavado en cero ni pegado al máximo.",
        "Termina la práctica: te deja puntuarla y la guarda.",
        "Vuelve al inicio y entra otra vez: la práctica que acabas de guardar aparece en el historial.",
        "Repite el mismo ejercicio: nada se rompe ni se duplica raro."
      ],
      checksEn: [
        "Pick an exercise from the catalog: its screen opens with the guide.",
        "Open the folded guide: the steps are in the site's language, complete, not half in English.",
        "Tap Start: the browser asks for microphone permission.",
        "Grant it and speak or sing: something on screen moves and reacts to your voice.",
        "Speak at a normal volume: the meter is not stuck at zero or pinned at the top.",
        "Finish the practice: it lets you rate it and saves it.",
        "Go back home and in again: the practice you just saved is in the history.",
        "Repeat the same exercise: nothing breaks or duplicates oddly."
      ]
    },
    {
      id: "micro",
      area: "audio",
      title: "Micrófono: permisos, silencios y auriculares",
      titleEn: "Microphone: permissions, silence and headphones",
      goal: "El sitio dice la verdad sobre el micrófono en todos los casos, incluido cuando se le dice no.",
      goalEn: "The site tells the truth about the microphone in every case, including when you say no.",
      checks: [
        "Niega el permiso al micrófono: el sitio lo explica y dice cómo volver a darlo, en lugar de quedarse esperando.",
        "Da el permiso y luego quítalo desde el navegador, sin recargar: el sitio se da cuenta.",
        "Con los auriculares puestos y luego sin ellos: en los dos casos detecta tu voz.",
        "En un sitio silencioso, quédate callado: no inventa que estás cantando.",
        "Pon música de fondo: no cuenta la música como tu voz (o al menos no afirma que lo hiciste bien).",
        "En el móvil, con el teléfono en silencio: el sonido del piano o del metrónomo se comporta como esperas.",
        "Deja la práctica abierta un par de minutos sin hablar: no se cuelga ni se calienta el teléfono de forma absurda."
      ],
      checksEn: [
        "Deny microphone permission: the site explains it and says how to grant it again, instead of waiting forever.",
        "Grant it, then revoke it in the browser without reloading: the site notices.",
        "With headphones on, and then without them: it detects your voice in both cases.",
        "In a quiet room, stay silent: it does not invent that you are singing.",
        "Play music in the background: it does not count the music as your voice (or at least does not claim you did well).",
        "On a phone with the ringer on silent: the piano or metronome sound behaves the way you expect.",
        "Leave a practice open for a couple of minutes without speaking: it does not hang or heat the phone absurdly."
      ]
    },
    {
      id: "progreso",
      area: "progress",
      title: "Tu progreso: que no se pierda",
      titleEn: "Your progress: that it does not get lost",
      goal: "Lo que practicaste sigue ahí después de cerrar, recargar y volver mañana.",
      goalEn: "What you practised is still there after closing, reloading and coming back tomorrow.",
      checks: [
        "Guarda dos prácticas y mira el historial: están las dos, con sus fechas correctas.",
        "Cierra la pestaña y vuelve a abrir el sitio: el historial sigue completo.",
        "Mira el resumen y los logros: los números cuadran con lo que practicaste.",
        "Crea un segundo perfil y cambia entre los dos: cada uno tiene su propio historial.",
        "Pon un recordatorio desde la tarjeta de la semana: dice cuándo avisará.",
        "Borra una práctica: desaparece del historial y los números se ajustan."
      ],
      checksEn: [
        "Save two practices and look at the history: both are there, with the right dates.",
        "Close the tab and open the site again: the history is still complete.",
        "Look at the summary and the achievements: the numbers match what you practised.",
        "Create a second profile and switch between the two: each has its own history.",
        "Set a reminder from the week card: it says when it will tell you.",
        "Delete a practice: it leaves the history and the numbers adjust."
      ]
    },
    {
      id: "cuenta",
      area: "account",
      title: "Entrar, salir y volver",
      titleEn: "Signing in, out and back",
      goal: "Entrar funciona con lo que este deploy ofrezca, y salir deja el navegador limpio.",
      goalEn: "Signing in works with whatever this deploy offers, and signing out leaves the browser clean.",
      checks: [
        "Abre el panel de cuenta: ofrece exactamente las formas de entrar que dice «Entrar con» arriba en esta página.",
        "Entra: el panel dice con qué correo entraste.",
        "Recarga: sigues dentro.",
        "Sal: el panel vuelve a ofrecer entrar, y si tenías Pro por regalo ya no se ve como Pro.",
        "Entra otra vez con el mismo correo: tu progreso y tu acceso vuelven.",
        "Intenta entrar con un código de regalo inventado: lo rechaza con una frase clara, no con un error técnico.",
        "Si tienes un código de regalo real, cánjealo: dice cuántos días te dio."
      ],
      checksEn: [
        "Open the account panel: it offers exactly the ways in that “Sign in with” at the top of this page names.",
        "Sign in: the panel says which address you signed in with.",
        "Reload: you are still in.",
        "Sign out: the panel offers signing in again, and if you had gifted Pro it no longer shows as Pro.",
        "Sign in again with the same address: your progress and your access come back.",
        "Try a made-up gift code: it refuses with a clear sentence, not a technical error.",
        "If you have a real gift code, redeem it: it says how many days it gave you."
      ]
    },
    {
      id: "pro",
      area: "payment",
      title: "Pro y el panel de precios (sin comprar nada)",
      titleEn: "Pro and the pricing panel (buying nothing)",
      goal: "El panel de precios explica el plan con honestidad y no intenta cobrar, porque todavía no se puede.",
      goalEn: "The pricing panel explains the plan honestly and does not try to charge, because it cannot yet.",
      checks: [
        "Abre el panel de precios: dice qué incluye Pro y qué cuesta.",
        "No hay ningún botón que intente cobrar. Si lo hay, repórtalo de inmediato.",
        "Los precios del panel coinciden con los de la página de términos.",
        "Abre los términos desde el pie de página: se lee, dice cómo se cancela y cómo se devuelve un pago.",
        "Si no tienes Pro, mira qué está bloqueado: lo bloqueado se explica, no se queda en silencio.",
        "Si tienes Pro por regalo, mira que lo bloqueado se desbloquee de verdad.",
        "Pide Pro sin haber entrado: te pide entrar primero, en lugar de dejarte pagar sin cuenta."
      ],
      checksEn: [
        "Open the pricing panel: it says what Pro includes and what it costs.",
        "There is no button that tries to charge. If there is, report it immediately.",
        "The prices in the panel match the ones on the terms page.",
        "Open the terms from the footer: it reads well and says how to cancel and how a refund works.",
        "Without Pro, look at what is locked: a locked thing explains itself rather than going quiet.",
        "With gifted Pro, check that the locked things really unlock.",
        "Ask for Pro without being signed in: it asks you to sign in first, rather than letting you pay with no account."
      ]
    },
    {
      id: "privacidad",
      area: "site",
      title: "Privacidad: decir no y que se note",
      titleEn: "Privacy: saying no, and it sticking",
      goal: "Apagar las estadísticas es tan fácil como dejarlas, y la página dice la verdad sobre lo que envía.",
      goalEn: "Switching statistics off is as easy as leaving them on, and the page tells the truth about what it sends.",
      checks: [
        "Mira el pie de página: dice si este navegador está enviando estadísticas.",
        "Apágalas con el botón: la frase cambia y dice que ya no se envía.",
        "Recarga: sigue apagado.",
        "Abre la página de privacidad: dice qué se guarda, cuánto tiempo y a quién escribir.",
        "La página de privacidad menciona qué se guarda de un reporte de problema.",
        "Vuelve a encenderlas: también es un botón, no un trámite."
      ],
      checksEn: [
        "Look at the footer: it says whether this browser is sending statistics.",
        "Switch them off with the button: the sentence changes and says nothing is being sent.",
        "Reload: it is still off.",
        "Open the privacy page: it says what is kept, for how long, and who to write to.",
        "The privacy page mentions what a problem report keeps.",
        "Switch them back on: that is also one button, not a procedure."
      ]
    },
    {
      id: "interrumpir",
      area: "practice",
      title: "Interrumpir, irse y quedarse sin red",
      titleEn: "Interruptions, leaving, and losing the network",
      goal: "La vida real no rompe nada: una llamada, un cambio de pestaña, el metro sin señal.",
      goalEn: "Real life breaks nothing: a phone call, a tab switch, a tunnel with no signal.",
      checks: [
        "A media práctica, cambia de pestaña o de app y vuelve: la práctica sigue en pie.",
        "A media práctica, intenta salir de la pantalla: te pregunta si guardas antes de perderla.",
        "Gira el teléfono en plena práctica: no se descoloca nada.",
        "Pon el móvil en modo avión y practica: se puede practicar y guardar sin red.",
        "Vuelve a tener red estando con la sesión iniciada: el progreso se sincroniza sin pedirte nada.",
        "Bloquea la pantalla un minuto y vuelve: el sitio sigue donde estaba."
      ],
      checksEn: [
        "Mid-practice, switch tab or app and come back: the practice is still standing.",
        "Mid-practice, try to leave the screen: it asks whether to save before losing it.",
        "Rotate the phone mid-practice: nothing is knocked out of place.",
        "Put the phone in airplane mode and practise: you can practise and save with no network.",
        "Come back online while signed in: your progress syncs without asking you anything.",
        "Lock the screen for a minute and come back: the site is where you left it."
      ]
    },
    {
      id: "reportar",
      area: "site",
      title: "El propio reporte de problemas",
      titleEn: "The problem report itself",
      goal: "Contarnos algo funciona, y no pierde lo escrito ni cuando nuestro servidor falla.",
      goalEn: "Telling us something works, and does not lose what you wrote even when our server fails.",
      checks: [
        "Abre el diálogo desde el pie de página del estudio: aparece y se puede cerrar con Escape.",
        "Envía un reporte de prueba: te da un número VS-… y lo puedes copiar.",
        "Abre el diálogo otra vez a medio escribir y ciérralo: al volver a abrirlo, lo escrito sigue ahí.",
        "Elige «Una idea para mejorar»: el formulario cambia y ya no pide gravedad ni pasos.",
        "Mira «Qué adjuntamos automáticamente»: la lista coincide con lo que dice esta página.",
        "Con la sesión iniciada, pulsa «Ver mis reportes»: aparece el que acabas de enviar con su estado.",
        "En modo avión, envía un reporte: el diálogo te deja copiar el texto entero en lugar de perderlo."
      ],
      checksEn: [
        "Open the dialog from the studio's footer: it appears and closes with Escape.",
        "Send a test report: it gives you a VS-… number and you can copy it.",
        "Open the dialog half-written and close it: reopening it, what you wrote is still there.",
        "Pick “An idea to make it better”: the form changes and stops asking for severity and steps.",
        "Look at “What we attach automatically”: the list matches what this page says.",
        "Signed in, press “See my reports”: the one you just sent is there with its status.",
        "In airplane mode, send a report: the dialog lets you copy the whole text instead of losing it."
      ]
    }
  ];

  const $ = (sel) => document.querySelector(sel);

  /** Which language to draw in. */
  function lang() {
    try {
      return localStorage.getItem("vt_lang") === "en" ? "en" : "es";
    } catch {
      return "es";
    }
  }

  const EN = () => lang() === "en";

  /**
   * Build an element with text and attributes, never HTML.
   * @param {string} tag Tag name.
   * @param {Object} [attrs] Attributes; `text` sets textContent.
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

  /** What has been ticked, as `{ "charter:index": true }`. */
  function readRun() {
    try {
      const raw = localStorage.getItem(RUN_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeRun(run) {
    try {
      localStorage.setItem(RUN_KEY, JSON.stringify(run));
    } catch {
      /* private mode: the ticks simply are not kept */
    }
  }

  /** The checks of a charter in the page's language. */
  function checksOf(charter) {
    return (EN() && charter.checksEn) || charter.checks;
  }

  /** Say something in a live region, and say whether it went well. */
  function say(node, text, tone) {
    if (!node) return;
    node.textContent = text || "";
    node.dataset.tone = tone || "";
  }

  /**
   * Copy text, telling the truth about whether it worked.
   * @param {string} text Text.
   * @param {HTMLElement} node Where to say what happened.
   * @returns {Promise<void>} Resolves when said.
   */
  async function copy(text, node) {
    try {
      await navigator.clipboard.writeText(text);
      say(node, EN() ? "Copied." : "Copiado.", "ok");
    } catch {
      say(node, EN() ? "Could not copy. Select it and copy it by hand." : "No se pudo copiar. Selecciónalo y cópialo a mano.", "error");
    }
  }

  // ------------------------------------------------------------- the facts

  /** What the worker last said, so "copy this state" can include it. */
  let health = null;

  /** Yes/no in words, for a reader who is not reading JSON. */
  function yesNo(value) {
    if (value === true) return EN() ? "yes" : "sí";
    if (value === false) return EN() ? "no" : "no";
    return EN() ? "unknown" : "no se sabe";
  }

  /** Fill in the browser side of the facts, which needs no network. */
  function drawLocalFacts() {
    const env = (global.VTReports && global.VTReports.environment && global.VTReports.environment()) || {};
    const build = (() => {
      const own = document.querySelector('script[src*="qa.js"]');
      const match = own && /[?&]v=([^&]+)/.exec(own.getAttribute("src") || "");
      return match ? decodeURIComponent(match[1]) : EN() ? "unknown" : "no se sabe";
    })();
    const set = (id, text) => {
      const node = $(id);
      if (node) node.textContent = text;
    };
    set("#qa-build", build);
    set("#qa-ua", env.ua || (EN() ? "unknown" : "no se sabe"));
    set("#qa-screen", `${env.viewport || "?"}${env.screen ? ` (${EN() ? "screen" : "pantalla"} ${env.screen})` : ""}`);
  }

  /** Read `/v1/health` and say, in words, what this deploy has switched on. */
  async function loadHealth() {
    const set = (id, text) => {
      const node = $(id);
      if (node) node.textContent = text;
    };
    const A = global.VTAccount;
    if (!A || !A.isConfigured()) {
      health = null;
      set("#qa-worker", EN() ? "not configured on this site" : "no configurado en este sitio");
      ["#qa-auth", "#qa-trial", "#qa-reports", "#qa-events"].forEach((id) => set(id, "—"));
      return;
    }
    set("#qa-worker", EN() ? "checking…" : "comprobando…");
    const res = await A.request("GET", "/v1/health", null, { auth: false, timeoutMs: 8000 });
    if (!res || !res.ok || !res.data) {
      health = null;
      set("#qa-worker", EN() ? "could not be reached" : "no se pudo contactar");
      ["#qa-auth", "#qa-trial", "#qa-reports", "#qa-events"].forEach((id) => set(id, "—"));
      return;
    }
    health = res.data;
    const methods = health.authMethods || {};
    const ways = [];
    if (methods.google) ways.push("Google");
    if (methods.email) ways.push(EN() ? "a code by email" : "código por correo");
    set("#qa-worker", EN() ? "answering" : "responde");
    set("#qa-auth", ways.length ? ways.join(EN() ? " and " : " y ") : EN() ? "nothing switched on" : "nada encendido");
    const days = Number(methods.trialDays);
    set(
      "#qa-trial",
      Number.isFinite(days) && days > 0
        ? EN()
          ? `${days} days`
          : `${days} días`
        : EN()
          ? "unknown"
          : "no se sabe"
    );
    // `reportsEnabled` is absent on a worker deployed before reports existed,
    // and saying "no" there would be a lie: the route is missing, not off.
    set(
      "#qa-reports",
      health.reportsEnabled === undefined
        ? EN()
          ? "this worker is older than the report route"
          : "este servidor es anterior a los reportes"
        : yesNo(health.reportsEnabled)
    );
    set(
      "#qa-events",
      health.eventsEnabled === undefined
        ? EN()
          ? "this worker is older than the statistics"
          : "este servidor es anterior a las estadísticas"
        : yesNo(health.eventsEnabled)
    );
  }

  /** The state above as plain text, for pasting into a report or a message. */
  function stateText() {
    const env = (global.VTReports && global.VTReports.environment && global.VTReports.environment()) || {};
    const lines = [
      `${EN() ? "Build" : "Build"}: ${$("#qa-build") ? $("#qa-build").textContent : "?"}`,
      `${EN() ? "Browser" : "Navegador"}: ${env.ua || "?"}`,
      `${EN() ? "Screen" : "Pantalla"}: ${env.viewport || "?"}${env.screen ? ` (${env.screen})` : ""}`,
      `${EN() ? "Language" : "Idioma"}: ${lang()}`
    ];
    if (health) {
      const methods = health.authMethods || {};
      lines.push(
        `${EN() ? "Worker" : "Servidor"}: ${EN() ? "answering" : "responde"}`,
        `${EN() ? "Accounts" : "Cuentas"}: ${yesNo(health.accountsConfigured)}`,
        `${EN() ? "Sign-in" : "Entrar"}: google=${yesNo(methods.google)} email=${yesNo(methods.email)}`,
        `${EN() ? "Trial days" : "Días de prueba"}: ${methods.trialDays === undefined ? "?" : methods.trialDays}`,
        `${EN() ? "Reports" : "Reportes"}: ${health.reportsEnabled === undefined ? "n/a" : yesNo(health.reportsEnabled)}`,
        `${EN() ? "Statistics" : "Estadísticas"}: ${health.eventsEnabled === undefined ? "n/a" : yesNo(health.eventsEnabled)}`
      );
    } else {
      lines.push(`${EN() ? "Worker" : "Servidor"}: ${EN() ? "no answer" : "sin respuesta"}`);
    }
    return lines.join("\n");
  }

  // ----------------------------------------------------------- the charters

  /** Draw every charter, with what has been ticked already. */
  function drawCharters() {
    const box = $("#qa-charters");
    if (!box) return;
    const run = readRun();
    const nodes = CHARTERS.map((charter) => {
      const checks = checksOf(charter);
      const done = checks.filter((_, index) => run[`${charter.id}:${index}`]).length;
      const card = el("section", { className: "qa-charter", "data-charter": charter.id });
      card.appendChild(
        el("h3", {}, [
          el("span", { text: EN() && charter.titleEn ? charter.titleEn : charter.title }),
          el("span", { className: "qa-count", text: `${done}/${checks.length}` })
        ])
      );
      card.appendChild(el("p", { className: "qa-goal", text: EN() && charter.goalEn ? charter.goalEn : charter.goal }));
      const list = el("ul", { className: "qa-checks" });
      checks.forEach((text, index) => {
        const key = `${charter.id}:${index}`;
        const box2 = el("input", { type: "checkbox", id: `qa-${key.replace(":", "-")}` });
        box2.checked = !!run[key];
        box2.addEventListener("change", () => {
          const current = readRun();
          if (box2.checked) current[key] = true;
          else delete current[key];
          writeRun(current);
          drawCharters();
        });
        const report = el("button", {
          type: "button",
          className: "btn btn-ghost btn-sm qa-report",
          text: EN() ? "Report this" : "Reportar esto"
        });
        report.addEventListener("click", () => {
          if (!global.VTReports) return;
          global.VTReports.open({ kind: "bug", area: charter.area, summary: text });
        });
        list.appendChild(
          el("li", { "data-done": box2.checked ? "1" : "0" }, [
            el("label", { for: box2.id }, [box2, el("span", { text })]),
            report
          ])
        );
      });
      card.appendChild(list);
      return card;
    });
    box.replaceChildren(...nodes);
  }

  /** What was and was not ticked, as a message a tester can send us. */
  function runText() {
    const run = readRun();
    const lines = [EN() ? "Test pass" : "Ronda de pruebas", "", stateText(), ""];
    let anyDone = false;
    CHARTERS.forEach((charter) => {
      const checks = checksOf(charter);
      const done = [];
      const left = [];
      checks.forEach((text, index) => (run[`${charter.id}:${index}`] ? done : left).push(text));
      if (!done.length) return;
      anyDone = true;
      lines.push(`## ${EN() && charter.titleEn ? charter.titleEn : charter.title} — ${done.length}/${checks.length}`);
      done.forEach((text) => lines.push(`  [x] ${text}`));
      left.forEach((text) => lines.push(`  [ ] ${text}`));
      lines.push("");
    });
    if (!anyDone) {
      lines.push(EN() ? "(nothing ticked yet)" : "(todavía no marqué nada)");
    }
    return lines.join("\n");
  }

  function bind() {
    $("#qa-refresh")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      await loadHealth();
      drawLocalFacts();
      button.disabled = false;
    });
    $("#qa-copy-state")?.addEventListener("click", () => copy(stateText(), $("#qa-state-msg")));
    $("#qa-copy-run")?.addEventListener("click", () => copy(runText(), $("#qa-run-msg")));
    $("#qa-reset-run")?.addEventListener("click", () => {
      // No confirmation dialog: it clears ticks in this browser and nothing
      // else, and a tester who did it by accident loses a few taps.
      writeRun({});
      drawCharters();
      say($("#qa-run-msg"), EN() ? "Ticks cleared." : "Marcas borradas.", "ok");
    });
  }

  drawLocalFacts();
  drawCharters();
  bind();
  loadHealth();

  global.VTQa = { CHARTERS, runText, stateText, drawCharters };
})(window);
