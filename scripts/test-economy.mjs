// Creativity-economy regression (P1) — node-only, no browser.
//   node scripts/test-economy.mjs
// Verifies: exact-repeat decay, skeleton decay, novelty bonus, preview purity
// (evaluating without recording must not advance the ledger), reset scope.
import { readFileSync } from 'node:fs';

const { G } = await import('../src/game/state.js');
const { evaluateSentence } = await import('../src/game/evaluator/index.js');
const { resetCreativity, recordChantCreativity } = await import('../src/game/creativity.js');

const raw = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
let uid = 0;
const card = (key) => {
  const def = raw[key];
  if (!def) throw new Error('no card def: ' + key);
  return { ...def, key, id: 'c' + (++uid), upgraded: false };
};
const enemyTarget = (idx = 0) => ({
  word: G.enemies[idx].name, pos: 'object', cost: 0, _isEnemyTarget: true, _enemyIdx: idx, id: 'e' + (++uid),
});

function resetG() {
  G.enemies = [
    { name: '纸鬼', hp: 30, maxHp: 30, tags: ['paper', 'ghost'], block: 0 },
    { name: '残句怪', hp: 25, maxHp: 25, tags: ['word', 'fragment'], block: 0 },
  ];
  G.strength = 0; G.weak = 0; G.vulnerable = 0;
  G.hand = []; G.maxHp = 50; G.hp = 40;
  G.poeticAura = false; G.lastRhymeKey = null; G.rhymeStreak = 0;
  G.sentence = [];
  resetCreativity();
}

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

// helper: evaluate & optionally record like chantSentence does
const evalOnly = (cards) => evaluateSentence(cards);
const chant = (cards) => {
  const r = evaluateSentence(cards);
  recordChantCreativity((r && r.cards) || cards);
  return r;
};

console.log('— 原句重复衰减 —');
resetG();
const s1 = () => [card('wo'), card('zhan'), enemyTarget(0)];   // 我斩纸鬼
const r1 = chant(s1());
const r2 = evalOnly(s1());
ok(r2.literaryMult < r1.literaryMult, '第2遍 literaryMult 下降', `${r1.literaryMult} -> ${r2.literaryMult}`);
ok((r2.effects._repetition || {}).kind === 'exact', '标记 exact 重复');
recordChantCreativity(r2.cards);
const r3 = evalOnly(s1());
ok(r3.literaryMult < r2.literaryMult, '第3遍继续下降', `${r2.literaryMult} -> ${r3.literaryMult}`);
ok(r3.literaryNotes.some(n => n.includes('词穷')), '词穷提示出现');

console.log('— 骨架重复(同结构换宾语) 温和衰减 —');
resetG();
chant([card('wo'), card('zhan'), enemyTarget(0)]);            // 我斩纸鬼
const rSk = evalOnly([card('wo'), card('zhan'), enemyTarget(1)]); // 我斩残句怪
ok((rSk.effects._repetition || {}).kind === 'skeleton', '标记 skeleton 重复');
ok(rSk.literaryNotes.some(n => n.includes('句式重复')), '句式重复提示');

console.log('— 换动词 = 新骨架, 无衰减 —');
resetG();
chant([card('wo'), card('zhan'), enemyTarget(0)]);
const rNew = evalOnly([card('wo'), card('chui'), enemyTarget(0)]); // 我锤纸鬼
ok(!rNew.effects._repetition, '不同动词不衰减');

console.log('— 新意奖励 —');
resetG();
const base1 = evalOnly([card('mingyue'), card('zhao'), card('wo')]); // 明月照我(首句,无新意加成)
ok(!base1.effects._novelty, '首句无新意加成(无基准)');
chant([card('wo'), card('zhan'), enemyTarget(0)]);
const rNov = evalOnly([card('mingyue'), card('zhao'), card('wo')]);
ok(!!rNov.effects._novelty, '第二句起新词有加成');
ok(rNov.effects._novelty.words.includes('明月'), '新词包含明月');
ok(!rNov.effects._novelty.words.includes('我'), '用过的词不算新');
ok(rNov.literaryMult > base1.literaryMult - 1e-9, '新意后不低于基线', `${base1.literaryMult} vs ${rNov.literaryMult}`);

console.log('— 预览纯读不记账 —');
resetG();
chant(s1());
evalOnly(s1()); evalOnly(s1()); evalOnly(s1());               // 反复预览
const rPrev = evalOnly(s1());
ok((rPrev.effects._repetition || {}).n === 1, '预览多次不叠加计数', JSON.stringify(rPrev.effects._repetition));

console.log('— 重置作用域 —');
resetCreativity();
const rReset = evalOnly(s1());
ok(!rReset.effects._repetition, '重置后无衰减');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
