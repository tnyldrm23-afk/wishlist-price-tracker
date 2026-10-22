import {randomUUID} from 'node:crypto';
export const errorWorkflowId='wtErrorHandler01';
export function formatFailure(input){
 const e=input.execution||{},w=input.workflow||{},t=input.trigger||{};
 const clean=v=>String(v??'Unknown').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,140);
 const raw=String(e.error?.message||t.error?.message||'');
 const reason=raw.includes('WISHLIST_CONTROLLED_ERROR_TEST')?'Controlled error test (intentional; no Amazon request).':/timeout|timed out/i.test(raw)?'A service request timed out.':/connect|ECONN|ENOTFOUND/i.test(raw)?'A service connection failed.':'Execution failed. Inspect the saved execution for details.';
 const url=w.id&&e.id?`http://localhost:5678/workflow/${encodeURIComponent(w.id)}/executions/${encodeURIComponent(e.id)}`:null;
 return {reply:['Wishlist workflow failure',`Workflow: ${clean(w.name)}`,`Node: ${clean(e.lastNodeExecuted||t.error?.node?.name)}`,`Reason: ${reason}`,url?`Execution: ${url}`:'Execution URL unavailable (trigger failed before a saved execution).','Local execution links open on the computer hosting n8n.'].join('\n')};
}
export function buildErrorWorkflow(){
 const node=(name,type,parameters,position,extra={})=>({id:randomUUID(),name,type:`n8n-nodes-base.${type}`,typeVersion:type==='code'?2:type==='telegram'?1.2:1,parameters,position,...extra});
 return {id:errorWorkflowId,name:'Wishlist | Error Handler',active:false,versionId:randomUUID(),settings:{executionOrder:'v1',timezone:'Europe/Paris',saveDataSuccessExecution:'all',saveDataErrorExecution:'all'},nodes:[
 node('Catch workflow failure','errorTrigger',{},[0,0]),
 node('Format safe error message','code',{jsCode:formatFailure.toString()+'\nreturn $input.all().map(item=>({json:formatFailure(item.json)}));'},[260,0]),
 node('Send error to Telegram','telegram',{resource:'message',operation:'sendMessage',chatId:'REPLACE_OWNER_CHAT',text:'={{ $json.reply }}',additionalFields:{appendAttribution:false,disable_web_page_preview:true}},[540,0],{credentials:{telegramApi:{id:'wtTelegram000001',name:'Wishlist Telegram'}}}),
 node('Error handling notes','stickyNote',{content:'## Automatic execution failure notifications\nError Trigger → safe message → private Telegram.\nWorkflow name, failed node and local execution URL. Raw error text/stacks are not sent, to avoid leaking secrets.\nHandled/continued errors do not trigger this workflow. Manual editor tests do not prove automatic error handling.\nNo self error-workflow link; Telegram delivery is not blindly retried.',width:760,height:230},[0,-290])
 ],connections:{'Catch workflow failure':{main:[[{node:'Format safe error message',type:'main',index:0}]]},'Format safe error message':{main:[[{node:'Send error to Telegram',type:'main',index:0}]]}},pinData:{}};
}
