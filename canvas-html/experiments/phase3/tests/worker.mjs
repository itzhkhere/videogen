import {parentPort,workerData} from 'node:worker_threads';
import {load,html,options,memory,hash} from './common.mjs';
const a=load();const r=new a.ExperimentalDenoRenderer(html,{...options,evalTimeoutMs:250});
r.eval('globalThis.n=0;null');
if(workerData?.mode==='idle'){r.render();parentPort.postMessage({ready:true,memory:memory('worker live',a,[r])});setInterval(()=>{},1000);}
else if(workerData?.mode==='busy'){parentPort.postMessage({ready:true});try{r.eval('while(true){}');}catch(e){parentPort.postMessage({error:e.message});}setInterval(()=>{},1000);}
else{for(let i=0;i<100;i++){r.eval('++n');r.advanceTo(i);r.render();}const data={value:r.eval('n'),frame:hash(r.render()),memory:memory('worker live',a,[r])};if(workerData?.mode!=='exit-live')r.close();parentPort.postMessage(data);parentPort.close();}
