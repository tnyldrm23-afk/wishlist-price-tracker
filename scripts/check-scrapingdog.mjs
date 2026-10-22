import {config} from './config.mjs';
import {fetchScrapingdog} from '../app/scrapingdog.mjs';
const asin=process.argv[2];
if(!/^[A-Z0-9]{10}$/.test(asin||'')) throw Error('Usage: node scripts/check-scrapingdog.mjs ASIN');
const result=await fetchScrapingdog(asin,config().SCRAPINGDOG_API_KEY);
console.log(JSON.stringify(result,null,2));
if(!result.ok) process.exitCode=1;
