// Phase 4A.1 helpers: renderer factory, statistics, result files, child processes, environment.
// Scenes come from Phase 4A (`../phase4a/lib/scenes.mjs`) so the workloads are identical.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { HtmlRenderer, nativePath } from './native.mjs'
import { VIEWPORT, baseUrl } from '../../phase4a/lib/scenes.mjs'

export { HtmlRenderer, nativePath }
const here = path.dirname(fileURLToPath(import.meta.url))
export const root = path.resolve(here, '..')
export const TAG = process.env.PHASE4A1_TAG ?? 'local'
export const resultsDir = path.join(root, 'results', TAG)
export const buildDir = path.join(root, 'build')
fs.mkdirSync(resultsDir, { recursive: true })

export const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)
export const MiB = (b) => +(b / 2 ** 20).toFixed(1)

export function make(backend, html, { dpr = 1, share, scripts = false, url = baseUrl, width = VIEWPORT.width, height = VIEWPORT.height } = {}) {
  const r = new HtmlRenderer({
    width, height, devicePixelRatio: dpr, systemFonts: false, scripts,
    ...(backend && backend !== 'cpu' ? { experimentalBackend: backend } : {}),
    ...(share ? { experimentalGpuShare: share } : {}),
  })
  if (html != null) r.load(html, url)
  return r
}

export function stats(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  if (!n) return null
  const mean = s.reduce((a, b) => a + b, 0) / n
  const q = (p) => s[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))]
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
  return { n, median, mean, p95: q(0.95), min: s[0], max: s[n - 1], cv: mean ? sd / mean : 0 }
}

export function round(v, d = 3) {
  if (typeof v === 'number') return +v.toFixed(d)
  if (Array.isArray(v)) return v.map((x) => round(x, d))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x, d)]))
  return v
}

/** Per-key statistics (ms) over a list of {key: ns} maps. */
export function timingStats(frames) {
  const keys = new Set(frames.flatMap((f) => Object.keys(f)))
  return Object.fromEntries([...keys].map((k) => [k, round(stats(frames.map((f) => (f[k] ?? 0) / 1e6)))]))
}

export function writeResult(name, data) {
  const file = path.join(resultsDir, name)
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  return file
}

/** `node script args` in a fresh process (optionally another addon); parses the last stdout line as JSON. */
export function child(script, args = [], { env = {}, timeout = 1800000, nodeArgs = [] } = {}) {
  const r = spawnSync(process.execPath, [...nodeArgs, script, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout, maxBuffer: 256 << 20 })
  let json = null
  try { json = JSON.parse((r.stdout ?? '').trim().split('\n').pop()) } catch {}
  return { code: r.status, signal: r.signal, stdout: r.stdout, stderr: (r.stderr ?? '').slice(-4000), json }
}

const tryRun = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }).trim() } catch { return null } }

export function environment(backends) {
  const cpus = os.cpus()
  const probe = (b) => { try { const r = make(b, '<p>x</p>'); const i = r._backendInfo(); r.close(); return i } catch (e) { return { error: String(e.message ?? e) } } }
  return {
    tag: TAG, date: new Date().toISOString(), host: os.hostname(), os: `${os.type()} ${os.release()}`,
    distro: tryRun('sh', ['-c', '. /etc/os-release && echo "$PRETTY_NAME"']), cpu: `${cpus[0]?.model} ×${cpus.length}`,
    memGiB: +(os.totalmem() / 2 ** 30).toFixed(1), node: process.version, addon: nativePath,
    nvidiaSmi: tryRun('nvidia-smi', ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader']),
    backends: Object.fromEntries(backends.filter((b) => b !== 'cpu').map((b) => [b, probe(b)])),
  }
}

/** process.memoryUsage() in MiB plus the RSS. */
export function mem() {
  const m = process.memoryUsage()
  return { rssMiB: MiB(m.rss), heapMiB: MiB(m.heapUsed), externalMiB: MiB(m.external), arrayBuffersMiB: MiB(m.arrayBuffers) }
}

export const log = (...a) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
export const BACKENDS = (process.env.PHASE4A1_BACKENDS ?? 'cpu').split(',')
export const turn = () => new Promise((r) => setImmediate(r))
