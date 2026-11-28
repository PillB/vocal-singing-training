const {test,expect}=require("@playwright/test");
const BASE=process.env.BASE_URL||"http://127.0.0.1:8765";
async function boot(page,lang="es",tab="singing",returning=false){
  await page.addInitScript(({lang,tab,returning})=>{
    localStorage.setItem("vt_tour_v1","1");
    localStorage.setItem("vt_lang",lang);
    localStorage.setItem("vt_settings_v1",JSON.stringify({lastTab:tab}));
    localStorage.setItem("vt_skill_discovery_v1",JSON.stringify({v:1,visits:1}));
    sessionStorage.setItem("vt_e2e","1");
    sessionStorage.setItem("vt_sets_e2e","1");
    if(returning) localStorage.setItem("vt_days_v1",JSON.stringify({v:1,days:{"2026-11-26":{sec:240,n:1,ex:["s4-lip-trills"]}},rest:{bank:1,earnedAt:0,used:[]},backfilled:true}));
  },{lang,tab,returning});
  await page.goto(BASE+"/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.VTApp&&!!window.VTSets&&!!window.VTLoop);
  await page.waitForFunction((returning)=>returning
    ? document.body.classList.contains("loop-on")&&!document.body.classList.contains("loop-first")
    : document.body.classList.contains("loop-first"),returning);
}
async function showSkills(page){
  const first=page.locator("#btn-skill-first");
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.locator("#sets-sheet")).toBeVisible();
}
test("skill journey shows Observe, Try, Transfer and shares the actual session engine",async({page})=>{
  await boot(page);
  await expect(page.locator("#btn-skill-first")).toBeVisible();
  await expect(page.locator("#btn-skill-sets")).toBeHidden();
  await showSkills(page);
  await expect(page.locator("#sets-title")).toHaveText("Entrenamiento por habilidad");
  await expect(page.locator(".set-card")).toHaveCount(5);
  const card=page.locator('[data-set="s-skill-breath"]');
  await expect(card).toContainText("Observa");
  await expect(card).toContainText("Practica");
  await expect(card).toContainText("Transfiere");
  await expect(card).toContainText("Si incomoda");
  await card.locator('[data-set-start="s-skill-breath"]').click();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  const session=await page.evaluate(()=>window.VTStorage.getSession());
  expect(session.path).toBe("set");
  expect(session.set).toBe("s-skill-breath");
  expect(session.order).toEqual(["s18-costal-breath","s8-breath-support","s3-song-stanzas"]);
});
test("old goal picker remains ten and skill filter does not leak into goal filter",async({page})=>{
  await boot(page,"es","singing",true);
  await showSkills(page);
  await page.locator("#sets-focus").selectOption("breath");
  await expect(page.locator(".set-card")).toHaveCount(1);
  await expect(page.locator('[data-set="s-skill-breath"]')).toBeVisible();
  await page.locator("#sets-close").click();
  const more=page.locator("#btn-more-ways");
  await expect(more).toBeVisible();
  if(await more.getAttribute("aria-expanded")==="false") await more.click();
  await page.locator("#btn-sets").click();
  await expect(page.locator("#sets-title")).toHaveText("Rutinas por objetivo");
  await expect(page.locator(".set-card")).toHaveCount(10);
  const arbitrarySkillScore=await page.evaluate(()=>Object.keys(localStorage).filter(k=>/skill.*(?:score|mastery)/i.test(k)));
  expect(arbitrarySkillScore).toEqual([]);
});
test("English translation and 320px controls remain visible without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await boot(page,"en");
  await showSkills(page);
  await expect(page.locator("#sets-title")).toHaveText("Skill-focused practice");
  const card=page.locator('[data-set="s-skill-breath"]');
  await expect(card).toContainText("Observe");
  await expect(card).toContainText("Transfer");
  const layout=await page.evaluate(()=>{
    const sheet=document.querySelector("#sets-sheet .sets-card");
    const start=document.querySelector('[data-set="s-skill-breath"] [data-set-start]');
    return {overflow:document.documentElement.scrollWidth>innerWidth,width:sheet.getBoundingClientRect().width,button:start.getBoundingClientRect().height};
  });
  expect(layout.overflow,JSON.stringify(layout)).toBe(false);
  expect(layout.width).toBeLessThanOrEqual(320);
  expect(layout.button).toBeGreaterThanOrEqual(44);
});

test("day, week, month and navigation share one ledger across pages and tabs",async({page,context})=>{
  await page.clock.install({time:new Date("2026-11-27T12:00:00-05:00")});
  await page.addInitScript(()=>{
    localStorage.setItem("vt_lang","es");
    localStorage.setItem("vt_tour_v1","1");
    localStorage.setItem("vt_settings_v1",JSON.stringify({lastTab:"singing"}));
    localStorage.setItem("vt_days_v1",JSON.stringify({v:1,days:{
      "2026-10-31":{sec:120,n:1,ex:["s7-humming"]},
      "2026-11-02":{sec:180,n:1,ex:["s4-lip-trills"]},
      "2026-11-26":{sec:240,n:1,ex:["s9-pitch-match"]}
    },rest:{bank:1,earnedAt:0,used:[]},backfilled:true}));
    localStorage.setItem("vt_skill_discovery_v1",JSON.stringify({v:1,visits:1}));
    sessionStorage.setItem("vt_e2e","1");
    sessionStorage.setItem("vt_sets_e2e","1");
  });
  await page.goto(BASE+"/");
  await page.waitForFunction(()=>!!window.VTDays&&!!window.VTSets&&document.body.classList.contains("loop-on"));
  const before=await page.evaluate(()=>({
    s:window.VTDays.summary(),oct:window.VTDays.countDays("2026-10-01","2026-10-31"),
    nov:window.VTDays.countDays("2026-11-01","2026-11-30")
  }));
  expect(before.s.practiceDays).toBe(3);
  expect(before.s.weekDays).toBe(1);
  expect(before.oct).toBe(1);
  expect(before.nov).toBe(2);
  const more=page.locator("#btn-more-ways");
  if(await more.getAttribute("aria-expanded")==="false") await more.click();
  await page.locator("#btn-skill-sets").click();
  await page.locator("#sets-focus").selectOption("breath");
  await page.locator("#sets-close").click();
  await expect.poll(async()=>page.evaluate(()=>window.VTDays.summary().practiceDays)).toBe(3);
  for(const [button,view] of [["#btn-history","#view-history"],["#btn-plan","#view-plan"],["#btn-nav-home","#view-home"]]){
    await page.locator(button).click();
    await expect(page.locator(view)).toHaveClass(/active/);
    expect(await page.evaluate(()=>window.VTDays.summary().practiceDays)).toBe(3);
  }
  const second=await context.newPage();
  await second.goto(BASE+"/");
  await second.waitForFunction(()=>!!window.VTDays);
  expect(await second.evaluate(()=>window.VTDays.summary().practiceDays)).toBe(3);
  await second.close();
});
