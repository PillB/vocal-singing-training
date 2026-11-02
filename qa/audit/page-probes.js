/**
 * In-page probes for qa/audit/forensic-audit.mjs. Injected with addInitScript;
 * exposes window.__audit. Nothing here ships to users.
 *
 * zInventory(): every visible interactive element and text leaf, in Z reading
 *   order (rows top to bottom, left to right within a row), with its box,
 *   fold state, target size, hit-test result and an approximate contrast.
 * overlaps(): pairs of visible controls whose boxes intersect (neither inside
 *   the other), and clipped text.
 * snapshot(): the live state a learner sees during a take, for tick timelines.
 */
(function () {
  "use strict";
  const INTERACTIVE = "button, a[href], input, select, textarea, summary, [role=button], [role=tab], [role=switch], [role=slider], [tabindex]:not([tabindex='-1'])";

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    // 1 px and under is the screen-reader-only pattern (a live region), not something on screen
    if (r.width <= 1 || r.height <= 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.02;
  }

  function folded(el) {
    const det = el.closest("details:not([open])");
    if (det && !el.closest("summary")) return "details-closed";
    if (el.closest("[hidden]")) return "hidden-attr";
    if (el.closest(".collapsed")) return "collapsed";
    if (el.closest("[aria-hidden='true']")) return "aria-hidden";
    return "";
  }

  function directText(el) {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.replace(/\s+/g, " ").trim();
  }

  // A form control's name is its label's text, never its value ("on" for a checkbox)
  function label(el) {
    const aria = el.getAttribute("aria-label") || "";
    const own = el.labels && el.labels.length ? el.labels[0].innerText : "";
    const text = (own || el.innerText || (el.type === "checkbox" || el.type === "radio" ? "" : el.value) || "").replace(/\s+/g, " ").trim();
    return (aria || text || el.getAttribute("title") || el.getAttribute("placeholder") || el.id || "").slice(0, 90);
  }

  const tooSmall = (r) => r.width < 24 || r.height < 24;

  /**
   * Under 24 × 24 px with no way round it (WCAG 2.5.8). A label activates its
   * control, so a checkbox inside a big enough label is a big enough target.
   */
  function smallTarget(el, r) {
    if (!tooSmall(r)) return false;
    return ![...(el.labels || [])].some((l) => visible(l) && !tooSmall(l.getBoundingClientRect()));
  }

  /** What sits on top of an element's centre: "self", "offscreen", or the coverer. */
  function coverer(el, r) {
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return "offscreen";
    const top = document.elementFromPoint(x, y);
    if (!top) return "none";
    if (top === el || el.contains(top) || top.contains(el)) return "self";
    // A label over its own control is the same target
    if (el.labels && [...el.labels].some((l) => l === top || l.contains(top))) return "self";
    return (top.id ? "#" + top.id : top.tagName.toLowerCase()) + "." + String(top.className || "").split(" ")[0];
  }

  function parseRgb(s) {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function lum(c) {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function background(el) {
    for (let e = el; e; e = e.parentElement) {
      const c = parseRgb(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c;
      if (getComputedStyle(e).backgroundImage !== "none") return null;
    }
    return parseRgb(getComputedStyle(document.body).backgroundColor);
  }

  function contrast(el) {
    const fg = parseRgb(getComputedStyle(el).color);
    const bg = background(el);
    if (!fg || !bg) return null;
    const a = lum(fg);
    const b = lum(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }

  function describe(el, kind) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      kind,
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      role: el.getAttribute("role") || "",
      text: kind === "text" ? directText(el).slice(0, 90) : label(el),
      x: Math.round(r.left),
      y: Math.round(r.top + scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
      inView: r.bottom > 0 && r.top < innerHeight,
      fold: folded(el),
      disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true",
      font: parseFloat(cs.fontSize),
      contrast: contrast(el),
      hit: kind === "control" ? coverer(el, r) : undefined,
      small: kind === "control" && smallTarget(el, r)
    };
  }

  function rowsOf(items) {
    const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const it of sorted) {
      const row = rows.find((rw) => Math.abs(rw.cy - (it.y + it.h / 2)) <= Math.max(12, it.h / 2));
      if (row) row.items.push(it);
      else rows.push({ cy: it.y + it.h / 2, items: [it] });
    }
    rows.forEach((rw, i) => {
      rw.items.sort((a, b) => a.x - b.x);
      rw.index = i;
    });
    return rows;
  }

  function zInventory(rootSel) {
    const root = document.querySelector(rootSel || "body") || document.body;
    const items = [];
    root.querySelectorAll(INTERACTIVE).forEach((el) => {
      if (visible(el)) items.push(describe(el, "control"));
    });
    root.querySelectorAll("h1,h2,h3,h4,p,li,span,label,strong,em,small,div,dt,dd,figcaption,legend,th,td").forEach((el) => {
      if (!visible(el) || el.closest(INTERACTIVE)) return;
      if (directText(el).length >= 2) items.push(describe(el, "text"));
    });
    return rowsOf(items).map((rw) => rw.items);
  }

  function intersects(a, b) {
    return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  }

  function controlOverlaps(controls) {
    const out = [];
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i];
        const b = controls[j];
        if (a.contains(b) || b.contains(a)) continue;
        if (intersects(a.getBoundingClientRect(), b.getBoundingClientRect())) out.push([label(a) || a.id, label(b) || b.id]);
      }
    }
    return out;
  }

  function clippedText(root) {
    const out = [];
    root.querySelectorAll("*").forEach((el) => {
      if (!visible(el) || !directText(el)) return;
      const cs = getComputedStyle(el);
      const clips = /hidden|clip/.test(cs.overflowX) || cs.textOverflow === "ellipsis";
      if (clips && el.scrollWidth > el.clientWidth + 2) out.push(directText(el).slice(0, 60));
    });
    return out;
  }

  function overlaps(rootSel) {
    const root = document.querySelector(rootSel || "body") || document.body;
    const controls = [...root.querySelectorAll(INTERACTIVE)].filter(visible).filter((el) => !folded(el));
    return { controls: controlOverlaps(controls), clipped: clippedText(root) };
  }

  const text = (sel) => (document.querySelector(sel)?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240);

  function snapshot() {
    const st = window.VTApp?.getState?.() || {};
    return {
      t: Math.round(performance.now()),
      view: document.querySelector(".view.active")?.id || "",
      live: !document.getElementById("btn-practice-stop")?.hidden,
      status: text("#practice-status"),
      focus: text("#mode-focus"),
      hud: text("#mode-hud"),
      cue: text("#mode-cue"),
      pitch: text("#pitch-stats"),
      timer: text("#session-timer, #practice-timer, .practice-clock"),
      toast: document.getElementById("toast")?.classList.contains("show") ? text("#toast") : "",
      practiced: Math.round((window.VTApp?.getPracticedSec?.() || 0) * 10) / 10,
      targetFreq: st.practice?.targetFreq || null
    };
  }

  window.__audit = { zInventory, overlaps, snapshot, visible, label, smallTarget, coverer };
})();
