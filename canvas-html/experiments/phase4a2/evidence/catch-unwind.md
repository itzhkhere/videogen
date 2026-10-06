# napi-rs `catch_unwind` on render() / renderInto()

Local container (4 vCPU), CPU backend, Node 24.19.0, median of 7 rounds (`catch-unwind-bench.mjs`).
Two alternating rounds at 32×32 (where per-call overhead would show most), one at 1280×720.

| build | size | renderInto µs/call | render µs/call | wrong-length error |
|---|---|---|---|---|
| without | 32×32 | 10.17 / 9.44 | 13.54 / 12.53 | RangeError ERR_OUT_OF_RANGE |
| with catch_unwind | 32×32 | 9.90 / 10.97 | 13.16 / 14.95 | RangeError ERR_OUT_OF_RANGE |
| without | 1280×720 | 504.3 | 1285.4 | RangeError ERR_OUT_OF_RANGE |
| with catch_unwind | 1280×720 | 511.1 | 1245.6 | RangeError ERR_OUT_OF_RANGE |

Differences are run-to-run noise (±1.5 µs on ~10 µs calls; nothing measurable at frame scale).
Ordinary errors keep their class and code: napi-rs maps only a caught panic to an Error
(`catch_unwind(..).map_err(panic_to_error).and_then(|r| r)`).

Panic check (throwaway build with a synthetic `panic!` in renderInto, not committed):

```text
caught: Error GenericFailure "synthetic panic for the catch_unwind check"
process still alive; other renderer works
```

Without `catch_unwind`, a panic cannot unwind into Node (extern "C" boundary) and aborts the
process. Decision: adopted on `render()` and `renderInto()` as a last-resort boundary. Known panic
paths in the output code were removed first; a caught panic means a bug, and that renderer
should be closed.
