import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {config} from './config.mjs';
console.log('Node:',process.version);
console.log('.env:',existsSync('.env')?'present':'missing');
if(existsSync('.env')){const e=config();console.log('Mode:',e.TRACKER_MODE,'Price source:',e.PRICE_SOURCE);for(const k of ['TELEGRAM_BOT_TOKEN','KEEPA_API_KEY','SCRAPINGDOG_API_KEY','LLM_API_KEY'])console.log(k+':',e[k]?'configured':'not configured');}
try{console.log(execFileSync('docker',['compose','ps'],{encoding:'utf8'}));}catch{console.log('Docker is not ready. Start Docker Desktop.');}
for(const [name,url] of [['n8n','http://localhost:5678/healthz'],['Price service','http://localhost:8787/health']])try{console.log(name+':',(await fetch(url)).status);}catch{console.log(name+': unreachable');}
