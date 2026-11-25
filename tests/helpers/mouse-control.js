/** Real pointer click after Playwright has scrolled and checked actionability. */
async function hitCenter(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { ok: false, reason: "missing" };
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { ok: false, reason: "zero" };
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      ok: !!(top && (top === el || el.contains(top))), x, y,
      r: { t: r.top, b: r.bottom, w: r.width, h: r.height },
      top: top ? { id: top.id, tag: top.tagName } : null
    };
  }, selector);
}

async function mouseClickControl(page, selector) {
  try {
    // Trial performs scrolling, visibility, stability and event-target checks,
    // without clicking. Fitting the stage again here would undo this scroll.
    await page.locator(selector).click({ trial: true, timeout: 5000 });
  } catch (error) {
    return { ok: false, hit: await hitCenter(page, selector), error: String(error.message) };
  }
  let hit = await hitCenter(page, selector);
  if (!hit.ok) return { ok: false, hit };
  await page.mouse.move(hit.x - 12, hit.y, { steps: 4 });
  await page.mouse.move(hit.x, hit.y, { steps: 6 });
  hit = await hitCenter(page, selector);
  if (!hit.ok) return { ok: false, hit };
  await page.mouse.click(hit.x, hit.y, { delay: 30 });
  return { ok: true, hit };
}

module.exports = { mouseClickControl };
