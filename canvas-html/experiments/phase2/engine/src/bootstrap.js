(() => {
  const now=()=>Deno.core.ops.op_phase2_now(), epoch=globalThis.__phase2Epoch;
  delete globalThis.__phase2Epoch;
  const NativeDate=Date;
  function VirtualDate(...args){
    if(!new.target)return new NativeDate(Math.floor(epoch+now())).toString();
    return Reflect.construct(NativeDate,args.length?args:[Math.floor(epoch+now())],new.target);
  }
  VirtualDate.prototype=NativeDate.prototype;
  Object.defineProperty(VirtualDate.prototype,'constructor',{value:VirtualDate,writable:true,configurable:true});
  VirtualDate.now=()=>Math.floor(epoch+now());VirtualDate.parse=NativeDate.parse;VirtualDate.UTC=NativeDate.UTC;
  globalThis.Date=VirtualDate;globalThis.performance=Object.freeze({now,timeOrigin:epoch});
  globalThis.window=globalThis;globalThis.self=globalThis;
  const op=(method,...args)=>JSON.parse(Deno.core.ops.op_phase2_dom(JSON.stringify({method,args})));
  const kebab=p=>p.startsWith('--')?p:p.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
  const ids=new WeakMap(), wrappers=new Map();
  const styleProps=new Set(['opacity','transform','transformOrigin','width','height','background','backgroundColor','left','top','color','position','display','visibility','zIndex','border','padding','margin']);
  const styleFor=id=>new Proxy({}, {
    has:(_,key)=>styleProps.has(key),
    get:(_,key)=>{
      if(key==='setProperty')return(p,v)=>op('styleSet',id,String(p),String(v));
      if(key==='getPropertyValue')return p=>op('styleGet',id,String(p));
      if(key==='removeProperty')return p=>{const old=op('styleGet',id,String(p));op('styleSet',id,String(p),'');return old;};
      if(key==='cssText')return op('attributeGet',id,'style')||'';
      if(key==='length')return op('styleNames',id).length;
      if(typeof key==='symbol')return undefined;
      if(/^\d+$/.test(key))return op('styleNames',id)[Number(key)];
      return op('styleGet',id,kebab(key));
    },
    set:(_,key,value)=>{if(key==='cssText')op('attributeSet',id,'style',String(value));else op('styleSet',id,kebab(key),String(value));return true;}
  });
  class Element {
    constructor(id){ids.set(this,id);Object.defineProperty(this,'style',{value:styleFor(id)});}
    get nodeType(){return 1;} get ownerDocument(){return document;}
    get textContent(){return op('textGet',ids.get(this));} set textContent(v){op('textSet',ids.get(this),String(v));}
    get tagName(){return op('tag',ids.get(this)).toUpperCase();}
    get id(){return this.getAttribute('id')||'';} set id(v){this.setAttribute('id',v);}
    get className(){return this.getAttribute('class')||'';}set className(v){this.setAttribute('class',v);}
    get parentNode(){const n=op('parent',ids.get(this));return n===null?null:wrap(n);}
    get parentElement(){return this.parentNode;}
    get offsetWidth(){return op('bounds',ids.get(this)).width;}get offsetHeight(){return op('bounds',ids.get(this)).height;}
    get clientWidth(){return this.offsetWidth;}get clientHeight(){return this.offsetHeight;}
    getAttribute(name){return op('attributeGet',ids.get(this),String(name));}
    setAttribute(name,value){op('attributeSet',ids.get(this),String(name),String(value));}
    removeAttribute(name){op('attributeSet',ids.get(this),String(name),'');}
    getBoundingClientRect(){const b=op('bounds',ids.get(this));return {...b,left:b.x,top:b.y,right:b.x+b.width,bottom:b.y+b.height};}
  }
  const wrap=id=>{if(!wrappers.has(id))wrappers.set(id,new Element(id));return wrappers.get(id);};
  globalThis.Element=Element;globalThis.HTMLElement=Element;
  globalThis.document={
    getElementById:id=>{const n=op('id',String(id));return n===null?null:wrap(n);},
    querySelector:selector=>{const ns=op('query',String(selector));return ns.length?wrap(ns[0]):null;},
    querySelectorAll:selector=>op('query',String(selector)).map(wrap),
    createElement:tag=>wrap(op('create',String(tag))),
    defaultView:globalThis,
    get documentElement(){return this.querySelector('html');},get body(){return this.querySelector('body');}
  };
  globalThis.getComputedStyle=element=>{
    const id=ids.get(element);if(id===undefined)throw new TypeError('Element required');
    return new Proxy({}, {get:(_,key)=>{
      if(key==='getPropertyValue')return p=>op('computed',id,String(p));
      if(typeof key==='symbol')return undefined;
      return op('computed',id,kebab(key));
    }});
  };
  globalThis.__phase2Console=[];
  globalThis.console=Object.fromEntries(["log","warn","error"].map(level=>[level,(...args)=>{if(__phase2Console.length<100)__phase2Console.push({level,message:args.map(String).join(" ")});}]));
  let serial=0;const timers=new Map(),frames=new Map();
  globalThis.setTimeout=(callback,delay=0,...args)=>{
    if(typeof callback!=='function')throw new TypeError('function required');
    const id=++serial,ms=Number(delay);timers.set(id,{id,due:now()+Math.max(0,Number.isFinite(ms)?ms:0),callback,args});return id;
  };
  globalThis.clearTimeout=id=>timers.delete(id);
  globalThis.requestAnimationFrame=callback=>{if(typeof callback!=='function')throw new TypeError('function required');const id=++serial;frames.set(id,callback);return id;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.queueMicrotask=callback=>Promise.resolve().then(callback);
  const ordered=()=>[...timers.values()].sort((a,b)=>a.due-b.due||a.id-b.id);
  globalThis.__phase2Clock=Object.freeze({
    next:()=>ordered()[0]?.due??null,
    tick:()=>{const t=ordered()[0];if(t&&t.due<=now()){timers.delete(t.id);t.callback(...t.args);}},
    frame:()=>{const ids=[...frames.keys()];for(const id of ids){const cb=frames.get(id);frames.delete(id);if(cb)cb(now());}}
  });
})();
