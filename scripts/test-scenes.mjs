// 场景系统(P5)回归 — node-only.
//   node scripts/test-scenes.mjs
// 覆盖: 去句式识别 / 场景buff(诗意·伤害) / 景物检测与光环 / 上限3·去重 /
//        回合开始效果 / 无场景状态零影响(golden 契约)。
import { readFileSync } from 'node:fs';

const { G } = await import('../src/game/state.js');
const { evaluateSentence } = await import('../src/game/evaluator/index.js');
const { isWellFormed } = await import('../src/lang/zh/rules/wellformed.js');
const { resetCreativity } = await import('../src/game/creativity.js');
const { SCENES, SCENERY, addSceneryWords, sceneTurnStartEffects, detectSceneryWords } =
  await import('../src/game/scenes.js');

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
  ];
  G.strength = 0; G.weak = 0; G.vulnerable = 0;
  G.hand = []; G.maxHp = 50; G.hp = 40;
  G.poeticAura = false; G.lastRhymeKey = null; G.rhymeStreak = 0;
  G.sentence = [];
  G.currentScene = null;
  G.sceneryProps = [];
  G.scenesVisited = [];
  resetCreativity();
}

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

// ---- 1. 去句式识别 ----
console.log('— qu_movement 句式 —');
resetG();
const quSentence = () => [card('wo'), card('qu_verb'), card('yuexia')];
const wf = isWellFormed(quSentence());
ok(wf.ok, '「我去月下」成句', wf.reason || '');
const rQu = evaluateSentence(quSentence());
ok(rQu.effects._sceneChange && rQu.effects._sceneChange.sceneId === 'yuexia',
  '识别 _sceneChange=yuexia', JSON.stringify(rQu.effects._sceneChange));
ok(rQu.grammarNotes.some(n => n.includes('移步换景')), '语法注记「移步换景」');
ok(rQu.effects.damage === 0, '换景句无伤害', String(rQu.effects.damage));

// 无主语祈使「去战场」也成立
resetG();
const rQu2 = evaluateSentence([card('qu_verb'), card('zhanchang')]);
ok(rQu2.effects._sceneChange && rQu2.effects._sceneChange.sceneId === 'zhanchang',
  '「去战场」也识别', JSON.stringify(rQu2.effects._sceneChange));

// 非地点宾语不触发:「我去海」(海不是 place 卡)
resetG();
const rQu3 = evaluateSentence([card('wo'), card('qu_verb'), card('hai')]);
ok(!rQu3.effects._sceneChange, '「我去海」不换景(海非地点卡)');

// 感叹卡「去」不触发句式(它会浮到句尾,且不在动词位)
resetG();
const rExcl = evaluateSentence([card('wo'), card('zhan'), enemyTarget(0), card('qu')]);
ok(!rExcl.effects._sceneChange, '感叹「去」不误触发换景');

// ---- 2. 场景全局 buff ----
console.log('— 场景 buff —');
resetG();
const atk = () => [card('wo'), card('zhan'), enemyTarget(0)];
const rBase = evaluateSentence(atk());

resetG();
G.currentScene = { id: 'yuexia', name: '月下', sinceTurn: 1 };
const rMoonScene = evaluateSentence(atk());
ok(Math.abs(rMoonScene.literaryMult - (rBase.literaryMult + 0.2)) < 1e-9,
  '月下:literaryMult +0.2', `${rBase.literaryMult} -> ${rMoonScene.literaryMult}`);
ok(rMoonScene.literaryNotes.some(n => n.includes('诗意沐月')), '月下注记');

resetG();
G.currentScene = { id: 'zhanchang', name: '战场', sinceTurn: 1 };
const rWarScene = evaluateSentence(atk());
ok(rWarScene.effects.damage > rBase.effects.damage,
  '战场:攻击句伤害更高', `${rBase.effects.damage} -> ${rWarScene.effects.damage}`);
ok(rWarScene.literaryNotes.some(n => n.includes('杀伐之地')), '战场注记');

// 战场对非攻击句零影响
resetG();
const rDefBase = evaluateSentence([card('wo'), card('shou')]);
resetG();
G.currentScene = { id: 'zhanchang', name: '战场', sinceTurn: 1 };
const rDefWar = evaluateSentence([card('wo'), card('shou')]);
ok(rDefWar.effects.damage === 0 && rDefWar.effects.block === rDefBase.effects.block,
  '战场:防守句零影响', `dmg=${rDefWar.effects.damage} block ${rDefBase.effects.block}->${rDefWar.effects.block}`);

// ---- 3. 景物词 → 舞台道具 ----
console.log('— 景物检测 —');
resetG();
const rScenery = evaluateSentence([card('wo'), card('zhan'), card('mingyue')]);
ok(Array.isArray(rScenery.effects._sceneryAdd) && rScenery.effects._sceneryAdd.includes('明月'),
  '「我斩明月」→ _sceneryAdd 含明月', JSON.stringify(rScenery.effects._sceneryAdd));

// 敌方目标卡不算景物:敌人名字叫「明月」也不上台
resetG();
G.enemies[0].name = '明月';
const rEnemyMoon = evaluateSentence([card('wo'), card('zhan'), enemyTarget(0)]);
ok(!rEnemyMoon.effects._sceneryAdd, '敌方目标「明月」不算景物');

// 在场景物光环
resetG();
G.sceneryProps = [{ id: 'moon', word: '明月', turn: 1 }];
const rMoonAura = evaluateSentence(atk());
ok(Math.abs(rMoonAura.literaryMult - (rBase.literaryMult + 0.1)) < 1e-9,
  '明月在场:literaryMult +0.1', `${rBase.literaryMult} -> ${rMoonAura.literaryMult}`);
ok(rMoonAura.literaryNotes.some(n => n.includes('明月在场')), '明月光环注记');

// ---- 4. 道具列表:去重 + 上限3 ----
console.log('— 道具去重/上限 —');
let list = addSceneryWords([], ['明月'], 1).props;
list = addSceneryWords(list, ['明月'], 2).props;
ok(list.length === 1, '重复不叠加(明月×2)', JSON.stringify(list));
list = addSceneryWords(list, ['月亮'], 3).props;
ok(list.length === 1, '同 id 别名不叠加(明月+月亮)', JSON.stringify(list));
list = addSceneryWords(list, ['椅子'], 4).props;
list = addSceneryWords(list, ['灯'], 5).props;
list = addSceneryWords(list, ['山'], 6).props;
ok(list.length === 3, '上限 3', JSON.stringify(list.map(p => p.id)));
ok(!list.some(p => p.id === 'moon') && list[list.length - 1].id === 'mountain',
  '最老的(明月)被顶掉,最新(山)在列', JSON.stringify(list.map(p => p.id)));

// detectSceneryWords 词面覆盖
ok(detectSceneryWords([{ word: '枯藤', pos: 'object' }, { word: '海', pos: 'object' }]).length === 2,
  'detectSceneryWords 识别枯藤/海');

// ---- 5. 回合开始效果 ----
console.log('— 回合 buff —');
const fxSea = sceneTurnStartEffects({ id: 'haibian' }, []);
ok(fxSea.block === 2 && fxSea.draw === 0, '海边:+2block', JSON.stringify(fxSea));
const fxTavern = sceneTurnStartEffects({ id: 'jiuguan' }, []);
ok(fxTavern.draw === 1 && fxTavern.block === 0, '酒馆:+1抽', JSON.stringify(fxTavern));
const fxChair = sceneTurnStartEffects(null, [{ id: 'chair', word: '椅子', turn: 1 }]);
ok(fxChair.block === 1, '椅子:blockPerTurn 1', JSON.stringify(fxChair));
const fxNone = sceneTurnStartEffects(null, []);
ok(fxNone.block === 0 && fxNone.draw === 0 && fxNone.notes.length === 0, '无场景:零效果');

// ---- 6. 无场景状态零影响(golden 契约) ----
console.log('— 零影响契约 —');
resetG();
const rClean = evaluateSentence(atk());
ok(rClean.totalMult === rBase.totalMult && rClean.effects.damage === rBase.effects.damage,
  '无场景状态下评估与基线一致', `${rBase.totalMult}/${rBase.effects.damage} vs ${rClean.totalMult}/${rClean.effects.damage}`);
ok(!rClean.literaryNotes.some(n => /沐月|杀伐|在场/.test(n)), '无场景无场景注记');
// SCENES/SCENERY 注册表完整性
ok(['yuexia', 'haibian', 'jiuguan', 'zhanchang'].every(id => SCENES[id] && SCENES[id].id === id),
  'SCENES 注册表 4 场景齐全');
ok(Object.values(SCENERY).every(d => d.svg && d.aura && d.words.length), 'SCENERY 道具字段齐全');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
