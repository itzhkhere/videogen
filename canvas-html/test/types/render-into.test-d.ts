// Type-level tests for the public frame API. Checked with:
//   npx -p typescript@5 -p @types/node@24 tsc -p test/types
// Every `@ts-expect-error` line must be an error (tsc fails if one is not).
import { HtmlRenderer, type FrameTarget } from '../../index'

const r = new HtmlRenderer({ width: 1280, height: 720 })
const n: number = r.frameByteLength

// Accepted targets
r.renderInto(Buffer.alloc(n))
const sabView = new Uint8Array(new SharedArrayBuffer(n)) // type-correct; rejected at run time (see API_CONTRACT.md)
r.renderInto(new Uint8Array(n))
r.renderInto(new Uint8ClampedArray(n))
r.renderInto(new Uint8Array(new ArrayBuffer(n + 16), 16, n))
const t: FrameTarget = Buffer.allocUnsafe(n)
r.renderInto(t)

// renderInto returns nothing
const ret: void = r.renderInto(t)
// @ts-expect-error - no return value to use
const notBuffer: Buffer = r.renderInto(t)

// render() still returns an owning Buffer
const frame: Buffer = r.render()
const png: Buffer = r.render({ format: 'png' })

// frameByteLength is read-only
// @ts-expect-error - read-only
r.frameByteLength = 4

// Rejected targets
// @ts-expect-error - not a byte array
r.renderInto(new Float32Array(n / 4))
// @ts-expect-error - not a byte array
r.renderInto(new Uint32Array(n / 4))
// @ts-expect-error - not a byte array
r.renderInto(new Int16Array(n / 2))
// @ts-expect-error - DataView is not accepted
r.renderInto(new DataView(new ArrayBuffer(n)))
// @ts-expect-error - a bare ArrayBuffer is not a view
r.renderInto(new ArrayBuffer(n))
// @ts-expect-error - plain arrays are not accepted
r.renderInto(new Array<number>(n).fill(0))
// @ts-expect-error - a target is required
r.renderInto()
// @ts-expect-error - strings are not accepted
r.renderInto('frame')

// Private APIs are not part of the supported surface: renamed experimental methods are gone.
// @ts-expect-error - the Phase 4A.1 name was removed
r._renderInto(t)
// @ts-expect-error - the frame pool was removed
r._poolStats()

void [ret, notBuffer, frame, png, sabView]
