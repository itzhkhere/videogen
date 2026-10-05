// Deliberately small POC scheduler. rAF runs once at each explicit advance.
// No network, modules, wall-clock timers, or process/filesystem APIs.
(() => {
  const now = () => Deno.core.ops.op_now_ms();
  globalThis.host = Object.freeze({
    setText: (id,value) => Deno.core.ops.op_poc_set_text(String(id),String(value)),
    setStyle: (id,property,value) => Deno.core.ops.op_poc_set_style(String(id),String(property),String(value))
  });
  const NativeDate = Date;
  class VirtualDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [Math.floor(now())])); }
    static now() { return Math.floor(now()); }
  }
  globalThis.Date = VirtualDate;
  globalThis.performance = Object.freeze({ now });
  let serial = 0;
  const timers = new Map(), frames = new Map();
  globalThis.setTimeout = (callback, delay=0, ...args) => {
    if (typeof callback !== 'function') throw new TypeError('function required');
    const id = ++serial;
    const ms = Number(delay);
    timers.set(id, {id, due: now()+Math.max(0,Number.isFinite(ms)?ms:0), callback, args});
    return id;
  };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.requestAnimationFrame = callback => {
    if (typeof callback !== 'function') throw new TypeError('function required');
    const id=++serial; frames.set(id,callback); return id;
  };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const ordered = () => [...timers.values()].sort((a,b)=>a.due-b.due || a.id-b.id);
  globalThis.__pocClock = Object.freeze({
    next: () => ordered()[0]?.due ?? null,
    tick: () => {
      const timer=ordered()[0];
      if(timer && timer.due <= now()) { timers.delete(timer.id);timer.callback(...timer.args); }
    },
    frame: () => {
      const ids=[...frames.keys()];
      for(const id of ids) {
        const cb=frames.get(id); frames.delete(id); if(cb) cb(now());
      }
    }
  });
})();
