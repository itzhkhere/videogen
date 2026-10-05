// Existing baseline limitation; do not change the production clock in this POC.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const {HtmlRenderer}=createRequire(import.meta.url)('../index.js');
const html=`<style>body{margin:0;font:32px Inter}</style><div id="date"></div><script>document.getElementById('date').textContent=String(Date.now())</script>`;
const font=fs.readFileSync(new URL('../test/assets/Inter-Regular.otf',import.meta.url));
function fresh(){
 const r=new HtmlRenderer({width:600,height:60,scripts:true,systemFonts:false});r.registerFont(font);r.load(html);
 const time=r.eval('Date.now()');const hash=createHash('sha256').update(r.render()).digest('hex');
 assert.equal(r.eval('Date.now()'),time,'time stays frozen inside one renderer');
 return {dateNow:Number(time),hash};
}
const samples=[fresh(),fresh(),fresh()];
console.log(JSON.stringify({description:'Frozen Date has a wall-clock epoch in the existing Boa adapter',samples,identical:new Set(samples.map(x=>x.hash)).size===1},null,2));
