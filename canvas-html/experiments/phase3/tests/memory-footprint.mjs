import fs from 'node:fs';
import {load,loadBoa,require,html,options,memory,gc,output} from './common.mjs';
const kind=process.argv[2],points=[memory('baseline Node')];let a,R;if(kind==='deno'){a=load();R=a.ExperimentalDenoRenderer;}else({HtmlRenderer:R}=loadBoa());
points.push(memory('addon loaded',a));const font=fs.readFileSync(new URL('../../../test/assets/Inter-Regular.otf',import.meta.url));function create(){if(kind==='deno')return new R(html,options);const r=new R({...options,scripts:true,systemFonts:false});r.registerFont(font);r.load(html);return r;}
let rs=[create()];rs.forEach(r=>r.render());await gc();points.push(memory('1 live renderer after render and Node GC',a,kind==='deno'?rs:[]));for(let i=1;i<10;i++)rs.push(create());rs.forEach(r=>r.render());await gc();points.push(memory('10 live renderers after render and Node GC',a,kind==='deno'?rs:[]));if(kind==='deno')rs.forEach(r=>r.close());rs=null;await gc();points.push(memory('after cleanup',a));output({kind,points});
