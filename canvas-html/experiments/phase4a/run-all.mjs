// One command for the whole Phase 4A suite:
//   PHASE4A_TAG=<name> node run-all.mjs [step ...]
// Writes results/<tag>/{environment,correctness,bench,animated,contexts,multi,workers,
// determinism,memory,fonts,failures}.json, images/ and logs/. Each step runs in its own process.
// PHASE4A_REQUIRE_HW=1 aborts when a GPU backend would run on a software device.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { environment, writeResult, resultsDir, log } from './lib/common.mjs'
import { prepareAssets } from './lib/scenes.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ALL = ['correctness', 'bench', 'animated', 'contexts', 'multi', 'workers', 'determinism', 'memory', 'fonts', 'failures']
const steps = process.argv.slice(2).length ? process.argv.slice(2) : ALL
prepareAssets()
const env = environment()
writeResult('environment.json', env)
log('environment', JSON.stringify({ cpu: env.cpu, gpu: env.nvidiaSmi, addon: env.addon, backends: Object.fromEntries(Object.entries(env.backends).map(([b, i]) => [b, i.device ?? i.error])) }))
if (process.env.PHASE4A_REQUIRE_HW) {
  const soft = Object.entries(env.backends).filter(([, i]) => !i.device || /software|llvmpipe|\(CPU\)/i.test(i.device))
  if (soft.length) { log('ABORT: not on a hardware GPU:', JSON.stringify(soft)); process.exit(2) }
}
const logs = path.join(resultsDir, 'logs')
fs.mkdirSync(logs, { recursive: true })
const summary = []
for (const s of steps) {
  const t = performance.now()
  log('step', s)
  const r = spawnSync(process.execPath, [path.join(here, `${s}.mjs`)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 4 * 3600e3, maxBuffer: 256 << 20 })
  fs.writeFileSync(path.join(logs, `${s}.log`), (r.stdout ?? '') + (r.stderr ?? ''))
  summary.push({ step: s, code: r.status, signal: r.signal, seconds: +((performance.now() - t) / 1000).toFixed(1) })
  log('step', s, 'exit', r.status, r.signal ?? '', `${summary.at(-1).seconds} s`)
}
writeResult('run-summary.json', summary)
if (summary.some((x) => x.code !== 0)) process.exit(1)
