# 30 — Keyboard focus trap for modal overlays

**Date:** 2026-09-19  
**Code:** `js/focus-trap.js` (new), `js/app.js`, `js/tour.js`, `index.html`  
**Tests:** `tests/focus-trap.spec.js` (8 specs, chromium)  
**Status:** Shipped

---

## Problem

Every overlay in the app is marked `role="dialog" aria-modal="true"`, but nothing
enforced it. With the pricing, account or leave dialog open, Tab walked straight
out of the card and into the page behind it — the header buttons, the catalog,
the exercise controls — while the backdrop still swallowed the pointer. A
keyboard or screen-reader user could reach controls they could not see and could
not click. Closing a dialog dropped focus on `<body>`, so the next Tab restarted
from the top of the document instead of the button that opened the dialog.

Relevant WCAG: 2.1.2 No Keyboard Trap (inverse case — modal containment),
2.4.3 Focus Order, 3.2.1 On Focus.

## Fix

`js/focus-trap.js` exposes `window.VTFocusTrap`:

| Call | Effect |
|------|--------|
| `activate(container, { initialFocus, returnFocus })` | Starts a trap, focuses `initialFocus` (default: first tabbable control), remembers the trigger |
| `release(container, { restoreFocus })` | Ends the trap and hands focus back to the trigger |
| `isActive(container)` | Whether that dialog is trapping |
| `focusables(container)` | Tabbable controls inside, in DOM order |
| `stack()` | Open dialogs, outermost first (test helper) |

Behaviour:

- **Tab / Shift+Tab wrap** inside the dialog instead of leaving it.
- **Escaped focus is pulled back** — a `focusin` listener in capture phase
  returns focus to the dialog if anything behind it takes focus.
- **Focus returns to the trigger** on close, but only if the trigger is still
  connected and visible; a trigger that lives inside the dialog is ignored.
- **Traps stack**, so a dialog opened over another restores the one underneath.
- **Self-healing** — a dialog hidden without `release()` (the QA helpers do this)
  is dropped from the stack on the next key or focus event, so a forgotten close
  can never freeze the keyboard.

## Wiring

| Dialog | Open | Close | First focus |
|--------|------|-------|-------------|
| `#leave-modal` | `promptLeaveExercise` | `finish()` | `#leave-save` |
| `#pricing-modal` | `openPricing` | `closePricing` | `#pricing-close` |
| `#account-modal` | `openAccount` | `closeAccount` | `#login-username`, or `#account-close` when signed in |
| `.tour-card` | `beginTour` | `end` | tour Next button |

The tour is included because its card carries `aria-modal="true"` and its steps
click page chrome behind the backdrop; without a trap, Tab left the tour after
the first step and finishing it stranded focus on whatever a step had clicked.

## Verification

`npx playwright test tests/focus-trap.spec.js --project=chromium` — 8 passed.

Covers: module present; pricing Tab cycle of 24 presses never leaves the card;
Shift+Tab wrap; Escape and close-button both return focus to `#btn-pricing`;
account dialog cycle and restore to `#btn-account`; background control focused
programmatically is pulled back; account → pricing hand-off leaves exactly one
trap and restores `#btn-account`; leave dialog traps, resolves `"stay"` on
Escape and returns focus to `#btn-back-home`; tour card traps and restores
`#btn-tour`.

Full chromium suite: 228 passed, 12 failed — all 12 fail identically on `main`
without this change (9 are headed specs that need an X server, 3 are unrelated
hidden-element assertions in `pro-features`, `retention` and `validation`).
