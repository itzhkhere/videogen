import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const rss=()=>{try{return process.memoryUsage().rss}catch{return null}};
const native = createRequire(import.meta.url)('./addon.node');
function check() {
  assert.equal(JSON.parse(native.denoEval('1 + 2')), 3);
  assert.throws(() => native.denoEval('throw new Error("expected")'), /expected/);
  assert.equal(JSON.parse(native.denoSmoke()).smoke, 'passed');
  for (let i=0;i<100;i++) assert.equal(JSON.parse(native.denoEval('20 + 22')),42);
}
function worker() {
  return new Promise((resolve,reject) => {
    const w = new Worker(new URL(import.meta.url), {workerData:{test:true}});
    const timer=setTimeout(()=>{w.terminate();reject(new Error('worker timeout'));},30_000);
    let result;
    w.on('message',message=>{ result=message; });
    w.once('error',reject);
    w.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error(`worker exit ${code}`));else if(!result)reject(new Error('missing result'));else resolve(result);});
  });
}
if (!isMainThread) {
  check(); parentPort.postMessage({rss:rss()});
} else if (process.argv.includes('--child-load')) {
  check();
} else if (process.argv.includes('--child-two-copies')) {
  const copy=new URL('./addon-copy.node',import.meta.url);
  fs.copyFileSync(new URL('./addon.node',import.meta.url),copy);
  const second=createRequire(import.meta.url)(copy.pathname);
  for(let i=0;i<20;i++){
    assert.equal(native.denoEval('1+2'),'3');
    assert.equal(second.denoEval('2+2'),'4');
  }
} else if (process.argv.includes('--child-worker-first')) {
  // Stress first initialization from a worker, followed by its destruction.
  await worker(); await worker();
} else {
  const initialRss=rss();
  native.initPlatform();
  check();
  const samples=[];
  for(let i=0;i<10;i++) samples.push(JSON.parse(native.denoBench(10_000)));
  const rssAfterInit=rss();
  const start=performance.now();
  await worker();
  await Promise.all([worker(),worker()]);
  const rssBeforeCycles=rss();
  for(let i=0;i<10;i++) await worker();
  const rssAfterCycles=rss();
  for(const mode of ['--child-load','--child-worker-first','--child-two-copies']) {
    const p=spawnSync(process.execPath,[new URL(import.meta.url).pathname,mode],{timeout:60_000,encoding:'utf8'});
    assert.equal(p.status,0,`${mode}: ${p.error?.message??''} ${p.signal??''} ${p.stderr}`);
  }
  console.log(JSON.stringify({node:process.version,nodeV8:process.versions.v8,initialRss,rssAfterInit,rssBeforeCycles,rssAfterCycles,workersMs:performance.now()-start,samples},null,2));
  console.log('coexistence matrix passed');
}
