// canvas-html Deno/V8 adapter. Exposes canvas-dom-host's behaviour to V8; it implements no
// DOM semantics of its own. What lives here is engine-local by design:
// - wrapper caches (handle -> wrapper; identity comes from the native handle),
// - JS callbacks of listeners and timers (keyed by ids the shared host hands out),
// - the requestAnimationFrame queue (same rules as the Boa renderer's prelude).
// Everything else is one op call into the shared host.
((globalThis) => {
  'use strict';
  const O = Deno.core.ops;

  // ---------------------------------------------------------------- errors
  class DOMException extends Error {
    constructor(message = '', name = 'Error') {
      super(message);
      Object.defineProperty(this, 'name', { value: String(name), writable: true, configurable: true });
    }
  }
  globalThis.DOMException = DOMException;
  // Shared host errors cross as "kind\u0001name\u0001message" (canvas-dom-host DomError::js_error).
  const hostError = (e) => {
    const parts = String(e && e.message !== undefined ? e.message : e).split('\u0001');
    if (parts.length !== 3) return e;
    return parts[0] === 'TypeError' ? new TypeError(parts[2]) : new DOMException(parts[2], parts[1]);
  };
  const host = (op, ...args) => {
    try { return op(...args); } catch (e) { throw hostError(e); }
  };
  const report = (what, e) => {
    const m = String(e), st = e && e.stack ? String(e.stack) : '';
    O.op_ch_record_error(`Uncaught JS error in ${what}: ${st.startsWith(m) ? st : m}`);
  };

  // ---------------------------------------------------------------- globals and clock
  globalThis.window = globalThis;
  globalThis.self = globalThis;
  const NativeDate = Date;
  function VirtualDate(...args) {
    if (!new.target) return new NativeDate(O.op_ch_date_now()).toString();
    return Reflect.construct(NativeDate, args.length ? args : [O.op_ch_date_now()], new.target);
  }
  VirtualDate.prototype = NativeDate.prototype;
  Object.defineProperty(VirtualDate.prototype, 'constructor', { value: VirtualDate, writable: true, configurable: true });
  VirtualDate.now = () => O.op_ch_date_now();
  VirtualDate.parse = NativeDate.parse;
  VirtualDate.UTC = NativeDate.UTC;
  globalThis.Date = VirtualDate;
  globalThis.performance = {
    now: () => O.op_ch_perf_now(),
    get timeOrigin() { return O.op_ch_time_origin(); },
    mark() {}, measure() {},
    toJSON() { return { timeOrigin: this.timeOrigin }; },
  };
  const consoleLog = [];
  globalThis.console = Object.fromEntries(['log', 'info', 'debug', 'warn', 'error'].map((level) => [level, (...args) => {
    if (consoleLog.length < 100) consoleLog.push({ level, message: args.map(String).join(' ') });
  }]));
  if (typeof globalThis.queueMicrotask !== 'function') {
    globalThis.queueMicrotask = (cb) => { Promise.resolve().then(cb); };
  }

  // ---------------------------------------------------------------- timers (ids from the shared schedule)
  const timers = new Map();
  const addTimer = (cb, delay, args, interval) => {
    if (typeof cb !== 'function') return 0;
    let ms = Number(delay);
    ms = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const id = O.op_ch_timer_add(ms, interval ? ms : -1);
    timers.set(id, { cb, args, interval });
    return id;
  };
  globalThis.setTimeout = (cb, delay = 0, ...args) => addTimer(cb, delay, args, false);
  globalThis.setInterval = (cb, delay = 0, ...args) => addTimer(cb, delay, args, true);
  globalThis.clearTimeout = globalThis.clearInterval = (id) => {
    const n = Number(id);
    timers.delete(n);
    O.op_ch_timer_clear(n);
  };
  const runTimer = (id) => {
    const t = timers.get(id);
    if (!t) return;
    if (!t.interval) timers.delete(id);
    try { t.cb.apply(undefined, t.args); } catch (e) { report('timer callback', e); }
  };

  // ---------------------------------------------------------------- requestAnimationFrame
  // Same contract as the Boa renderer: callbacks run once per render(), right before style and
  // layout, in registration order, with performance.now() as the timestamp.
  let rafQueue = [];
  let rafId = 0;
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push([++rafId, cb]); return rafId; };
  globalThis.cancelAnimationFrame = (id) => { rafQueue = rafQueue.filter((e) => e[0] !== id); };
  const frame = () => {
    const run = rafQueue;
    rafQueue = [];
    const t = O.op_ch_perf_now();
    let error;
    for (const [, cb] of run) {
      try { cb(t); } catch (e) { error = error || e; }
    }
    if (error) report('script', error);
  };

  // ---------------------------------------------------------------- wrappers (runtime-local cache)
  const HANDLE = Symbol('canvas-html.handle');
  const CONSTRUCT = Symbol('canvas-html.construct');
  const wrappers = new Map();
  const handleOf = (node) => {
    const h = node != null ? node[HANDLE] : undefined;
    if (h === undefined) throw new TypeError('`this` is not a DOM node');
    return h;
  };
  let docHandle;
  const wrap = (h) => {
    if (h === null || h === undefined) return null;
    if (h === docHandle) return document;
    let w = wrappers.get(h);
    if (!w) {
      w = new Element(CONSTRUCT, h);
      wrappers.set(h, w);
    }
    return w;
  };

  // ---------------------------------------------------------------- events
  const callbackKeys = new Map();
  const callbacks = new Map();
  let nextKey = 0;
  const keyFor = (cb) => {
    let k = callbackKeys.get(cb);
    if (k === undefined) { k = ++nextKey; callbackKeys.set(cb, k); callbacks.set(k, cb); }
    return k;
  };
  const releaseIfUnused = (k) => {
    if (!O.op_ch_callback_in_use(k)) { callbackKeys.delete(callbacks.get(k)); callbacks.delete(k); }
  };
  const targetKey = (t) => (t === globalThis ? 'w' : handleOf(t));
  const listenerOptions = (o) => (o !== null && typeof o === 'object' ? [!!o.capture, !!o.once] : [!!o, false]);
  const addListener = (t, type, cb, options) => {
    if (typeof cb !== 'function') return;
    const [capture, once] = listenerOptions(options);
    const k = keyFor(cb);
    if (!host(O.op_ch_listener_add, targetKey(t), String(type), k, capture, once)) releaseIfUnused(k);
  };
  const removeListener = (t, type, cb, options) => {
    const k = callbackKeys.get(cb);
    if (k === undefined) return;
    host(O.op_ch_listener_remove, targetKey(t), String(type), k, listenerOptions(options)[0]);
    releaseIfUnused(k);
  };
  const STATE = Symbol('canvas-html.event');
  class Event {
    constructor(type, init) {
      if (arguments.length === 0) throw new TypeError('Event: type is required');
      this[STATE] = {
        type: String(type), bubbles: !!(init && init.bubbles), cancelable: !!(init && init.cancelable),
        prevented: false, stop: false, stopImmediate: false, dispatching: false,
        target: null, currentTarget: null, phase: 0, timeStamp: O.op_ch_perf_now(),
      };
    }
    get type() { return this[STATE].type; }
    get bubbles() { return this[STATE].bubbles; }
    get cancelable() { return this[STATE].cancelable; }
    get target() { return this[STATE].target; }
    get srcElement() { return this[STATE].target; }
    get currentTarget() { return this[STATE].currentTarget; }
    get eventPhase() { return this[STATE].phase; }
    get defaultPrevented() { return this[STATE].prevented; }
    get isTrusted() { return false; }
    get composed() { return false; }
    get timeStamp() { return this[STATE].timeStamp; }
    preventDefault() { if (this[STATE].cancelable) this[STATE].prevented = true; }
    stopPropagation() { this[STATE].stop = true; }
    stopImmediatePropagation() { this[STATE].stop = true; this[STATE].stopImmediate = true; }
  }
  Object.assign(Event, { NONE: 0, CAPTURING_PHASE: 1, AT_TARGET: 2, BUBBLING_PHASE: 3 });
  class CustomEvent extends Event {
    constructor(type, init) {
      super(type, init);
      Object.defineProperty(this, 'detail', { value: init && init.detail !== undefined ? init.detail : null, enumerable: true });
    }
  }
  globalThis.Event = Event;
  globalThis.CustomEvent = CustomEvent;

  // The shared dispatch algorithm (canvas-dom-host `events` module docs).
  const runListeners = (tk, current, ev, st, phase) => {
    const ids = O.op_ch_listener_ids(tk, st.type);
    if (!ids.length) return false;
    st.currentTarget = current;
    st.phase = phase;
    for (const id of ids) {
      const begun = O.op_ch_listener_begin(tk, st.type, id);
      if (!begun) continue;
      const [k, once] = begun;
      const cb = callbacks.get(k);
      if (once) releaseIfUnused(k);
      if (cb) {
        try { cb.call(current, ev); } catch (e) { report('event listener', e); }
      }
      if (st.stopImmediate) return true;
    }
    return false;
  };
  const dispatch = (t, ev) => {
    if (!(ev instanceof Event)) throw new TypeError('dispatchEvent: argument is not an Event');
    const st = ev[STATE];
    if (st.dispatching) throw new DOMException('the event is already being dispatched', 'InvalidStateError');
    let path = [], includeWindow = true;
    if (t !== globalThis) {
      const h = handleOf(t);
      path = host(O.op_ch_event_path, h);
      includeWindow = host(O.op_ch_is_connected, h);
    }
    st.dispatching = true; st.stop = false; st.stopImmediate = false; st.target = t;
    try {
      let halted = false;
      for (let i = 0; i < path.length && !halted; i++) {
        const tk = path[i];
        const hasListeners = O.op_ch_listener_ids(tk, st.type).length > 0;
        if (!hasListeners) { if (!st.bubbles) break; continue; }
        halted = runListeners(tk, wrap(tk), ev, st, i === 0 ? 2 : 3);
        if (!st.bubbles || st.stop) break;
      }
      if (!halted && includeWindow && (st.bubbles || t === globalThis) && !st.stop) {
        runListeners('w', globalThis, ev, st, 3);
      }
    } finally {
      st.currentTarget = null; st.phase = 0; st.dispatching = false;
    }
    return !st.prevented;
  };
  globalThis.addEventListener = (type, cb, options) => addListener(globalThis, type, cb, options);
  globalThis.removeEventListener = (type, cb, options) => removeListener(globalThis, type, cb, options);
  globalThis.dispatchEvent = (ev) => dispatch(globalThis, ev);

  // ---------------------------------------------------------------- style objects
  const isIndex = (p) => typeof p === 'string' && /^\d+$/.test(p);
  const inlineStyle = (h) => {
    const api = {
      getPropertyValue: (p) => host(O.op_ch_style_get, h, String(p)),
      setProperty: (p, v, prio) => host(O.op_ch_style_set, h, String(p), v == null ? '' : String(v), prio == null ? '' : String(prio)),
      removeProperty: (p) => host(O.op_ch_style_remove, h, String(p)),
      item: (i) => host(O.op_ch_style_names, h)[Number(i)] ?? '',
    };
    return new Proxy(api, {
      get(target, p) {
        if (typeof p === 'symbol') return undefined;
        if (p in api) return api[p];
        if (p === 'cssText') return host(O.op_ch_style_css_text, h);
        if (p === 'length') return host(O.op_ch_style_names, h).length;
        if (isIndex(p)) return host(O.op_ch_style_names, h)[Number(p)];
        return host(O.op_ch_style_get, h, p);
      },
      set(target, p, v) {
        if (typeof p === 'symbol') return false;
        if (p === 'cssText') host(O.op_ch_style_set_css_text, h, String(v));
        else host(O.op_ch_style_set, h, p, v == null ? '' : String(v), '');
        return true;
      },
      has(target, p) {
        if (typeof p === 'symbol') return false;
        return p in api || p === 'cssText' || p === 'length' || O.op_ch_style_supported(p);
      },
    });
  };
  const computedStyle = (h) => {
    const api = {
      getPropertyValue: (p) => host(O.op_ch_computed, h, String(p)),
      setProperty() {}, removeProperty() {},
    };
    return new Proxy(api, {
      get(target, p) {
        if (typeof p === 'symbol') return undefined;
        if (p in api) return api[p];
        if (p === 'cssText') return '';
        return host(O.op_ch_computed, h, p);
      },
      has(target, p) { return typeof p === 'string' && (p in api || O.op_ch_style_supported(p)); },
    });
  };
  globalThis.getComputedStyle = (el) => {
    const h = el != null ? el[HANDLE] : undefined;
    if (h === undefined || h === docHandle) throw new TypeError('getComputedStyle: argument is not an Element');
    return computedStyle(h);
  };

  const rect = ([x, y, width, height]) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });
  const styles = new WeakMap();
  const classLists = new WeakMap();
  const classOp = (el, op, ...tokens) => host(O.op_ch_class_op, handleOf(el), op, tokens.map(String));

  // ---------------------------------------------------------------- Node / Element / Document
  class Node {
    constructor(token, h) {
      if (token !== CONSTRUCT) throw new TypeError('Illegal constructor');
      Object.defineProperty(this, HANDLE, { value: h });
    }
    get ownerDocument() { return this === document ? null : document; }
    get parentNode() { return wrap(host(O.op_ch_parent_node, handleOf(this))); }
    get parentElement() { return wrap(host(O.op_ch_parent_element, handleOf(this))); }
    get isConnected() { return host(O.op_ch_is_connected, handleOf(this)); }
    get textContent() { return this === document ? null : host(O.op_ch_text_get, handleOf(this)); }
    set textContent(v) { if (this !== document) host(O.op_ch_text_set, handleOf(this), v == null ? '' : String(v)); }
    get children() { return host(O.op_ch_children, handleOf(this)).map(wrap); }
    get firstElementChild() { return wrap(host(O.op_ch_children, handleOf(this))[0]); }
    appendChild(child) { host(O.op_ch_append_child, handleOf(this), handleOf(child)); return child; }
    querySelector(s) { return wrap(host(O.op_ch_query, this === document ? '' : handleOf(this), String(s))); }
    querySelectorAll(s) { return host(O.op_ch_query_all, this === document ? '' : handleOf(this), String(s)).map(wrap); }
    addEventListener(type, cb, options) { addListener(this, type, cb, options); }
    removeEventListener(type, cb, options) { removeListener(this, type, cb, options); }
    dispatchEvent(ev) { return dispatch(this, ev); }
  }
  class Element extends Node {
    get nodeType() { return 1; }
    get tagName() { return host(O.op_ch_tag_name, handleOf(this)); }
    get nodeName() { return this.tagName; }
    get localName() { return this.tagName.toLowerCase(); }
    get id() { return host(O.op_ch_attr_get, handleOf(this), 'id') ?? ''; }
    set id(v) { host(O.op_ch_attr_set, handleOf(this), 'id', String(v)); }
    get className() { return host(O.op_ch_attr_get, handleOf(this), 'class') ?? ''; }
    set className(v) { host(O.op_ch_attr_set, handleOf(this), 'class', String(v)); }
    getAttribute(n) { return host(O.op_ch_attr_get, handleOf(this), String(n)); }
    setAttribute(n, v) { host(O.op_ch_attr_set, handleOf(this), String(n), String(v)); }
    removeAttribute(n) { host(O.op_ch_attr_remove, handleOf(this), String(n)); }
    hasAttribute(n) { return host(O.op_ch_attr_get, handleOf(this), String(n)) !== null; }
    remove() { host(O.op_ch_remove, handleOf(this)); }
    get style() {
      let s = styles.get(this);
      if (!s) { handleOf(this); s = inlineStyle(this[HANDLE]); styles.set(this, s); }
      return s;
    }
    get classList() {
      let list = classLists.get(this);
      if (list) return list;
      const el = this;
      const tokens = () => host(O.op_ch_class_list, handleOf(el));
      list = {
        add: (...names) => { classOp(el, 'add', ...names); },
        remove: (...names) => { classOp(el, 'remove', ...names); },
        contains: (name) => classOp(el, 'contains', name),
        toggle: (name, force) => classOp(el, force === undefined ? 'toggle' : force ? 'toggle-on' : 'toggle-off', name),
        item: (i) => tokens()[i] ?? null,
        get length() { return tokens().length; },
        get value() { return el.className; },
        set value(v) { el.className = v; },
        toString: () => el.className,
        forEach: (cb, thisArg) => tokens().forEach(cb, thisArg),
        [Symbol.iterator]: () => tokens()[Symbol.iterator](),
      };
      classLists.set(this, list);
      return list;
    }
    set classList(v) { this.className = v; }
    getBoundingClientRect() { return rect(host(O.op_ch_rect, handleOf(this))); }
    getClientRects() { return host(O.op_ch_client_rects, handleOf(this)).map(rect); }
    get offsetLeft() { return host(O.op_ch_offset, handleOf(this))[0]; }
    get offsetTop() { return host(O.op_ch_offset, handleOf(this))[1]; }
    get offsetWidth() { return host(O.op_ch_offset, handleOf(this))[2]; }
    get offsetHeight() { return host(O.op_ch_offset, handleOf(this))[3]; }
    get clientWidth() { return host(O.op_ch_client_size, handleOf(this))[0]; }
    get clientHeight() { return host(O.op_ch_client_size, handleOf(this))[1]; }
  }
  class Document extends Node {
    get nodeType() { return 9; }
    get nodeName() { return '#document'; }
    get documentElement() { return wrap(host(O.op_ch_document_element)); }
    get body() { return wrap(host(O.op_ch_body)); }
    get defaultView() { return globalThis; }
    getElementById(id) { return wrap(host(O.op_ch_by_id, String(id))); }
    createElement(tag) { return wrap(host(O.op_ch_create_element, String(tag))); }
  }
  docHandle = host(O.op_ch_document);
  const document = new Document(CONSTRUCT, docHandle);
  globalThis.document = document;
  globalThis.Node = Node;
  globalThis.Element = Element;
  globalThis.HTMLElement = Element;
  globalThis.Document = Document;

  // ---------------------------------------------------------------- embedder hooks
  Object.defineProperty(globalThis, '__canvasHtml', {
    value: Object.freeze({
      runTimer,
      frame,
      console: () => consoleLog.slice(),
      // Same result protocol as the Boa renderer's eval: indirect eval, JSON with undefined -> null.
      evalJson(code) {
        let r;
        try { r = { ok: (0, eval)(code) }; } catch (e) {
          const m = String(e), st = e && e.stack ? String(e.stack) : '';
          r = { error: st.startsWith(m) ? st : st ? m + '\n' + st : m };
        }
        try { return JSON.stringify(r, (k, v) => (v === undefined ? null : v)); } catch (e) { return '{"ok":null}'; }
      },
      stats: () => ({ wrappers: wrappers.size, callbacks: callbacks.size, timers: timers.size, raf: rafQueue.length }),
    }),
    enumerable: false,
  });
})(globalThis);
