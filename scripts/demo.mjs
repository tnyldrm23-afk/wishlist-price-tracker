import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execAsync=promisify(execFile);
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {config} from './config.mjs';
const env=config();
if(env.TRACKER_MODE!=='demo'||env.PRICE_SOURCE!=='demo'||env.ALLOWED_CHAT_ID!=='10001')throw Error('The test harness runs only with the reserved demo chat 10001 and demo source.');
const report=[];let nextId=100;
function docker(args,input){return execFileSync('docker',['compose',...args],{input,encoding:'utf8',maxBuffer:20*1024*1024,timeout:120000,stdio:['pipe','pipe','pipe']});}
function sql(query){return docker(['exec','-T','postgres','psql','-U','wishlist','-d','wishlist','-tA','-v','ON_ERROR_STOP=1'],query).trim();}
async function api(path,data){const r=await fetch('http://localhost:8787'+path,{method:data?'POST':'GET',headers:{connection:'close','x-demo-key':env.DEMO_API_KEY,'content-type':'application/json'},body:data?JSON.stringify(data):undefined});if(!r.ok)throw Error(`Demo API ${r.status}`);return r.json();}
async function scenario(extra={}){return api('/scenario',{asin:'B000TEST01',price_cents:12000,...extra});}
async function command(text,options={}){
 const id=options.id??nextId++,wf=JSON.parse(readFileSync('workflows/demo.json','utf8'));
 const update={update_id:id,message:{chat:{id:options.chat??10001,type:'private'},text}};
 wf.nodes.find(n=>n.name==='Create test message').parameters.jsCode=options.schedule?JSON.parse(readFileSync('workflows/entry.json','utf8')).nodes.find(n=>n.name==='Prepare daily check').parameters.jsCode:'return [{json:'+JSON.stringify({update})+'}];';
 if(options.schedule)wf.nodes.find(n=>n.name==='Process test command').parameters.workflowId.value='wtRunChecks00001';
 writeFileSync('.runtime/demo-run.json',JSON.stringify(wf));
 docker(['exec','-T','n8n','n8n','import:workflow','--input=/bootstrap/demo-run.json']);
 let out;
 try{out=docker(['exec','-T','-e','N8N_RUNNERS_BROKER_PORT=5680','n8n','n8n','execute','--id=wtDemo0000000001','--rawOutput']);}
 catch(e){writeFileSync(`.runtime/demo-${id}.log`,String(e.stdout??'')+'\n'+String(e.stderr??''));throw Error(`n8n failed for update ${id}; inspect .runtime/demo-${id}.log`);}
 writeFileSync(`.runtime/demo-${id}.log`,out);
 const begin=out.indexOf('\n{'),end=out.lastIndexOf('\n}');
 const result=JSON.parse(out.slice(begin+1,end+2));
 assert.equal(result.status,'success');
 return {id,result:result.data.resultData.runData['Process test command'].at(-1).data.main[0][0]?.json};
}
async function check(name,fn){await fn();report.push({name,status:'passed'});console.log('PASS '+name);writeFileSync('docs/demo-results.json',JSON.stringify({tested_at:new Date().toISOString(),mode:'demo',n8n:'2.43.4',tests:report},null,2)+'\n');}
const alertCount=()=>Number(sql("SELECT count(*) FROM tracker.alerts WHERE status='sent';"));
assert.equal(sql("SELECT count(*) FROM tracker.watches WHERE source<>'demo';"),'0','Refusing to reset non-demo data');
sql('TRUNCATE tracker.alerts,tracker.observations,tracker.errors,tracker.watches,tracker.updates RESTART IDENTITY;');
await api('/reset',{});
await check('Register a product at EUR 120 through n8n and PostgreSQL',async()=>{
 await scenario();const r=await command('/watch https://www.amazon.fr/dp/B000TEST01 90 15');
 assert.equal(sql('SELECT count(*) FROM tracker.watches;'),'1');assert.equal(r.result.registered,true);assert.match(r.result.reply,/DEMO AI fixture/);
});
await check('EUR 95 triggers significant-drop alert above EUR 90 target',async()=>{
 await scenario({price_cents:9500});await command('/check');assert.equal(alertCount(),1);const m=(await api('/state')).messages.find(m=>m.delivery_key.startsWith('alert:'));assert.match(m.text,/20.83%/);assert.match(m.text,/5.00 EUR above target/);
});
await check('Repeated EUR 95 observation sends no duplicate alert',async()=>{await command('/check');assert.equal(alertCount(),1);});
let targetUpdate;
await check('EUR 89 triggers target alert and combines both rules',async()=>{await scenario({price_cents:8900});targetUpdate=await command('/check');assert.equal(alertCount(),2);const m=(await api('/state')).messages.filter(m=>m.delivery_key.startsWith('alert:')).at(-1);assert.match(m.text,/Target price reached/);});
await check('Duplicate Telegram update is ignored',async()=>{const n=(await api('/state')).messages.length;const r=await command('/check',{id:targetUpdate.id});assert.equal(r.result.status,'duplicate-update');assert.equal((await api('/state')).messages.length,n);});
await check('Recovery and a later discount start a new alert episode',async()=>{await scenario({price_cents:11000});await command('/check');assert.equal(alertCount(),2);await scenario({price_cents:9500});await command('/check');assert.equal(alertCount(),3);});
await check('Stale prices are logged, not treated as discounts',async()=>{const n=sql('SELECT count(*) FROM tracker.observations;');await scenario({price_cents:100,age_seconds:30000});await command('/check');assert.equal(sql('SELECT count(*) FROM tracker.observations;'),n);assert.equal(alertCount(),3);assert.ok(Number(sql('SELECT count(*) FROM tracker.errors;'))>=1);});
await check('429 and 503 recover on the third attempt',async()=>{await scenario({price_cents:9400,failures:[429,503]});await command('/check');assert.equal((await api('/state')).calls.B000TEST01,3);assert.equal(alertCount(),4);});
await check('Persistent failure stops after three attempts',async()=>{await scenario({failures:[503,503,503,503]});await command('/check');assert.equal((await api('/state')).calls.B000TEST01,3);assert.equal(alertCount(),4);});
await check('Unavailable and wrong-currency prices do not alert',async()=>{await scenario({price_cents:100,available:false});await command('/check');await scenario({price_cents:100,currency:'USD'});await command('/check');assert.equal(alertCount(),4);});
await check('Unauthorized chat and unsupported URL cannot register watches',async()=>{const r=await command('/watch https://amazon.fr/dp/B000TEST02 50',{chat:999});assert.equal(r.result.status,'ignored');await command('/watch https://amazon.fr.evil.com/dp/B000TEST02 50');assert.equal(sql('SELECT count(*) FROM tracker.watches;'),'1');});
await check('Five-product limit is enforced',async()=>{await scenario();for(let i=2;i<=6;i++)await command(`/watch https://amazon.fr/dp/B000TEST0${i} 50`);assert.equal(sql('SELECT count(*) FROM tracker.watches WHERE active;'),'5');});
await check('List and remove commands persist their results',async()=>{const r=await command('/list');assert.match(r.result.reply,/#1/);await command('/remove 5');assert.equal(sql('SELECT count(*) FROM tracker.watches WHERE active;'),'4');});
await check('Daily schedule configuration invokes the shared checking workflow',async()=>{await scenario({price_cents:9300});const r=await command('',{schedule:true});assert.equal(r.result.results.length,4);assert.ok(r.result.results.some(x=>x.should_send));});
await check('AI outage falls back to the original product title',async()=>{await scenario({asin:'B000TEST06',title:'Fallback headphones',ai_failure:true});const r=await command('/watch https://amazon.fr/dp/B000TEST06 50');assert.equal(r.result.registered,true);assert.match(r.result.reply,/Fallback headphones/);assert.doesNotMatch(r.result.reply,/DEMO AI fixture/);await scenario({ai_failure:false});});
await check('Concurrent database checks reserve only one alert',async()=>{
 const w=JSON.parse(sql("SELECT row_to_json(w) FROM tracker.watches w WHERE asin='B000TEST06';"));
 const p={watch:w,product:{asin:w.asin,price_cents:8000,observed_at:new Date().toISOString()}};
 const q="SELECT tracker.observe('"+JSON.stringify(p).replaceAll("'","''")+"'::jsonb);";
 const results=await Promise.all([0,1].map(()=>execAsync('docker',['compose','exec','-T','postgres','psql','-U','wishlist','-d','wishlist','-tA','-v','ON_ERROR_STOP=1','-c',q],{maxBuffer:100000})));
 assert.equal(results.map(r=>JSON.parse(r.stdout.trim())).filter(x=>x.should_send).length,1);
 sql("UPDATE tracker.alerts SET status='failed' WHERE watch_id="+w.id+" AND status='pending';");
});
await check('Ambiguous delivery is flagged and not automatically resent',async()=>{
 await scenario({price_cents:8000,delivery_failure:true});await command('/check');
 assert.ok(Number(sql("SELECT count(*) FROM tracker.alerts WHERE status='review';"))>=1);
 const before=(await api('/state')).messages.filter(x=>x.delivery_key.startsWith('alert:')).length;
 await scenario({price_cents:7900});await command('/check');
 assert.equal((await api('/state')).messages.filter(x=>x.delivery_key.startsWith('alert:')).length,before);
 await scenario({delivery_failure:false});
});
docker(['exec','-T','n8n','n8n','import:workflow','--input=/workflows/demo.json']);
console.log(`Demo complete: ${report.length} end-to-end scenarios passed. External messages sent: 0.`);
