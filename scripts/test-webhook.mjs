import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {config} from './config.mjs';
const env=config(),workflow=JSON.parse(readFileSync('workflows/entry.json','utf8'));
const node=workflow.nodes.find(n=>n.type==='n8n-nodes-base.telegramTrigger');
const secret=(workflow.id+'_'+node.id).replace(/[^a-zA-Z0-9_-]+/g,'');
const id=String(Date.now());
try {
 const response=await fetch(env.WEBHOOK_URL+'webhook/wishlist-telegram-trigger/webhook',{
   method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},
   body:JSON.stringify({update_id:Number(id),message:{chat:{id:Number(env.ALLOWED_CHAT_ID),type:'private'},text:'/list'}}),
   signal:AbortSignal.timeout(20000),
 });
 if(!response.ok)throw Error('Webhook returned HTTP '+response.status);
 for(let i=0;i<30;i++) {
   const status=execFileSync('docker',['compose','exec','-T','postgres','psql','-U','wishlist','-d','wishlist','-At','-c',`SELECT status FROM tracker.updates WHERE update_id='${id}';`],{encoding:'utf8'}).trim();
   if(status==='done'){console.log('Authenticated HTTPS webhook → n8n Telegram Trigger → Telegram reply: passed.');process.exit(0);}
   if(status==='review')throw Error('Telegram delivery needs review');
   await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('Webhook execution did not finish within 30 seconds');
} catch(error) {console.error(error.message);process.exitCode=1;}
