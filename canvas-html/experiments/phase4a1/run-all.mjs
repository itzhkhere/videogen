// Phase 4A.1 suite in one command: PHASE4A1_TAG=<name> PHASE4A1_BACKENDS=cpu,gpu-gl,gpu-vulkan node run-all.mjs [step ...]
// Steps run in their own processes; results in results/<tag>/, logs in results/<tag>/logs/.
// PHASE4A1_REQUIRE_HW=1 aborts when a GPU backend would run on a software device.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { environment, writeResult, resultsDir, log, BACKENDS } from './lib/common.mjs'
import { prepareAssets } from '../phase4a/lib/scenes.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ALL = ['transport', 'animated', 'pipeline', 'memory', 'workers', 'lifetimes']
const steps = process.argv.slice(2).length ? process.argv.slice(2) : ALL
prepareAssets()
// The GPU backends are probed with the GPU build; CPU rows use the production addon.
const gpuAddon = process.env.CANVAS_HTML_GPU_NODE ?? path.join(here, 'build', 'gpu.node')
const probe = spawnSync(process.execPath, ['-e', `import('${path.join(here, 'lib', 'common.mjs').replace(/\\/g, '/')}').then(m => console.log(JSON.stringify(m.environment(${JSON.stringify(BACKENDS)}))))`], { encoding: 'utf8', env: { ...process.env, CANVAS_HTML_NODE: gpuAddon } })
const env = JSON.parse(probe.stdout.trim().split('\n').pop() || '{}')
writeResult('environment.json', env)
log('environment', JSON.stringify({ cpu: env.cpu, gpu: env.nvidiaSmi, backends: Object.fromEntries(Object.entries(env.backends ?? {}).map(([b, i]) => [b, i.device ?? i.error])) }))
if (process.env.PHASE4A1_REQUIRE_HW) {
  const soft = Object.entries(env.backends ?? {}).filter(([, i]) => !i.device || /software|llvmpipe|\(CPU\)/i.test(i.device))
  if (soft.length) { log('ABORT: not on a hardware GPU:', JSON.stringify(soft)); process.exit(2) }
}
const logs = path.join(resultsDir, 'logs')
fs.mkdirSync(logs, { recursive: true })
const summary = []
for (const s of steps) {
  const t = performance.now()
  log('step', s)
  const r = spawnSync(process.execPath, [path.join(here, `${s}.mjs`)], { encoding: 'utf8', timeout: 4 * 3600e3, maxBuffer: 256 << 20 })
  fs.writeFileSync(path.join(logs, `${s}.log`), (r.stdout ?? '') + (r.stderr ?? ''))
  summary.push({ step: s, code: r.status, signal: r.signal, seconds: +((performance.now() - t) / 1000).toFixed(1) })
  log('step', s, 'exit', r.status, r.signal ?? '', `${summary.at(-1).seconds} s`)
}
writeResult('run-summary.json', summary)
if (summary.some((x) => x.code !== 0)) process.exit(1)
