import http from 'node:http';
// Public ingress can reach only the production Telegram webhook, never the editor.
const allowed='/webhook/wishlist-telegram-trigger/webhook';
http.createServer(async(req,res)=>{
  if(req.method!=='POST'||req.url!==allowed){res.writeHead(404);return res.end();}
  const secret=req.headers['x-telegram-bot-api-secret-token'];
  if(typeof secret!=='string'||!secret){res.writeHead(403);return res.end();}
  try {
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413);return res.end();}chunks.push(chunk);}
    const upstream=await fetch('http://n8n:5678'+allowed,{
      method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},
      body:Buffer.concat(chunks),signal:AbortSignal.timeout(15000),
    });
    res.writeHead(upstream.status,{'content-type':'application/json'});res.end(await upstream.text());
  } catch {res.writeHead(502);res.end();}
}).listen(8080,'0.0.0.0');
