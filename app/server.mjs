import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {normalizeKeepa} from './domain.mjs';
import {fetchScrapingdog} from './scrapingdog.mjs';
const mode=process.env.PRICE_SOURCE??'demo';
let scenarios=new Map(), messages=new Map(), calls=new Map(), aiFailure=false, deliveryFailure=false;
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
function authorized(req) {
 const a=Buffer.from(req.headers['x-demo-key']??''),b=Buffer.from(process.env.DEMO_API_KEY??'');
 return b.length>0&&a.length===b.length&&timingSafeEqual(a,b);
}
async function body(req) {
 let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw Error('Request too large');}
 return JSON.parse(text||'{}');
}
http.createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/health') return send(res,200,{status:'ok',source:mode});
 if(!authorized(req) && !url.pathname.startsWith('/v1/')) return send(res,401,{error:'Authentication required'});
 if(url.pathname==='/price') {
   const asin=url.searchParams.get('asin');
   if(!/^[A-Z0-9]{10}$/.test(asin??'')) return send(res,200,{ok:false,error:'Invalid product ID',retryable:false});
   if(mode==='demo') {
     const s=scenarios.get(asin)??{price_cents:12000,title:'Demo headphones',available:true};
     const count=(calls.get(asin)??0)+1;calls.set(asin,count);
     if(s.failures?.length) {const status=s.failures.shift();if(status!==200)return send(res,200,{ok:false,error:`Simulated HTTP ${status}`,retryable:status===429||status>=500,retry_after_seconds:s.retry_after_seconds??0});}
     return send(res,200,{ok:true,product:{asin,marketplace:'amazon.fr',currency:s.currency??'EUR',condition:'new',series:'NEW_ITEM',title:s.title??'Demo headphones',price_cents:s.price_cents??12000,available:s.available!==false,observed_at:new Date(Date.now()-(s.age_seconds??0)*1000).toISOString(),is_demo:true}});
   }
   if(mode==='scrapingdog')return send(res,200,await fetchScrapingdog(asin,process.env.SCRAPINGDOG_API_KEY));
   if(mode!=='keepa')return send(res,200,{ok:false,error:'Unsupported price source',retryable:false});
   if(!process.env.KEEPA_API_KEY)return send(res,200,{ok:false,error:'Keepa API key has not been configured',retryable:false});
   const endpoint=new URL('https://api.keepa.com/product');
   endpoint.search=new URLSearchParams({key:process.env.KEEPA_API_KEY,domain:'4',asin,history:'1',update:'1'});
   try {
     const r=await fetch(endpoint,{signal:AbortSignal.timeout(20000)});
     if(!r.ok)return send(res,200,{ok:false,error:`Price provider returned HTTP ${r.status}`,retryable:r.status===429||r.status>=500,retry_after_seconds:Number(r.headers.get('retry-after'))||0});
     const data=await r.json();
     if(data.error)return send(res,200,{ok:false,error:'Price provider rejected request',retryable:false});
     return send(res,200,normalizeKeepa(data,asin));
   }catch{return send(res,200,{ok:false,error:'Price provider timeout or network failure',retryable:true});}
 }
 if(mode!=='demo')return send(res,404,{error:'Demo endpoints disabled'});
 if(url.pathname==='/scenario'&&req.method==='POST') {
   const b=await body(req);if(!/^[A-Z0-9]{10}$/.test(b.asin??''))return send(res,400,{error:'asin required'});
   scenarios.set(b.asin,b);calls.set(b.asin,0);if(typeof b.ai_failure==='boolean')aiFailure=b.ai_failure;if(typeof b.delivery_failure==='boolean')deliveryFailure=b.delivery_failure;return send(res,200,{ok:true});
 }
 if(url.pathname==='/messages'&&req.method==='POST') {
   const b=await body(req);if(!b.delivery_key||!b.text)return send(res,400,{error:'delivery_key and text required'});
   if(!messages.has(b.delivery_key))messages.set(b.delivery_key,{...b,message_id:messages.size+1,received_at:new Date().toISOString()});
   if(deliveryFailure && b.delivery_key.startsWith('alert:'))return send(res,503,{error:'Simulated ambiguous delivery after capture'});
   return send(res,200,{ok:true,result:{message_id:messages.get(b.delivery_key).message_id}});
 }
 if(url.pathname==='/state')return send(res,200,{messages:[...messages.values()],calls:Object.fromEntries(calls)});
 if(url.pathname==='/reset'&&req.method==='POST'){scenarios.clear();messages.clear();calls.clear();aiFailure=false;deliveryFailure=false;return send(res,200,{ok:true});}
 // OpenAI-compatible fixture exercises the n8n LLM Chain without a paid model.
 if(url.pathname==='/v1/chat/completions'&&req.method==='POST'){
   const b=await body(req);if(aiFailure)return send(res,503,{error:{message:'Simulated model failure',type:'server_error'}});const content='[DEMO AI fixture] New-condition product saved to your wishlist.';
   return send(res,200,{id:'demo-completion',object:'chat.completion',created:Math.floor(Date.now()/1000),model:b.model??'demo-model',choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
 }
 return send(res,404,{error:'Not found'});
 }catch {send(res,400,{error:'Invalid request'});}
}).listen(8080,'0.0.0.0',()=>console.log(`Price adapter ready; source=${mode}; demo delivery=${mode==='demo'}`));
