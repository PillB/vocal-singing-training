import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
function run(scenario){
 const dir=mkdtempSync(join(tmpdir(),'setup-key-test-'));const worker=join(dir,'workers/entitlements'),bin=join(dir,'bin');mkdirSync(join(worker,'scripts'),{recursive:true});mkdirSync(bin);
 cpSync(join(root,'workers/entitlements/scripts/setup.sh'),join(worker,'scripts/setup.sh'));
 cpSync(join(root,'workers/entitlements/wrangler.toml'),join(worker,'wrangler.toml'));
 const log=join(dir,'calls');writeFileSync(log,'');
 writeFileSync(join(bin,'npx'),`#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.CALLS,a.join(' ')+'\\n');
if(a.includes('namespace')&&a.includes('list'))console.log(JSON.stringify([{title:'ENTITLEMENTS',id:'a'.repeat(32)},{title:'ENTITLEMENTS_preview',id:'b'.repeat(32)}]));
else if(a.includes('d1')&&a.includes('list'))console.log(JSON.stringify([{name:'vocal-studio-accounts',uuid:'12345678-1234-1234-1234-123456789abc'}]));
else if(a.includes('secret')&&a.includes('list')){if(process.env.CASE==='error'){console.error('auth failed');process.exit(1)}const values={bad:'not JSON',object:JSON.stringify({success:false,result:[],errors:[{message:'inventory unavailable'}]}),empty:'[]'};console.log(values[process.env.CASE]??JSON.stringify([{name:'LICENSE_PRIVATE_KEY_PKCS8_B64'}]));}
else if(a.includes('secret')&&a.includes('put')){process.stdin.resume();process.stdin.on('end',()=>process.exit(0));}
`,{mode:0o700});
 writeFileSync(join(bin,'curl'),`#!/usr/bin/env node
const a=process.argv.slice(2).join(' ');console.log(a.includes('subdomain')?JSON.stringify({result:{subdomain:'fixture'}}):a.includes('jwks')?JSON.stringify({keys:[{kty:'EC',x:'existing-x',y:'existing-y'}]}):JSON.stringify({ok:true}));
`,{mode:0o700});
 const result=spawnSync('bash',[join(worker,'scripts/setup.sh')],{encoding:'utf8',timeout:15000,env:{...process.env,PATH:bin+':'+process.env.PATH,CALLS:log,CASE:scenario,CLOUDFLARE_API_TOKEN:'fixture-not-a-real-token',CLOUDFLARE_ACCOUNT_ID:'c'.repeat(32),ADMIN_EMAIL:''}});
 return{dir,worker,result,calls:readFileSync(log,'utf8')};
}
for(const scenario of ['error','bad','object','existing','empty'])test('setup preserves signing identity when secret inventory is '+scenario,()=>{
 const r=run(scenario);try{
  assert.equal(r.result.status,['existing','empty'].includes(scenario)?0:1,r.result.stdout+r.result.stderr);
  if(scenario==='empty')assert.equal((r.calls.match(/secret put/g)||[]).length,1);
  else assert.doesNotMatch(r.calls,/secret put/);
  if(scenario==='existing')assert.equal(JSON.parse(readFileSync(join(r.worker,'jwk.public.json'))).x,'existing-x');
  else if(scenario==='empty')assert.equal(JSON.parse(readFileSync(join(r.worker,'jwk.public.json'))).kty,'EC');
  else {assert.equal(existsSync(join(r.worker,'jwk.public.json')),false);assert.match(r.result.stderr,/Stopped without (generating|changing)/);}
 }finally{rmSync(r.dir,{recursive:true,force:true})}
});
