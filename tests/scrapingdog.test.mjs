import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScrapingdog} from '../app/scrapingdog.mjs';
import {validatePrice} from '../app/domain.mjs';
const asin='B000TEST01';
const offer=(value,is_new=true,currency='EUR')=>({price:{value,currency},condition:{is_new}});
const payload=()=>({asin,link:`https://www.amazon.fr/dp/${asin}`,title:'Test',offers:[offer(99.99),offer(90),offer(20,false)]});
test('Lowest new EUR item price passes tracker validation',()=>{
 const result=normalizeScrapingdog(payload(),asin);
 assert.equal(result.product.price_cents,9000);
 assert.equal(validatePrice(result,asin).valid,true);
});
test('Wrong ASIN and marketplace fail closed',()=>{
 assert.equal(normalizeScrapingdog({...payload(),asin:'B000OTHER1'},asin).ok,false);
 assert.equal(normalizeScrapingdog({...payload(),link:'https://amazon.com/dp/'+asin},asin).ok,false);
});
test('Used, missing condition, wrong currency and invalid prices are excluded',()=>{
 for(const offers of [[offer(10,false)],[{price:{value:10,currency:'EUR'}}],[offer(10,true,'USD')],[offer(-1)],[offer('10')],[]])
 assert.equal(normalizeScrapingdog({...payload(),offers},asin).ok,false);
});
test('Bulk minimum order offers do not create false discounts',()=>{
 const p=payload();p.offers.push({...offer(1),minimum_order_quantity:{value:10}});
 assert.equal(normalizeScrapingdog(p,asin).product.price_cents,9000);
});
