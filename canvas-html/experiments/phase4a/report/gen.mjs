// Builds the Phase 4A report page (HTML) from the T4 result JSON, so every number on the page
// comes from the measured data. node gen.mjs > phase4a-report.html
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const R = (tag, name) => JSON.parse(fs.readFileSync(path.join(here, '..', 'results', tag, name + '.json'), 'utf8'))
const css = fs.readFileSync(path.join(here, 'style.css'), 'utf8')
const f = (x, d = 1) => (x == null ? '–' : Number(x).toFixed(d))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const bench = [...R('colab-t4', 'bench').rows, ...R('colab-t4-graphite', 'bench').rows.filter((r) => r.backend !== 'cpu')]
const get = (s, res, b) => bench.find((r) => r.scene === s && r.res === res && r.backend === b)
const corr = R('colab-t4', 'correctness'), corrG = R('colab-t4-graphite', 'correctness')
const anim = [...R('colab-t4', 'animated').rows, ...R('colab-t4-graphite', 'animated').rows.filter((r) => r.backend !== 'cpu')]
const SC = { A: 'Simple typography', B: 'Large typography', C: 'Image-heavy', D: 'Gradient-heavy', E: 'Shadows, blur, filters', F: 'SVG paths', G100: 'Transforms ×100', G500: 'Transforms ×500', G1000: 'Transforms ×1000' }
const scenes = Object.keys(SC)
const GPU = [['gpu-gl', 'Ganesh GL', 'var(--s-gl)'], ['gpu-vulkan', 'Ganesh Vulkan', 'var(--s-vk)'], ['gpu-graphite', 'Graphite Vulkan', 'var(--s-gr)']]

// ---------------------------------------------------------------- speed-up chart (1080p)
function speedChart(res) {
  const W = 720, left = 196, right = 44, rowH = 30, barH = 7, top = 34
  const H = top + scenes.length * rowH + 30
  const max = 25, x = (v) => left + (Math.min(v, max) / max) * (W - left - right)
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Speed-up versus CPU at ${res}, per scene and GPU backend" class="chart">`
  for (const t of [0, 5, 10, 15, 20, 25]) {
    s += `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 26}" class="grid"/><text x="${x(t)}" y="${H - 10}" class="tick" text-anchor="middle">${t}×</text>`
  }
  s += `<line x1="${x(1)}" x2="${x(1)}" y1="${top - 10}" y2="${H - 26}" class="one"/><text x="${x(1) + 4}" y="${top - 14}" class="tick">1× = CPU</text>`
  scenes.forEach((sc, i) => {
    const y0 = top + i * rowH
    s += `<text x="${left - 10}" y="${y0 + 14}" class="lab" text-anchor="end">${sc} · ${esc(SC[sc])}</text>`
    const cpu = get(sc, res, 'cpu').rgba.total.median
    GPU.forEach(([b, , color], j) => {
      const r = get(sc, res, b); if (!r) return
      const v = cpu / r.rgba.total.median, y = y0 + 3 + j * (barH + 1)
      s += `<rect x="${left}" y="${y}" width="${Math.max(1, x(v) - left)}" height="${barH}" fill="${color}"><title>${esc(SC[sc])}, ${b}: ${f(v, 1)}× (${f(r.rgba.total.median)} ms vs CPU ${f(cpu)} ms)</title></rect>`
      if (j === 1 || v > 15) s += `<text x="${x(v) + 4}" y="${y + barH}" class="val">${f(v, 1)}×</text>`
    })
  })
  return s + '</svg>'
}

// ---------------------------------------------------------------- frame breakdown (stacked, 1080p E and C)
function stackChart(sc, res) {
  const parts = [['paint', 'paint / raster', 'var(--p-paint)'], ['gpuSubmit', 'submit', 'var(--p-submit)'], ['gpuWait', 'GPU wait', 'var(--p-wait)'], ['readback', 'readback', 'var(--p-read)'], ['buffer', 'Node Buffer copy', 'var(--p-buf)']]
  const rows = [['cpu', 'CPU'], ...GPU.map(([b, l]) => [b, l])]
  const W = 720, left = 130, right = 90, rowH = 26, top = 8
  const H = top + rows.length * rowH + 52
  const total = Math.max(...rows.map(([b]) => get(sc, res, b).rgba.total.median))
  const x = (v) => left + (v / total) * (W - left - right)
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Where a ${res} frame of scene ${sc} spends its time" class="chart">`
  rows.forEach(([b, l], i) => {
    const r = get(sc, res, b), y = top + i * rowH
    s += `<text x="${left - 10}" y="${y + 13}" class="lab" text-anchor="end">${l}</text>`
    let acc = 0
    for (const [k, name, color] of parts) {
      const v = r.rgba[k]?.median ?? 0
      if (v <= 0) continue
      s += `<rect x="${x(acc)}" y="${y + 2}" width="${Math.max(0.5, x(acc + v) - x(acc))}" height="16" fill="${color}"><title>${l} · ${name}: ${f(v, 2)} ms</title></rect>`
      acc += v
    }
    s += `<text x="${x(r.rgba.total.median) + 6}" y="${y + 14}" class="val">${f(r.rgba.total.median)} ms</text>`
  })
  let lx = left
  const ly = top + rows.length * rowH + 22
  for (const [, name, color] of parts) {
    s += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" fill="${color}"/><text x="${lx + 14}" y="${ly}" class="tick">${name}</text>`
    lx += 22 + name.length * 6.6
  }
  return s + '</svg>'
}

// ---------------------------------------------------------------- tables
const chip = (sev) => `<span class="chip ${({ exact: 'pass', 'near-exact': 'pass', minor: 'pass', 'edge-aa': 'diag', moderate: 'diag', major: 'fail' })[sev] ?? 'na'}">${sev}</span>`
const attr = (s) => corr.attribution[s]?.class ?? '–'
const corrRows = scenes.map((s) => {
  const c = (res, g) => (g === 'gpu-graphite' ? corrG : corr).resolutions[res][s][`cpu-vs-${g}`]
  const cell = (res, g) => { const x = c(res, g); return `${chip(x.severity)} <span class="note">${f(x.differingPct, 1)} % · max ${x.maxDelta} · &gt;32: ${f(x.over32Pct, 3)} %</span>` }
  return `<tr><td>${s} · ${esc(SC[s])}</td><td>${cell('1080p', 'gpu-gl')}</td><td>${cell('1080p', 'gpu-vulkan')}</td><td>${cell('1080p', 'gpu-graphite')}</td><td>${cell('4K', 'gpu-gl')}</td><td>${esc(attr(s))}</td></tr>`
}).join('\n')

const perfTable = (res) => {
  const head = `<tr><th>scene</th><th class="num">CPU</th>${GPU.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr>`
  const rows = scenes.map((s) => {
    const cpu = get(s, res, 'cpu').rgba.total.median
    return `<tr><td>${s} · ${esc(SC[s])}</td><td class="num">${f(cpu)}</td>${GPU.map(([b]) => { const r = get(s, res, b); const v = cpu / r.rgba.total.median; return `<td class="num">${f(r.rgba.total.median)} <span class="${v >= 1.5 ? 'up' : v < 1 ? 'down' : 'note'}">×${f(v, 1)}</span></td>` }).join('')}</tr>`
  }).join('\n')
  return `<div class="table"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`
}

const animRows = ['effects', 'css', 'gsap'].flatMap((sc) => [120, 300].flatMap((n) => ['cpu', 'gpu-gl', 'gpu-vulkan', 'gpu-graphite'].map((b) => {
  const r = anim.find((x) => x.scene === sc && x.frames === n && x.backend === b); if (!r) return ''
  const lab = { cpu: 'CPU', 'gpu-gl': 'Ganesh GL', 'gpu-vulkan': 'Ganesh Vulkan', 'gpu-graphite': 'Graphite' }[b]
  return `<tr><td>${sc}</td><td class="num">${n}</td><td>${lab}</td><td class="num">${f(r.rgba.frameMs.mean)}</td><td class="num">${f(r.rgba.frameMs.median)}</td><td class="num">${f(r.rgba.frameMs.p95)}</td><td class="num">${f(r.rgba.totalMs / 1000, 2)} s</td><td class="num">${r.none ? f(r.none.frameMs.median) : ''}</td><td class="num">${r.png ? f(r.png.steps.png.median) : ''}</td></tr>`
}))).join('\n')

const env = R('colab-t4', 'environment')
const html = `<title>canvas-html Phase 4A Results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
${css.replace('</style>', `
:root { --s-gl: #2c55c9; --s-vk: #1f8a70; --s-gr: #b0632b; --p-paint: #2c55c9; --p-submit: #6f8fe6; --p-wait: #b0632b; --p-read: #c23d6f; --p-buf: #8c95a5; --grid: #dde1e8; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --s-gl: #8aa8ff; --s-vk: #5fd0ae; --s-gr: #f0a066; --p-paint: #8aa8ff; --p-submit: #4f6fc4; --p-wait: #f0a066; --p-read: #ff7aa8; --p-buf: #6b7486; --grid: #2a3140; } }
:root[data-theme="dark"] { --s-gl: #8aa8ff; --s-vk: #5fd0ae; --s-gr: #f0a066; --p-paint: #8aa8ff; --p-submit: #4f6fc4; --p-wait: #f0a066; --p-read: #ff7aa8; --p-buf: #6b7486; --grid: #2a3140; }
.chart { width: 100%; height: auto; display: block; background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; margin: 8px 0 6px; }
.chart .grid { stroke: var(--grid); stroke-width: 1; }
.chart .one { stroke: var(--fg); stroke-width: 1; stroke-dasharray: 3 3; }
.chart .tick { fill: var(--muted); font: 11px var(--font-body); }
.chart .lab { fill: var(--fg); font: 12px var(--font-body); }
.chart .val { fill: var(--fg); font: 600 11px var(--font-body); font-variant-numeric: tabular-nums; }
.legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13.5px; color: var(--muted); margin: 0 0 18px; }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.up { color: var(--pass); font-weight: 600; }
.down { color: var(--fail); font-weight: 600; }
td .note { white-space: nowrap; }
</style>`)}

<div class="wrap">
<nav class="toc" aria-label="Contents">
  <p>Contents</p>
  <ol>
    <li><a href="#plain">In plain words</a></li>
    <li><a href="#summary">Executive summary</a></li>
    <li><a href="#architecture">Architecture</a></li>
    <li><a href="#backends">Backends tested</a></li>
    <li><a href="#correctness">Correctness</a></li>
    <li><a href="#performance">Performance</a></li>
    <li><a href="#animated">Animated workload</a></li>
    <li><a href="#readback">Readback</a></li>
    <li><a href="#reuse">Reuse, renderers, workers</a></li>
    <li><a href="#memory">Memory and fonts</a></li>
    <li><a href="#determinism">Determinism</a></li>
    <li><a href="#failures">Failures and fallback</a></li>
    <li><a href="#build">Build and distribution</a></li>
    <li><a href="#blockers">Remaining blockers</a></li>
    <li><a href="#recommendation">Recommendation</a></li>
    <li><a href="#checklist">Acceptance checklist</a></li>
  </ol>
</nav>

<main>
<header class="top">
  <p class="eyebrow">canvas-html · Phase 4A · GPU-backed Skia</p>
  <h1>Phase 4A Results</h1>
  <p class="meta">Prepared 2026-10-06 · measured on ${esc(env.nvidiaSmi.split(',')[0])} (driver ${esc(env.nvidiaSmi.split(',')[1].trim())}) · ${esc(env.cpu)} · ${esc(env.distro)} · Node ${esc(env.node)} · Skia m153 via rust-skia 0.153.3 · validated first on Mesa llvmpipe/lavapipe · branch <code>claude/serene-ritchie-o55j58</code> in itzhkhere/videogen</p>
  <div class="verdict">
    <span class="stamp">GO</span>
    <p>Adopt a GPU-backed Skia path (Skia <strong>Ganesh</strong>) as an <strong>experimental, opt-in</strong> renderer backend. CPU Skia stays the default and the fallback; the default build is unchanged, pixel for pixel.</p>
  </div>
</header>

<section id="plain">
  <h2>In plain words</h2>
  <div class="plain">
    <h3>The question</h3>
    <p>canvas-html draws every frame with Skia on the CPU. Phase 4A asked whether the same drawing commands can go to the GPU instead, by changing only the surface Skia draws into, and whether that makes realistic frames faster once the pixels are copied back for output.</p>
    <h3>The answer</h3>
    <p>Yes. Nothing above Skia changed: DOM, styles, layout, scripts and Blitz's paint code are the same. On a Tesla T4 the GPU draws heavy frames 3 to 22 times faster and looks the same as the CPU output. Copying pixels back is cheap. The bigger costs left are canvas-html's own copy into a Node Buffer and PNG encoding, which both backends pay.</p>
  </div>
  <div class="stats">
    <div class="stat"><b>22×</b><span>image-heavy scene, 1080p and 4K (Ganesh)</span></div>
    <div class="stat"><b>3.6–8.6×</b><span>large text, gradients, filters, SVG paths at 1080p (Ganesh Vulkan)</span></div>
    <div class="stat"><b>2–3×</b><span>animated CSS sequences per renderer, 1080p</span></div>
    <div class="stat"><b>1.9 ms</b><span>GPU→CPU readback per 1080p frame (Ganesh GL)</span></div>
    <div class="stat"><b>0</b><span>changes above the Skia surface; CPU pixels bit-identical</span></div>
  </div>
</section>

<section id="summary">
  <h2>Executive summary</h2>
  <div class="qa"><blockquote>Does GPU-backed Skia materially improve canvas-html rendering for realistic workloads?</blockquote>
  <p><strong>Yes for paint-heavy frames, no for trivial ones, and end-to-end gains are capped by the output path rather than the GPU.</strong></p></div>
  <ul>
    <li>Paint-heavy frames: images 22×, gradients 8.6×, large text 7.5×, filters 6.2×, paths 3.6×, 1000 transformed layers 2.5× at 1080p (Ganesh Vulkan). A simple text page gains nothing.</li>
    <li>Animated sequences at 1080p: the effects scene drops from 35.2 to 11.5 ms per frame, CSS motion from 22.9 to 11.7 ms. The GSAP scene is cheap to paint and stays at 8.4 ms.</li>
    <li>Readback is small (about 2 ms at 1080p, 7–9 ms at 4K on Ganesh). The Node Buffer copy (4 ms, 20 ms at 4K) and PNG encoding (30–700 ms) cost more. With PNG output the effects sequence improves only from 141 to 120 ms per frame.</li>
    <li>On 8 vCPUs, CPU workers reach 72 fps on the effects scene against 82 fps for the best GPU configuration. The GPU wins per renderer and on heavy frames; for moderate scenes the machine-level gap is small.</li>
    <li>Ganesh carries forward. Graphite is fastest on paths and gradients but 3.5× slower on text, uses about twice the GPU memory, is not bit-stable frame to frame, and needs a different Skia binary.</li>
  </ul>
</section>

<section id="architecture">
  <h2>Implemented architecture</h2>
  <pre class="mermaid">flowchart TD
  H["HtmlRenderer: DOM, Stylo, Taffy, Parley, Boa / Deno (unchanged)"] --> P["blitz_paint::paint_scene (unchanged)"]
  P --> S["SkiaScenePainter: AnyRender to SkCanvas (unchanged; Graphite uploads images)"]
  S --> C["CPU raster surface over the output Vec (default)"]
  S --> G["Ganesh render target: GL through an EGL device, or Vulkan"]
  S --> R["Graphite render target through a Recorder (Vulkan)"]
  G --> B["submit, wait, read back into the same Vec"]
  R --> B
  C --> O["Node Buffer / PNG (unchanged)"]
  B --> O</pre>
  <ul>
    <li><strong>Headless:</strong> GL uses an EGL device and a surfaceless context; Vulkan uses no surface extensions. No window, X11 or Wayland.</li>
    <li><strong>Opt-in per renderer:</strong> <code>experimentalBackend: "gpu-gl" | "gpu-vulkan" | "gpu-graphite"</code>. A GPU that cannot start throws; nothing falls back silently. <code>_renderTimed()</code> names the backend of every frame.</li>
    <li><strong>Ownership:</strong> one GPU device per renderer by default, or one per thread with <code>experimentalGpuShare: "thread"</code>. The surface is dropped before Skia's context, and the context before the device.</li>
    <li><strong>Two adapter-level fixes</strong> came out of the tests: Graphite drops ordinary images unless they are uploaded first, and Ganesh now frees cached GPU path data when a page is loaded, which makes reloads bit-exact.</li>
  </ul>
</section>

<section id="backends">
  <h2>Backends tested</h2>
  <div class="table"><table><thead><tr><th>backend</th><th>Skia binary</th><th>T4 device</th><th>status</th></tr></thead><tbody>
  <tr><td>Ganesh GL</td><td><code>ganesh-gl-jpegd-jpege-pdf</code> (the production binary)</td><td>EGL device, GL 3.3 core, NVIDIA 580.82.07</td><td><span class="chip pass">carried forward</span></td></tr>
  <tr><td>Ganesh Vulkan</td><td><code>ganesh-gl-jpegd-jpege-pdf-vulkan</code></td><td>Tesla T4, Vulkan 1.4.312</td><td><span class="chip pass">carried forward</span></td></tr>
  <tr><td>Graphite Vulkan</td><td><code>graphite-jpegd-jpege-pdf-vulkan</code> (no Ganesh, no GL)</td><td>Tesla T4, Vulkan 1.4.312</td><td><span class="chip diag">evaluated</span></td></tr>
  </tbody></table></div>
  <p class="note">Not available in the pinned build: Metal and Direct3D (not Linux), Dawn (rust-skia does not build it), Graphite on GL (Graphite has no GL backend), and any binary with both Ganesh and Graphite.</p>
</section>

<section id="correctness">
  <h2>Correctness</h2>
  <p>Every scene was rendered on CPU and on each GPU backend with fixed fonts, local images, seeded content and a frozen clock. Severity grades the share of pixels that differ by more than 32 levels; <em>edge-aa</em> means those pixels sit on edges. The cause comes from removing one kind of drawing at a time (text, images, gradients, shadows, filters, opacity) and seeing which removal makes the difference go away.</p>
  <div class="table"><table><thead><tr><th>scene</th><th>1080p Ganesh GL</th><th>1080p Ganesh Vulkan</th><th>1080p Graphite</th><th>4K Ganesh GL</th><th>cause</th></tr></thead><tbody>
${corrRows}
  </tbody></table></div>
  <ul>
    <li>No semantic mismatches. Differences are antialiasing coverage, image sampling and blending precision; most differing pixels are 1–3 levels apart.</li>
    <li>Large deltas sit on edges: big glyphs drawn as GPU paths (B), SVG paths (F), and a few corner pixels of the 168-px heading in A at 4K. Zoomed crops showed the two renderers draw the same shapes.</li>
    <li>Ganesh GL and Ganesh Vulkan differ from each other by at most 3 levels (19 on blurred shadows).</li>
    <li>Graphite first dropped every image (scene C was <em>major</em>). Skia's default image provider returns nothing by design; the scene painter now uploads each image once and caches it. After the fix C is <em>minor</em>.</li>
  </ul>
</section>

<section id="performance">
  <h2>Performance</h2>
  <p>Median frame time with RGBA output on a warm renderer, CPU and GPU on the same VM. Bars show the speed-up over CPU; the dashed line is CPU speed.</p>
  <div class="legend">${GPU.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
  <h3>1080p</h3>
  ${speedChart('1080p')}
  ${perfTable('1080p')}
  <h3>4K</h3>
  ${speedChart('4K')}
  ${perfTable('4K')}
  <h3>720p</h3>
  ${perfTable('720p')}
  <p class="note">Method: fresh renderer per scene and backend, 5 warm-up frames, then 20 / 15 / 10 frames at 720p / 1080p / 4K; variation (CV) mostly 1–7 %. Resolutions are the same 1280×720 page at device pixel ratio 1, 1.5 and 3. The CPU numbers repeated in the Graphite run match the first run.</p>
  <h3>Where the frame goes</h3>
  <p>Scene E (shadows, blur, filters) and scene F (SVG paths) at 1080p. Style, layout and Blitz's command generation stay under 1 ms here on every backend; the GPU removes rasterization. What remains on Ganesh is Skia's CPU-side work (recording and flush). Graphite records much faster and waits longer on the GPU.</p>
  <p class="note"><strong>Scene E</strong> (shadows, blur, filters), 1080p, median ms</p>
  ${stackChart('E', '1080p')}
  <p class="note"><strong>Scene F</strong> (SVG paths), 1080p, median ms</p>
  ${stackChart('F', '1080p')}
  <p class="note">First frames include shader compilation: scene E takes 97 ms (GL), 144 ms (Vulkan) and 136 ms (Graphite) on its first frame against 27–36 ms warm.</p>
</section>

<section id="animated">
  <h2>Animated workload</h2>
  <p>1080p, 30 fps, through the page's <code>seek(ms)</code> contract. A frame is the seek (JavaScript and animation update) plus the render. Sampled frames match CPU (<em>minor</em>) on every backend.</p>
  <div class="table"><table><thead><tr><th>scene</th><th class="num">frames</th><th>backend</th><th class="num">avg ms</th><th class="num">median</th><th class="num">p95</th><th class="num">total</th><th class="num">no-readback median</th><th class="num">PNG encode median</th></tr></thead><tbody>
${animRows}
  </tbody></table></div>
  <p>GPU frames are 2–3× faster where painting matters (effects, CSS motion) and equal where it does not (GSAP: painting takes about 2 ms; the frame is JavaScript plus output). PNG encoding (32–110 ms per frame) dominates every backend, so the GPU pays off with raw RGBA output to an encoder.</p>
</section>

<section id="readback">
  <h2>Readback</h2>
  <div class="qa"><blockquote>Is GPU→CPU readback the dominant bottleneck?</blockquote><p><strong>No.</strong></p></div>
  <div class="table"><table><thead><tr><th>per frame</th><th class="num">720p</th><th class="num">1080p</th><th class="num">4K</th></tr></thead><tbody>
    <tr><td>Ganesh GL readback</td><td class="num">0.8–1.0 ms</td><td class="num">1.9 ms</td><td class="num">6.5–7.4 ms</td></tr>
    <tr><td>Ganesh Vulkan readback</td><td class="num">0.8–0.9 ms</td><td class="num">1.7–2.1 ms</td><td class="num">8.7–23 ms</td></tr>
    <tr><td>Graphite readback</td><td class="num">0.9–1.1 ms</td><td class="num">1.7–2.2 ms</td><td class="num">18–19 ms</td></tr>
    <tr><td>Node Buffer copy (every backend)</td><td class="num">1.7–2.1 ms</td><td class="num">4.0–4.5 ms</td><td class="num">19–21 ms</td></tr>
    <tr><td>PNG encode (every backend)</td><td class="num">14–330 ms</td><td class="num">28–700 ms</td><td class="num">104–2700 ms</td></tr>
  </tbody></table></div>
  <ul>
    <li>4K GL reads 33 MB in about 7 ms (4.8 GB/s). Vulkan's synchronous readback copies to a transfer buffer and then submits and waits again, so it varies with the frame.</li>
    <li>For trivial scenes, readback plus the Buffer copy is the whole GPU frame, and the GPU is no faster than the CPU.</li>
    <li>The cheapest win is on canvas-html's side: the Node Buffer is created by copying the pixel Vec. Reading back straight into the Buffer, or handing the Vec over, removes 4–20 ms per frame on both backends.</li>
    <li>Both Skia engines also have asynchronous readback. Reading frame N back while frame N+1 paints would hide most of what is left, at the cost of one frame of latency (not built).</li>
  </ul>
</section>

<section id="reuse">
  <h2>Reuse, renderers, workers</h2>
  <h3>Reuse</h3>
  <p>Keep devices. A Vulkan or Graphite device takes 150–200 ms to create and 40–70 ms to close; a GL device about 7 ms once the EGL display exists. A new device also recompiles shaders. Creating a surface on an existing device takes 4–5 ms, so a renderer per document is fine on a shared device.</p>
  <h3>Several renderers on one thread</h3>
  <p>Throughput stays flat from 1 to 8 renderers. Sharing one device cuts GPU memory and setup: Ganesh Vulkan with 8 renderers uses 231 MiB of GPU memory on a shared device against 1254 MiB with one device each, and closes in 104 ms instead of 612 ms. Every configuration exited cleanly.</p>
  <h3>Worker threads</h3>
  <div class="table"><table><thead><tr><th>backend</th><th class="num">1 worker</th><th class="num">2</th><th class="num">4</th><th class="num">8</th></tr></thead><tbody>
  ${(() => { const w = [...R('colab-t4', 'workers').rows, ...R('colab-t4-graphite', 'workers').rows.filter((r) => r.backend !== 'cpu')]; return w.map((r) => `<tr><td>${r.backend}</td>${r.runs.map((x) => `<td class="num">${f(x.fps)} fps</td>`).join('')}</tr>`).join('') })()}
  </tbody></table></div>
  <p>Workers cannot share a GPU device: Skia's GPU contexts and GL contexts belong to one thread. Each worker owns its device. Device creation slows down when many workers start at once (Vulkan 282 to 774 ms), so start workers once and keep them. GPU throughput peaks at 4 workers on this 8-vCPU machine. Every frame matched the single-worker run, and terminating workers mid-render left the process healthy.</p>
</section>

<section id="memory">
  <h2>Memory and fonts</h2>
  <ul>
    <li>Per renderer with its own device: about 110 MiB of GPU memory on Ganesh Vulkan (an 8 MiB surface plus textures, glyph atlases and pipelines) and about 250 MiB on Graphite. The driver adds 95–140 MiB of host memory once per process.</li>
    <li>No growth: 300 animated frames on one renderer and 30 create-render-close cycles stayed flat on every backend.</li>
    <li>After close, memory does not return to the starting point on any backend, the CPU included. This is allocator and driver retention plus the Phase 3 findings (Stylo's per-thread caches, Skia's typeface cache). It does not grow per cycle.</li>
    <li>GPU mode does not worsen font retention: memory is flat after warm-up on every backend, and glyph atlases go away with the GPU context. The typeface duplication from Phase 3 stays a separate CPU-side cleanup task.</li>
  </ul>
</section>

<section id="determinism">
  <h2>Determinism</h2>
  <div class="table"><table><thead><tr><th>backend</th><th>5 fresh renderers</th><th>3 fresh processes</th><th>same page ×20</th><th>reloaded ×15</th></tr></thead><tbody>
  <tr><td>CPU</td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td></tr>
  <tr><td>Ganesh GL</td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span> after fix</td></tr>
  <tr><td>Ganesh Vulkan</td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span> after fix</td></tr>
  <tr><td>Graphite</td><td><span class="chip pass">identical</span></td><td><span class="chip pass">identical</span></td><td><span class="chip diag">varies ≤2 levels</span></td><td><span class="chip diag">varies ≤2 levels</span></td></tr>
  </tbody></table></div>
  <p>The first T4 run found a tiny drift when one Ganesh renderer reloaded a page with very large text. Skia's source showed the cause: glyphs above about 254 device pixels are drawn as GPU paths, and the context caches path geometry and reuses it within a tolerance. Disabling Skia's path renderers did not help; freeing the context's cached resources did. A Ganesh renderer now does that on every <code>load()</code>, and the re-run on the T4 is bit-exact. Renderers that share a device share those caches, so bit-exact output across documents needs one device per renderer or a cache flush between documents.</p>
  <p class="note">The GSAP test scene replays differently on its first pass on every backend, including the unchanged production build. That is GSAP's seek behavior, not the GPU. Cross-GPU determinism is not claimed.</p>
</section>

<section id="failures">
  <h2>Failures and fallback</h2>
  <p>Each probe ran in its own process. Every process exited cleanly and could render afterwards.</p>
  <ul>
    <li><strong>No GPU or a broken driver:</strong> the constructor throws "GPU initialization failed (…)"; a CPU renderer still works.</li>
    <li><strong>Surface too large:</strong> throws "GPU surface … could not be created"; the next GPU renderer works.</li>
    <li><strong>Device lost</strong> (Ganesh): renders throw "GPU context is lost", including on renderers sharing the device; <code>close()</code> works; a new renderer gets a fresh device and the same pixels. Graphite cannot simulate device loss.</li>
    <li><strong>Out of GPU memory</strong> (64 surfaces of 8192²): Vulkan reports "GPU out of memory" at #59 and recovers; Graphite fails surface creation at #59; GL never fails because the driver pages to system memory.</li>
    <li><strong>No <code>close()</code>:</strong> garbage collection and process exit with live GPU renderers are clean.</li>
  </ul>
  <p>Policy: GPU is opt-in, failures throw an error that names the backend, and the caller decides whether to use CPU instead.</p>
</section>

<section id="build">
  <h2>Build and distribution</h2>
  <div class="table"><table><thead><tr><th>build</th><th class="num">binary</th><th>Skia binary</th></tr></thead><tbody>
    <tr><td>production, before</td><td class="num">40.57 MB</td><td><code>ganesh-gl-jpegd-jpege-pdf</code></td></tr>
    <tr><td>production, after (default)</td><td class="num">40.68 MB</td><td>same</td></tr>
    <tr><td><code>experimental-gpu</code> (Ganesh GL)</td><td class="num">43.37 MB</td><td>same</td></tr>
    <tr><td><code>experimental-gpu-vulkan</code></td><td class="num">44.09 MB</td><td><code>…-vulkan</code></td></tr>
    <tr><td><code>experimental-graphite</code></td><td class="num">42.39 MB</td><td><code>graphite-…-vulkan</code></td></tr>
  </tbody></table></div>
  <ul>
    <li>No new crates and no new link-time libraries. <code>libEGL.so.1</code> and <code>libvulkan.so.1</code> are loaded only when a GPU backend is requested.</li>
    <li>On NVIDIA the driver also needs a glvnd EGL vendor file and a Vulkan ICD manifest. The Colab image had the driver libraries but neither file. Containers need the graphics driver capability, not just compute.</li>
    <li>CI can run the whole suite on Mesa without a GPU, which is how this phase was validated before any GPU time. Performance numbers need a GPU runner.</li>
  </ul>
</section>

<section id="blockers">
  <h2>Remaining blockers</h2>
  <div class="table"><table><thead><tr><th>blocker</th><th>severity</th><th>effort</th><th>arch. risk</th></tr></thead><tbody>
    <tr><td>Output path: Buffer copy and PNG encoding dominate end-to-end time</td><td><span class="chip fail">high</span></td><td>low to medium</td><td>low</td></tr>
    <tr><td>Deployment: drivers, EGL/Vulkan manifests, container capabilities; no GPU in CI</td><td><span class="chip fail">high</span></td><td>medium</td><td>low</td></tr>
    <tr><td>Cold start: device creation and shader compilation (70–260 ms)</td><td><span class="chip diag">medium</span></td><td>low to medium</td><td>low</td></tr>
    <tr><td>GPU worker scaling stops at 4 workers on 8 vCPUs</td><td><span class="chip diag">medium</span></td><td>medium</td><td>low</td></tr>
    <tr><td>Shared devices allow tiny cross-document drift on large text</td><td><span class="chip pass">low</span></td><td>low</td><td>low</td></tr>
    <tr><td>GL out-of-memory is invisible (driver pages)</td><td><span class="chip pass">low</span></td><td>low</td><td>low</td></tr>
    <tr><td>Graphite: separate binary, image provider not bound, drift, no cache stats</td><td><span class="chip pass">low now</span></td><td>high</td><td>medium</td></tr>
    <tr><td>Phase 3 typeface duplication (not GPU-related)</td><td><span class="chip pass">low</span></td><td>medium</td><td>low</td></tr>
  </tbody></table></div>
</section>

<section id="recommendation">
  <h2>Recommendation</h2>
  <div class="qa">
    <blockquote>Should canvas-html keep a GPU-backed Skia renderer path?</blockquote>
    <p><strong>Yes</strong>, as an experimental, opt-in backend.</p>
    <blockquote>Should CPU Skia remain the default and fallback?</blockquote>
    <p><strong>Yes.</strong> It is deterministic across machines, needs no drivers, scales across CPU workers and wins on trivial pages.</p>
    <blockquote>Which Skia GPU architecture goes into the next experiment?</blockquote>
    <p><strong>Ganesh</strong>: Vulkan as the primary path, GL through EGL as the cheap-to-create alternative. Graphite stays on watch until rust-skia ships a combined binary and binds its image provider and cache controls.</p>
    <blockquote>Is the project ready for Phase 4B (a user-facing WebGPU architecture)?</blockquote>
    <p><strong>Yes</strong>, with two prerequisites: a raw-RGBA, copy-free output path, and a deployment story for GPU drivers.</p>
    <blockquote>Dawn or wgpu first?</blockquote>
    <p><strong>More evidence is needed.</strong> rust-skia has no Dawn backend, so Skia on Dawn would mean building Skia from source. canvas-html now creates its own Vulkan device and hands it to Skia, which is exactly the hook needed to share that device with wgpu. Phase 4B should test texture sharing both ways, starting with wgpu and Skia on one Vulkan device.</p>
  </div>
</section>

<section id="checklist">
  <h2>Acceptance checklist</h2>
  <ul class="checks">
    <li>Existing paint semantics work on a GPU-backed Skia surface</li>
    <li>No JavaScript, DOM or layout architecture changes</li>
    <li>Production CPU tests green; CPU pixels bit-identical before and after</li>
    <li>GPU output visually equivalent to CPU, with the cause of each difference identified</li>
    <li>GPU paint materially faster on paint-heavy workloads (3–22×)</li>
    <li>Readback measured and understood (not the bottleneck)</li>
    <li>Ownership stable and deterministic across repeated renders and reloads</li>
    <li>Multi-renderer and worker behavior measured</li>
    <li>No unbounded resource growth</li>
    <li>Build and distribution implications documented</li>
  </ul>
  <p class="note">Full report: <code>canvas-html/PHASE4A_RESULTS.md</code>. Raw data, images and scripts: <code>canvas-html/experiments/phase4a/</code>. GPU time used: about 1.4 Colab compute units.</p>
</section>
</main>
</div>
`
process.stdout.write(html)
