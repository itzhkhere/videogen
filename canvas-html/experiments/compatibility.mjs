import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {denoEval}=createRequire(import.meta.url)('./deno-napi-coexist/addon.node');
const probes=[
 ['arithmetic','1+2'],
 ['host mutations',"host.setText('title','Deno');host.setStyle('box','width','60px');'queued'"],
 ['timer/rAF registration',"setTimeout(()=>{},10);requestAnimationFrame(()=>{});performance.now()"],
 ['window', 'typeof window'],
 ['document', 'typeof document'],
 ['computed style','typeof getComputedStyle'],
 ['fetch','typeof fetch'],
 ['WebGPU','typeof navigator']
];
const results=probes.map(([name,source])=>{
 try{return {name,value:JSON.parse(denoEval(source))}}catch(e){return {name,error:e.message}}
});
for(const [filename,mode] of [['../src/prelude.js','prelude'],['../test/assets/gsap.min.js','data-only'],['../test/assets/gsap.min.js','DOM selector']]){
 const source=fs.readFileSync(new URL(filename,import.meta.url),'utf8');
 try{
  const suffix=mode==='data-only'?"; gsap.to({x:0},{x:1,duration:1}); 'loaded'":mode==='DOM selector'?"; gsap.to('#box',{x:100,duration:1}); 'loaded'":"; 'loaded'";
  results.push({name:filename,mode,value:JSON.parse(denoEval(source+suffix))});
 }catch(e){results.push({name:filename,mode,error:e.message});}
}
const gsapSource=fs.readFileSync(new URL('../test/assets/gsap.min.js',import.meta.url),'utf8');
for(const [mode,prefix,suffix] of [
 ['CommonJS data tween',"globalThis.exports={};globalThis.module={exports};", ";const target={x:0};exports.gsap.to(target,{x:1,duration:1,ease:'none'}).totalTime(0.5);target.x"],
 ['window alias DOM tween',"globalThis.window=globalThis;", ";gsap.to('#box',{x:100,duration:1});'loaded'"]
]){
 try{results.push({name:'GSAP adapter probe',mode,value:JSON.parse(denoEval(prefix+gsapSource+suffix))});}
 catch(e){results.push({name:'GSAP adapter probe',mode,error:e.message});}
}
assert.equal(results[0].value,3);
assert.equal(results[1].value,'queued');
console.log(JSON.stringify(results,null,2));
