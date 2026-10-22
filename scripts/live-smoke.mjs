import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {config} from './config.mjs';
const env=config();
assert.equal(env.TRACKER_MODE,'live');
assert.equal(env.PRICE_SOURCE,'scrapingdog');
const asin='B004YAVF8I';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:16*1024*1024});
const sql=query=>docker(['compose','exec','-T','postgres','psql','-U','wishlist','-d','wishlist','-At','-c',query]).trim();
assert.match(env.ALLOWED_CHAT_ID,/^\d+$/);
const filter=`chat_id='${env.ALLOWED_CHAT_ID}' AND asin='${asin}' AND source='scrapingdog'`;
assert.equal(sql(`SELECT count(*) FROM tracker.watches WHERE ${filter} AND active;`),'0','Refusing to change an existing personal watch.');
const original=readFileSync('workflows/demo.json','utf8');
async function command(text,label){
 const w=JSON.parse(original);
 w.nodes.find(n=>n.name==='Create test message').parameters.jsCode='return [{json:'+JSON.stringify({update:{update_id:Date.now(),message:{chat:{id:Number(env.ALLOWED_CHAT_ID),type:'private'},text}}})+'}];';
 writeFileSync('.runtime/live-smoke.json',JSON.stringify(w));
 docker(['compose','exec','-T','n8n','n8n','import:workflow','--input=/bootstrap/live-smoke.json']);
 const output=docker(['compose','exec','-T','-e','N8N_RUNNERS_BROKER_PORT=5680','n8n','n8n','execute','--id=wtDemo0000000001']);
 writeFileSync(`.runtime/live-${label}.log`,output,{mode:0o600});
 assert.match(output,/Execution was successful/);
 console.log(label+': execution passed');
}
try {
 await command(`/watch https://www.amazon.fr/dp/${asin} 1 15`,'registration');
 const id=sql(`SELECT id FROM tracker.watches WHERE ${filter} AND active;`);
 assert.match(id,/^\d+$/);
 const log=readFileSync('.runtime/live-registration.log','utf8');
 assert.match(log,/"delivered": true/);
 await command('/list','list');
 await command('/remove '+id,'cleanup');
 assert.equal(sql(`SELECT count(*) FROM tracker.watches WHERE ${filter} AND active;`),'0');
 console.log('Real API registration and Telegram delivery verified. Temporary watch removed.');
} finally {
 docker(['compose','exec','-T','n8n','n8n','import:workflow','--input=/workflows/demo.json']);
}
