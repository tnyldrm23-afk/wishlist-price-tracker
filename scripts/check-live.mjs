import {config} from './config.mjs';
const env=config();
try {
 const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,{signal:AbortSignal.timeout(15000)});
 const b=await r.json();
 if(!b.ok) throw Error('Telegram status unavailable');
 console.log(JSON.stringify({registered_path:b.result.url?new URL(b.result.url).pathname:null,registered_host:b.result.url?new URL(b.result.url).hostname:null,webhook_matches:b.result.url===env.WEBHOOK_URL+'webhook/wishlist-telegram-trigger/webhook',
 pending_updates:b.result.pending_update_count,last_error:b.result.last_error_message||null},null,2));
 for(const [path,method,expected] of [['','GET',404],['rest/workflows','GET',404],['webhook/wishlist-telegram-trigger/webhook','POST',403]]) {
   const r=await fetch(env.WEBHOOK_URL+path,{method,signal:AbortSignal.timeout(15000)});
   console.log(`Public ${method} /${path}: ${r.status} (expected ${expected})`);
   if(r.status!==expected) process.exitCode=1;
 }
 if(b.result.url!==env.WEBHOOK_URL+'webhook/wishlist-telegram-trigger/webhook')process.exitCode=1;
} catch(error) {console.error('Live connectivity check failed:',error.cause?.code||error.name);process.exitCode=1;}
