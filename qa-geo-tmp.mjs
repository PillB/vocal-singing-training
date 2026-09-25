import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const b = await chromium.launch();
for (const [w, h] of [[320,740],[360,740],[390,844],[844,390],[768,1024]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const ids = ['btn-nav-home','btn-plan','btn-history','btn-account','btn-more'];
    const boxes = ids.map((id) => { const el = document.getElementById(id); const b = el.getBoundingClientRect(); return { id, x: Math.round(b.x), r: Math.round(b.right), y: Math.round(b.y), h: Math.round(b.height), w: Math.round(b.width) }; });
    // does the element at each button's centre belong to that button?
    const hits = boxes.map((b0) => {
      const el = document.getElementById(b0.id);
      const bb = el.getBoundingClientRect();
      const top = document.elementFromPoint(bb.x + bb.width / 2, bb.y + bb.height / 2);
      return `${b0.id}:${top && (top === el || el.contains(top)) ? 'ok' : 'BLOCKED by ' + (top ? (top.id || top.className || top.tagName) : 'null')}`;
    });
    const nav = document.getElementById('header-nav');
    return { boxes, hits, navClip: nav.scrollWidth - nav.clientWidth, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
  });
  console.log(`=== ${w}x${h} pageScroll=${r.scroll}/${r.client} navHiddenPx=${r.navClip}`);
  console.log('   ', r.boxes.map((b) => `${b.id} ${b.x}-${b.r} (${b.w}x${b.h})`).join(' | '));
  console.log('   ', r.hits.join(' | '));
  await p.close();
}
await b.close();
