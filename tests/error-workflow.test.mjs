import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFailure,buildErrorWorkflow} from '../scripts/error-workflow.mjs';
test('Failure notification contains workflow, node and local execution link without leaking raw errors',()=>{
 const result=formatFailure({workflow:{id:'wf1',name:'Price check'},execution:{id:'42',lastNodeExecuted:'Fetch',error:{message:'https://provider/?api_key=SECRET_TOKEN'}}});
 assert.match(result.reply,/Price check/);assert.match(result.reply,/Node: Fetch/);assert.match(result.reply,/http:\/\/localhost:5678\/workflow\/wf1\/executions\/42/);assert.doesNotMatch(result.reply,/SECRET_TOKEN/);
});
test('Trigger failures without saved execution have an explicit fallback',()=>{assert.match(formatFailure({workflow:{name:'Entry'},trigger:{error:{message:'Failed'}}}).reply,/Execution URL unavailable/);});
test('Error handler cannot recurse into itself and has no price call',()=>{
 const w=buildErrorWorkflow();assert.equal(w.settings.errorWorkflow,undefined);assert.equal(w.nodes[0].type,'n8n-nodes-base.errorTrigger');assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest').length,0);
});
