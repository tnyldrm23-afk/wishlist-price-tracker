import {readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {config} from './config.mjs';

// Never print credentials, request URLs, or Telegram message bodies.
const env=config();
if(!env.TELEGRAM_BOT_TOKEN) throw Error('Set TELEGRAM_BOT_TOKEN in .env first.');
async function api(method, body={}) {
  try {
    const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
    });
    const data=await response.json();
    if(!data.ok) throw Error('API rejected request');
    return data.result;
  } catch {
    throw Error(`Telegram ${method} failed. Check the token and network connection.`);
  }
}
try {
  const bot=await api('getMe');
  console.log(`Bot verified: @${bot.username}`);
  const webhook=await api('getWebhookInfo');
  if(webhook.url) {
    console.log('An existing webhook is configured; it has been left unchanged.');
    process.exit(0);
  }
  // No offset: do not acknowledge or consume updates before n8n receives them.
  const updates=await api('getUpdates',{timeout:0,limit:100});
  const chats=new Set(updates.filter(u=>u.message?.chat?.type==='private'
    && /^\/start(?:\s|$)/.test(u.message.text||''))
    .map(u=>String(u.message.chat.id)));
  if(chats.size===1 && (!env.ALLOWED_CHAT_ID || env.ALLOWED_CHAT_ID==='10001')) {
    const id=[...chats][0];
    const source=readFileSync('.env','utf8');
    writeFileSync('.env',source.replace(/^ALLOWED_CHAT_ID=.*$/m,()=>`ALLOWED_CHAT_ID=${id}`));
    chmodSync('.env',0o600);
    console.log('One private /start conversation found; saved as the allowed chat.');
  } else if(chats.size===0) {
    console.log('No private /start received yet. Open your bot and press Start.');
  } else if(chats.size>1) {
    console.log('Multiple private conversations found. Set ALLOWED_CHAT_ID explicitly.');
  } else {
    console.log('An allowed chat is already configured; it has been left unchanged.');
  }
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
