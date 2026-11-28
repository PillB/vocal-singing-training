import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { skillSetProblems } from "../../qa/audit-skill-sets.mjs";

const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
function page(source=read("js/session-sets.js"),lang="es",gated=false) {
  const win={console};
  win.window=win;
  win.document={querySelector:()=>null};
  win.addEventListener=()=>{};
  const storage=new Map();
  win.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
  win.sessionStorage={getItem:()=>null,setItem:()=>{}};
  win.navigator={language:"en-US"};
  win.VT_BILLING_CONFIG={skillSetsRequirePro:gated,trialRequiresOptIn:true,freeTrialDays:7};
  runInNewContext(read("js/billing.js"),win);
  runInNewContext(read("js/exercises-data.js"),win);
  const all=[...win.VT_EXERCISES.vocal,...win.VT_EXERCISES.singing];
  let session=null;
  win.VTStorage={setSession:x=>session=x,getSession:()=>session};
  win.VTI18n={lang,t:x=>x};
  runInNewContext(read("js/session.js"),win);
  runInNewContext(source,win);
  win.VTSets.bind({
    getTab:()=>"singing",
    setTab:()=>{},
    findExercise:id=>all.find(x=>x.id===id),
    startSet:r=>win.VTSession.start("singing","set",r)
  });
  return {win,all,catalog:new Map(all.map(x=>[x.id,x])),session:()=>session};
}
const p=page();
const toPlain=x=>JSON.parse(JSON.stringify(x));
const defs=toPlain(p.win.VTSets.SKILL_SETS);
test("ten bilingual skill routes reference real timed exercises and safe independent transfer",()=>{
  assert.equal(defs.length,10);
  assert.deepEqual(skillSetProblems(defs,p.catalog),[]);
  assert.equal(defs.filter(x=>x.track==="vocal").length,5);
  assert.equal(defs.filter(x=>x.track==="singing").length,5);
  assert.ok(defs.every(x=>x.es.transfer!==x.es.goal&&x.es.check!==x.es.transfer));
});
test("existing goal sets and the skill selection remain separate in both languages",()=>{
  assert.equal(p.win.VTSets.SETS.length,20);
  assert.equal(p.win.VTSets.list("singing").length,10);
  assert.equal(p.win.VTSets.list("vocal").length,10);
  assert.equal(p.win.VTSets.skillList("singing").length,5);
  assert.equal(p.win.VTSets.skillList("vocal").length,5);
  assert.equal(p.win.VTSets.resolve("s-skill-breath").kind,"skill");
  assert.equal(p.win.VTSets.resolve("s-warmup").kind,"goal");
  assert.equal(page(undefined,"en").win.VTSets.resolve("s-skill-breath").name,"Breath between phrases");
});
test("real VTSession.start retains one set path and actual sequence/timing",()=>{
  const q=page();
  const started=q.win.VTSets.start("s-skill-breath");
  assert.equal(started.path,"set");
  assert.equal(started.set,"s-skill-breath");
  assert.deepEqual(toPlain(started.order),["s18-costal-breath","s8-breath-support","s3-song-stanzas"]);
  assert.equal(started.sec["s8-breath-support"],120);
  assert.equal(q.session().set,started.set);
});
test("source mutation: dropping SKILL_SETS from the resolver breaks actual routing",()=>{
  const source=read("js/session-sets.js");
  const needle="[...SETS, ...SKILL_SETS].find((s) => s.id === id)";
  assert.ok(source.includes(needle),"source-drift: resolver text changed; review this test");
  const broken=page(source.replace(needle,"SETS.find((s) => s.id === id)"));
  assert.equal(broken.win.VTSets.resolve("s-skill-breath"),null);
  assert.equal(broken.win.VTSets.skillList("singing").length,0);
  assert.equal(p.win.VTSets.skillList("singing").length,5);
});
test("new skills do not award an existing goal-set milestone",()=>{
  const q=page();
  const noted=[];
  q.win.VTPath={noteSet:(...args)=>noted.push(args),doneHtml:()=>""};
  q.win.VTSets.onComplete({path:"set",set:"s-skill-breath"});
  assert.equal(noted.length,0);
  q.win.VTSets.onComplete({path:"set",set:"s-warmup"});
  assert.equal(noted.length,1);
  // Fault injection: the exact bad call would credit an unvalidated skill set.
  const src=read("js/session-sets.js");
  const needle='if (set.kind === "skill") return;';
  assert.ok(src.includes(needle),"milestone source drift");
  const broken=page(src.replace(needle,""));
  const undeserved=[];
  broken.win.VTPath={noteSet:(...args)=>undeserved.push(args),doneHtml:()=>""};
  broken.win.VTSets.onComplete({path:"set",set:"s-skill-breath"});
  assert.equal(undeserved.length,1);
});
test("negative fixtures reject missing catalogue IDs, unsafe time, missing teaching and fake efficacy",()=>{
  const plant=fn=>{const items=toPlain(defs);fn(items);return skillSetProblems(items,p.catalog).join(" | ");};
  assert.match(plant(x=>x[0].steps[0][0]="s99-removed"),/missing catalogue ID/);
  assert.match(plant(x=>x[0].steps[0][1]=99999),/unsafe timer/);
  assert.match(plant(x=>x[1].id=x[0].id),/duplicate skill ID/);
  assert.match(plant(x=>x[0].es.transfer=""),/missing es.transfer/);
  assert.match(plant(x=>x[0].en.fallback=""),/missing en.fallback/);
  assert.match(plant(x=>x[0].evidence=["E99"]),/missing evidence/);
  assert.match(plant(x=>x[0].es.why="Guaranteed improvement"),/unsupported clinical promise/);
  assert.match(plant(x=>x[0].kind="medical"),/not a skill-repair/);
  assert.match(plant(x=>delete x[0].accessTier),/missing Pro curriculum tag/);
  assert.match(plant(x=>x[0].steps[0][0]="v7-record-review"),/delayed review cannot fit/);
});

test("locked direct start cannot replace the session; original goal sets remain available",()=>{
  const q=page(undefined,"es",true);
  assert.equal(q.win.VTSets.start("s-skill-breath"),null);
  assert.equal(q.session(),null);
  assert.equal(q.win.VTSets.start("s-warmup").path,"set");
});
