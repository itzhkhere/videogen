// The README "Frames" examples, run as written against stand-ins: a synchronous consumer, and a
// deliberately slow Writable in place of ffmpeg.stdin (it hashes each chunk only after a delay,
// so a buffer overwritten before its write completed would hash wrong).
// node test/render-into-examples.mjs
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { Writable } from 'node:stream'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')
const scene = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scenes', 'effects.html')
const sha = (b) => createHash('sha256').update(b).digest('hex')
const N = 40
const make = () => { const r = new HtmlRenderer({ width: 320, height: 180, scripts: true }); r.load(fs.readFileSync(scene, 'utf8'), pathToFileURL(scene).href); return r }

const ref = make()
const want = []
for (let i = 0; i < N; i++) { ref.call('seek', (i * 1000) / 30); want.push(sha(ref.render())) }
ref.close()

// 1. A sequence into one buffer, consumed synchronously.
{
  const r = make(), got = []
  const consume = (b) => got.push(sha(b))
  const frame = Buffer.alloc(r.frameByteLength)
  for (let i = 0; i < N; i++) {
    r.call('seek', (i * 1000) / 30)
    r.renderInto(frame)
    consume(frame)
  }
  assert.deepEqual(got, want); r.close()
}

// 2. Ring of three buffers for an asynchronous consumer (README code, slow stream).
const slowSink = (got) => new Writable({
  highWaterMark: 1,
  write(chunk, _enc, cb) { setTimeout(() => { got.push(sha(chunk)); cb() }, 3) },
})
{
  const r = make(), got = []
  const ffmpeg = { stdin: slowSink(got) }
  const ring = Array.from({ length: 3 }, () => ({ buf: Buffer.alloc(r.frameByteLength), done: Promise.resolve() }))
  for (let i = 0; i < N; i++) {
    const slot = ring[i % ring.length]
    await slot.done
    r.call('seek', (i * 1000) / 30)
    r.renderInto(slot.buf)
    slot.done = new Promise((ok, fail) => ffmpeg.stdin.write(slot.buf, (e) => (e ? fail(e) : ok())))
  }
  await Promise.all(ring.map((s) => s.done))
  assert.deepEqual(got, want, 'ring: every frame reached the stream intact'); r.close()
}

// 3. The hazard the ring avoids: one buffer reused without waiting corrupts queued writes.
{
  const r = make(), got = []
  const out = slowSink(got)
  const frame = Buffer.alloc(r.frameByteLength)
  for (let i = 0; i < N; i++) { r.call('seek', (i * 1000) / 30); r.renderInto(frame); out.write(frame) }
  await new Promise((ok) => out.end(ok))
  assert.notDeepEqual(got, want, 'reusing one buffer for queued async writes is wrong (as documented)')
  r.close()
}

console.log('render-into-examples: all passed')
