/**
 * The fullscreen sweep's mouse: fit the stage, find a control's centre, check
 * that nothing covers it, and click it there with the real mouse
 * (tests/fullscreen-all-clicks.spec.js). Its own guard is
 * tests/fullscreen-click-harness.spec.js, which runs on every pull request.
 */
async function dismissOverlays(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
    } catch {
      /* ignore */
    }
    document.getElementById("toast")?.classList.remove("show");
    // This is not a cosmetic overlay: VTTour marks the exercise <section>
    // inert, so hiding its root by hand leaves every button unclickable.
    // End via the real controller to clear inert, focus trap and highlight.
    if (window.VTTour?.isActive?.()) window.VTTour.end(null);
    const tour = document.getElementById("tour-root");
    if (tour) {
      tour.hidden = true;
      tour.style.display = "none";
    }
    document.body.classList.remove("tour-active");
    document.querySelectorAll(".tour-backdrop").forEach((el) => {
      el.style.display = "none";
      el.hidden = true;
    });
    const m = document.getElementById("leave-modal");
    if (m) {
      document.getElementById("leave-discard")?.click();
      m.hidden = true;
      m.style.display = "none";
    }
    ["pricing-modal", "account-modal"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.style.display = "none";
      }
    });
  });
}

async function fit(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById("toast")?.classList.remove("show");
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
  await page.waitForTimeout(80);
}

async function hitCenter(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: "missing" };
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { ok: false, reason: "zero", r: { ...r } };
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const ok = !!(top && (top === el || el.contains(top)));
    return {
      ok,
      x,
      y,
      r: { t: r.top, b: r.bottom, w: r.width, h: r.height },
      top: top
        ? { id: top.id, tag: top.tagName, cls: String(top.className || "").slice(0, 50) }
        : null
    };
  }, sel);
}

/**
 * Fit, verify center hit, mouse-click. A control whose centre is under the
 * window's bottom edge is scrolled to, as a person would, and clicked where it
 * then is. The retry used to call fit() again, whose scrollTo(0, 0) put the
 * control straight back under the edge, so it could never be hit: the nightly
 * fullscreen run missed "Mostrar métricas" on s2-solfege-chords, 5 px under a
 * 1080 px screen in CI's fonts (DejaVu Sans), every night from Nov 12.
 *
 * The scroll needs no settling after it. On Chromium, Playwright scrolls with
 * CDP DOM.scrollIntoViewIfNeeded, which is instant whatever the page's
 * scroll-behavior, and it first waits for the control's box to hold still.
 * A control with no box (missing, or hidden by CSS) is not scrolled to: that
 * call would retry until the test's timeout, since the config sets no
 * actionTimeout.
 */
async function clickControl(page, sel) {
  await dismissOverlays(page);
  await fit(page);
  let hit = await hitCenter(page, sel);
  if (!hit.ok && hit.reason !== "zero" && hit.reason !== "missing") {
    await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});
    hit = await hitCenter(page, sel);
  }
  if (!hit.ok || hit.x == null) {
    return { ok: false, hit };
  }
  await page.mouse.move(hit.x - 12, hit.y, { steps: 4 });
  await page.mouse.move(hit.x, hit.y, { steps: 6 });
  // Re-check after move (fullscreen layout can shift)
  hit = await hitCenter(page, sel);
  if (!hit.ok) {
    // Last resort: Playwright locator click (auto-scroll) after ensuring not covered by tour
    await page.locator(sel).click({ timeout: 5000, force: false }).catch(() => {});
    return { ok: false, hit, usedForcePath: true };
  }
  await page.mouse.click(hit.x, hit.y, { delay: 30 });
  return { ok: true, hit };
}

/**
 * Put back what a click opened: an expanded guide card closes again by its own
 * button, and the piano stays closed. The metrics card hides its button once
 * open (#metrics-card:not(.collapsed) .metrics-header in css/styles.css), so it
 * is folded first, as the sweep folds it after Stop, and then closed by that
 * button, which tells the app. Clicking the hidden button used to wait for a
 * box that never came, until the test's six minutes ran out.
 */
async function restoreAfterClick(page, c, sel) {
  if (c.id === "btn-toggle-guide" || c.id === "btn-toggle-metrics") {
    await page.waitForTimeout(100);
    const open = await page.evaluate((id) => {
      const card =
        id === "btn-toggle-guide"
          ? document.querySelector(".guide-card")
          : document.querySelector("#metrics-card");
      const wasOpen = !!card && !card.classList.contains("collapsed");
      if (wasOpen && id === "btn-toggle-metrics") card.classList.add("collapsed");
      return wasOpen;
    }, c.id);
    if (open) await clickControl(page, sel);
  }
  if (c.id === "btn-toggle-piano") {
    // leave closed
    await page.evaluate(() => {
      if (window.VTApp?.getState?.()?.pianoOpen) {
        document.getElementById("btn-toggle-piano")?.click();
      }
    });
  }
}

module.exports = { dismissOverlays, fit, hitCenter, clickControl, restoreAfterClick };
