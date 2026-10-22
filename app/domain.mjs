// These exact functions are embedded in n8n Code nodes by scripts/generate.mjs.
export function parseCommand(update, allowedChatId) {
  const msg=update?.message;
  if (!msg || String(msg.chat?.id)!==String(allowedChatId) || msg.chat?.type!=='private') return {action:'ignore'};
  const base={chat_id:String(msg.chat.id), update_id:String(update.update_id ?? ''), text:String(msg.text??'').trim()};
  if (!/^\d+$/.test(base.update_id)) return {...base,action:'invalid',reply:'Invalid update identifier.'};
  const parts=base.text.split(/\s+/); const cmd=parts.shift()?.toLowerCase();
  const usage='Commands:\n/watch <amazon.fr product link> <target EUR> [discount %]\n/list\n/remove <watch ID>\n/check\nExample: /watch https://www.amazon.fr/dp/B000TEST01 90 15';
  if (cmd==='/help' || cmd==='/start') return {...base,action:'help',reply:usage};
  if ((cmd==='/check'||cmd==='/list') && !parts.length) return {...base,action:cmd.slice(1)};
  if (cmd==='/remove' && parts.length===1 && /^[1-9]\d*$/.test(parts[0])) return {...base,action:'remove',watch_id:parts[0]};
  if(cmd!=='/watch' || parts.length<2 || parts.length>3) return {...base,action:'invalid',reply:usage};
  // Use an anchored allowlist parser: n8n's isolated Code runtime has no URL global.
  const match=parts[0].match(/^https:\/\/(?:www\.)?amazon\.fr\/(?:[^?#\s]+\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/[^?#\s]*)?(?:\?[^#\s]*)?(?:#[^\s]*)?$/i);
  if(!match) return {...base,action:'invalid',reply:'Only full Amazon France product links are supported. Open shortened links in your browser first.'};
  if(!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(parts[1])) return {...base,action:'invalid',reply:'Target price must be a positive EUR amount with at most two decimals.'};
  const target_cents=Math.round(Number(parts[1].replace(',','.'))*100);
  const threshold=parts[2]??'15';
  if(!/^\d{1,2}(?:\.\d{1,2})?$/.test(threshold)||Number(threshold)<=0||Number(threshold)>=100||target_cents<=0)
    return {...base,action:'invalid',reply:'Use a positive target price and a discount percentage greater than 0 and below 100.'};
  const asin=match[1].toUpperCase();
  return {...base,action:'watch',asin,url:`https://www.amazon.fr/dp/${asin}`,target_cents,discount_bps:Math.round(Number(threshold)*100)};
}
export function validatePrice(body, asin, now=Date.now()) {
  if (!body?.ok) return {valid:false,reason:body?.error??'Price service unavailable',retryable:!!body?.retryable && (Number(body?.retry_after_seconds)||0)<=60,retry_after_seconds:Math.min(60,Math.max(0,Number(body?.retry_after_seconds)||0))};
  const p=body.product, time=Date.parse(p?.observed_at);
  if(!p || p.asin!==asin || p.marketplace!=='amazon.fr' || p.currency!=='EUR' || p.condition!=='new' || p.series!=='NEW_ITEM') return {valid:false,reason:'Product or price basis mismatch',retryable:false};
  if(!p.available || !Number.isSafeInteger(p.price_cents)||p.price_cents<=0) return {valid:false,reason:'No valid available price',retryable:false};
  if(!Number.isFinite(time)||time>now+60000||now-time>6*3600000) return {valid:false,reason:'Stale or invalid observation time',retryable:false};
  return {valid:true,product:{...p,title:String(p.title??asin).replace(/[\x00-\x1f]/g,' ').slice(0,250)}};
}
export function calculateDecision(watch, product) {
  const current=product.price_cents, baseline=Math.max(Number(watch.baseline_cents)||0,current);
  const target=current<=Number(watch.target_cents);
  const significant=(baseline-current)*10000>=baseline*Number(watch.discount_bps);
  const qualifies=target||significant;
  const newLow=watch.last_alert_cents==null || current<Number(watch.last_alert_cents);
  return {baseline_cents:baseline,price_cents:current,drop_percent:Math.round((baseline-current)*10000/baseline)/100,
    target_met:target,significant_drop:significant,qualifies,should_alert:qualifies&&(!watch.qualifying||newLow)};
}
export function formatAlert(watch, product, decision) {
  const money=n=>(Number(n)/100).toFixed(2)+' EUR';
  return `${product.is_demo?'[DEMO - simulated prices]\n':''}${decision.target_met?'Target price reached!':'Significant price drop!'}\n${product.title}\nCurrent: ${money(product.price_cents)}\nObserved reference: ${money(decision.baseline_cents)}\nDecrease: ${decision.drop_percent.toFixed(2)}%\nYour target: ${money(watch.target_cents)}${decision.target_met?'':` (${money(product.price_cents-watch.target_cents)} above target)`}\nObserved: ${product.observed_at}\nNew condition; item price only. Shipping and personal coupons excluded.\n${watch.url}`;
}
export function normalizeKeepa(payload, asin) {
  const p=payload?.products?.find(p=>p.asin===asin);
  if(!p || p.domainId!==4) return {ok:false,error:'Product not found on Amazon France',retryable:false};
  const series=p.csv?.[1]; // Keepa NEW: new-condition item price, excluding shipping.
  const price=Array.isArray(series)&&series.length>=2?series.at(-1):null;
  const time=Number.isFinite(p.lastUpdate)?new Date((p.lastUpdate+21564000)*60000).toISOString():null;
  return {ok:true,product:{asin,marketplace:'amazon.fr',currency:'EUR',condition:'new',series:'NEW_ITEM',
    title:p.title??asin,price_cents:price,available:Number.isInteger(price)&&price>0,observed_at:time,is_demo:false}};
}
