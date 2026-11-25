import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
function load() {
  const win = { console, document: { querySelector: () => null }, addEventListener: () => {} };
  win.window = win;
  win.VTI18n = { lang: "en", t: (key) => key };
  runInNewContext(read("js/exercises-data.js"), win);
  runInNewContext(read("js/session-sets.js"), win);
  runInNewContext(read("js/song-library.js"), win);
  return win;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test("skill filters isolate breath and pitch practice and unknown future tags fall back safely", () => {
  const { VTSets: sets } = load();
  const singing = sets.list("singing");
  assert.deepEqual(plain(sets.filterFocus(singing, "breath").map((set) => set.id)), ["s-breath-phrases"]);
  assert.deepEqual(plain(sets.filterFocus(singing, "pitch").map((set) => set.id)), ["s-pitch", "s-range"]);
  assert.equal(sets.filterFocus(singing, "renamed-in-future").length, 10);
  assert.equal(sets.filterFocus(singing, "all").length, 10);
  assert.ok(sets.SETS.every((set) => Object.hasOwn(sets.FOCUS.en, set.focus)), "authoring drift must fail rather than hide a routine");
});

test("song transfer ends with an actual song task rather than the delayed speaking-review workflow", () => {
  const { VTSets: sets } = load();
  for (const id of ["s-breath-phrases", "s-rhythm-phrasing", "s-onset-words", "s-song-listening"]) {
    assert.equal(sets.resolve(id).order.at(-1), "s3-song-stanzas", id);
  }
  for (const id of ["v-text-phrasing", "v-listen-contrast"]) assert.ok(!sets.resolve(id).order.includes("v7-record-review"));
});

test("historical score cards have distinct tasks, safe source URLs and bilingual rights limits", () => {
  const { VTSongLibrary: library } = load();
  assert.deepEqual(plain(library.SONGS.map((s) => s.id)), ["frere-jacques", "auld-lang-syne", "aura-lea"]);
  for (const lang of ["es", "en"]) {
    const html = library.html(lang);
    assert.equal((html.match(/data-song-study=/g) || []).length, 3);
    assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 3);
    assert.match(html, lang === "es" ? /EE\. UU\./ : /US public domain/);
    assert.match(html, lang === "es" ? /no estas melodías/ : /not these melodies/);
  }
  const card = library.SONGS[0];
  const original = card.en.task;
  card.en.task = '<img src=x onerror="bad">';
  assert.match(library.html("en"), /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  assert.doesNotMatch(library.html("en"), /<img/);
  card.en.task = original;
});
