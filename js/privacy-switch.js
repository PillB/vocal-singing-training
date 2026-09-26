/**
 * The privacy section's switch (guide.html #privacidad): says whether this
 * browser sends anonymous statistics and lets the visitor stop it.
 *
 * The answer comes from VTAnalytics.remoteState(), the same function that
 * decides whether anything is sent, so the sentence cannot drift from what the
 * page actually does. Opting out stops sending, asks the worker to delete what
 * this browser already sent (POST /v1/events/forget), and replaces the random
 * browser id, so nothing sent later could be tied to what was deleted. Events
 * that stay on this device are untouched, because they never left it.
 *
 * guide.html does not load js/i18n.js (a 100 KB table for two sentences), so
 * this file keeps its own Spanish and English strings.
 */
(function (global) {
  "use strict";

  const T = {
    es: {
      sending: "Este navegador envía estadísticas anónimas.",
      off: "Ahora mismo este sitio no envía estadísticas.",
      browser: "Tu navegador pide no ser rastreado, así que no se envía nada.",
      optedOut: "Elegiste no enviar estadísticas desde este navegador.",
      automated: "Este navegador no envía estadísticas.",
      stop: "No enviar y borrar lo enviado",
      resume: "Volver a permitir"
    },
    en: {
      sending: "This browser sends anonymous statistics.",
      off: "Right now this site sends no statistics.",
      browser: "Your browser asks not to be tracked, so nothing is sent.",
      optedOut: "You chose not to send statistics from this browser.",
      automated: "This browser sends no statistics.",
      stop: "Stop sending and delete what was sent",
      resume: "Allow again"
    }
  };

  function render() {
    const A = global.VTAnalytics;
    if (!A?.remoteState) return;
    const st = A.remoteState();
    document.querySelectorAll("[data-privacy-switch]").forEach((box) => {
      const t = T[box.dataset.lang === "en" ? "en" : "es"];
      const text = box.querySelector("[data-privacy-state]");
      const btn = box.querySelector("[data-privacy-toggle]");
      let line;
      let label = t.stop;
      let canToggle = true;
      if (st.optedOut) {
        line = t.optedOut;
        label = t.resume;
      } else if (st.reason === "gpc" || st.reason === "dnt") {
        line = t.browser;
        canToggle = false;
      } else if (st.reason === "automated") {
        line = t.automated;
        canToggle = false;
      } else if (st.reason === "no_endpoint") {
        // Offer the switch anyway, so the choice holds if sending starts later.
        line = t.off;
      } else {
        line = t.sending;
      }
      if (text) text.textContent = line;
      if (btn) {
        btn.hidden = !canToggle;
        btn.textContent = label;
        btn.setAttribute("aria-pressed", String(!!st.optedOut));
      }
      box.hidden = false;
    });
  }

  function init() {
    document.querySelectorAll("[data-privacy-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const A = global.VTAnalytics;
        if (!A?.setOptOut) return;
        const out = !A.remoteState().optedOut;
        if (out) {
          const E = global.VTExperiments;
          try {
            A.forget?.(E?.clientId?.());
            E?.reset?.();
          } catch {
            /* the opt-out below still holds */
          }
        }
        A.setOptOut(out);
        render();
      });
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
