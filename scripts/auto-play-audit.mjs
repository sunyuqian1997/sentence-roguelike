// 自动试玩 + 判定采集 —— 「自己去玩,把历程全 log 下来」的采集端。
// 开真实战斗,按 8 种组句策略(主谓宾/系词双关/工具格/祈使/复句/乱序…)
// 用**实际手牌**组句并真·吟诵(走与玩家完全相同的评估与结算管线),
// chantlog 快照(句子/卡/倍率/notes/效果)最后整体导出为 JSON,
// 供审计 agent 逐句检查判定是否合理。
//   node scripts/auto-play-audit.mjs [chants] [outfile]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';

const CHANTS = parseInt(process.argv[2] || '40', 10);
const OUT = process.argv[3] || 'audit-playlog.json';
const URL = process.env.AUDIT_URL || 'http://localhost:5173/?autocombat=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9302;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpGet = u => new Promise((res, rej) => { http.get(u, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });

const ch = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/apa','about:blank'], { stdio:'ignore' });
try {
  let t; for (let i=0;i<40;i++){ try{ t=JSON.parse(await httpGet(`http://localhost:${PORT}/json`)); if(t.length)break; }catch{ await sleep(200);} }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate:false, maxPayload:1<<28 });
  const pend = new Map(); let id = 0;
  await new Promise((r,j)=>{ ws.on('open',r); ws.on('error',j); });
  ws.on('message', b => { const m=JSON.parse(b.toString()); if(m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id);} });
  const send = (me,pa={}) => new Promise((rs,rj)=>{ const i=++id; pend.set(i,r=>r.error?rj(new Error(me+' '+JSON.stringify(r.error))):rs(r.result)); ws.send(JSON.stringify({id:i,method:me,params:pa})); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: URL }); await sleep(2200);

  const expr = `
  (async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const c = await import('/src/game/combat.js');
    const r = await import('/src/ui/render.js');
    const e = await import('/src/data/enemies.js');
    localStorage.removeItem('sentence_rogue_chantlog');
    const rand = a => a[Math.floor(Math.random()*a.length)];
    const defs = Object.values(e.ENEMY_DEFS).filter(d => d.act <= 2 && d.type !== 'boss');
    const enemyCard = (k) => ({ word: (G.enemies[k]||{}).name, pos:'object', cost:0,
      _isEnemyTarget:true, _enemyIdx:k, id:'aud_e'+k+'_'+Math.random().toString(36).slice(2,6) });
    const meCard = () => ({ word:'我', pos:'subject', cost:0, _isFixedWo:true,
      id:'aud_wo_'+Math.random().toString(36).slice(2,6) });
    const skipped = [];
    let chanted = 0, guard = 0;

    while (chanted < ${CHANTS} && guard++ < ${CHANTS} * 6) {
      if (!G.enemies || !G.enemies.length || G.enemies.every(x => x.hp <= 0) || G.hp <= 10) {
        G.hp = G.maxHp;
        const n = Math.random() < 0.45 ? 2 : 1;
        const set = []; while (set.length < n) set.push(rand(defs));
        window.__startCombat(set);
        await sleep(700);
      }
      G.energy = 3;
      G.sentence = [];
      const pool = [...G.hand];
      const take = pred => { const i = pool.findIndex(x => x && pred(x)); return i >= 0 ? pool.splice(i, 1)[0] : null; };
      const verb = () => take(x => x.pos === 'verb');
      const subj = () => take(x => x.pos === 'subject' && x.word !== '我');
      const conn = w => take(x => x.pos === 'connector' && (!w || x.word === w));
      const comma = () => take(x => x.pos === 'punctuation' && x.punctType === 'comma');
      const anyc = () => take(() => true);
      const aliveIdx = G.enemies.map((x,i) => x.hp > 0 ? i : -1).filter(i => i >= 0);
      const eIdx = rand(aliveIdx);
      const strat = rand(['svo','svo','vo','sv','copula','instrument','imperative','comma','shuffle']);
      const S = G.sentence;
      if (strat === 'svo') { S.push(meCard()); const v = verb(); if (v) S.push(v); S.push(enemyCard(eIdx)); }
      else if (strat === 'vo') { const v = verb(); if (v) S.push(v); S.push(enemyCard(eIdx)); }
      else if (strat === 'sv') { const s = subj() || meCard(); S.push(s); const v = verb(); if (v) S.push(v); }
      else if (strat === 'copula') {
        const a = rand(['me','subj','enemy']);
        S.push(a === 'me' ? meCard() : a === 'enemy' ? enemyCard(eIdx) : (subj() || meCard()));
        const shi = conn('是'); if (shi) S.push(shi);
        const b = rand(['pun','subj','me']);
        const bc = b === 'pun' ? take(x => x.pun) : b === 'subj' ? subj() : meCard();
        if (bc) S.push(bc);
      }
      else if (strat === 'instrument') {
        S.push(meCard()); const yong = conn('用'); if (yong) S.push(yong);
        const inst = subj(); if (inst) S.push(inst);
        const v = verb(); if (v) S.push(v); S.push(enemyCard(eIdx));
      }
      else if (strat === 'imperative') {
        S.push(enemyCard(eIdx)); const gei = take(x => x.word === '给');
        if (gei) S.push(gei); S.push(meCard()); const v = verb(); if (v) S.push(v);
      }
      else if (strat === 'comma') {
        S.push(meCard()); const v1 = verb(); if (v1) S.push(v1); S.push(enemyCard(eIdx));
        const cm = comma(); if (cm) S.push(cm);
        const s2 = subj() || meCard(); S.push(s2); const v2 = verb(); if (v2) S.push(v2);
      }
      else { const n = 3 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) { const x = anyc(); if (x) S.push(x); } }

      r.renderCombat();
      await sleep(200);
      const btn = document.getElementById('chant-btn');
      const text = S.map(x => x.word).join('');
      if (S.length && btn && !btn.disabled) {
        c.chantSentence();
        chanted++;
        await sleep(2600);
      } else {
        skipped.push({ strat, text });
        G.sentence = [];
      }
      if (Math.random() < 0.35 && G.enemies.some(x => x.hp > 0)) { c.endPlayerTurn(); await sleep(2800); }
    }
    await sleep(800);
    const log = JSON.parse(localStorage.getItem('sentence_rogue_chantlog') || '[]');
    return JSON.stringify({ chanted, log, skippedCount: skipped.length, skipped: skipped.slice(0, 40) });
  })()`;

  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
  const data = JSON.parse(res.result.value);
  writeFileSync(OUT, JSON.stringify(data, null, 1));
  console.log(`chanted=${data.chanted} logged=${data.log.length} skipped=${data.skippedCount} → ${OUT}`);
} finally {
  ch.kill();
}
