// 真·实战 fuzzer — 开一局真实战斗,逐回合拿「实际抽到的手牌」,把手牌做随机排列组合
// 全丢上去,跑**实际的成句判定**(isWellFormed,与点「吟诵」走同一判定),收集所有"通过"的
// 句子供人眼复核:有没有不成句/不合理的被放过。
//   node scripts/play-fuzz.mjs [turns] [combosPerTurn]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';

const TURNS = parseInt(process.argv[2] || '8', 10);
const COMBOS = parseInt(process.argv[3] || '300', 10);
const URL = process.env.FUZZ_URL || 'http://localhost:5173/?autocombat=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpGet = u => new Promise((res, rej) => { http.get(u, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });

const ch = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-port=9301','--user-data-dir=/tmp/pf','about:blank'], { stdio:'ignore' });
try {
  let t; for (let i=0;i<40;i++){ try{ t=JSON.parse(await httpGet('http://localhost:9301/json')); if(t.length)break; }catch{ await sleep(200);} }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate:false, maxPayload:1<<28 });
  const pend = new Map(); let id = 0;
  await new Promise((r,j)=>{ ws.on('open',r); ws.on('error',j); });
  ws.on('message', b => { const m=JSON.parse(b.toString()); if(m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id);} });
  const send = (me,pa={}) => new Promise((rs,rj)=>{ const i=++id; pend.set(i,r=>r.error?rj(new Error(me+' '+JSON.stringify(r.error))):rs(r.result)); ws.send(JSON.stringify({id:i,method:me,params:pa})); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: URL }); await sleep(1800);

  const expr = `
  (async () => {
    const wf = await import('/src/game/sentence.js');
    const combat = await import('/src/game/combat.js');
    const G = window.G;
    const TURNS=${TURNS}, COMBOS=${COMBOS};
    const passes=[], rejectsSample=[];
    let totalTried=0, totalPass=0;

    // 把一手牌(含 _isFixedWo 我卡 + 敌目标卡)做随机子集+随机排列。
    function randCombo(hand){
      const n = 2 + Math.floor(Math.random()*Math.min(6, hand.length));   // 2..6 张
      const pool=[...hand]; const pick=[];
      for(let i=0;i<n && pool.length;i++){ pick.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]); }
      return pick;
    }

    for (let turn=0; turn<TURNS; turn++){
      if (!G.hand || G.hand.length===0) break;
      // 构造可用牌池:手牌 + 我卡 + 一个敌目标卡(模拟真实可点的目标)
      const enemyTgt = G.enemies[0] ? {word:G.enemies[0].name,pos:'object',_isEnemyTarget:true,_enemyIdx:0} : null;
      const selfCard = {word:'我',pos:'subject',_isFixedWo:true,key:'wo'};
      const base = [...G.hand.map(c=>({...c})), selfCard]; if(enemyTgt) base.push(enemyTgt);

      for (let k=0;k<COMBOS;k++){
        const combo = randCombo(base).map(c=>({...c, id:'pf'+turn+'_'+k+'_'+Math.random()}));
        if (combo.length<2) continue;
        totalTried++;
        const r = wf.isWellFormed(combo);
        if (r.ok){ totalPass++;
          if (passes.length<60) passes.push(combo.map(c=>c.word).join('')+'  ['+combo.map(c=>c.pos[0]).join('')+']');
        } else if (rejectsSample.length<15) rejectsSample.push(combo.map(c=>c.word).join('')+' → '+r.reason);
      }
      // 进入下一回合拿新手牌:结束本回合 → 等敌方 → 新回合
      combat.endPlayerTurn();
      await new Promise(res=>setTimeout(res, 3200));
    }
    return { totalTried, totalPass, rate:(totalPass/Math.max(1,totalTried)*100).toFixed(1)+'%', passes, rejectsSample };
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue:true, awaitPromise:true });
  if (r.exceptionDetails) console.error('EXC', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  else {
    const v = r.result.value;
    console.log(`\n真·实战 fuzzer: ${v.totalTried} 个真实手牌组合, 通过 ${v.totalPass} (${v.rate})\n`);
    console.log('=== 通过的句子(人眼复核:有没有不成句的?) ===');
    v.passes.forEach(s => console.log('  ✓ ' + s));
    console.log('\n=== 被拒样本 ===');
    v.rejectsSample.forEach(s => console.log('  ✗ ' + s));
    writeFileSync('/tmp/play-fuzz-result.json', JSON.stringify(v,null,1));
  }
  ws.close();
} finally { ch.kill(); }
