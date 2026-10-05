import {Worker} from 'node:worker_threads';
import {load,output} from './common.mjs';
load();const results={};for(const kind of ['boa','deno']){const samples=[];for(let i=0;i<10;i++){const start=performance.now();const data=await new Promise((resolve,reject)=>{const w=new Worker(new URL('./startup-worker.mjs',import.meta.url),{workerData:{kind}});let data;w.on('message',d=>data=d);w.on('error',reject);w.on('exit',c=>c?reject(Error('exit '+c)):resolve(data));});samples.push({...data,parentStartToExitMs:performance.now()-start});}results[kind]=samples;}output(results);
