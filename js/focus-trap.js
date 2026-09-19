/**
 * VTFocusTrap — keyboard focus containment for modal overlays.
 *
 * While a dialog is open, Tab / Shift+Tab cycle only through the controls
 * inside it, focus that escapes (browser chrome, background clicks, removed
 * nodes) is pulled back, and closing the dialog returns focus to whatever
 * opened it. Traps stack, so a dialog opened on top of another restores the
 * one underneath when it closes.
 *
 * Usage:
 *   VTFocusTrap.activate(modal, { initialFocus: "#modal-close" });
 *   ...
 *   modal.hidden = true;
 *   VTFocusTrap.release(modal);
 */
(function () {
  "use strict";

  const FOCUSABLE = [
    "a[href]",
    "area[href]",
    "button",
    "input",
    "select",
    "textarea",
    "iframe",
    "audio[controls]",
    "video[controls]",
    "[contenteditable]:not([contenteditable='false'])",
    "[tabindex]"
  ].join(",");

  /** Active traps, outermost first. */
  const stack = [];
  let bound = false;

  function isOpen(container) {
    return !!(container && container.isConnected && !container.closest("[hidden]"));
  }

  function isFocusable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled) return false;
    if (el.tagName === "INPUT" && el.type === "hidden") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const ti = el.getAttribute("tabindex");
    if (ti !== null && Number(ti) < 0) return false;
    if (el.closest("[hidden]")) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  /** Tabbable controls inside a container, in DOM order. */
  function focusables(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter(isFocusable);
  }

  function focus(el) {
    if (!el) return false;
    try {
      el.focus({ preventScroll: true });
    } catch {
      try {
        el.focus();
      } catch {
        return false;
      }
    }
    return document.activeElement === el;
  }

  /** Focus a container that has nothing tabbable in it yet. */
  function focusContainer(container) {
    if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
    return focus(container);
  }

  function resolve(target, container) {
    if (!target) return null;
    if (typeof target === "function") return resolve(target(container), container);
    if (typeof target === "string") {
      return container.querySelector(target) || document.querySelector(target);
    }
    return target.nodeType === 1 ? target : null;
  }

  /**
   * Innermost live trap. Traps whose dialog was hidden or removed without a
   * release() are dropped here so a forgotten close never freezes the page.
   */
  function top() {
    while (stack.length) {
      const trap = stack[stack.length - 1];
      if (isOpen(trap.container)) return trap;
      stack.pop();
      restore(trap);
    }
    unbind();
    return null;
  }

  function restore(trap) {
    const el = trap.returnTo;
    if (!el || !el.isConnected || !isFocusable(el)) return;
    const active = document.activeElement;
    // Only take focus back if the dialog still had it.
    if (active && active !== document.body && !trap.container.contains(active)) return;
    focus(el);
  }

  function onKeydown(e) {
    if (e.key !== "Tab" || e.defaultPrevented) return;
    const trap = top();
    if (!trap) return;
    const items = focusables(trap.container);
    if (!items.length) {
      e.preventDefault();
      focusContainer(trap.container);
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!trap.container.contains(active)) {
      e.preventDefault();
      focus(e.shiftKey ? last : first);
      return;
    }
    if (e.shiftKey && active === first) {
      e.preventDefault();
      focus(last);
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      focus(first);
    }
  }

  function onFocusIn(e) {
    const trap = top();
    if (!trap || trap.container.contains(e.target)) return;
    const items = focusables(trap.container);
    if (items.length) focus(items[0]);
    else focusContainer(trap.container);
  }

  function bind() {
    if (bound) return;
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("focusin", onFocusIn, true);
    bound = true;
  }

  function unbind() {
    if (!bound) return;
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("focusin", onFocusIn, true);
    bound = false;
  }

  /**
   * Trap focus inside an open dialog.
   * @param {Element} container dialog element (already visible)
   * @param {{ initialFocus?: any, returnFocus?: any }} [opts]
   *   initialFocus: element, selector or getter to focus first (default: first
   *   tabbable control). returnFocus: what to focus on release (default: the
   *   element focused right now); pass null to restore nothing.
   */
  function activate(container, opts) {
    const o = opts || {};
    if (!container || !container.nodeType) return null;
    const existing = stack.find((t) => t.container === container);
    if (existing) {
      const again = resolve(o.initialFocus, container);
      if (again) focus(again);
      return existing;
    }
    let returnTo = "returnFocus" in o ? resolve(o.returnFocus, container) : document.activeElement;
    // A control inside the dialog (or the page body) is not a useful trigger.
    if (returnTo === document.body || (returnTo && container.contains(returnTo))) returnTo = null;
    const trap = { container, returnTo };
    stack.push(trap);
    bind();
    const initial = resolve(o.initialFocus, container) || focusables(container)[0];
    if (initial) focus(initial);
    else focusContainer(container);
    return trap;
  }

  /**
   * Stop trapping and hand focus back to the opener.
   * Call it after hiding the dialog.
   * @param {Element} container
   * @param {{ restoreFocus?: boolean }} [opts] restoreFocus:false keeps focus put
   */
  function release(container, opts) {
    const i = stack.findIndex((t) => t.container === container);
    if (i === -1) return false;
    const trap = stack.splice(i, 1)[0];
    if (!stack.length) unbind();
    if (!opts || opts.restoreFocus !== false) restore(trap);
    // Re-assert the dialog underneath, if any.
    const next = top();
    if (next && !next.container.contains(document.activeElement)) {
      const items = focusables(next.container);
      if (items.length) focus(items[0]);
    }
    return true;
  }

  function isActive(container) {
    if (!container) return stack.length > 0;
    return stack.some((t) => t.container === container);
  }

  window.VTFocusTrap = {
    activate,
    release,
    isActive,
    focusables,
    FOCUSABLE,
    /** Test helper: dialogs currently trapping, outermost first. */
    stack: () => stack.map((t) => t.container)
  };
})();
