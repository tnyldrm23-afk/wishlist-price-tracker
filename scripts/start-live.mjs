import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {config} from './config.mjs';
const run=(args)=>execFileSync('docker',args,{stdio:'inherit'});
const env=config();
if(!env.SCRAPINGDOG_API_KEY||!env.TELEGRAM_BOT_TOKEN||env.ALLOWED_CHAT_ID==='10001')
  throw Error('Scrapingdog, Telegram and the private chat must be configured.');
run(['compose','up','-d','ollama','webhook-gateway']);
run(['compose','up','-d','--force-recreate','tunnel']);
let url;
for(let attempt=0;attempt<30&&!url;attempt++) {
  const logs=execFileSync('docker',['compose','logs','--no-color','tunnel'],{encoding:'utf8'});
  url=[...logs.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)].at(-1)?.[0];
  if(!url) await new Promise(r=>setTimeout(r,1000));
}
if(!url) throw Error('Tunnel URL is not ready. Run this script again.');
let source=readFileSync('.env','utf8');
for(const [key,value] of Object.entries({TRACKER_MODE:'live',PRICE_SOURCE:'scrapingdog',
  LLM_API_KEY:'ollama-local',LLM_BASE_URL:'http://ollama:11434/v1',LLM_MODEL:'qwen2.5:0.5b',WEBHOOK_URL:url+'/'})) {
  const pattern=new RegExp('^'+key+'=.*$','m');
  source=pattern.test(source)?source.replace(pattern,()=>key+'='+value):source+'\n'+key+'='+value+'\n';
}
writeFileSync('.env',source);chmodSync('.env',0o600);
execFileSync(process.execPath,['scripts/bootstrap.mjs'],{stdio:'inherit'});
run(['compose','exec','-T','n8n','n8n','publish:workflow','--id=wtEntry000000001']);
run(['compose','restart','n8n']);
console.log('Live workflow published. Verify Telegram webhook health before relying on alerts.');
