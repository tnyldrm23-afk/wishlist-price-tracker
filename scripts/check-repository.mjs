import {execFileSync} from 'node:child_process';
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const paths=git(['ls-files','--cached','-z']).split('\0').filter(Boolean);
const problems=[];
const patterns=[/\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/,/\bgh[pousr]_[A-Za-z0-9]{20,}\b/,/\bgithub_pat_[A-Za-z0-9_]{30,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for(const path of paths){
 if((/(^|\/)(\.env(?:\..*)?|\.runtime|node_modules|volumes|postgres_data|n8n_data|ollama_data)(\/|$)/.test(path)&&path!=='.env.example')||/credential.*\.json$/i.test(path)||/\.(?:log|pem|key|p12|pfx)$/i.test(path))problems.push(path+': private path');
 if(/\.(?:jpg|jpeg|png)$/i.test(path)){
  if(!['docs/images/n8n-entry.jpg','docs/images/n8n-check.jpg'].includes(path))problems.push(path+': image requires explicit visual review');
  continue;
 }
 const content=git(['show',':'+path]);
 if(patterns.some(p=>p.test(content)))problems.push(path+': possible credential pattern');
 if(path==='.env.example')for(const line of content.split('\n')){
  const match=line.match(/^([A-Z_]*(?:KEY|TOKEN|PASSWORD))=(.*)$/);if(match&&match[2].trim())problems.push(path+': credential placeholder must be empty');
 }
}
if(problems.length){console.error('Repository safety check failed. Values have not been printed.');for(const p of problems)console.error(p);process.exitCode=1;}else console.log(`Repository safety check passed for ${paths.length} staged files.`);
