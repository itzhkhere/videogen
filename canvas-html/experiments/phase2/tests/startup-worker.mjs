import fs from 'node:fs';
import {parentPort,workerData} from 'node:worker_threads';
import {load,loadBoa,require,html,options} from './common.mjs';
const start=performance.now();let r;if(workerData.kind==='deno'){const a=load();r=new a.ExperimentalDenoRenderer(html,options);}else{const {HtmlRenderer}=loadBoa();r=new HtmlRenderer({...options,scripts:true,systemFonts:false});r.registerFont(fs.readFileSync(new URL('../../../test/assets/Inter-Regular.otf',import.meta.url)));r.load(html);}
r.eval('1+2');r.render();parentPort.postMessage({workerConstructionEvalRenderMs:performance.now()-start});if(workerData.kind==='deno')r.close();parentPort.close();
