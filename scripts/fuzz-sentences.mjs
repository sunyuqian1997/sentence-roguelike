// 随机组句 fuzzer — 从真实卡库随机抽卡拼句, 跑成句判定, 统计通过率并抽样展示,
// 用来人眼复核「不成句却通过 / 成句却被拒」的漏网之鱼。
//   node scripts/fuzz-sentences.mjs [count] [maxLen]
// 需要 dev server 在跑 (默认 5173)。用 CDP 在真实页面里执行, 因此能看到多义解析。
import { spawn } from 'node:child_process';
import http from 'node:http';
import { WebSocket } from 'ws';

const COUNT = parseInt(process.argv[2] || '400', 10);
const MAXLEN = parseInt(process.argv[3] || '6', 10);
const URL = process.env.FUZZ_URL || 'http://localhost:5173/?autocombat=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpGet = u => new Promise((res, rej) => { http.get(u, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });

let chrome;
try {
  chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-port=9240','about:blank'], { stdio:'ignore' });
  let t; for (let i=0;i<40;i++){ try{ t=JSON.parse(await httpGet('http://localhost:9240/json')); if(t.length)break; }catch{ await sleep(200);} }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate:false, maxPayload:256*1024*1024 });
  const pend = new Map(); let id = 0;
  await new Promise((res,rej)=>{ ws.on('open',res); ws.on('error',rej); });
  ws.on('message', b => { const m=JSON.parse(b.toString()); if(m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id);} });
  const send = (method,params={}) => new Promise((rs,rj)=>{ const i=++id; pend.set(i,r=>r.error?rj(new Error(JSON.stringify(r.error))):rs(r.result)); ws.send(JSON.stringify({id:i,method,params})); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await sleep(1800);

  const expr = `
  (async () => {
    const wf = await import('/src/game/sentence.js');
    const defs = (await import('/src/data/cards.js')).WORD_DEFS;
    const cards = Object.values(defs).filter(d => d && d.word && d.pos);
    // seeded RNG so runs are reproducible-ish without Math.random ban issues here (page context allows it)
    const pick = arr => arr[Math.floor(Math.random()*arr.length)];
    const COUNT=${COUNT}, MAXLEN=${MAXLEN};
    let pass=0; const passes=[], rejects=[];
    for (let n=0;n<COUNT;n++){
      const len = 2 + Math.floor(Math.random()*(MAXLEN-1));
      const seq = [];
      for (let i=0;i<len;i++){ const d=pick(cards); seq.push({...d, id:'f'+n+'_'+i}); }
      const text = seq.map(c=>c.word).join('');
      const r = wf.isWellFormed(seq);
      if (r.ok){ pass++; if(passes.length<40) passes.push(text+'  ['+seq.map(c=>c.pos[0]).join('')+']'); }
      else { if(rejects.length<25) rejects.push(text+' → '+r.reason); }
    }
    return { COUNT, pass, rate:(pass/COUNT*100).toFixed(1)+'%', passes, rejects };
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue:true, awaitPromise:true });
  if (r.exceptionDetails) { console.error('EXC', r.exceptionDetails.exception?.description||r.exceptionDetails.text); }
  else {
    const v = r.result.value;
    console.log(`\n随机组句 fuzzer: ${v.COUNT} 句, 通过 ${v.pass} (${v.rate})\n`);
    console.log('=== 通过的句子(抽样, 人眼复核是否真成句) ===');
    v.passes.forEach(s => console.log('  ✓ ' + s));
    console.log('\n=== 被拒的句子(抽样, 看拒得对不对) ===');
    v.rejects.forEach(s => console.log('  ✗ ' + s));
  }
  ws.close();
} finally { if (chrome) try { chrome.kill(); } catch {} }
