// Test/example helper: pipe canvas-html frames into ffmpeg. Encoding lives outside the engine.
// The page follows the contract window.seek(ms): each frame is a seek, then a render.
import { spawn } from 'node:child_process'
export async function encode(renderer, { fps, durationMs, output, crf = 18, preset = 'veryfast' }) {
  const enc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${renderer.pixelWidth}x${renderer.pixelHeight}`, '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', output], { stdio: ['pipe', 'inherit', 'inherit'] })
  const closed = new Promise((res, rej) => { enc.on('error', rej); enc.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`)))) })
  const t0 = performance.now()
  const count = Math.ceil((durationMs * fps) / 1000)
  for (let i = 0; i < count; i++) {
    renderer.call('seek', (i * 1000) / fps)
    if (!enc.stdin.write(renderer.render())) await new Promise((r) => enc.stdin.once('drain', r))
  }
  enc.stdin.end()
  await closed
  const seconds = (performance.now() - t0) / 1000
  return { frames: count, seconds, fps: count / seconds }
}
