const {test,expect}=require("@playwright/test");
const BASE=process.env.BASE_URL||"http://127.0.0.1:8765";
async function boot(page,lang="es",tab="singing"){
  await page.addInitScript(({lang,tab})=>{
    localStorage.setItem("vt_tour_v1","1");
    localStorage.setItem("vt_lang",lang);
    localStorage.setItem("vt_settings_v1",JSON.stringify({lastTab:tab}));
    sessionStorage.setItem("vt_e2e","1");
    sessionStorage.setItem("vt_sets_e2e","1");
  },{lang,tab});
  await page.goto(BASE+"/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.VTApp&&!!window.VTSets);
}
async function showSkills(page){
  const more=page.locator("#btn-more-ways");
  if((await more.getAttribute("aria-expanded"))==="false") await more.click();
  await page.locator("#btn-skill-sets").click();
  await expect(page.locator("#sets-sheet")).toBeVisible();
}
test("skill journey shows Observe, Try, Transfer and shares the actual session engine",async({page})=>{
  await boot(page);
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
  await boot(page);
  await showSkills(page);
  await page.locator("#sets-focus").selectOption("breath");
  await expect(page.locator(".set-card")).toHaveCount(1);
  await expect(page.locator('[data-set="s-skill-breath"]')).toBeVisible();
  await page.locator("#sets-close").click();
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
