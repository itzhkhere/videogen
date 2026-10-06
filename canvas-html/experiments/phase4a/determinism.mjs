// Determinism on one machine and one backend:
//  - 5 fresh renderer instances (each its own GPU device) per scene, same frame → hashes
//  - 3 fresh processes (scene E) → hashes
//  - one long-lived renderer: the same frame 20×, other scenes loaded in between, then again;
//    and an animated sequence played twice (GSAP, 60 frames) → per-frame hashes equal
// Differences, if any, are measured with the pixel comparison and attributed by ablation later.
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SCENES, ANIMATED, BACKENDS, prepareAssets, baseUrl } from './lib/scenes.mjs'
import { make, expectBackend, sha, writeResult, child, log } from './lib/common.mjs'
import { compare } from './lib/diff.mjs'

const DPR = 1.5, W = 1920, H = 1080
const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G1000']
const self = fileURLToPath(import.meta.url)
const one = (b, html) => { const r = make(b, html, { dpr: DPR }); const p = expectBackend(r._renderTimed({ format: 'rgba' }), b).pixels; r.close(); return p }

if (process.argv[2] === '--child') {
  console.log(JSON.stringify({ hash: sha(one(process.argv[3], SCENES.find((s) => s.id === 'E').html())) }))
  process.exit(0)
}

prepareAssets()
const out = {}
for (const b of BACKENDS) {
  const res = { fresh: {}, processes: [], longLived: {}, animation: {} }
  for (const id of ids) {
    const html = SCENES.find((s) => s.id === id).html()
    const px = Array.from({ length: 5 }, () => one(b, html))
    const hashes = px.map(sha)
    res.fresh[id] = { hashes, identical: new Set(hashes).size === 1 }
    if (!res.fresh[id].identical) res.fresh[id].worstDiff = px.slice(1).map((p) => compare(px[0], p, W, H)).sort((a, c) => c.differingPixels - a.differingPixels)[0]
  }
  for (let i = 0; i < 3; i++) res.processes.push(child(self, ['--child', b]).json?.hash ?? 'crashed')
  res.processesIdentical = new Set(res.processes).size === 1 && res.processes[0] === res.fresh.E.hashes[0]

  // Long-lived renderer: (a) the same loaded document rendered 20×; (b) reloaded before every
  // frame, with other scenes in between. Differences are measured against a fresh instance.
  const r = make(b, null, { dpr: DPR })
  const frame = (id, reload = true) => { if (reload) r.load(SCENES.find((s) => s.id === id).html(), baseUrl); return expectBackend(r._renderTimed({ format: 'rgba' }), b).pixels }
  for (const id of ['B', 'E', 'F']) {
    const ref = one(b, SCENES.find((s) => s.id === id).html())
    const same = [frame(id), ...Array.from({ length: 19 }, () => frame(id, false))]
    const reloaded = Array.from({ length: 10 }, () => frame(id))
    for (const other of ['C', 'D', 'G500']) frame(other)
    reloaded.push(...Array.from({ length: 5 }, () => frame(id)))
    const worst = (xs) => xs.map((p) => compare(ref, p, W, H)).sort((x, y) => y.differingPixels - x.differingPixels)[0]
    res.longLived[id] = {
      sameDocument: { distinct: new Set(same.map(sha)).size, matchesFresh: same.every((p) => sha(p) === sha(ref)) },
      reloaded: { distinct: new Set(reloaded.map(sha)).size, matchesFresh: reloaded.every((p) => sha(p) === sha(ref)), worstVsFresh: worst(reloaded) },
    }
  }
  r.close()

  // Animated sequence played twice in one renderer
  const g = ANIMATED.find((s) => s.id === 'gsap')
  const a = make(b, fs.readFileSync(g.file, 'utf8'), { dpr: DPR, scripts: true, url: pathToFileURL(g.file).href })
  const play = () => Array.from({ length: 60 }, (_, i) => { a.call('seek', (i * 1000) / 30); return sha(expectBackend(a._renderTimed({ format: 'rgba' }), b).pixels) })
  const p1 = play(), p2 = play(), p3 = play()
  a.close()
  const mism = (x, y) => x.reduce((n, h, i) => n + (h !== y[i] ? 1 : 0), 0)
  // first play vs replay differs on every backend, also with production render(): GSAP seek semantics
  res.animation = { frames: 60, firstPlayVsReplay: mism(p1, p2), replayVsReplay: mism(p2, p3) }
  out[b] = res
  log(b.padEnd(10), 'fresh identical:', ids.map((id) => `${id}=${res.fresh[id].identical}`).join(' '), '| processes', res.processesIdentical,
    '| long-lived same doc', Object.entries(res.longLived).map(([id, v]) => `${id}=${v.sameDocument.matchesFresh}`).join(' '),
    '| reloaded', Object.entries(res.longLived).map(([id, v]) => `${id}=${v.reloaded.matchesFresh || v.reloaded.worstVsFresh.severity + ' max ' + v.reloaded.worstVsFresh.maxDelta}`).join(' '),
    '| replay', JSON.stringify(res.animation))
}
// Same scene across backends (for reference, not a determinism requirement)
writeResult('determinism.json', { dpr: DPR, scenes: ids, backends: out })
