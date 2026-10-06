// Shared helpers: renderer factory, statistics, environment capture, result files.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { HtmlRenderer, nativePath } from './native.mjs'
import { VIEWPORT, baseUrl, root, BACKENDS } from './scenes.mjs'

export { HtmlRenderer }
export const TAG = process.env.PHASE4A_TAG ?? 'local'
export const resultsDir = path.join(root, 'results', TAG)
fs.mkdirSync(resultsDir, { recursive: true })

export const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)
export const ms = (ns) => ns / 1e6

/** A renderer on `backend` at `dpr`, with `html` loaded. Bundled fonts only. */
export function make(backend, html, { dpr = 1, share, scripts = false, url = baseUrl, width = VIEWPORT.width, height = VIEWPORT.height } = {}) {
  const r = new HtmlRenderer({
    width, height, devicePixelRatio: dpr, systemFonts: false, scripts,
    experimentalBackend: backend, ...(share ? { experimentalGpuShare: share } : {}),
  })
  if (html != null) r.load(html, url)
  return r
}

/** The backend that actually renders (never assumed): checks the result's `backend`. */
export function expectBackend(result, backend) {
  const want = { cpu: 'cpu-raster', 'gpu-gl': 'ganesh-gl', 'gpu-vulkan': 'ganesh-vulkan', 'gpu-graphite': 'graphite-vulkan' }[backend]
  if (result.backend !== want) throw new Error(`asked for ${backend}, rendered by ${result.backend}`)
  return result
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

/** Per-key statistics (ms) over a list of timingsNs maps. */
export function timingStats(frames) {
  const keys = new Set(frames.flatMap((f) => Object.keys(f)))
  const out = {}
  for (const k of keys) out[k] = round(stats(frames.map((f) => ms(f[k] ?? 0))))
  return out
}

export function round(v, d = 3) {
  if (typeof v === 'number') return +v.toFixed(d)
  if (Array.isArray(v)) return v.map((x) => round(x, d))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x, d)]))
  return v
}

export function writeResult(name, data) {
  const file = path.join(resultsDir, name)
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  return file
}

const tryRun = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }).trim() } catch { return null }
}

/** GPU memory used by this process (MiB), from nvidia-smi; null elsewhere. */
export function nvidiaProcessMiB(pid = process.pid) {
  const out = tryRun('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'])
  const total = tryRun('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'])
  if (out == null && total == null) return null
  const mine = (out ?? '').split('\n').map((l) => l.split(',').map((x) => x.trim())).find(([p]) => Number(p) === pid)
  return { processMiB: mine ? Number(mine[1]) : null, deviceUsedMiB: total == null ? null : Number(total.split('\n')[0]) }
}

/** Machine, driver and build facts recorded next to every result set. */
export function environment() {
  const probe = (backend) => {
    try {
      const r = make(backend, '<p>x</p>')
      const info = r._backendInfo()
      r.close()
      return info
    } catch (e) {
      return { error: String(e.message ?? e) }
    }
  }
  const cpus = os.cpus()
  return {
    tag: TAG,
    date: new Date().toISOString(),
    host: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    distro: tryRun('sh', ['-c', '. /etc/os-release && echo "$PRETTY_NAME"']),
    glibc: tryRun('ldd', ['--version'])?.split('\n')[0],
    cpu: `${cpus[0]?.model} ×${cpus.length}`,
    memGiB: +(os.totalmem() / 2 ** 30).toFixed(1),
    node: process.version,
    addon: nativePath,
    addonBytes: fs.statSync(nativePath).size,
    nvidiaSmi: tryRun('nvidia-smi', ['--query-gpu=name,driver_version,memory.total,clocks.max.sm', '--format=csv,noheader']),
    vulkanSummary: tryRun('sh', ['-c', 'vulkaninfo --summary 2>/dev/null | grep -E "deviceName|driverName|driverInfo|apiVersion"']),
    backends: Object.fromEntries(BACKENDS.filter((b) => b !== 'cpu').map((b) => [b, probe(b)])),
    gpuDeviceEnv: process.env.CANVAS_HTML_GPU_DEVICE ?? null,
  }
}

/** Runs `node script args` in a fresh process; returns { code, signal, stdout, stderr, json }. */
export function child(script, args = [], { env = {}, timeout = 600000, nodeArgs = [] } = {}) {
  const r = spawnSync(process.execPath, [...nodeArgs, script, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout, maxBuffer: 64 << 20 })
  let json = null
  const last = (r.stdout ?? '').trim().split('\n').pop()
  try { json = JSON.parse(last) } catch {}
  return { code: r.status, signal: r.signal, stdout: r.stdout, stderr: (r.stderr ?? '').slice(-4000), json }
}

export const log = (...a) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
