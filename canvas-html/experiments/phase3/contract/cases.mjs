// Engine-independent DOM/Web contract cases. Each case gets a fresh renderer from one of the
// runtimes (runtimes.mjs), returns observable values only, and is checked twice: against its
// expected value (when the contract fixes one) and against the other engine's result.
import { createHash } from 'node:crypto'

export const sha = (b) => createHash('sha256').update(b).digest('hex')

export const SCENE = `<!doctype html><html><head><style>
  body { margin: 0; font-family: Inter; font-size: 12px }
  #box { position: absolute; left: 10px; top: 20px; width: 30px; height: 40px; background: red; opacity: 1 }
  #box.wide { width: 50px }
  #list { position: absolute; left: 100px; top: 0 }
</style></head><body><div id="box" class="a b">box</div><div id="list"><p class="item">one</p><p class="item">two</p></div><div id="date"></div></body></html>`

// Error capture used inside page code: [name, instanceof DOMException, instanceof TypeError]
const CAP = `globalThis.__cap = (f) => { try { f(); return null } catch (e) { return [e && e.name, typeof DOMException === 'function' && e instanceof DOMException, e instanceof TypeError] } };`
const ev = (rt, src) => rt.eval(CAP + src)

export const cases = [
  {
    row: 'global aliases',
    name: 'window, self and document',
    run: (rt) => rt.eval('[window === globalThis, self === globalThis, typeof document, document.defaultView === window, document.nodeType]'),
    expect: [true, true, 'object', true, 9],
  },
  {
    row: 'getElementById',
    name: 'id lookup, missing id',
    run: (rt) => rt.eval('[document.getElementById("box").tagName, document.getElementById("missing"), document.getElementById("box").id]'),
    expect: ['DIV', null, 'box'],
  },
  {
    row: 'querySelector',
    name: 'document and element scoped selectors',
    run: (rt) => rt.eval(`[document.querySelector("#list .item").textContent, document.querySelector("#nope"),
      document.getElementById("list").querySelector("p").textContent, document.body.querySelector("#box").id]`),
    expect: ['one', null, 'one', 'box'],
  },
  {
    row: 'querySelectorAll',
    name: 'static list in document order',
    run: (rt) => rt.eval(`(() => { const l = document.querySelectorAll(".item"); return [l.length, l[0].textContent, l[1].textContent,
      Array.isArray(l), document.getElementById("list").querySelectorAll("p").length, document.querySelectorAll(".none").length] })()`),
    expect: [2, 'one', 'two', true, 2, 0],
  },
  {
    row: 'stable identity',
    name: 'one wrapper per native node',
    run: (rt) => rt.eval(`(() => { const a = document.getElementById("box"), b = document.querySelector("#box"), c = document.querySelectorAll("#box")[0];
      a.expando = 7; return [a === b, b === c, document.querySelector("#box").expando, document.body.firstElementChild === a, a.parentElement === document.body] })()`),
    expect: [true, true, 7, true, true],
  },
  {
    row: 'querySelector',
    name: 'invalid selector errors (both engines: SyntaxError DOMException)',
    run: (rt) => ev(rt, `[__cap(() => document.querySelector("[")), __cap(() => document.querySelectorAll("a[")), __cap(() => document.body.querySelector(":::"))]`),
    expect: [['SyntaxError', true, false], ['SyntaxError', true, false], ['SyntaxError', true, false]],
  },
  {
    row: 'textContent',
    name: 'set/get, wrapper stays, render reflects text',
    run: (rt) => {
      const before = sha(rt.render())
      const v = rt.eval(`(() => { const b = document.getElementById("box"); b.textContent = "hello"; return [b.textContent, b === document.getElementById("box"), document.getElementById("list").textContent] })()`)
      const after = sha(rt.render())
      rt.eval('document.getElementById("box").textContent = "box"')
      return [...v, before !== after, sha(rt.render()) === before]
    },
    expect: ['hello', true, 'onetwo', true, true],
  },
  {
    row: 'attributes',
    name: 'set/get/has/remove, lowercase names, missing is null',
    run: (rt) => rt.eval(`(() => { const b = document.getElementById("box"); b.setAttribute("Data-X", "1");
      const r = [b.getAttribute("data-x"), b.getAttribute("DATA-X"), b.hasAttribute("data-x")]; b.removeAttribute("data-x");
      r.push(b.getAttribute("data-x"), b.hasAttribute("data-x"), b.getAttribute("nope")); return r })()`),
    expect: ['1', '1', true, null, false, null],
  },
  {
    row: 'attributes',
    name: 'id and className reflect attributes',
    run: (rt) => rt.eval(`(() => { const b = document.getElementById("box"); b.className = "x y"; const r = [b.getAttribute("class"), b.className];
      b.id = "box2"; r.push(document.getElementById("box2") === b, document.getElementById("box")); return r })()`),
    expect: ['x y', 'x y', true, null],
  },
  {
    row: 'classList',
    name: 'add/remove/toggle/contains, identity, ordered set',
    run: (rt) => rt.eval(`(() => { const b = document.getElementById("box"), l = b.classList; const r = [l === b.classList, l.contains("a"), l.length];
      l.add("c", "a"); r.push(b.className); l.remove("a"); r.push(b.className, l.contains("a"));
      r.push(l.toggle("a"), l.toggle("a"), l.toggle("z", true), l.toggle("z", true), l.toggle("z", false), b.className); return r })()`),
    expect: [true, true, 2, 'a b c', 'b c', false, true, false, true, true, false, 'b c'],
  },
  {
    row: 'classList',
    name: 'invalid tokens',
    run: (rt) => ev(rt, `(() => { const l = document.getElementById("box").classList; return [__cap(() => l.add("")), __cap(() => l.add("a b")), __cap(() => l.toggle("")), l.contains("")] })()`),
    expect: [['SyntaxError', true, false], ['InvalidCharacterError', true, false], ['SyntaxError', true, false], false],
  },
  {
    row: 'classList',
    name: 'class change restyles (computed width)',
    run: (rt) => rt.eval(`(() => { const b = document.getElementById("box"); b.classList.add("wide"); return [getComputedStyle(b).width, b.getBoundingClientRect().width] })()`),
    expect: ['50px', 50],
  },
  {
    row: 'style identity',
    name: 'element.style === element.style',
    run: (rt) => rt.eval(`(() => { const b = document.getElementById("box"); const s = b.style; s.opacity = "0.5"; return [s === b.style, document.querySelector("#box").style === s, b.style.opacity] })()`),
    expect: [true, true, '0.5'],
  },
  {
    row: 'inline style',
    name: 'motion properties: set, read back, native style attribute',
    run: (rt) => rt.eval(`(() => {
      const values = { opacity: "0.5", transform: "translateX(12px)", width: "23px", height: "19px", background: "blue",
        left: "5px", top: "6px", right: "7px", bottom: "8px", display: "block", position: "absolute", color: "red",
        backgroundColor: "rgb(0, 128, 0)", fontSize: "13px", fontWeight: "700", letterSpacing: "2px", borderRadius: "4px",
        transformOrigin: "left top", visibility: "hidden" };
      const out = {};
      for (const [k, v] of Object.entries(values)) {
        const el = document.createElement("div"); document.body.appendChild(el);
        el.style[k] = v; out[k] = [el.style[k], el.getAttribute("style")];
      }
      return out })()`),
    check: (v) => Object.values(v).every(([read, attr]) => read !== '' && attr !== null && attr !== ''),
  },
  {
    row: 'inline style',
    name: 'one policy: kebab/camel, setProperty/removeProperty/cssText/length, invalid ignored',
    run: (rt) => rt.eval(`(() => { const s = document.getElementById("box").style; const r = [];
      s.setProperty("background-color", "red"); r.push(s.backgroundColor, s.getPropertyValue("background-color"));
      s.opacity = "banana"; r.push(s.opacity); s.opacity = "0.25"; s.opacity = "nope"; r.push(s.opacity);
      s.setProperty("width", "10px", "important"); r.push(s.getPropertyValue("width"), s.cssText);
      r.push(s.removeProperty("width"), s.length, s[0], s.cssText); s.cssText = "height: 5px; junk: 1"; r.push(s.cssText, s.length);
      s.opacity = ""; s.height = null; r.push(s.cssText, "opacity" in s, "notAProperty" in s); return r })()`),
    expect: ['red', 'red', '', '0.25', '10px', 'background-color: red; opacity: 0.25; width: 10px !important;', '10px', 2, 'background-color',
      'background-color: red; opacity: 0.25;', 'height: 5px;', 1, '', true, false],
  },
  {
    row: 'getComputedStyle',
    name: 'resolved values follow mutations without a render',
    run: (rt) => rt.eval(`(() => { const b = document.getElementById("box"), s = getComputedStyle(b);
      const r = [s.opacity, s.transform, s.width, s.height, s.getPropertyValue("left"), s.display];
      b.style.opacity = "0.5"; b.style.transform = "translateX(12px) scale(2)"; b.style.width = "70px";
      r.push(s.opacity, s.transform, s.width, getComputedStyle(b).height, s.backgroundColor); return r })()`),
    expect: ['1', 'none', '30px', '40px', '10px', 'block', '0.5', 'matrix(2, 0, 0, 2, 12, 0)', '70px', '40px', 'rgb(255, 0, 0)'],
  },
  {
    row: 'getComputedStyle',
    name: 'non-element argument',
    run: (rt) => ev(rt, `[__cap(() => getComputedStyle({})), __cap(() => getComputedStyle(document))]`),
    expect: [['TypeError', false, true], ['TypeError', false, true]],
  },
  {
    row: 'getBoundingClientRect',
    name: 'resolved layout, mutation, detached element',
    run: (rt) => rt.eval(`(() => { const b = document.getElementById("box"); const r1 = b.getBoundingClientRect();
      b.style.width = "70px"; b.style.top = "5px"; const r2 = b.getBoundingClientRect();
      const d = document.createElement("div"); const r3 = d.getBoundingClientRect();
      const p = document.querySelector(".item"); p.remove(); const r4 = p.getBoundingClientRect();
      const f = (r) => [r.x, r.y, r.width, r.height, r.top, r.right, r.bottom, r.left];
      return [f(r1), f(r2), f(r3), f(r4), b.offsetWidth, b.offsetHeight, b.offsetLeft, b.offsetTop, b.clientWidth, p.isConnected] })()`),
    expect: [[10, 20, 30, 40, 20, 40, 60, 10], [10, 5, 70, 40, 5, 80, 45, 10], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], 70, 40, 10, 5, 70, false],
  },
  {
    row: 'createElement / tree',
    name: 'createElement, appendChild, children, remove',
    run: (rt) => {
      const before = sha(rt.render())
      const v = rt.eval(`(() => { const d = document.createElement("SECTION"); const r = [d.tagName, d.parentElement, d.isConnected];
        d.style.cssText = "position:absolute;left:0;top:0;width:20px;height:20px;background:blue"; document.body.appendChild(d);
        r.push(d.parentElement === document.body, d.isConnected, document.body.children.length, document.body.children[3] === d); globalThis.made = d; return r })()`)
      const shown = sha(rt.render())
      rt.eval('made.remove()')
      return [...v, before !== shown, sha(rt.render()) === before, rt.eval('[made.isConnected, document.body.children.length, made.tagName]')]
    },
    expect: ['SECTION', null, false, true, true, 4, true, true, true, [false, 3, 'SECTION']],
  },
  {
    row: 'events',
    name: 'add/dispatch/remove, target/currentTarget, bubbling to document and window',
    run: (rt) => rt.eval(`(() => { const log = []; const b = document.getElementById("box");
      const f = (e) => log.push(["box", e.type, e.target === b, e.currentTarget === b, e.eventPhase]);
      b.addEventListener("ping", f); b.addEventListener("ping", f);
      document.body.addEventListener("ping", (e) => log.push(["body", e.currentTarget === document.body, e.eventPhase]));
      document.addEventListener("ping", (e) => log.push(["document", e.currentTarget === document]));
      window.addEventListener("ping", (e) => log.push(["window", e.currentTarget === window]));
      const r1 = b.dispatchEvent(new Event("ping", { bubbles: true }));
      log.push("--"); b.dispatchEvent(new Event("ping"));
      log.push("--"); b.removeEventListener("ping", f); b.dispatchEvent(new Event("ping", { bubbles: true }));
      const e = new Event("ping"); log.push([e.target, e.currentTarget, e.defaultPrevented, e.bubbles, e.cancelable, e.isTrusted]);
      return [r1, log] })()`),
    expect: [true, [['box', 'ping', true, true, 2], ['body', true, 3], ['document', true], ['window', true], '--', ['box', 'ping', true, true, 2], '--',
      ['body', true, 3], ['document', true], ['window', true], [null, null, false, false, false, false]]],
  },
  {
    row: 'events',
    name: 'preventDefault, stopPropagation, stopImmediatePropagation, once, removal during dispatch, errors',
    run: (rt) => {
      const v = ev(rt, `(() => { const log = []; const b = document.getElementById("box");
        b.addEventListener("c", (e) => e.preventDefault());
        const r = [b.dispatchEvent(new Event("c", { cancelable: true })), b.dispatchEvent(new Event("c"))];
        b.addEventListener("s", (e) => { log.push("s1"); e.stopPropagation() }); b.addEventListener("s", () => log.push("s2"));
        document.body.addEventListener("s", () => log.push("body"));
        b.dispatchEvent(new Event("s", { bubbles: true }));
        b.addEventListener("i", (e) => { log.push("i1"); e.stopImmediatePropagation() }); b.addEventListener("i", () => log.push("i2"));
        b.dispatchEvent(new Event("i", { bubbles: true }));
        b.addEventListener("o", () => log.push("once"), { once: true }); b.dispatchEvent(new Event("o")); b.dispatchEvent(new Event("o"));
        const late = () => log.push("removed-too-late"); b.addEventListener("r", () => { log.push("r1"); b.removeEventListener("r", late) }); b.addEventListener("r", late);
        b.dispatchEvent(new Event("r"));
        b.addEventListener("t", () => { throw new Error("listener boom") }); b.addEventListener("t", () => log.push("after-throw"));
        b.dispatchEvent(new Event("t"));
        const ce = new CustomEvent("k", { detail: { n: 1 } }); b.addEventListener("k", (e) => log.push(e.detail.n, e instanceof Event));
        b.dispatchEvent(ce);
        b.addEventListener("re", (e) => log.push(__cap(() => b.dispatchEvent(e)))); b.dispatchEvent(new Event("re"));
        r.push(__cap(() => b.dispatchEvent({ type: "x" })));
        return [r, log] })()`)
      return [v, rt.jsErrors().filter((e) => e.includes('listener boom')).length]
    },
    expect: [[[false, true, ['TypeError', false, true]], ['s1', 's2', 'i1', 'once', 'r1', 'after-throw', 1, true, ['InvalidStateError', true, false]]], 1],
  },
  {
    row: 'errors',
    name: 'stale node after native removal: InvalidStateError everywhere in the subset',
    run: (rt) => {
      rt.eval('globalThis.stale = document.getElementById("box"); globalThis.staleStyle = stale.style')
      const dropped = rt.dropNode('#box')
      return [dropped, ev(rt, `[__cap(() => stale.textContent), __cap(() => stale.getAttribute("id")), __cap(() => stale.setAttribute("a", "b")),
        __cap(() => staleStyle.opacity), __cap(() => { staleStyle.opacity = "1" }), __cap(() => getComputedStyle(stale).opacity),
        __cap(() => stale.getBoundingClientRect()), __cap(() => stale.classList.add("x")), document.getElementById("box")]`)]
    },
    expect: [true, [...Array(8).fill(['InvalidStateError', true, false]), null]],
  },
  {
    row: 'errors',
    name: 'wrong this / non-node arguments: TypeError',
    run: (rt) => ev(rt, `[__cap(() => Object.getPrototypeOf(document.body).getAttribute.call({}, "x")),
      __cap(() => document.body.appendChild({})), __cap(() => new Event())]`),
    expect: [['TypeError', false, true], ['TypeError', false, true], ['TypeError', false, true]],
  },
  {
    row: 'errors',
    name: 'closed renderer',
    run: (rt) => {
      rt.close(); rt.close()
      const msg = (f) => { try { f(); return 'no error' } catch (e) { return /renderer is closed/.test(e.message) } }
      return [msg(() => rt.eval('1')), msg(() => rt.render()), msg(() => rt.advanceTo(10))]
    },
    expect: [true, true, true],
  },
  {
    row: 'errors',
    name: 'eval exception, then continued use',
    run: (rt) => {
      let thrown = null
      try { rt.eval('throw new Error("ordinary")') } catch (e) { thrown = /ordinary/.test(e.message) }
      return [thrown, rt.eval('6 * 7'), rt.jsErrors().length, rt.eval('const scoped = 1; typeof scoped'), rt.eval('typeof scoped')]
    },
    expect: [true, 42, 0, 'number', 'undefined'],
  },
  {
    row: 'deterministic timers',
    name: 'Date, performance and timeOrigin from visual time',
    epochMs: 12345,
    run: (rt) => {
      const a = rt.eval('[Date.now(), performance.now(), performance.timeOrigin, new Date().getTime(), new Date(100).getTime(), Date() === new Date().toString()]')
      rt.advanceTo(250.5)
      const b = rt.eval('[Date.now(), performance.now(), new Date().getTime()]')
      let backwards = null
      try { rt.advanceTo(100) } catch (e) { backwards = /monotonic|finite/.test(e.message) }
      return [a, b, backwards, rt.clockTime()]
    },
    expect: [[12345, 0, 12345, 12345, 100, true], [12595, 250.5, 12595], true, 250.5],
  },
  {
    row: 'deterministic timers',
    name: 'setTimeout/clearTimeout/setInterval order, microtasks after each timer',
    epochMs: 12345,
    run: (rt) => {
      rt.eval(`globalThis.events = []; const push = (n) => events.push([n, Date.now(), performance.now()]);
        Promise.resolve().then(() => push("micro"));
        setTimeout(() => { push("timer"); Promise.resolve().then(() => push("timerMicro")) }, 100);
        setTimeout(() => push("peer"), 100);
        const c = setTimeout(() => push("cleared"), 50); clearTimeout(c);
        for (let i = 0; i < 5; i++) setTimeout(() => push("same" + i), 150);
        const k = setTimeout(() => push("killed-in-batch"), 150); setTimeout(() => {}, 0);
        setTimeout(() => { clearTimeout(k) }, 149);
        let n = 0; const iv = setInterval(() => { push("interval" + (++n)); if (n === 3) clearInterval(iv) }, 60);
        setTimeout(() => { push("outer"); setTimeout(() => push("nested0"), 0) }, 200);`)
      const first = rt.eval('events.slice()')
      rt.advanceTo(300)
      return [first, rt.eval('events')]
    },
    expect: [[['micro', 12345, 0]], [['micro', 12345, 0], ['interval1', 12405, 60], ['timer', 12445, 100], ['timerMicro', 12445, 100], ['peer', 12445, 100],
      ['interval2', 12465, 120], ['same0', 12495, 150], ['same1', 12495, 150], ['same2', 12495, 150], ['same3', 12495, 150], ['same4', 12495, 150],
      ['interval3', 12525, 180], ['outer', 12545, 200], ['nested0', 12545, 200]]],
  },
  {
    row: 'rAF',
    name: 'callbacks run at render, in order, with performance.now(); cancel; next-frame registration',
    epochMs: 12345,
    run: (rt) => {
      rt.eval(`globalThis.frames = []; requestAnimationFrame((t) => { frames.push(["a", t, Date.now()]); requestAnimationFrame((t2) => frames.push(["next", t2])) });
        const x = requestAnimationFrame(() => frames.push(["cancelled"])); requestAnimationFrame((t) => frames.push(["b", t])); cancelAnimationFrame(x);
        setTimeout(() => frames.push(["timer"]), 10);`)
      const beforeRender = rt.eval('frames.slice()')
      rt.advanceTo(16)
      const afterAdvance = rt.eval('frames.slice()')
      rt.render()
      const afterRender = rt.eval('frames.slice()')
      rt.advanceTo(32); rt.render()
      return [beforeRender, afterAdvance, afterRender, rt.eval('frames')]
    },
    expect: [[], [['timer']], [['timer'], ['a', 16, 12361], ['b', 16]], [['timer'], ['a', 16, 12361], ['b', 16], ['next', 32]]],
  },
  {
    row: 'Promise ordering',
    name: 'microtasks: eval, timer, rAF and listener boundaries',
    run: (rt) => {
      rt.eval(`globalThis.o = []; o.push("sync"); Promise.resolve().then(() => o.push("p1")).then(() => o.push("p2")); queueMicrotask(() => o.push("q"));
        setTimeout(() => { o.push("t1"); Promise.resolve().then(() => o.push("t1-micro")) }, 0); setTimeout(() => o.push("t2"), 0);
        requestAnimationFrame(() => { o.push("raf"); Promise.resolve().then(() => o.push("raf-micro")) });
        document.body.addEventListener("m", () => { Promise.resolve().then(() => o.push("listener-micro")); o.push("listener") });
        document.body.dispatchEvent(new Event("m")); o.push("after-dispatch");`)
      const a = rt.eval('o.slice()')
      rt.advanceTo(0)
      const b = rt.eval('o.slice()')
      rt.render()
      return [a, b, rt.eval('o')]
    },
    expect: [['sync', 'listener', 'after-dispatch', 'p1', 'q', 'listener-micro', 'p2'],
      ['sync', 'listener', 'after-dispatch', 'p1', 'q', 'listener-micro', 'p2', 't1', 't1-micro', 't2'],
      ['sync', 'listener', 'after-dispatch', 'p1', 'q', 'listener-micro', 'p2', 't1', 't1-micro', 't2', 'raf', 'raf-micro']],
  },
  {
    row: 'unsupported operation',
    name: 'APIs outside the shared subset (diagnostic, engines may differ)',
    diagnostic: true,
    run: (rt) => rt.eval(`[typeof document.body.animate, typeof document.getAnimations, typeof document.createTextNode, typeof document.body.matches, typeof document.body.childNodes, typeof fetch]`),
  },
]
