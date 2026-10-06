// Focused A/B for the Boa workloads whose 3-run medians disagreed: many samples, alternating
// processes. Usage: node ab-boa.mjs <path to addon .node or index.js>
import fs from 'node:fs';
import {require,html,options} from './common.mjs';
const {HtmlRenderer}=require(process.argv[2]);
const font=fs.readFileSync(new URL('../../../test/assets/Inter-Regular.otf',import.meta.url));
const r=new HtmlRenderer({...options,scripts:true,systemFonts:false});r.registerFont(font);r.load(html);
r.eval('globalThis.b=document.querySelector("#box");null');
const med=(f,n,reps)=>{for(let i=0;i<50;i++)f();const s=[];for(let k=0;k<reps;k++){const t=performance.now();for(let i=0;i<n;i++)f();s.push((performance.now()-t)/n);}s.sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const out={
  getBoundingClientRect100:med(()=>r.eval('(()=>{let x;for(let i=0;i<100;i++)x=b.getBoundingClientRect().width;return x})()'),20,40),
  querySelectorAll100:med(()=>r.eval('(()=>{let x;for(let i=0;i<100;i++)x=document.querySelectorAll("div");return x.length})()'),20,40),
  render:med(()=>r.render(),50,40),
};
console.log(JSON.stringify(out));
