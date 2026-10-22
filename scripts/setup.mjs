import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
mkdirSync('.runtime', {recursive:true});
if (!existsSync('.env')) {
  let s = readFileSync('.env.example','utf8');
  for (const name of ['POSTGRES_PASSWORD','N8N_ENCRYPTION_KEY','DEMO_API_KEY']) {
    s = s.replace(`${name}=`, `${name}=${randomBytes(32).toString('hex')}`);
  }
  writeFileSync('.env',s,{mode:0o600});
  console.log('Created local .env with random secrets. Existing files are never overwritten.');
} else console.log('Using existing .env.');
