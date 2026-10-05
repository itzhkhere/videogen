// canvas-html page prelude. Runs before the page's own scripts (when `scripts: true`).
//
// 1. `performance.now()` (Boa has none), derived from the engine's clock.
// 2. `requestAnimationFrame`: callbacks run once per `render()`, right before layout and paint,
//    like a browser's "update the rendering" step.
// 3. Web Animations (`document.getAnimations()`, `element.getAnimations()`, `element.animate()`)
//    built on CSS animations. Every animation we control is a paused CSS animation whose negative
//    `animation-delay` places it at the wanted time, so Stylo does all the interpolation natively.
//    What is not supported throws a NotSupportedError instead of pretending to work.
(() => {
  'use strict';
  const G = globalThis;

  if (typeof G.performance === 'undefined') {
    const t0 = Date.now();
    G.performance = { timeOrigin: t0, now: () => Date.now() - t0, mark() {}, measure() {} };
  }
  const now = () => G.performance.now();

  // ------------------------------------------------------------------ requestAnimationFrame
  let rafQueue = [];
  let rafId = 0;
  G.requestAnimationFrame = (cb) => {
    rafQueue.push([++rafId, cb]);
    return rafId;
  };
  G.cancelAnimationFrame = (id) => {
    rafQueue = rafQueue.filter((e) => e[0] !== id);
  };
  const runRaf = () => {
    const run = rafQueue;
    rafQueue = [];
    const t = now();
    let error;
    for (const [, cb] of run) {
      try { cb(t); } catch (e) { error = error || e; }
    }
    if (error) throw error;
  };

  // ------------------------------------------------------------------ helpers
  const notSupported = (what) => {
    const msg = `canvas-html: ${what} is not supported`;
    return typeof G.DOMException === 'function' ? new G.DOMException(msg, 'NotSupportedError') : new Error(msg);
  };
  const invalidState = (msg) =>
    typeof G.DOMException === 'function' ? new G.DOMException(msg, 'InvalidStateError') : new Error(msg);
  // Split a computed CSS list on top-level commas ("a, cubic-bezier(1, 2, 3, 4)").
  const splitList = (v) => {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of String(v || '')) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const parseTime = (s) => {
    s = String(s).trim();
    if (s.endsWith('ms')) return parseFloat(s);
    if (s.endsWith('s')) return parseFloat(s) * 1000;
    return parseFloat(s) || 0;
  };
  const ms = (v) => `${Math.round(v * 1000) / 1000}ms`;
  const kebab = (p) => {
    if (p.startsWith('--')) return p;
    if (p === 'cssFloat') return 'float';
    if (p === 'cssOffset') return 'offset';
    const k = p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    return /^(webkit|moz|ms)-/.test(k) ? '-' + k : k;
  };

  // ------------------------------------------------------------------ easing functions
  const PRESETS = {
    linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
  };
  const parseBezier = (easing) => {
    const e = String(easing).trim();
    if (PRESETS[e]) return PRESETS[e];
    const m = /^cubic-bezier\(([^)]*)\)$/.exec(e);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return p.length === 4 && p.every(Number.isFinite) ? p : null;
  };
  const bezierXY = ([x1, y1, x2, y2]) => {
    const c = (a1, a2) => (u) => 3 * a1 * u * (1 - u) * (1 - u) + 3 * a2 * u * u * (1 - u) + u * u * u;
    return { x: c(x1, x2), y: c(y1, y2) };
  };
  const solveU = (f, target) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  // Value of an easing function at input progress p (for getComputedTiming).
  const ease = (easing, p) => {
    const b = parseBezier(easing || 'linear');
    if (b) { const { x, y } = bezierXY(b); return y(solveU(x, p)); }
    const s = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+))?\s*\)$/.exec(String(easing).trim());
    if (s) {
      const n = Number(s[1]), pos = s[2] || 'end';
      let step = Math.floor(p * n);
      if (pos === 'start' || pos === 'jump-start' || pos === 'jump-both') step += 1;
      const jumps = pos === 'jump-both' ? n + 1 : pos === 'jump-none' ? n - 1 : n;
      if (p >= 1 && pos !== 'jump-none') step = jumps;
      return Math.min(Math.max(step / jumps, 0), 1);
    }
    if (easing === 'step-start') return p > 0 ? 1 : 0;
    if (easing === 'step-end') return p >= 1 ? 1 : 0;
    return p; // linear(...) points are not evaluated here; only used for getComputedTiming().progress
  };
  // The part of a cubic-bezier easing between output progress y0..y1, rescaled to a unit box:
  // returns { t0, t1, easing } where t0..t1 is the input (time) range. Exact for easings whose
  // output only rises (no overshoot), which is what lets a whole-animation easing be spread
  // over the per-keyframe easings of a CSS @keyframes rule.
  const splitBezier = (b, y0, y1) => {
    const { x, y } = bezierXY(b);
    const u0 = y0 <= 0 ? 0 : solveU(y, y0), u1 = y1 >= 1 ? 1 : solveU(y, y1);
    // de Casteljau: control points of the sub-curve u0..u1
    const P = [[0, 0], [b[0], b[1]], [b[2], b[3]], [1, 1]];
    const at = (u) => {
      const l = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
      const a = l(P[0], P[1], u), bb = l(P[1], P[2], u), c = l(P[2], P[3], u);
      const d = l(a, bb, u), e = l(bb, c, u);
      return { left: [P[0], a, d, l(d, e, u)], right: [l(d, e, u), e, c, P[3]] };
    };
    let seg = at(u1).left; // 0..u1
    if (u0 > 0) {
      const t = u0 / u1;
      const l = (a, c, s) => [a[0] + (c[0] - a[0]) * s, a[1] + (c[1] - a[1]) * s];
      const a = l(seg[0], seg[1], t), bb = l(seg[1], seg[2], t), c = l(seg[2], seg[3], t);
      const d = l(a, bb, t), e = l(bb, c, t);
      seg = [l(d, e, t), e, c, seg[3]];
    }
    const [p0, p1, p2, p3] = seg;
    const nx = (v) => Math.min(1, Math.max(0, (v - p0[0]) / (p3[0] - p0[0] || 1)));
    const ny = (v) => (v - p0[1]) / (p3[1] - p0[1] || 1);
    const r = (v) => Math.round(v * 1e6) / 1e6;
    return {
      t0: x(u0), t1: x(u1),
      easing: `cubic-bezier(${r(nx(p1[0]))}, ${r(ny(p1[1]))}, ${r(nx(p2[0]))}, ${r(ny(p2[1]))})`,
    };
  };

  // ------------------------------------------------------------------ keyframes
  const RESERVED = new Set(['offset', 'easing', 'composite']);
  const checkComposite = (c) => {
    if (c !== undefined && c !== null && c !== 'replace' && c !== 'auto') throw notSupported(`composite: '${c}'`);
  };
  const normalizeKeyframes = (keyframes) => {
    if (keyframes == null) return [];
    let frames;
    if (Array.isArray(keyframes) || typeof keyframes[Symbol.iterator] === 'function') {
      frames = Array.from(keyframes, (kf) => {
        checkComposite(kf.composite);
        const props = {};
        for (const k of Object.keys(kf)) if (!RESERVED.has(k) && kf[k] !== undefined) props[k] = String(kf[k]);
        return { offset: kf.offset == null ? null : Number(kf.offset), easing: kf.easing || 'linear', props };
      });
      // Missing offsets: first 0 (or 1 when alone), last 1, the rest spread evenly in between.
      if (frames.length === 1 && frames[0].offset == null) frames[0].offset = 1;
      if (frames.length > 1) {
        if (frames[0].offset == null) frames[0].offset = 0;
        if (frames[frames.length - 1].offset == null) frames[frames.length - 1].offset = 1;
      }
      for (let i = 0; i < frames.length; ) {
        if (frames[i].offset != null) { i++; continue; }
        let j = i; while (frames[j].offset == null) j++;
        const a = frames[i - 1].offset, b = frames[j].offset;
        for (let k = i; k < j; k++) frames[k].offset = a + ((b - a) * (k - i + 1)) / (j - i + 1);
        i = j;
      }
    } else {
      // Property-indexed form: { opacity: [0, 1], transform: [...], offset: [...], easing: ... }
      checkComposite(keyframes.composite);
      const byOffset = new Map();
      const get = (o) => { if (!byOffset.has(o)) byOffset.set(o, { offset: o, easing: 'linear', props: {} }); return byOffset.get(o); };
      const offsets = keyframes.offset == null ? null : [].concat(keyframes.offset);
      for (const k of Object.keys(keyframes)) {
        if (RESERVED.has(k)) continue;
        const values = [].concat(keyframes[k]);
        values.forEach((v, i) => {
          const o = offsets && offsets[i] != null ? Number(offsets[i]) : values.length === 1 ? 1 : i / (values.length - 1);
          get(o).props[k] = String(v);
        });
      }
      frames = [...byOffset.values()].sort((a, b) => a.offset - b.offset);
      const easings = keyframes.easing == null ? [] : [].concat(keyframes.easing);
      frames.forEach((f, i) => { f.easing = easings.length ? easings[i % easings.length] : 'linear'; });
    }
    for (let i = 0; i < frames.length; i++) {
      const o = frames[i].offset;
      if (!(o >= 0 && o <= 1)) throw new TypeError(`keyframe offset ${o} is outside 0..1`);
      if (i && o < frames[i - 1].offset) throw new TypeError('keyframe offsets must not decrease');
    }
    return frames;
  };

  // Spread a whole-animation easing over the keyframes (CSS has easing per keyframe only).
  const applyOverallEasing = (frames, easing) => {
    if (!easing || easing === 'linear') return frames;
    if (frames.length === 2 && frames[0].easing === 'linear') {
      return [{ ...frames[0], easing }, frames[1]];
    }
    const b = parseBezier(easing);
    const rises = b && b[1] >= 0 && b[1] <= 1 && b[3] >= 0 && b[3] <= 1;
    if (!b || !rises || frames.some((f, i) => i < frames.length - 1 && f.easing !== 'linear')) {
      throw notSupported(`easing '${easing}' on the whole animation together with ${frames.length} keyframes (put the easing on the keyframes instead)`);
    }
    return frames.map((f, i) => {
      if (i === frames.length - 1) return { ...f, offset: 1 };
      const s = splitBezier(b, f.offset, frames[i + 1].offset);
      return { ...f, offset: s.t0, easing: s.easing };
    });
  };

  let ruleId = 0;
  const addKeyframesRule = (frames) => {
    const name = `__canvas_html_wa_${++ruleId}`;
    let last = -1;
    const blocks = frames.map((f) => {
      // CSS merges blocks with the same percentage; nudge repeats so a jump stays a jump.
      let pct = f.offset * 100;
      if (pct <= last) pct = last + 1e-4;
      last = pct;
      const decls = Object.entries(f.props).map(([k, v]) => `${kebab(k)}: ${v};`).join(' ');
      return `${Math.round(pct * 1e5) / 1e5}% { ${decls} animation-timing-function: ${f.easing}; }`;
    });
    const style = document.createElement('style');
    style.setAttribute('data-canvas-html', 'web-animations');
    style.textContent = `@keyframes ${name} { ${blocks.join(' ')} }`;
    (document.head || document.documentElement).appendChild(style);
    return name;
  };

  // ------------------------------------------------------------------ element state
  // For each element we keep the list of animation slots in its `animation-*` lists. Once a
  // slot is controlled from script ("written"), the element's lists live in its inline style and
  // every slot is a paused CSS animation positioned by its delay.
  const states = new WeakMap();
  const tracked = new Set(); // animations that may need per-render updates
  const LONGHANDS = [
    ['name', 'animationName'], ['duration', 'animationDuration'], ['easing', 'animationTimingFunction'],
    ['delay', 'animationDelay'], ['iterations', 'animationIterationCount'], ['direction', 'animationDirection'],
    ['fill', 'animationFillMode'], ['play', 'animationPlayState'],
  ];

  // Every computed-style read restyles the document if needed, so read the names first and
  // the other seven lists only for elements that have animations.
  const animationNames = (cs) => {
    const names = splitList(cs.animationName);
    return names.length === 1 && names[0] === 'none' ? [] : names;
  };
  const cssSlots = (el, cs = G.getComputedStyle(el), names = animationNames(cs)) => {
    if (!names.length) return [];
    const lists = { name: names };
    for (const [key, prop] of LONGHANDS) if (key !== 'name') lists[key] = splitList(cs[prop]);
    const pick = (key, i, d) => { const l = lists[key]; return l.length ? l[i % l.length] : d; };
    return lists.name.map((name, i) => ({
      name,
      cssEasing: pick('easing', i, 'ease'),
      timing: {
        duration: parseTime(pick('duration', i, '0s')),
        delay: parseTime(pick('delay', i, '0s')),
        endDelay: 0,
        iterations: pick('iterations', i, '1') === 'infinite' ? Infinity : parseFloat(pick('iterations', i, '1')),
        direction: pick('direction', i, 'normal'),
        fill: pick('fill', i, 'none'),
        easing: 'linear',
      },
      nativePaused: pick('play', i, 'running') === 'paused',
    }));
  };

  const stateFor = (el) => {
    let st = states.get(el);
    if (st && st.written) return st;
    const cs = G.getComputedStyle(el);
    const names = animationNames(cs);
    const sig = names.join(',');
    if (st && st.sig === sig) return st;
    const slots = cssSlots(el, cs, names);
    st = { el, written: false, sig, slots: [], lastWrite: '' };
    for (const s of slots) {
      const a = new Animation(st, s.name, s.timing, 'css');
      // CSSAnimation.animationName (only animations from a stylesheet have it, as in browsers)
      Object.defineProperty(a, 'animationName', { value: s.name, enumerable: true });
      a._cssEasing = s.cssEasing;
      if (s.nativePaused) { a._state = 'paused'; a._hold = 0; } else { a._state = 'running'; a._start = 0; }
      st.slots.push(a);
    }
    states.set(el, st);
    return st;
  };

  // Every animation we control is a paused CSS animation. Its timing (duration, delay,
  // iterations, direction, fill) lives in the element's inline animation-* lists, and its
  // position is set natively with __blitz_set_animation_time, which moves the paused Stylo
  // animation without a style change. So a seek costs no style parse and no keyframe
  // recomputation; only a timing change rewrites the lists.
  //
  // Writes are batched: a seek usually pauses and moves every animation. flush() runs before
  // anything reads styles or layout, and before every render.
  const pending = new Set();
  const setTime = G.__blitz_set_animation_time;
  let rawGetComputedStyle = G.getComputedStyle;
  const writeState = (st) => {
    st.written = true;
    pending.add(st);
  };
  const flush = () => {
    if (!pending.size) return;
    const list = [...pending];
    pending.clear();
    let restyle = false;
    for (const st of list) restyle = writeLists(st) || restyle;
    // A newly declared Stylo animation exists once styles are resolved: a computed-style read
    // resolves them.
    if (restyle) rawGetComputedStyle(list[0].el).animationName;
    for (const st of list) {
      for (const a of st.slots) {
        if (a._state === 'idle') continue;
        setTime(st.el, a._name, (a.currentTime || 0) / a._rate / 1000);
      }
    }
  };
  // Write the element's animation lists if its timing changed. Returns whether it wrote.
  const writeLists = (st) => {
    const lists = { name: [], duration: [], easing: [], delay: [], iterations: [], direction: [], fill: [], play: [] };
    for (const a of st.slots) {
      const t = a._timing;
      const rate = a._rate;
      lists.name.push(a._name);
      lists.duration.push(ms(t.duration / rate));
      lists.easing.push(a._kind === 'css' ? a._cssEasing : 'linear');
      lists.iterations.push(t.iterations === Infinity ? 'infinite' : String(t.iterations));
      lists.direction.push(t.direction);
      lists.play.push('paused');
      if (a._state === 'idle') {
        lists.fill.push('none');
        lists.delay.push('100000000s'); // far in the future: no effect
      } else {
        lists.fill.push(t.fill === 'auto' ? 'none' : t.fill);
        lists.delay.push(ms(t.delay / rate));
      }
    }
    const key = JSON.stringify(lists);
    if (key === st.lastWrite) return false;
    st.lastWrite = key;
    const s = st.el.style;
    s.animationName = lists.name.join(', ');
    s.animationDuration = lists.duration.join(', ');
    s.animationTimingFunction = lists.easing.join(', ');
    s.animationDelay = lists.delay.join(', ');
    s.animationIterationCount = lists.iterations.join(', ');
    s.animationDirection = lists.direction.join(', ');
    s.animationFillMode = lists.fill.join(', ');
    s.animationPlayState = lists.play.join(', ');
    return true;
  };

  // ------------------------------------------------------------------ Animation
  class Animation {
    constructor(st, name, timing, kind) {
      this._st = st;
      this._name = name;
      this._timing = timing;
      this._kind = kind; // 'css' (from a stylesheet) or 'script' (element.animate)
      this._rate = 1;
      this._state = 'running';
      this._hold = null;
      this._start = now();
      this._listeners = {};
      this.id = '';
      this.onfinish = null;
      this.oncancel = null;
      this.onremove = null;
      this._newFinished();
      this.ready = Promise.resolve(this);
      const self = this;
      this.effect = {
        get target() { return st.el; },
        pseudoElement: null,
        composite: 'replace',
        getKeyframes: () => (self._frames || []).map((f) => ({ offset: f.offset, easing: f.easing, composite: 'auto', ...f.props })),
        getTiming: () => ({ ...self._timing, iterationStart: 0, playbackRate: 1 }),
        getComputedTiming: () => self._computedTiming(),
        updateTiming: (t = {}) => {
          if (t.iterationStart) throw notSupported('iterationStart');
          if (t.easing !== undefined && t.easing !== self._timing.easing) throw notSupported('changing easing with updateTiming()');
          Object.assign(self._timing, Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)));
          if (self._timing.duration === 'auto') self._timing.duration = 0;
          self._apply();
        },
      };
    }
    _newFinished() {
      this.finished = new Promise((res, rej) => { this._resolve = res; this._reject = rej; });
      this.finished.catch(() => {}); // a cancelled animation's rejection is not an uncaught error
    }
    _end() {
      const t = this._timing;
      return t.delay + t.duration * t.iterations + (t.endDelay || 0);
    }
    _apply() {
      // The first change to a native CSS animation hands the element's lists over to script.
      writeState(this._st);
      if (this._state === 'running') tracked.add(this); else tracked.delete(this);
    }
    _fire(type) {
      const ev = { type, target: this, currentTime: this.currentTime, timelineTime: now() };
      const h = this['on' + type];
      if (typeof h === 'function') h.call(this, ev);
      for (const fn of this._listeners[type] || []) fn.call(this, ev);
    }
    addEventListener(type, fn) { if (!this._listeners[type]) this._listeners[type] = []; this._listeners[type].push(fn); }
    removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn); }
    dispatchEvent(ev) { this._fire(ev.type); return true; }

    get currentTime() {
      if (this._state === 'idle') return null;
      if (this._hold != null) return this._hold;
      return (now() - this._start) * this._rate;
    }
    set currentTime(v) {
      if (v == null) throw new TypeError('currentTime cannot be set to null');
      v = Number(v);
      if (this._state === 'running') this._start = now() - v / this._rate;
      else { this._hold = v; if (this._state === 'idle' || (this._state === 'finished' && v < this._end())) this._state = 'paused'; }
      this._apply();
    }
    get startTime() { return this._state === 'running' ? this._start : null; }
    set startTime(v) {
      if (v == null) throw notSupported('setting startTime to null');
      this._start = Number(v); this._hold = null; this._state = 'running'; this._apply();
    }
    get playState() { return this._state; }
    get pending() { return false; }
    get replaceState() { return 'active'; }
    get timeline() { return G.document.timeline; }
    get playbackRate() { return this._rate; }
    set playbackRate(v) {
      v = Number(v);
      if (!(v > 0)) throw notSupported(`playbackRate ${v} (only positive rates)`);
      const c = this.currentTime;
      this._rate = v;
      if (this._state === 'running') this._start = now() - (c || 0) / v;
      this._apply();
    }
    updatePlaybackRate(v) { this.playbackRate = v; }
    play() {
      let c = this.currentTime;
      if (c == null || (this._timing.iterations !== Infinity && c >= this._end())) c = 0;
      this._state = 'running'; this._hold = null; this._start = now() - c / this._rate;
      if (this._settled) { this._settled = false; this._newFinished(); }
      this._apply();
    }
    pause() {
      const c = this.currentTime;
      this._hold = c == null ? 0 : c; this._state = 'paused'; this._apply();
    }
    finish() {
      if (this._timing.iterations === Infinity) throw invalidState('cannot finish an infinite animation');
      this._hold = this._end(); this._state = 'finished'; this._apply(); this._settle();
    }
    cancel() {
      if (this._state === 'idle') return;
      this._state = 'idle'; this._hold = null; this._apply();
      this._reject(typeof G.DOMException === 'function' ? new G.DOMException('The animation was cancelled', 'AbortError') : new Error('AbortError'));
      this._settled = true; this._newFinished();
      this._fire('cancel');
    }
    reverse() { throw notSupported('Animation.reverse()'); }
    persist() {}
    commitStyles() {
      if (this._kind !== 'script') throw notSupported('commitStyles() on a CSS animation');
      const c = this.currentTime, t = this._timing;
      const active = t.duration * t.iterations;
      let frame;
      if (c != null && c >= t.delay + active) {
        const it = t.iterations, dir = t.direction;
        const odd = Math.ceil(it) % 2 === 1;
        const reversedEnd = dir === 'reverse' || (dir === 'alternate' && !odd) || (dir === 'alternate-reverse' && odd);
        frame = reversedEnd ? this._frames[0] : this._frames[this._frames.length - 1];
      } else if (c != null && c <= t.delay) {
        frame = t.direction === 'reverse' || t.direction === 'alternate-reverse' ? this._frames[this._frames.length - 1] : this._frames[0];
      } else {
        throw notSupported('commitStyles() in the middle of an animation');
      }
      for (const [k, v] of Object.entries(frame.props)) this._st.el.style.setProperty(kebab(k), v);
    }
    _settle() {
      if (this._settled) return;
      this._settled = true;
      this._resolve(this);
      this._fire('finish');
    }
    _computedTiming() {
      const t = this._timing, c = this.currentTime;
      const active = t.duration * t.iterations;
      const res = { ...t, iterationStart: 0, activeDuration: active, endTime: this._end(), localTime: c, progress: null, currentIteration: null };
      if (c == null) return res;
      const at = c - t.delay;
      const before = at < 0, after = at >= active;
      const fill = t.fill === 'auto' ? 'none' : t.fill;
      if ((before && fill !== 'backwards' && fill !== 'both') || (after && fill !== 'forwards' && fill !== 'both')) return res;
      const clamped = Math.min(Math.max(at, 0), active);
      let it = t.duration ? Math.floor(clamped / t.duration) : 0;
      let p = t.duration ? (clamped - it * t.duration) / t.duration : 1;
      if (after && p === 0 && it > 0) { it -= 1; p = 1; }
      const dir = t.direction;
      const rev = dir === 'reverse' || (dir === 'alternate' && it % 2 === 1) || (dir === 'alternate-reverse' && it % 2 === 0);
      if (rev) p = 1 - p;
      res.progress = t.easing && t.easing !== 'linear' ? ease(t.easing, p) : p;
      res.currentIteration = it;
      return res;
    }
  }

  // ------------------------------------------------------------------ public API
  const elementAnimations = (el) => stateFor(el).slots.filter((a) => a._state !== 'idle');

  const animate = function (keyframes, options) {
    const opts = typeof options === 'number' ? { duration: options } : { ...(options || {}) };
    if (opts.iterationStart) throw notSupported('iterationStart');
    if (opts.pseudoElement) throw notSupported('pseudoElement');
    if (opts.timeline !== undefined && opts.timeline !== G.document.timeline) throw notSupported('a custom timeline');
    checkComposite(opts.composite);
    if (opts.direction && !['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(opts.direction)) {
      throw new TypeError(`invalid direction ${opts.direction}`);
    }
    const timing = {
      duration: opts.duration === undefined || opts.duration === 'auto' ? 0 : Number(opts.duration),
      delay: Number(opts.delay || 0),
      endDelay: Number(opts.endDelay || 0),
      iterations: opts.iterations === undefined ? 1 : Number(opts.iterations),
      direction: opts.direction || 'normal',
      fill: opts.fill || 'auto',
      easing: opts.easing || 'linear',
    };
    if (!(timing.duration >= 0)) throw new TypeError('duration must be >= 0');
    if (!(timing.iterations >= 0)) throw new TypeError('iterations must be >= 0');
    const frames = applyOverallEasing(normalizeKeyframes(keyframes), timing.easing);
    const st = stateFor(this);
    if (!st.written && st.slots.length) writeState(st); // take over native slots first
    const a = new Animation(st, addKeyframesRule(frames), timing, 'script');
    a._frames = normalizeKeyframes(keyframes);
    if (opts.id) a.id = String(opts.id);
    st.slots.push(a);
    st.written = true;
    a._apply();
    return a;
  };

  const install = () => {
    const proto = G.Element && G.Element.prototype;
    if (!proto) return;
    // Reads of styles and geometry must see the animation writes that are still pending.
    const flushBefore = (obj, name) => {
      const orig = obj && obj[name];
      if (typeof orig !== 'function') return;
      obj[name] = function (...args) { flush(); return orig.apply(this, args); };
    };
    rawGetComputedStyle = G.getComputedStyle;
    flushBefore(G, 'getComputedStyle');
    flushBefore(proto, 'getBoundingClientRect');
    flushBefore(proto, 'getClientRects');
    proto.animate = animate;
    proto.getAnimations = function () { return elementAnimations(this); };
    const doc = G.document;
    doc.getAnimations = () => {
      const out = [];
      for (const el of doc.querySelectorAll('*')) out.push(...elementAnimations(el));
      return out;
    };
    if (!doc.timeline) {
      doc.timeline = { get currentTime() { return now(); } };
    }
  };
  install();

  // Called by the engine at the start of every render(): update running animations for the
  // current clock, fire finish events, then run requestAnimationFrame callbacks.
  const tick = () => {
    for (const a of [...tracked]) {
      if (a._state !== 'running') { tracked.delete(a); continue; }
      const end = a._end();
      if (a._timing.iterations !== Infinity && a.currentTime >= end) {
        a._hold = end; a._state = 'finished'; tracked.delete(a);
        writeState(a._st);
        a._settle();
      } else {
        writeState(a._st);
      }
    }
  };

  Object.defineProperty(G, '__canvasHtml', {
    value: Object.freeze({ frame() { tick(); runRaf(); flush(); } }),
    enumerable: false,
  });
})();
