// 「用X戳」工具格句式回归 (P3) — node-only.
//   node scripts/test-instrument.mjs
import { readFileSync } from 'node:fs';

const { G } = await import('../src/game/state.js');
const { evaluateSentence } = await import('../src/game/evaluator/index.js');
const { isWellFormed } = await import('../src/lang/zh/rules/wellformed.js');
const { resetCreativity } = await import('../src/game/creativity.js');

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

G.enemies = [
  { name: '纸鬼', hp: 30, maxHp: 30, tags: ['paper', 'ghost'], block: 0 },
];
G.strength = 0; G.weak = 0; G.vulnerable = 0;
G.hand = []; G.maxHp = 50; G.hp = 40;
G.poeticAura = false; G.lastRhymeKey = null; G.rhymeStreak = 0;
G.sentence = [];
resetCreativity();

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

// 我用猫戳纸鬼
const withCat = [card('wo'), card('yong'), card('mao'), card('cu'), enemyTarget(0)];
const wf = isWellFormed(withCat);
ok(wf.ok, '「我用猫戳纸鬼」成句', wf.reason || '');
const rCat = evaluateSentence(withCat);
ok(rCat.effects._instrument?.word === '猫', '识别器物=猫');
ok(rCat.grammarNotes.some(n => n.includes('用「猫」')), '语法注记');
ok(rCat.literaryNotes.some(n => n.includes('猫爪')), '猫专属味道');
ok(rCat.grammarNotes.some(n => n.includes('器物之利')), '器物伤害注记');

// 基线:我戳纸鬼 — 用猫版伤害必须更高
resetCreativity();
const rBase = evaluateSentence([card('wo'), card('cu'), enemyTarget(0)]);
ok(rCat.effects.damage > rBase.effects.damage, '用猫伤害 > 徒手', `${rCat.effects.damage} vs ${rBase.effects.damage}`);

// 我用明月斩纸鬼 — 高诗意器物
resetCreativity();
const rMoon = evaluateSentence([card('wo'), card('yong'), card('mingyue'), card('zhan'), enemyTarget(0)]);
ok(rMoon.effects._instrument?.word === '明月', '识别器物=明月');
ok(rMoon.literaryNotes.some(n => n.includes('月光为刃')), '明月专属味道');

// 表外词兜底:我用海斩纸鬼
resetCreativity();
const rSea = evaluateSentence([card('wo'), card('yong'), card('hai'), card('zhan'), enemyTarget(0)]);
ok(rSea.effects._instrument?.word === '海', '表外词也是器物');
ok(rSea.literaryNotes.some(n => n.includes('万物皆兵')), '兜底味道');

// 用后无名词 → 不触发(不误伤)
resetCreativity();
const rNoInstr = evaluateSentence([card('wo'), card('yong'), card('cu'), enemyTarget(0)]);
ok(!rNoInstr.effects._instrument, '用+直接动词不触发工具格');

// 防守句不吃器物伤害
resetCreativity();
const rDef = evaluateSentence([card('wo'), card('yong'), card('mao'), card('shou')]);
ok(!rDef.grammarNotes.some(n => n.includes('器物之利')), '无伤害句不加器物之利');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
