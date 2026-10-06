import {load,html,options,output} from './common.mjs';
const a=load(),R=a.ExperimentalDenoRenderer,mode=process.argv[2];globalThis.kept=[];
for(let i=0;i<(mode==='multiple'?8:1);i++)kept.push(new R(html,options));
for(const r of kept){r.eval('globalThis.persisted=42;null');r.advanceTo(100);r.render();}
if(mode==='closed')kept.forEach(r=>r.close());
if(mode==='exception')try{kept[0].eval('throw new Error("exit test")');}catch{}
output({mode,beforeExit:a.lifecycleStats()});
