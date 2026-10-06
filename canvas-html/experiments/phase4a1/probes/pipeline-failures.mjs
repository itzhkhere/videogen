// Pipelined readback: order/identity vs sequential render() for every mode and depth, then the
// failure paths: submit when full, close() with frames in flight, device loss while in flight.
// node probes/pipeline-failures.mjs <cpu|gpu-gl|gpu-vulkan> (GPU: CANVAS_HTML_NODE=build/gpu.node)
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { HtmlRenderer } from '../lib/native.mjs'
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12)
const backend = process.argv[2]
const file = fileURLToPath(new URL('../../../test/scenes/effects.html', import.meta.url))
const mk = () => { const r = new HtmlRenderer({ width: 640, height: 360, scripts: true, experimentalBackend: backend }); r.load(fs.readFileSync(file, 'utf8'), pathToFileURL(file).href); return r }
const times = Array.from({ length: 12 }, (_, i) => (i * 1000) / 30)
const bytes = 640 * 360 * 4
// reference: per-frame seek + render()
const ref = mk(); const want = times.map((t) => { ref.call('seek', t); return sha(ref.render()) }); ref.close()
const modes = backend === 'cpu' ? [['sync', 1]] : [['sync', 1], ['deferred', 1], ['deferred', 2], ['deferred', 4], ...(backend === 'gpu-gl' ? [['pbo', 1], ['pbo', 2], ['pbo', 4]] : [])]
for (const [mode, depth] of modes) {
  const r = mk(); const targets = times.map(() => Buffer.alloc(bytes))
  const res = r._renderFramesExperimental(times, targets, { mode, depth })
  const got = targets.map(sha)
  console.log(backend, mode, depth, 'frames', res.frames, 'in order & identical to sequential render():', got.every((h, i) => h === want[i]), 'latency ms', res.seriesNs.latency ? (res.seriesNs.latency.reduce((a, b) => a + b) / res.seriesNs.latency.length / 1e6).toFixed(1) : '-')
  r.close()
}
if (backend !== 'cpu') {
  // close with frames in flight; complete after device loss; submit when full
  const r = mk()
  r._pipelineStart(backend === 'gpu-gl' ? 'pbo' : 'deferred', 2)
  r.call('seek', 0); r._pipelineSubmit(); r.call('seek', 33); r._pipelineSubmit()
  let full; try { r._pipelineSubmit() } catch (e) { full = e.message }
  r.close()
  console.log('full pipeline:', full, '| close with 2 in flight: ok')
  const r2 = mk(); r2._pipelineStart(backend === 'gpu-gl' ? 'pbo' : 'deferred', 2)
  r2._pipelineSubmit(); r2._gpuAbandonForTesting()
  let lost; try { r2._pipelineComplete(Buffer.alloc(bytes)) } catch (e) { lost = e.message }
  let afterLost; try { r2._pipelineSubmit() } catch (e) { afterLost = e.message }
  console.log('device lost while in flight:', lost, '| submit after loss:', afterLost, '| stop discarded', r2._pipelineStop()); r2.close()
}
