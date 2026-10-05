import {createRequire} from 'node:module';
import {getHeapStatistics} from 'node:v8';
import {resourceUsage,memoryUsage} from 'node:process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
export const require=createRequire(import.meta.url);
export function loadBoa(){const rebuilt=new URL('../../../../tools/baseline-rebuilt.node',import.meta.url).pathname;return require(process.env.BOA_ADDON_PATH||(fs.existsSync(rebuilt)?rebuilt:'../../../index.js'));}
export const html='<style>body{margin:0;font-family:Inter;font-size:12px}#box{position:absolute;left:0;top:20px;width:16px;height:16px;background:red}</style><div id="date"></div><div id="box"></div>';
export const options={width:160,height:64};
export function load(){const a=require('../addon.node');a.initPlatform();return a;}
export const hash=b=>createHash('sha256').update(b).digest('hex');
export function memory(label,addon,renderers=[]){
 let node,reason;try{node=memoryUsage();}catch(e){reason=e.message;const s=getHeapStatistics();node={heapTotal:s.total_heap_size,heapUsed:s.used_heap_size,external:s.external_memory};}
 return {label,peakRssBytes:resourceUsage().maxRSS*1024,node,currentRssUnavailable:reason||null,native:addon?.nativeMemory(),lifecycle:addon?.lifecycleStats(),deno:renderers.map(r=>r.stats().heap)};
}
export const output=v=>console.log(JSON.stringify(v,(_,v)=>typeof v==='bigint'?Number(v):v));
export const write=(name,v)=>fs.writeFileSync(new URL('../evidence/'+name,import.meta.url),JSON.stringify(v,(_,v)=>typeof v==='bigint'?Number(v):v,null,2)+'\n');
export async function gc(){for(let i=0;i<4;i++){global.gc?.();await new Promise(r=>setImmediate(r));}}
