import assert from 'node:assert/strict';
import fs from 'node:fs';
import {references, hashOf, PAGES} from '../asset-versions.mjs';
import {chromium} from 'playwright';

const base='https://pillb.github.io/vocal-singing-training/';
const worker='https://vocal-studio-entitlements.vocalstudio-pe.workers.dev';
const report={commit:'801755ddf1577b4924aba355742cd19bb0df53f9',checkedAt:new Date().toISOString(),pages:[],assets:[],api:[],screens:[],failures:[]};
fs.mkdirSync('test-results/live-audit',{recursive:true});
const attempt=async(label,fn)=>{try{await fn();console.log('PASS',label)}catch(e){report.failures.push({label,error:e.message});console.error('FAIL',label,e.message)}};
const text=async(url,options={})=>{const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache',...options.headers}});const body=await r.text();assert.equal(r.status,200,url+' '+body.slice(0,500));return {r,body}};
const assets=new Map();
for(const page of PAGES)await attempt('page '+page,async()=>{
 const {body}=await text(new URL(page,base));
 assert.equal(hashOf(body),hashOf(fs.readFileSync(page,'utf8')),'published HTML differs from deployed commit: '+page);
 report.pages.push(page);
 for(const ref of references(body,page))assets.set(ref.file,ref);
});
const manifest=JSON.parse(fs.readFileSync('qa/asset-manifest.json','utf8'));
for(const [file,ref]of assets)await attempt('asset '+file,async()=>{
 assert.equal(ref.v,manifest[file]?.v,'cache version mismatch');
 const {body}=await text(new URL(file+'?v='+ref.v,base));
 assert.equal(hashOf(body),manifest[file].sha,'deployed content mismatch');report.assets.push(file);
});
for(const path of ['/v1/health?probe=1','/v1/auth/methods'])await attempt('worker '+path,async()=>{
 const {r,body}=await text(worker+path,{headers:{Origin:new URL(base).origin}});
 const value=JSON.parse(body);report.api.push({path,status:r.status,body:value,cors:r.headers.get('access-control-allow-origin')});
 assert.equal(r.headers.get('access-control-allow-origin'),new URL(base).origin,'production CORS');
 if(path.includes('health')){assert.equal(value.ok,true);assert.equal(value.probe?.db,'ok');assert.equal(value.probe?.kv,'ok')}
 else{assert.equal(typeof value.google,'boolean');assert.equal(typeof value.email,'boolean')}
});
const browser=await chromium.launch();
try{for(const [width,height]of [[1280,800],[390,844],[844,390]])await attempt(`screen ${width}x${height}`,async()=>{
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000});
 try{
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('vt_tour_v1','1');localStorage.setItem('vt_lang','es');sessionStorage.setItem('vt_e2e','1')});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const card=page.locator('#exercise-list .card-ex').first();await card.waitFor({state:'visible'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'home overflows sideways');
  await page.screenshot({path:`test-results/live-audit/home-${width}.png`,fullPage:true});
  await card.click();await page.locator('#view-exercise.active').waitFor({state:'visible'});
  await page.locator('#btn-practice-start').click({trial:true});
  const metrics=page.locator('#btn-toggle-metrics');await metrics.click();assert.equal(await metrics.getAttribute('aria-expanded'),'true');
  await page.screenshot({path:`test-results/live-audit/exercise-${width}.png`,fullPage:true});
  await page.locator('#btn-back-home').click();await card.waitFor({state:'visible'});
  assert.deepEqual(errors,[],'uncaught page errors');report.screens.push({width,height,errors});
 }finally{await context.close()}
})}finally{await browser.close();fs.writeFileSync('test-results/live-audit/report.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({pages:report.pages.length,assets:report.assets.length,api:report.api,screens:report.screens,failures:report.failures}));
if(report.failures.length)process.exitCode=1;
