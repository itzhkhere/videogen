import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {load,output,memory,gc} from './common.mjs';
const a=load();const points=[memory('workers baseline',a)],groups=[];
function worker(mode){return new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{mode}});}
function graceful(mode){return new Promise((resolve,reject)=>{const w=worker(mode);let data;w.on('message',d=>data=d);w.on('error',reject);w.on('exit',code=>code?reject(Error('worker exit '+code)):resolve(data));});}
function forced(mode){return new Promise((resolve,reject)=>{const w=worker(mode);w.on('error',reject);w.once('message',async data=>{if(!data.ready)return reject(Error('worker not ready'));const start=performance.now();if(mode==='busy')await new Promise(r=>setTimeout(r,30));const code=await w.terminate();resolve({mode,code,terminateElapsedMs:performance.now()-start,memory:data.memory});});});}
for(const n of [1,2,4,8]){const start=performance.now();const data=await Promise.all(Array.from({length:n},()=>graceful('normal')));assert.ok(data.every(d=>d.value===100));assert.equal(new Set(data.map(d=>d.frame)).size,1);groups.push({n,elapsedMs:performance.now()-start,data});points.push(memory(n+' graceful workers finished',a));}
const implicitExit=await graceful('exit-live');
const forcedResults=[];for(let i=0;i<16;i++){forcedResults.push(await forced(i%2?'busy':'idle'));points.push(memory('forced worker '+i,a));}
const repeated=[];for(let i=0;i<16;i++)repeated.push(await graceful('normal'));
await gc();const s=a.lifecycleStats();assert.equal(s.openRenderers,0);assert.equal(s.wrongThreadDrops,0);assert.equal(s.engine.created,s.engine.dropped);assert.equal(s.engine.watchdogs,0);output({groups,implicitExit,forcedResults,repeatedCount:repeated.length,points,lifecycle:s});
