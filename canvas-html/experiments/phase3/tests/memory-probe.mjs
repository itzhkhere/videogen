import fs from 'node:fs';
import {load,loadBoa,require,html,options,memory,gc,output} from './common.mjs';
const mode=process.argv[2],a=load(),R=a.ExperimentalDenoRenderer,points=[memory('loaded',a)];
if(mode==='memory-boa-render'){const {HtmlRenderer}=loadBoa();const font=fs.readFileSync(new URL('../../../test/assets/Inter-Regular.otf',import.meta.url));for(let i=0;i<400;i++){let r=new HtmlRenderer({...options,systemFonts:false});r.registerFont(font);r.load(html);r.render();r=null;if([99,199,399].includes(i)){await gc();points.push(memory((i+1)+' Boa render cycles',a));}}
}else if(mode.startsWith('memory-cycles-')){
 const operation=mode.slice(14);for(let i=0;i<400;i++){const r=new R(html,options);if(operation==='eval')r.eval('1+2');if(operation==='render')r.render();r.close();if([99,199,399].includes(i)){await gc();points.push(memory((i+1)+' cycles',a));}}
}else{
 const operation=mode.slice(12);let r=new R(html,options);r.eval('globalThis.b=document.getElementById("box");null');points.push(memory('one live',a,[r]));
 for(let i=0;i<10000;i++){if(operation==='eval')r.eval('1+2');if(operation==='seek')r.advanceTo(i);if(operation==='render'||operation==='render-gc')r.render();if(operation==='render-gc'&&i%100===99)await gc();if(operation==='style')r.eval('b.style.width="'+(16+i%16)+'px";null');if([999,4999,9999].includes(i))points.push(memory((i+1)+' operations',a,[r]));}
 await gc();points.push(memory('Node GC while renderer live',a,[r]));if(operation==='style')points.push({styleLength:r.eval('b.style.cssText.length')});r.stats(true);points.push(memory('Deno GC',a,[r]));r.close();r=null;await gc();points.push(memory('closed GC',a));
}output({mode,points,lifecycle:a.lifecycleStats()});
