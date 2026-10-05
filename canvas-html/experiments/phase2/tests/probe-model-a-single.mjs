import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
for(const source of ['one','eval','close']){
 const script=`const a=require(${JSON.stringify(new URL('../addon.node',import.meta.url).pathname)});a.initPlatform();const r=new a.ExperimentalDenoRenderer('<div>x</div>',{width:16,height:16});${source==='eval'?'r.eval("1+2");':source==='close'?'r.close();':''}`;
 const p=spawnSync(process.execPath,['-e',script],{timeout:30000,env:{...process.env,RUST_BACKTRACE:'1'}});const result={case:source,status:p.status,signal:p.signal,error:p.error?.message};fs.writeFileSync(new URL('../evidence/model-a-'+source+'.json',import.meta.url),JSON.stringify(result,null,2));fs.writeFileSync(new URL('../evidence/model-a-'+source+'.stderr',import.meta.url),p.stderr||'');console.log(result,String(p.stderr).slice(0,1000));
}
