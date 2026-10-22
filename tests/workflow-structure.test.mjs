import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
const workflows=readdirSync(new URL('../workflows/',import.meta.url)).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(new URL('../workflows/'+f,import.meta.url))));
test('Workflow nodes have unique labels and all connections point to existing nodes',()=>{
 for(const w of workflows){const names=new Set(w.nodes.map(n=>n.name));assert.equal(names.size,w.nodes.length,w.name);
  for(const [from,types]of Object.entries(w.connections)){assert.ok(names.has(from),`${w.name}: ${from}`);for(const branches of Object.values(types))for(const branch of branches)for(const edge of branch||[])assert.ok(names.has(edge.node),`${w.name}: ${edge.node}`);}
 }
});
test('Code and expression references use current node labels',()=>{
 for(const w of workflows){const names=new Set(w.nodes.map(n=>n.name));for(const n of w.nodes){const params=JSON.stringify(n.parameters);for(const match of params.matchAll(/\$\('([^']+)'\)/g))assert.ok(names.has(match[1]),`${w.name}: ${n.name} references ${match[1]}`);}}
});
test('All workflow calls reference exported sub-workflows and error handler does not recurse',()=>{
 const ids=new Set(workflows.map(w=>w.id));for(const w of workflows){for(const n of w.nodes)if(n.type==='n8n-nodes-base.executeWorkflow')assert.ok(ids.has(n.parameters.workflowId.value));if(w.settings.errorWorkflow)assert.ok(ids.has(w.settings.errorWorkflow));if(w.id==='wtErrorHandler01')assert.equal(w.settings.errorWorkflow,undefined);}
});
