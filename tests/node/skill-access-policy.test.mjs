import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("../../js/billing.js",import.meta.url),"utf8");
const TRIAL="vt_billing_trial_started_v1";
function browser({preview=false,stored={},claims=null,code=source}={}) {
  let time=Date.parse("2026-11-27T12:00:00Z");
  const bag=new Map(Object.entries(stored));
  class Clock extends Date { constructor(...args){super(...(args.length?args:[time]));} static now(){return time;} }
  const w={console,Date:Clock,navigator:{language:"en-US"},
    localStorage:{getItem:k=>bag.get(k)||null,setItem:(k,v)=>bag.set(k,String(v)),removeItem:k=>bag.delete(k)},
    VT_BILLING_CONFIG:{skillSetsRequirePro:!preview,freeTrialDays:7,trialRequiresOptIn:true,verification:{required:true}},
    VTLicense:{getClaims:()=>claims},addEventListener:()=>{},dispatchEvent:()=>{},CustomEvent:class{}};
  w.window=w;vm.runInNewContext(code,w);
  return {billing:w.VTBilling,bag,advance:n=>time+=n};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test("launch preview is distinct from the Pro capability and never spends the trial",()=>{
  const b=browser({preview:true});
  assert.equal(b.billing.can("skill_sets"),false);
  assert.deepEqual(plain(b.billing.skillSetAccess()),{allowed:true,mode:"preview",endsAt:null});
  assert.equal(b.bag.has(TRIAL),false);
  assert.equal(browser().billing.skillSetAccess().allowed,false);
});
test("explicit trial uses one immutable end, locks exactly at expiry and cannot restart",()=>{
  const b=browser();
  assert.equal(b.billing.skillSetAccess().mode,"locked");
  assert.equal(b.billing.startTrial().ok,true);
  const start=b.bag.get(TRIAL),end=Date.parse(start)+7*86400000;
  assert.deepEqual(plain(b.billing.skillSetAccess()),{allowed:true,mode:"trial",endsAt:end});
  b.advance(7*86400000-1);assert.equal(b.billing.skillSetAccess().allowed,true);
  b.advance(1);assert.equal(b.billing.skillSetAccess().allowed,false);
  assert.equal(b.billing.skillSetAccess().mode,"expired");
  assert.equal(b.billing.startTrial().reason,"used");assert.equal(b.bag.get(TRIAL),start);
});
test("unsigned paid, malformed and future trial dates cannot open the gated curriculum",()=>{
  for(const stored of [
    {vt_billing_v1:JSON.stringify({plan:"pro_yearly",status:"active",source:"paid"})},
    {[TRIAL]:"broken"}, {[TRIAL]:"2099-01-01T00:00:00Z"}
  ]) assert.equal(browser({stored}).billing.skillSetAccess().allowed,false);
});
test("verified capability respects the earlier token or paid-period expiry",()=>{
  const now=Date.parse("2026-11-27T12:00:00Z")/1000;
  const b=browser({claims:{plan:"pro_monthly",periodEnd:now+120,exp:now+60}});
  assert.deepEqual(plain(b.billing.skillSetAccess()),{allowed:true,mode:"pro",endsAt:(now+60)*1000});
  b.advance(60000);assert.equal(b.billing.skillSetAccess().allowed,false);
});
test("negative control: bypassing the earlier expiry resurrects an expired verified capability",()=>{
  const needle='const current = endsAt === null || nowMs() < endsAt;';
  assert.ok(source.includes(needle),"expiry source drift");
  const now=Date.parse("2026-11-27T12:00:00Z")/1000;
  const b=browser({claims:{plan:"pro_monthly",periodEnd:now+120,exp:now-1},code:source.replace(needle,"const current = true;")});
  assert.equal(b.billing.skillSetAccess().allowed,true);
  assert.equal(browser({claims:{plan:"pro_monthly",periodEnd:now+120,exp:now-1}}).billing.skillSetAccess().allowed,false);
});
