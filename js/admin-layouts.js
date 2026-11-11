/**
 * Admin page: the site-designs dashboard, the at-a-glance strip, and a section
 * bar that stays in reach and shows where you are.
 *
 * Reads GET /v1/admin/layouts (workers/entitlements/src/layouts.js). What it
 * shows is what visitors chose and used — a preference, never a winner: the
 * worker says so in `readMe`, and this page repeats it above the numbers
 * rather than under them.
 *
 * Kept apart from js/admin.js on purpose (it loads after it and touches none
 * of its functions). Everything drawn from data goes through textContent or
 * SVG attributes built here from numbers; nothing a browser sent is ever
 * parsed as markup, because whatever lands in this page runs with an admin's
 * session.
 */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  /** Validated against the card surface for colour-blind separation (blue/orange). */
  const COLORS = { a: "#3987e5", b: "#d95926" };
  const VERSIONS = ["a", "b"];

  const STR = {
    es: {
      navLayouts: "Diseños",
      title: "Diseños del sitio",
      lead: "Qué diseño usa la gente (A · Clásico o B · Enfocado), cuánto tiempo y si vuelve. Cada visitante elige con el control de arriba del sitio, así que esto es una preferencia, no una prueba A/B: quien cambia de diseño no se parece a quien nunca toca el control. Cuenta navegadores, nunca personas.",
      window: "Periodo en días",
      load: "Leer diseños",
      loading: "Leyendo…",
      missing: "El servidor aún no tiene esta lectura: hay que volver a desplegarlo (guía de admin, 8.7). El sitio ya funciona; solo falta el recuento.",
      offline: "No se pudo contactar al servidor.",
      forbidden: "Esta cuenta no es administradora.",
      sessionGone: "La sesión terminó. Vuelve a entrar.",
      generic: "El servidor respondió {reason}.",
      empty: "Todavía no llegó ninguna visita con diseño en estos {days} días. Los navegadores automáticos, los que tienen las estadísticas apagadas y los que no han respondido al aviso en Europa no envían nada.",
      readAt: "Leído a las {time} · últimos {days} días",
      nameA: "A · Clásico",
      nameB: "B · Enfocado",
      visits: "Visitas",
      browsers: "Navegadores",
      time: "Tiempo en uso",
      perVisit: "Por visita",
      cameBack: "Volvieron",
      cameBackOf: "{k} de {n}",
      range: "entre {lo} y {hi}",
      multiday: "Otro día",
      none: "—",
      shareTitle: "Reparto",
      shareTime: "Tiempo en uso",
      shareVisits: "Visitas",
      shareNone: "sin datos",
      dailyTitle: "Visitas por día",
      dailyTable: "Ver como tabla",
      day: "Día",
      design: "Diseño",
      seconds: "Tiempo",
      switchesTitle: "Cambios de diseño",
      switchesNone: "Nadie usó el control en este periodo.",
      switchers: "{n} navegadores usaron el control.",
      switchers_one: "1 navegador usó el control.",
      from: "De",
      to: "A",
      times: "Veces",
      sourceTitle: "Cómo empezó cada visita",
      srcDefault: "Diseño por defecto",
      srcChosen: "Lo eligió",
      srcLink: "Llegó por un enlace",
      caveatTitle: "Cómo leerlo",
      caveat1: "Quien elige un diseño ya es distinto de quien no elige: más tiempo en B no demuestra que B sea mejor.",
      caveat2: "Casi nadie toca un control: el reparto mide sobre todo cuál es el diseño por defecto.",
      caveat3: "El tiempo es un mínimo: si el navegador cierra la página sin avisar, ese tramo se pierde. Pestañas ocultas y páginas sin uso durante cinco minutos no cuentan; cantar sí.",
      caveat4: "La comparación justa es la prueba «site_layout_2026_11» (reparte el diseño por defecto al azar). Está apagada hasta que la enciendas en js/experiments-config.js; su resultado se lee en el panel de cuenta del estudio.",
      ignored: "{n} visitas llegaron con un diseño que el sitio no tiene (una página vieja en caché o alguien escribiendo al servidor) y no se contaron.",
      csv: "Descargar CSV",
      glanceTitle: "De un vistazo",
      glanceServer: "Servidor",
      glanceStats: "Estadísticas",
      glanceLayouts: "Lectura de diseños",
      on: "activo",
      off: "apagado",
      old: "servidor antiguo",
      down: "sin respuesta",
      ready: "disponible",
      hours: "{h} h {m} min",
      minutes: "{m} min",
      secs: "{s} s",
      chartLabel: "Visitas por día y diseño. La tabla de abajo tiene los mismos números.",
      tipVisits: "{day} · {name}: {n} visitas, {time}"
    },
    en: {
      navLayouts: "Designs",
      title: "Site designs",
      lead: "Which design people use (A · Classic or B · Focused), for how long, and whether they come back. Each visitor picks with the control at the top of the site, so this is a preference, not an A/B test: people who switch are not like people who never touch the control. It counts browsers, never people.",
      window: "Window in days",
      load: "Read designs",
      loading: "Reading…",
      missing: "The server does not have this readout yet: it needs a redeploy (admin guide, 8.7). The site already works; only the count is missing.",
      offline: "Could not reach the server.",
      forbidden: "This account is not an admin.",
      sessionGone: "The session ended. Sign in again.",
      generic: "The server answered {reason}.",
      empty: "No visit with a design arrived in these {days} days. Automated browsers, browsers with statistics switched off and those that have not answered the notice in Europe send nothing.",
      readAt: "Read at {time} · last {days} days",
      nameA: "A · Classic",
      nameB: "B · Focused",
      visits: "Visits",
      browsers: "Browsers",
      time: "Time in use",
      perVisit: "Per visit",
      cameBack: "Came back",
      cameBackOf: "{k} of {n}",
      range: "between {lo} and {hi}",
      multiday: "Another day",
      none: "—",
      shareTitle: "Split",
      shareTime: "Time in use",
      shareVisits: "Visits",
      shareNone: "no data",
      dailyTitle: "Visits per day",
      dailyTable: "View as a table",
      day: "Day",
      design: "Design",
      seconds: "Time",
      switchesTitle: "Design changes",
      switchesNone: "Nobody used the control in this window.",
      switchers: "{n} browsers used the control.",
      switchers_one: "1 browser used the control.",
      from: "From",
      to: "To",
      times: "Times",
      sourceTitle: "How each visit began",
      srcDefault: "Default design",
      srcChosen: "Chose it",
      srcLink: "Came by a link",
      caveatTitle: "How to read it",
      caveat1: "Someone who picks a design already differs from someone who does not: more time on B does not show B is better.",
      caveat2: "Hardly anyone touches a control: the split mostly measures which design is the default.",
      caveat3: "Time is a minimum: if the browser closes the page without notice, that stretch is lost. Hidden tabs and pages idle for five minutes do not count; singing does.",
      caveat4: "The fair comparison is the experiment \"site_layout_2026_11\" (it deals the default design at random). It is off until you switch it on in js/experiments-config.js; its result is read in the studio's account panel.",
      ignored: "{n} visits arrived with a design the site does not have (an old cached page, or somebody posting at the server) and were not counted.",
      csv: "Download CSV",
      glanceTitle: "At a glance",
      glanceServer: "Server",
      glanceStats: "Statistics",
      glanceLayouts: "Design readout",
      on: "on",
      off: "off",
      old: "old server",
      down: "no answer",
      ready: "available",
      hours: "{h} h {m} min",
      minutes: "{m} min",
      secs: "{s} s",
      chartLabel: "Visits per day and design. The table below holds the same numbers.",
      tipVisits: "{day} · {name}: {n} visits, {time}"
    }
  };

  const state = { days: 28, seq: 0, data: null, asked: false, readAt: null, error: "" };

  function lang() {
    try {
      return localStorage.getItem("vt_lang") === "en" ? "en" : "es";
    } catch {
      return "es";
    }
  }

  function t(key, vars) {
    const table = STR[lang()];
    let text = table[key] === undefined ? STR.es[key] : table[key];
    if (text === undefined) return key;
    Object.entries(vars || {}).forEach(([name, value]) => {
      text = text.split(`{${name}}`).join(String(value));
    });
    return text;
  }

  const $ = (sel) => document.querySelector(sel);

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    fill(node, attrs, children);
    return node;
  }

  function svg(tag, attrs, children) {
    const node = document.createElementNS(SVG_NS, tag);
    fill(node, attrs, children);
    return node;
  }

  function fill(node, attrs, children) {
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === "text") node.textContent = String(value);
      else node.setAttribute(key === "className" ? "class" : key, value === true ? "" : String(value));
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
  }

  // ------------------------------------------------------------ formatting

  function count(n) {
    return Number(n || 0).toLocaleString(lang() === "en" ? "en-US" : "es-PE");
  }

  function pct(x) {
    if (x === null || x === undefined || !Number.isFinite(Number(x))) return t("none");
    return `${Math.round(Number(x) * 100)}%`;
  }

  /** Seconds as "1 h 5 min", "12 min" or "40 s": a duration, never a clock time. */
  function duration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (s >= 3600) return t("hours", { h: count(Math.floor(s / 3600)), m: Math.floor((s % 3600) / 60) });
    if (s >= 60) return t("minutes", { m: Math.floor(s / 60) });
    return t("secs", { s });
  }

  function name(ver) {
    return ver === "b" ? t("nameB") : t("nameA");
  }

  function swatch(ver) {
    return el("span", { className: "lay-swatch", "data-ver": ver, "aria-hidden": "true" });
  }

  // ------------------------------------------------------------ reading

  function failure(res) {
    if (!res || res.status === 0) return t("offline");
    if (res.status === 404) return t("missing");
    if (res.status === 401) return t("sessionGone");
    if (res.status === 403) return t("forbidden");
    return t("generic", { reason: (res.data && res.data.reason) || res.status });
  }

  async function load() {
    const box = $("#layouts-result");
    const button = $("#layouts-load");
    if (!box || !window.VTAccount) return;
    const seq = ++state.seq;
    state.asked = true;
    state.data = null;
    state.error = "";
    if (button) button.disabled = true;
    box.replaceChildren(el("p", { className: "muted", text: t("loading") }));
    const res = await window.VTAccount.request("GET", `/v1/admin/layouts?days=${state.days}`, null, {
      timeoutMs: 15000
    });
    if (seq !== state.seq) return;
    if (button) button.disabled = false;
    if (!res.ok || !res.data || !Array.isArray(res.data.versions)) {
      state.error = failure(res);
      render();
      // A dead session is the whole page's business: js/admin.js's own probe
      // puts the sign-in back.
      if (res && res.status === 401) window.VTAdmin?.boot?.();
      return;
    }
    state.data = res.data;
    state.readAt = new Date();
    render();
  }

  // ------------------------------------------------------------ drawing

  function versionOf(data, ver) {
    return (data.versions || []).find((v) => v.ver === ver) || { ver, bySource: {} };
  }

  function stat(label, value, sub) {
    return el("div", { className: "lay-stat" }, [
      el("dt", { text: label }),
      el("dd", {}, [el("strong", { text: value }), sub ? el("span", { className: "lay-sub", text: sub }) : null])
    ]);
  }

  function backText(rate) {
    if (!rate || rate.rate === null || rate.rate === undefined) return null;
    return t("range", { lo: pct(rate.lo), hi: pct(rate.hi) });
  }

  function tile(v) {
    const repeat = v.repeat || {};
    const browsers = Number(v.browsers) || 0;
    return el("section", { className: "lay-tile", "data-ver": v.ver, "aria-label": name(v.ver) }, [
      el("h3", {}, [swatch(v.ver), name(v.ver)]),
      el("dl", { className: "lay-stats" }, [
        stat(t("visits"), count(v.sessions), `${count(browsers)} ${t("browsers").toLowerCase()}`),
        stat(t("time"), duration(v.seconds), v.secondsPerSession ? `${t("perVisit")}: ${duration(v.secondsPerSession)}` : null),
        stat(
          t("cameBack"),
          browsers ? pct(repeat.rate) : t("none"),
          browsers ? `${t("cameBackOf", { k: count(v.repeatBrowsers), n: count(browsers) })} · ${backText(repeat) || ""}` : null
        ),
        stat(t("multiday"), browsers ? count(v.multidayBrowsers) : t("none"), null)
      ])
    ]);
  }

  /** One bar split between the two designs, each part labelled with its share. */
  function shareBar(label, data, field) {
    const parts = VERSIONS.map((ver) => ({ ver, share: versionOf(data, ver)[field] }));
    const known = parts.some((p) => typeof p.share === "number");
    const bar = el("div", { className: "lay-share-bar", role: "img", "aria-label": shareLabel(label, parts, known) });
    if (known) {
      parts.forEach((p) => {
        const share = Math.max(0, Math.min(1, Number(p.share) || 0));
        if (share <= 0) return;
        bar.appendChild(
          el("span", { className: "lay-share-part", "data-ver": p.ver, style: `flex-grow:${(share * 1000).toFixed(0)}` })
        );
      });
    }
    return el("div", { className: "lay-share" }, [
      el("div", { className: "lay-share-head" }, [
        el("span", { text: label }),
        el("span", { className: "muted", text: known ? parts.map((p) => `${name(p.ver)} ${pct(p.share)}`).join(" · ") : t("shareNone") })
      ]),
      bar
    ]);
  }

  function shareLabel(label, parts, known) {
    if (!known) return `${label}: ${t("shareNone")}`;
    return `${label}: ${parts.map((p) => `${name(p.ver)} ${pct(p.share)}`).join(", ")}`;
  }

  /** The days of the series, oldest first, each with both designs' numbers. */
  function dailySeries(data) {
    const byDay = new Map();
    (data.daily || []).forEach((row) => {
      if (!VERSIONS.includes(row.ver) || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.day))) return;
      if (!byDay.has(row.day)) byDay.set(row.day, { day: row.day, a: { sessions: 0, seconds: 0 }, b: { sessions: 0, seconds: 0 } });
      byDay.get(row.day)[row.ver] = { sessions: Number(row.sessions) || 0, seconds: Number(row.seconds) || 0 };
    });
    return [...byDay.values()].sort((x, y) => (x.day < y.day ? -1 : 1));
  }

  /** A round number at or above the largest value, so the axis reads cleanly. */
  function niceMax(max) {
    if (max <= 5) return 5;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const lead = max / pow;
    const step = lead <= 1 ? 1 : lead <= 2 ? 2 : lead <= 5 ? 5 : 10;
    return step * pow;
  }

  function shortDay(day) {
    return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  }

  /**
   * Visits per day, the two designs side by side on one axis. Bars, because
   * a day's visits are a count, and the days are few enough to read each one.
   */
  function dailyChart(series) {
    const W = 640;
    const H = 220;
    const pad = { l: 34, r: 8, t: 10, b: 26 };
    const top = niceMax(Math.max(1, ...series.map((d) => Math.max(d.a.sessions, d.b.sessions))));
    const slot = (W - pad.l - pad.r) / series.length;
    const barW = Math.max(2, Math.min(18, (slot - 4) / 2 - 1));
    const y = (n) => pad.t + (H - pad.t - pad.b) * (1 - n / top);
    const tip = el("p", { className: "lay-tip muted", "aria-live": "off", text: " " });
    const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, className: "lay-chart", role: "img", "aria-label": t("chartLabel") });
    [0, top / 2, top].forEach((tick) => {
      chart.appendChild(svg("line", { x1: pad.l, x2: W - pad.r, y1: y(tick), y2: y(tick), className: "lay-grid" }));
      chart.appendChild(svg("text", { x: pad.l - 6, y: y(tick) + 4, "text-anchor": "end", className: "lay-axis", text: count(tick) }));
    });
    const labelEvery = Math.max(1, Math.ceil(series.length / 8));
    series.forEach((d, i) => {
      const mid = pad.l + slot * i + slot / 2;
      if (i % labelEvery === 0) {
        chart.appendChild(svg("text", { x: mid, y: H - 8, "text-anchor": "middle", className: "lay-axis", text: shortDay(d.day) }));
      }
      VERSIONS.forEach((ver, k) => chart.appendChild(dayBar(d, ver, { x: mid + (k === 0 ? -barW - 1 : 1), w: barW, y, base: y(0), tip })));
    });
    return el("div", { className: "lay-chart-wrap" }, [chart, tip]);
  }

  function dayBar(d, ver, g) {
    const n = d[ver].sessions;
    const text = t("tipVisits", { day: d.day, name: name(ver), n: count(n), time: duration(d[ver].seconds) });
    const h = Math.max(n > 0 ? 2 : 0, g.base - g.y(n));
    const bar = svg("rect", {
      x: g.x.toFixed(1),
      y: (g.base - h).toFixed(1),
      width: g.w.toFixed(1),
      height: h.toFixed(1),
      rx: Math.min(3, g.w / 2),
      className: "lay-bar",
      "data-ver": ver,
      tabindex: n > 0 ? "0" : null
    }, [svg("title", { text })]);
    const show = () => {
      g.tip.textContent = text;
    };
    bar.addEventListener("pointerenter", show);
    bar.addEventListener("focus", show);
    return bar;
  }

  function legend() {
    return el("ul", { className: "lay-legend" }, VERSIONS.map((ver) => el("li", {}, [swatch(ver), name(ver)])));
  }

  function table(headers, rows) {
    return el("div", { className: "admin-table-wrap" }, [
      el("table", { className: "admin-table" }, [
        el("thead", {}, [el("tr", {}, headers.map((h) => el("th", { scope: "col", text: h })))]),
        el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((cell, i) => el("td", { "data-label": headers[i], text: cell })))))
      ])
    ]);
  }

  function dailyBlock(data) {
    const series = dailySeries(data);
    if (!series.length) return [];
    const rows = [];
    series.forEach((d) => {
      VERSIONS.forEach((ver) => rows.push([d.day, name(ver), count(d[ver].sessions), duration(d[ver].seconds)]));
    });
    return [
      el("h3", { text: t("dailyTitle") }),
      legend(),
      dailyChart(series),
      el("details", { className: "lay-details" }, [
        el("summary", { text: t("dailyTable") }),
        table([t("day"), t("design"), t("visits"), t("seconds")], rows)
      ])
    ];
  }

  function switchBlock(data) {
    const switches = Array.isArray(data.switches) ? data.switches : [];
    const head = el("h3", { text: t("switchesTitle") });
    if (!switches.length) return [head, el("p", { className: "muted", text: t("switchesNone") })];
    const n = Number(data.switchers) || 0;
    return [
      head,
      el("p", { className: "muted", text: n === 1 ? t("switchers_one") : t("switchers", { n: count(n) }) }),
      table(
        [t("from"), t("to"), t("times"), t("browsers")],
        switches.map((s) => [name(s.from), name(s.to), count(s.count), count(s.browsers)])
      )
    ];
  }

  function sourceBlock(data) {
    const rows = VERSIONS.map((ver) => {
      const by = versionOf(data, ver).bySource || {};
      return [name(ver), count(by.default), count(by.chosen), count(by.link)];
    });
    return [el("h3", { text: t("sourceTitle") }), table([t("design"), t("srcDefault"), t("srcChosen"), t("srcLink")], rows)];
  }

  function caveatBlock(data) {
    const items = ["caveat1", "caveat2", "caveat3", "caveat4"].map((key) => el("li", { text: t(key) }));
    const ignored = Number(data.ignoredSessions) || 0;
    if (ignored > 0) items.push(el("li", { text: t("ignored", { n: count(ignored) }) }));
    return el("aside", { className: "lay-caveat" }, [el("h3", { text: t("caveatTitle") }), el("ul", {}, items)]);
  }

  function csvText(data) {
    const lines = [["day", "design", "visits", "seconds"].join(",")];
    dailySeries(data).forEach((d) => {
      VERSIONS.forEach((ver) => lines.push([d.day, ver, d[ver].sessions, d[ver].seconds].join(",")));
    });
    return `${lines.join("\n")}\n`;
  }

  function csvButton(data) {
    const button = el("button", { type: "button", className: "btn btn-sm", id: "layouts-csv", text: t("csv") });
    button.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([csvText(data)], { type: "text/csv" }));
      const link = el("a", { href: url, download: `site-designs-${state.days}d.csv` });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    return button;
  }

  /** Draw what load() last read, in the page's current language. */
  function render() {
    const box = $("#layouts-result");
    if (!box) return;
    if (state.error) {
      box.replaceChildren(el("p", { className: "admin-message", "data-tone": "error", text: state.error }));
      return;
    }
    const data = state.data;
    if (!data) return;
    const total = (data.versions || []).reduce((n, v) => n + (Number(v.sessions) || 0), 0);
    const days = (data.window && data.window.days) || state.days;
    if (!total && !(data.switches || []).length && !data.ignoredSessions) {
      box.replaceChildren(el("p", { className: "muted", text: t("empty", { days }) }), caveatBlock(data));
      return;
    }
    const time = state.readAt
      ? state.readAt.toLocaleTimeString(lang() === "en" ? "en-US" : "es-PE", { hour: "2-digit", minute: "2-digit" })
      : "";
    box.replaceChildren(
      el("p", { className: "muted lay-read-at", text: t("readAt", { time, days }) }),
      // The caveat first: numbers read before their limits are read as a verdict.
      caveatBlock(data),
      el("div", { className: "lay-tiles" }, VERSIONS.map((ver) => tile(versionOf(data, ver)))),
      el("h3", { text: t("shareTitle") }),
      shareBar(t("shareVisits"), data, "sessionShare"),
      shareBar(t("shareTime"), data, "timeShare"),
      ...dailyBlock(data),
      ...switchBlock(data),
      ...sourceBlock(data),
      csvButton(data)
    );
  }

  // ------------------------------------------------------------ at a glance

  const glance = { health: null, layouts: null };

  function pill(label, tone, value) {
    return el("li", { "data-tone": tone }, [
      el("span", { className: "admin-dot", "aria-hidden": "true" }),
      `${label}: `,
      el("strong", { text: value })
    ]);
  }

  function renderGlance() {
    const list = $("#glance-list");
    if (!list) return;
    const h = glance.health;
    const items = [pill(t("glanceServer"), h ? "on" : "error", h ? t("on") : t("down"))];
    if (h) {
      const ev = h.eventsEnabled;
      items.push(pill(t("glanceStats"), ev === undefined ? "error" : ev ? "on" : "off", ev === undefined ? t("old") : ev ? t("on") : t("off")));
    }
    if (glance.layouts !== null) {
      items.push(pill(t("glanceLayouts"), glance.layouts ? "on" : "error", glance.layouts ? t("ready") : t("old")));
    }
    list.replaceChildren(...items);
  }

  /** Two cheap reads when the tools appear: is the server up, and is it new enough. */
  async function loadGlance() {
    if (!window.VTAccount) return;
    const [health, probe] = await Promise.all([
      window.VTAccount.request("GET", "/v1/health", null, { auth: false, timeoutMs: 8000 }),
      window.VTAccount.request("GET", "/v1/admin/layouts?days=1", null, { timeoutMs: 8000 })
    ]);
    glance.health = health.ok && health.data ? health.data : null;
    glance.layouts = probe.ok ? true : probe.status === 404 ? false : null;
    renderGlance();
  }

  // ------------------------------------------------------------ section bar

  /** Mark the section on screen in the bar, so a long page says where you are. */
  function watchSections() {
    const links = Array.from(document.querySelectorAll(".admin-jump a[href^='#']"));
    if (!links.length || typeof IntersectionObserver !== "function") return;
    const seen = new Map();
    const mark = () => {
      let best = null;
      seen.forEach((ratio, id) => {
        if (ratio > 0 && (!best || ratio > seen.get(best))) best = id;
      });
      links.forEach((link) => {
        if (link.getAttribute("href") === `#${best}`) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => seen.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0));
        mark();
      },
      { rootMargin: "-20% 0px -50% 0px", threshold: [0, 0.1, 0.5, 1] }
    );
    links.forEach((link) => {
      const section = document.getElementById(link.getAttribute("href").slice(1));
      if (section) observer.observe(section);
    });
  }

  // ------------------------------------------------------------ wiring

  function applyText() {
    document.querySelectorAll("[data-lt]").forEach((node) => {
      node.textContent = t(node.getAttribute("data-lt"));
    });
    document.querySelectorAll("[data-lt-aria]").forEach((node) => {
      node.setAttribute("aria-label", t(node.getAttribute("data-lt-aria")));
    });
  }

  function markWindow() {
    document.querySelectorAll("#layouts [data-lwindow]").forEach((chip) => {
      chip.setAttribute("aria-pressed", Number(chip.getAttribute("data-lwindow")) === state.days ? "true" : "false");
    });
  }

  /** The tools were hidden (signed out, not an admin): nothing read may stay on screen. */
  function clear() {
    state.seq += 1;
    state.data = null;
    state.error = "";
    state.asked = false;
    glance.health = null;
    glance.layouts = null;
    $("#layouts-result")?.replaceChildren();
    $("#glance-list")?.replaceChildren();
    const button = $("#layouts-load");
    if (button) button.disabled = false;
  }

  function bind() {
    $("#layouts-load")?.addEventListener("click", load);
    document.querySelectorAll("#layouts [data-lwindow]").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.days = Number(chip.getAttribute("data-lwindow")) || 28;
        markWindow();
        if (state.asked) load();
      });
    });
    // js/admin.js flips the language first (it bound first); redraw after it.
    $("#admin-lang")?.addEventListener("click", () => {
      applyText();
      render();
      renderGlance();
    });
    const tools = $("#admin-tools");
    if (tools) {
      new MutationObserver(() => {
        if (tools.hidden) clear();
        else loadGlance();
      }).observe(tools, { attributes: true, attributeFilter: ["hidden"] });
      if (!tools.hidden) loadGlance();
    }
  }

  applyText();
  markWindow();
  bind();
  watchSections();

  window.VTAdminLayouts = { load, render, csvText, dailySeries, niceMax, duration };
})();
