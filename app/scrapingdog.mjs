// Contract: https://www.scrapingdog.com/documentation/amazon-offers-api/
// Compare the lowest available NEW item price, excluding delivery and coupons.
export function normalizeScrapingdog(payload, asin, now=Date.now()) {
  const fail=error=>({ok:false,error,retryable:false});
  if(payload?.asin!==asin) return fail('Product identity mismatch');
  let link;
  try {link=new URL(payload.link);} catch {return fail('Missing marketplace identity');}
  if(!['amazon.fr','www.amazon.fr'].includes(link.hostname)) return fail('Marketplace mismatch');
  if(!Array.isArray(payload.offers)) return fail('Missing offers');
  const prices=payload.offers.filter(o=>o.condition?.is_new===true
    && o.price?.currency==='EUR' && typeof o.price.value==='number'
    && Number.isFinite(o.price.value) && o.price.value>0
    && (o.minimum_order_quantity?.value??1)<=1)
    .map(o=>Math.round(o.price.value*100)).filter(Number.isSafeInteger);
  if(!prices.length) return fail('No eligible new-condition EUR offer');
  return {ok:true,product:{asin,marketplace:'amazon.fr',currency:'EUR',condition:'new',
    series:'NEW_ITEM',title:payload.title||asin,price_cents:Math.min(...prices),
    available:true,observed_at:new Date(now).toISOString(),is_demo:false}};
}

export async function fetchScrapingdog(asin, key) {
  if(!key) return {ok:false,error:'Scrapingdog API key has not been configured',retryable:false};
  const endpoint=new URL('https://api.scrapingdog.com/amazon/offers');
  endpoint.search=new URLSearchParams({api_key:key,asin,domain:'fr',country:'fr'});
  try {
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(60000)});
    if(!response.ok) return {ok:false,error:`Price provider returned HTTP ${response.status}`,
      retryable:response.status>=500,retry_after_seconds:0};
    return normalizeScrapingdog(await response.json(),asin);
  } catch {return {ok:false,error:'Price provider timeout or network failure',retryable:true};}
}
