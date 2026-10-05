import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const p=spawnSync(process.execPath,[new URL('./model-a-probe.mjs',import.meta.url).pathname],{timeout:30000,maxBuffer:4*1024*1024,env:{...process.env,RUST_BACKTRACE:'1'}});for(const k of ['stdout','stderr'])fs.writeFileSync(new URL('../evidence/model-a-probe.'+k,import.meta.url),p[k]||'');const v={status:p.status,signal:p.signal,error:p.error?.message};fs.writeFileSync(new URL('../evidence/model-a-probe.json',import.meta.url),JSON.stringify(v,null,2));console.log(v);console.log(String(p.stderr).slice(0,3500));
