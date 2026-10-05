import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
const rss=()=>{try{return process.memoryUsage().rss}catch{return null}};
const {HtmlRenderer}=createRequire(import.meta.url)('../index.js');
const scene=`<style>body{margin:0}#box{position:absolute;width:20px;height:20px;background:#f00}</style><div id="box"></div><script>
setTimeout(()=>document.getElementById('box').style.backgroundColor='#00ff00',500);
function update(){document.getElementById('box').style.left=(performance.now()/50)+'px';requestAnimationFrame(update)}requestAnimationFrame(update);
</script>`;
const times=[0,16.6667,500,1000,2500];
function frames(){
 const r=new HtmlRenderer({width:80,height:30,systemFonts:false,scripts:true});r.load(scene);
 let last=0;return times.map(t=>{r.advanceClock(t-last);last=t;const b=r.render();assert.deepEqual(r.jsErrors,[]);return createHash('sha256').update(b).digest('hex');});
}
const reference=frames(); for(let i=0;i<4;i++)assert.deepEqual(frames(),reference);
const rssBefore=rss();
const samples=[];
for(let sample=0;sample<10;sample++){
 let start=performance.now();const r=new HtmlRenderer({width:10,height:10,scripts:true,systemFonts:false});r.load('<div></div>');const createLoadMs=performance.now()-start;
 start=performance.now();for(let i=0;i<10_000;i++)assert.equal(r.eval('1+2'),3);const evalMs=performance.now()-start;
 start=performance.now();const sum=r.eval('(()=>{let s=0;for(let i=0;i<100000;i++)s+=i;return s})()');const arithmeticMs=performance.now()-start;
 start=performance.now();const clockSum=r.eval('(()=>{let s=0;for(let i=0;i<10000;i++)s+=Date.now();return s})()');const clockLoopMs=performance.now()-start;
 samples.push({createLoadMs,evalMs,arithmeticMs,sum:Number(sum),clockLoopMs,clockSum:Number(clockSum)});
}
const result={node:process.version,nodeV8:process.versions.v8,rssBefore,rssAfter:rss(),artifactBytes:fs.statSync(new URL('../canvas-html.linux-x64-gnu.node',import.meta.url)).size,times,hashes:reference,replays:5,samples};
console.log(JSON.stringify(result,null,2));
