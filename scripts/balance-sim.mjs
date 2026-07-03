#!/usr/bin/env node
// ============================================================================
// balance-sim.mjs — headless 战斗模拟器（node 直跑，无浏览器）
//
// 用法:  node scripts/balance-sim.mjs [act] [runsPerEnemy] [--json out.json] [--boss]
//        SEED=42 node scripts/balance-sim.mjs 1 100
//
// 架构: 直接 import 真实游戏模块（evaluateSentence / isWellFormed / ENEMY_DEFS /
// createStarterDeck / poetics），只有「效果结算」和「敌方意图结算」是本文件照抄
// src/game/damage.js 与 src/game/combat.js#applyEffects 主干重写的（因原函数碰 DOM）。
//
// ---------------------------------------------------------------------------
// ★ 与真实 combat 的已知偏差清单（改动结算逻辑时同步更新此表）:
//  1. 不调 enemy.act_fn（碰 DOM）。敌方意图按语义自行结算:
//     attack=value×hits 经 dealDamageToPlayerSim；defend=+block；
//     buff=+strength（例外: 墨魂 mohun 的 buff 实为回血4，按回血结算）；
//     debuff=易伤+2（墨劫 mojie / 词帝 cidi 额外虚弱+2）；
//     special（文曲星消耗手牌）= 敌方回合时手牌已弃空，等效无操作，计入 skipped。
//  2. 单敌模拟。真实 normal 战有 40% 概率双敌（map.js#getRandomEnemies）。
//  3. 层数缩放不模拟（startCombat 的 depth: 每层 +8% HP / 每 2 层 +1 伤）,
//     即模拟的是「本 act 第一层」强度；实际后期同 act 敌人更强。
//  4. 召唤句不模拟；detectSummon 命中的候选被 bot 排除。
//  5. applyEffects 的特殊字段跳过并在 stderr 记 skipped 计数:
//     zeroCost/_spendGold/_discardRandom/goldGain/drawLessNext/thorns/_kickback/
//     _reduceEnemyBlock/_stripTargetBlock/_taunt/_vulnSelfNext/_bonusEnergy/
//     _stunEnemy/_reduceStrength/_skipNextTurn/_removeBuffs/_execute/
//     _partialPenetrate/_poison/_reflectDmg/_transferDebuffs/_goldOnKill/
//     _excSkipChance/_drawNextTurn/_blockDebuffNext/_confuse/_imperative 等。
//     已结算: damage(aoe/multi/target)/block/heal/strengthGain/draw/applyVuln/
//     applyWeak/selfHarm(+buff)/_predicates(pun+identity)/_motifTriggers/
//     _fearTriggers/_coActors/_poetryLevel回血/_rhymeInfo。
//  6. guaranteePunctuation/Verb/Copula 逻辑为照抄（combat.js 未导出）；
//     guaranteeTutorialCombo（首战教学保底）不模拟。
//  7. 无 perks / 事件 / 商店 / 升级牌；固定 createStarterDeck 起手牌组。
//  8. bot 每回合最多吟诵 3 句；枚举 ≤2000 个卡序列、句长 ≤5 张、同词去重。
//  9. 候选每回合枚举一次（≤2000 序列 / ≤400 求值），同回合后续吟诵复用剩余
//     候选（选择依据是吟诵前的旧数值）；吟诵时再 evaluate 一次做实际结算——
//     与真实「预览→吟诵」两次求值一致；随机卡（猫）两次结果可能不同。
// 10. 玩家侧反伤 thorns / 反弹 _reflectDmg 不结算（其来源效果本身被跳过）；
//     敌方 jingmo 的 reflecting（受击反弹50%）已按 damage.js 结算。
// 11. 敌人混乱 confused 自伤按 combat.js#enemyTurn 结算；眩晕 stunned 跳过行动。
// 12. 动画/评分卡时序与数值无关，全部忽略。
// ============================================================================

import { register } from 'node:module';
import fs from 'node:fs';

// ---- node 侧适配: json import attribute + 最小 DOM shim -------------------
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url && r.url.endsWith('.json')) return { ...r, importAttributes: { type: 'json' } };
  return r;
}
`));

// 万能吸收器: 任意属性访问/调用都返回自身。UI 模块顶层或函数内偶发的 DOM
// 访问全部被吞掉（本模拟器不调用任何真正渲染路径）。
const sink = new Proxy(function () {}, {
  get(t, p) {
    if (p === Symbol.toPrimitive) return () => '';
    if (p === 'then') return undefined; // 防止被误当 thenable
    return sink;
  },
  apply() { return sink; },
  set() { return true; },
});
globalThis.document = sink;
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-sim' }, configurable: true }); } catch { /* already ok */ }

// ---- 可复现随机: SEED 环境变量 --------------------------------------------
const SEED = Number(process.env.SEED || 20260702);
let _rs = SEED >>> 0;
Math.random = () => {
  _rs = (_rs * 1664525 + 1013904223) >>> 0;
  return _rs / 4294967296;
};

// ---- 真实游戏模块 ----------------------------------------------------------
const u = (p) => new URL('../src/' + p, import.meta.url).href;
const { G } = await import(u('game/state.js'));
const { evaluateSentence, isWellFormed, detectSummon } = await import(u('game/sentence.js'));
const { WORD_DEFS, makeCard, createStarterDeck } = await import(u('data/cards.js'));
const { ENEMY_DEFS } = await import(u('data/enemies.js'));
const { PUN_STATUS, PUN_ON_APPLY, resolveIdentityTrait, processEnemyPuns } = await import(u('game/poetics.js'));
const { resetCreativity, recordChantCreativity } = await import(u('game/creativity.js'));

// ---- CLI ------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--') && !a.includes('.json')));
const jsonIdx = argv.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
const positional = argv.filter((a, i) => !a.startsWith('--') && !(jsonIdx >= 0 && i === jsonIdx + 1));
const ACT = Number(positional[0] || 1);
const RUNS = Number(positional[1] || 100);
const INCLUDE_BOSS = flags.has('--boss');

const STRATEGIES = ['greedy-mult', 'greedy-damage', 'spam', 'diverse'];
const MAX_TURNS = 25;          // 超过按打不死(timeout)算,不计胜
const MAX_CHANTS_PER_TURN = 3;
const MAX_SEQ = 2000;          // 每次决策枚举的卡序列上限
const MAX_EVAL = 400;          // 其中真正跑 evaluateSentence 的上限
const MAX_LEN = 5;             // 句长上限(张)

const skipped = {};            // 跳过的效果字段计数 → stderr
const skip = (k) => { skipped[k] = (skipped[k] || 0) + 1; };

// ============================================================================
// 结算公式 —— 照抄 src/game/damage.js（剥掉 DOM/音效/动画）
// ============================================================================
function dealDamageToEnemySim(idx, amount, ignoreBlock) {
  const enemy = G.enemies[idx];
  if (!enemy || enemy.hp <= 0) return 0;
  if (enemy.vulnerable > 0) amount = Math.floor(amount * 1.5);
  if (enemy.reflecting) dealDamageToPlayerSim(Math.floor(amount * 0.5), enemy);
  if (!ignoreBlock && enemy.block > 0) {
    if (amount <= enemy.block) { enemy.block -= amount; return 0; }
    amount -= enemy.block;
    enemy.block = 0;
  }
  const dealt = Math.min(enemy.hp, amount);
  enemy.hp -= amount;
  if (enemy.hp < 0) enemy.hp = 0;
  return dealt;
}

function dealDamageToPlayerSim(amount, source) {
  if (source && source._dmgBonus) amount += source._dmgBonus;
  if (source && source.strength) amount += source.strength;
  if (source && source.weak > 0) amount = Math.floor(amount * 0.75);
  if (G.vulnerable > 0) amount = Math.floor(amount * 1.5);
  // thorns 跳过（其来源效果字段本就未结算）
  if (G.block > 0) {
    if (amount <= G.block) { G.block -= amount; return; }
    amount -= G.block;
    G.block = 0;
  }
  G.hp -= amount;
  if (G.hp < 0) G.hp = 0;
}

// ============================================================================
// 效果结算 —— 照抄 src/game/combat.js#applyEffects 主干（剥掉 DOM）
// ============================================================================
const HANDLED_KEYS = new Set([
  'damage', 'block', 'heal', 'strengthGain', 'draw', 'applyVuln', 'applyWeak',
  'selfHarm', 'selfHarmDmg', 'selfHarmBuff',
  '_predicates', '_motifTriggers', '_fearTriggers', '_coActors',
  '_poetryLevel', '_poeticCrit', '_rhymeInfo',
  // 纯元数据（不产生结算动作）:
  'targetEnemyIdx', 'aoe', 'ignoreBlock', 'multiTargetIndices', 'isQuestion',
  'text', 'summonName',
  // 已在 eval-core/settle.js 内部消耗完毕的字段（伤害/目标已折算进 damage 等）:
  '_crit', '_imperative', '_doubleExecute',
]);

function settleEffects(effects, stats) {
  if (!effects) return;

  if (effects.selfHarm) {
    G.hp -= effects.selfHarmDmg;
    if (G.hp < 1) G.hp = 1;
    if (effects.selfHarmBuff) G.strength += effects.selfHarmBuff;
    stats.hpLostSelf += effects.selfHarmDmg;
  }

  if (effects.block > 0) G.block += effects.block;
  if (effects.heal > 0) G.hp = Math.min(G.maxHp, G.hp + effects.heal);
  if (effects.strengthGain > 0) G.strength += effects.strengthGain;
  if (effects.draw > 0) drawCardsSim(effects.draw);

  if (effects.applyVuln > 0) {
    G.enemies.forEach(e => { if (e.hp > 0) e.vulnerable = (e.vulnerable || 0) + effects.applyVuln; });
  }

  if (effects.applyWeak > 0) {
    if (effects.aoe) {
      G.enemies.forEach(e => { if (e.hp > 0) e.weak = (e.weak || 0) + effects.applyWeak; });
    } else if (effects.targetEnemyIdx >= 0) {
      const tgt = G.enemies[effects.targetEnemyIdx];
      if (tgt && tgt.hp > 0) tgt.weak = (tgt.weak || 0) + effects.applyWeak;
    } else {
      const t = G.enemies.find(e => e.hp > 0);
      if (t) t.weak = (t.weak || 0) + effects.applyWeak;
    }
  }

  if (effects.damage > 0) {
    if (effects.aoe) {
      G.enemies.forEach((e, idx) => { if (e.hp > 0) stats.dmgDealt += dealDamageToEnemySim(idx, effects.damage, effects.ignoreBlock); });
    } else if (effects.multiTargetIndices && effects.multiTargetIndices.length > 1) {
      effects.multiTargetIndices.forEach(tIdx => {
        if (G.enemies[tIdx] && G.enemies[tIdx].hp > 0) stats.dmgDealt += dealDamageToEnemySim(tIdx, effects.damage, effects.ignoreBlock);
      });
    } else if (effects.targetEnemyIdx >= 0 && G.enemies[effects.targetEnemyIdx] && G.enemies[effects.targetEnemyIdx].hp > 0) {
      stats.dmgDealt += dealDamageToEnemySim(effects.targetEnemyIdx, effects.damage, effects.ignoreBlock);
    } else {
      const fallback = G.enemies.findIndex(e => e.hp > 0);
      if (fallback >= 0) stats.dmgDealt += dealDamageToEnemySim(fallback, effects.damage, effects.ignoreBlock);
    }
  }

  // PREDICATES — A是B: 谐音 pun + 身份 identity（照抄 applyEffects）
  if (effects._predicates && effects._predicates.length > 0) {
    const resolveEnemy = (idx) => (idx >= 0 ? G.enemies[idx] : G.enemies.find(e => e && e.hp > 0));
    effects._predicates.forEach(p => {
      if (p.kind === 'pun') {
        const tag = p.pun.tag;
        const applyToEnemy = (e) => {
          if (!e || e.hp <= 0) return;
          if (!e._puns) e._puns = [];
          if (!e._puns.includes(tag)) e._puns.push(tag);
          if (PUN_ON_APPLY[tag]) PUN_ON_APPLY[tag](e);
        };
        if (p.target === 'enemy') applyToEnemy(resolveEnemy(p.subjectEnemyIdx));
        else if (p.target === 'broadcast') G.enemies.forEach(applyToEnemy);
        else {
          if (!G._puns) G._puns = [];
          if (!G._puns.includes(tag)) G._puns.push(tag);
          const sp = (PUN_STATUS[tag] || {}).selfPun;
          if (sp) {
            const se = sp.selfEffect || {};
            if (se.block) G.block += se.block;
            if (se.heal) G.hp = Math.min(G.maxHp, G.hp + se.heal);
            if (se.draw) drawCardsSim(se.draw);
            if (se.strength) G.strength += se.strength;
            if (se.poeticAuraNext) G.poeticAuraNext = true;
            if (se.charmEnemiesNext) G.enemies.forEach(e => { if (e && e.hp > 0) e.stunned = true; });
          }
        }
        return;
      }
      if (p.kind === 'identity') {
        const trait = resolveIdentityTrait(p.identityWord, p.identityIsEnemyName);
        if (p.target === 'self') {
          const se = trait.selfEffect || {};
          if (se.block) G.block += se.block;
          if (se.heal) G.hp = Math.min(G.maxHp, G.hp + se.heal);
          if (se.draw) drawCardsSim(se.draw);
          if (se.strength) G.strength += se.strength;
          if (se.vulnerable) G.vulnerable += se.vulnerable;
          if (se.poeticAuraNext) G.poeticAuraNext = true;
        } else {
          const ee = trait.enemyEffect || {};
          const applyToEnemy = (e) => {
            if (!e || e.hp <= 0) return;
            if (ee.weak) e.weak = (e.weak || 0) + ee.weak;
            if (ee.vulnerable) e.vulnerable = (e.vulnerable || 0) + ee.vulnerable;
            if (ee.strengthDelta) e.strength = (e.strength || 0) + ee.strengthDelta;
            if (ee.block) e.block = (e.block || 0) + ee.block;
            if (ee.stunChance && Math.random() < ee.stunChance) e.stunned = true;
          };
          if (p.target === 'enemy') applyToEnemy(resolveEnemy(p.subjectEnemyIdx));
          else G.enemies.forEach(applyToEnemy);
        }
      }
      // forbidden / tautology: 只飘字，无数值
    });
  }

  // MOTIF DEBUFFS（照抄 applyEffects）
  if (effects._motifTriggers && effects._motifTriggers.length > 0) {
    effects._motifTriggers.forEach(t => {
      const eff = t.motif.effect || {};
      t.enemyIdx.forEach(idx => {
        const e = G.enemies[idx];
        if (!e || e.hp <= 0) return;
        if (eff.vuln) e.vulnerable = (e.vulnerable || 0) + eff.vuln;
        if (eff.weak) e.weak = (e.weak || 0) + eff.weak;
        if (eff.stripBlock && e.block > 0) e.block = 0;
        if (eff.reduceStrength && e.strength) e.strength = Math.max(0, e.strength - eff.reduceStrength);
        if (eff.burn) e.poison = { dmg: 3, turns: eff.burn };
        if (eff.soak) e._soaked = (e._soaked || 0) + 1;
        if (eff.stunChance && Math.random() < eff.stunChance) e.stunned = true;
      });
    });
  }

  if (effects._fearTriggers) {
    effects._fearTriggers.forEach(f => {
      const e = G.enemies[f.enemyIdx];
      if (!e || e.hp <= 0) return;
      e.weak = (e.weak || 0) + f.weak;
    });
  }

  // 高诗意攻击回血（照抄）
  if (effects.damage > 0 && effects._poetryLevel >= 2.0) {
    const poetHeal = Math.floor(effects.damage * 0.15);
    if (poetHeal > 0) G.hp = Math.min(G.maxHp, G.hp + poetHeal);
  }

  // CO-ACTORS（真实版有 setTimeout 排队,这里立即结算,数值等价）
  if (effects._coActors && effects._coActors.length) {
    effects._coActors.forEach(a => {
      if (a.damage > 0) {
        const tIdx = a.targetEnemyIdx >= 0 ? a.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
        if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) {
          stats.dmgDealt += dealDamageToEnemySim(tIdx, a.damage, a.ignoreBlock);
        }
      } else if (a.block > 0) G.block += a.block;
      else if (a.heal > 0) G.hp = Math.min(G.maxHp, G.hp + a.heal);
    });
  }

  // 其余字段: 跳过 + 计数
  for (const [k, v] of Object.entries(effects)) {
    if (HANDLED_KEYS.has(k)) continue;
    if (v === 0 || v === false || v == null || (Array.isArray(v) && v.length === 0)) continue;
    skip(k);
  }
}

// ============================================================================
// 玩家回合基建 —— 对应 combat.js#startPlayerTurn / drawCards / guarantee*
// ============================================================================
function shuffleSim(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawCardsSim(count) {
  for (let i = 0; i < count; i++) {
    if (G.drawPile.length === 0) {
      if (G.discardPile.length === 0) return;
      G.drawPile = shuffleSim([...G.discardPile]);
      G.discardPile = [];
    }
    if (G.drawPile.length > 0) G.hand.push(G.drawPile.pop());
  }
}

// 照抄 combat.js（未导出）
function guaranteePunctuationSim() {
  const hasComma = G.hand.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  if (!hasComma) {
    const commaCard = makeCard({ ...WORD_DEFS.comma, key: 'comma' });
    const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'exclamation');
    if (replaceIdx >= 0) { G.discardPile.push(G.hand[replaceIdx]); G.hand[replaceIdx] = commaCard; }
    else G.hand.push(commaCard);
  }
  const hasOtherPunct = G.hand.some(c => c.pos === 'punctuation' && c.punctType !== 'comma');
  if (!hasOtherPunct && Math.random() < 0.4) {
    const punctKeys = ['period', 'exclamation_punct', 'question'];
    const key = punctKeys[Math.floor(Math.random() * punctKeys.length)];
    const punctCard = makeCard({ ...WORD_DEFS[key], key });
    const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'exclamation' && c.pos !== 'punctuation');
    if (replaceIdx >= 0) { G.discardPile.push(G.hand[replaceIdx]); G.hand[replaceIdx] = punctCard; }
  }
}

function guaranteeVerbSim() {
  const verbCount = G.hand.filter(c => c.pos === 'verb').length;
  const needed = Math.max(0, 2 - verbCount);
  for (let i = 0; i < needed; i++) {
    let verbIdx = G.drawPile.findIndex(c => c.pos === 'verb');
    let source = G.drawPile;
    if (verbIdx < 0) { verbIdx = G.discardPile.findIndex(c => c.pos === 'verb'); source = G.discardPile; }
    if (verbIdx < 0) break;
    const verbCard = source.splice(verbIdx, 1)[0];
    const replaceIdx = G.hand.findIndex(c => c.pos !== 'subject' && c.pos !== 'punctuation' && c.pos !== 'exclamation' && c.pos !== 'verb');
    if (replaceIdx >= 0) { G.discardPile.push(G.hand[replaceIdx]); G.hand[replaceIdx] = verbCard; }
    else G.hand.push(verbCard);
  }
}

function guaranteeCopulaSim() {
  const deckHasCopula = [...G.drawPile, ...G.discardPile, ...G.hand].some(c => c.copulaConn);
  if (!deckHasCopula) return;
  if (G.hand.some(c => c.copulaConn)) return;
  let idx = G.drawPile.findIndex(c => c.copulaConn);
  let source = G.drawPile;
  if (idx < 0) { idx = G.discardPile.findIndex(c => c.copulaConn); source = G.discardPile; }
  if (idx < 0) return;
  const copCard = source.splice(idx, 1)[0];
  const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'punctuation' && !c.copulaConn);
  if (replaceIdx >= 0) { G.discardPile.push(G.hand[replaceIdx]); G.hand[replaceIdx] = copCard; }
  else G.hand.push(copCard);
}

function getEffectiveCostSim(card) {
  if (card._isEnemyTarget || card._isSelfTarget || card._isFixedWo) return 0;
  if (G.allCardsCostZero) return 0;
  return card.cost;
}
const seqCost = (cards) => cards.reduce((s, c) => s + getEffectiveCostSim(c), 0);

// ============================================================================
// bot 组句枚举
// ============================================================================
function roleRank(c) {
  if (c._isSelfTarget) return 0;
  if (c.pos === 'subject') return 1;
  if (c.pos === 'verb' || c.pos === 'special') return 2;
  if (c._isEnemyTarget) return 3;
  if (c.pos === 'object') return 4;
  if (c.copulaConn) return 5;
  if (c.pos === 'modifier') return 6;
  if (c.pos === 'connector') return 7;
  if (c.pos === 'exclamation') return 8;
  return 9; // punctuation & other
}

function enumerateCandidates() {
  // 同词去重（两张「，」/两张「是」只用一张），削枝
  const seen = new Set();
  const handItems = [];
  for (const c of G.hand) {
    if (seen.has(c.word)) continue;
    seen.add(c.word);
    handItems.push(c);
  }
  const selfCard = { word: '我', pos: 'subject', cost: 0, _isSelfTarget: true, id: '_self' };
  const enemyCards = G.enemies
    .map((e, i) => (e.hp > 0 ? { word: e.name, pos: 'object', cost: 0, _isEnemyTarget: true, _enemyIdx: i, id: '_e' + i } : null))
    .filter(Boolean);
  const items = [selfCard, ...enemyCards, ...handItems].sort((a, b) => roleRank(a) - roleRank(b));

  const cands = [];
  let seq = 0, evals = 0;
  const cur = [];
  const used = new Array(items.length).fill(false);

  const tryCandidate = () => {
    const cards = [...cur];
    if (seqCost(cards) > G.energy) return;
    const hasVerb = cards.some(c => c.pos === 'verb' || c.pos === 'special');
    const hasExcl = cards.some(c => c.pos === 'exclamation');
    const hasSubject = cards.some(c => c.pos === 'subject' || c._isFixedWo || c._isSelfTarget);
    if (!hasVerb && !(hasSubject && hasExcl)) return; // updateChantButton 的可吟诵条件
    if (detectSummon(cards)) return;                  // 召唤句不模拟
    const wf = isWellFormed(cards);                   // 成句性硬门槛(照 chantSentence)
    if (!wf.ok) return;
    if (evals >= MAX_EVAL) return;
    evals++;
    try {
      const result = evaluateSentence(cards);
      cands.push({ cards, result, cost: seqCost(cards) });
    } catch (e) {
      skip('__evalError:' + String(e && e.message).slice(0, 60));
    }
  };

  const dfs = () => {
    if (seq >= MAX_SEQ || evals >= MAX_EVAL) return;
    if (cur.length > 0) { seq++; tryCandidate(); }
    if (cur.length >= MAX_LEN) return;
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      const c = items[i];
      if (c.pos === 'punctuation' && c.punctType === 'comma' &&
          cur.some(x => x.pos === 'punctuation' && x.punctType === 'comma')) continue;
      if (cur.length === 0 && c.pos === 'punctuation') continue; // 标点开头必废,削枝
      used[i] = true; cur.push(c);
      dfs();
      cur.pop(); used[i] = false;
      if (seq >= MAX_SEQ || evals >= MAX_EVAL) return;
    }
  };
  dfs();
  return cands;
}

// 一个候选的「打点价值」——用于判断是否值得花费吟诵
function candValue(c) {
  const e = c.result.effects || {};
  const coDmg = (e._coActors || []).reduce((s, a) => s + (a.damage || 0), 0);
  return (e.damage || 0) + coDmg + (e.block || 0) + (e.heal || 0) * 0.8 +
    (e.strengthGain || 0) * 2 + (e.applyVuln || 0) * 3 + (e.applyWeak || 0) * 2 +
    (e.selfHarmBuff || 0) * 2 - (e.selfHarm ? (e.selfHarmDmg || 0) : 0) +
    ((e._predicates || []).length ? 3 : 0);
}
const candDamage = (c) => {
  const e = c.result.effects || {};
  const coDmg = (e._coActors || []).reduce((s, a) => s + (a.damage || 0), 0);
  const nAlive = G.enemies.filter(x => x.hp > 0).length;
  return (e.damage || 0) * (e.aoe ? nAlive : 1) + coDmg;
};
const candText = (c) => c.cards.map(x => x.word).join('');

// ============================================================================
// 策略
// ============================================================================
function pickByStrategy(cands, strategy, ctx) {
  if (cands.length === 0) return null;
  const best = (arr, key, tie) => arr.reduce((a, b) => {
    const ka = key(a), kb = key(b);
    if (kb > ka) return b;
    if (kb === ka && tie && tie(b) > tie(a)) return b;
    return a;
  });

  if (strategy === 'greedy-mult') return best(cands, c => c.result.totalMult, candValue);

  if (strategy === 'greedy-damage') {
    const withDmg = cands.filter(c => candDamage(c) > 0);
    if (withDmg.length) return best(withDmg, candDamage, c => c.result.totalMult);
    return best(cands, candValue, c => c.result.totalMult);
  }

  if (strategy === 'spam') {
    // 「找到一个好句后每回合重复出同一句」: 好句 = 综合打点价值(candValue)最高。
    // 曲目单里的句子只要还能拼出来就重复出;拼不出才找新句并记入曲目单。
    const playableKnown = cands.filter(c => ctx.repertoire.has(candText(c)));
    if (playableKnown.length) return best(playableKnown, c => ctx.repertoire.get(candText(c)), candValue);
    const pick = best(cands, candValue, c => c.result.totalMult);
    ctx.repertoire.set(candText(pick), candValue(pick));
    return pick;
  }

  if (strategy === 'diverse') {
    // 「每回合尽量用没用过的词/句式」: 只在没用过的句子里选,打点价值+新词奖励;
    // 全用过才退回按价值选。与 spam 同用 candValue 口径,差异只在多样性约束。
    const fresh = cands.filter(c => !ctx.usedTexts.has(candText(c)));
    const pool = fresh.length ? fresh : cands;
    const score = (c) => {
      const words = c.cards.filter(x => !x._isEnemyTarget && !x._isSelfTarget).map(x => x.word);
      const newFrac = words.length ? words.filter(w => !ctx.usedWords.has(w)).length / words.length : 0;
      return candValue(c) + newFrac * 2;
    };
    return best(pool, score, c => c.result.totalMult);
  }

  throw new Error('unknown strategy ' + strategy);
}

// 敌方下回合预估进攻(用于第2句起的防御决策)
function incomingDamage() {
  let sum = 0;
  for (const e of G.enemies) {
    if (e.hp <= 0 || e.stunned || !e.nextIntent) continue;
    if (e.nextIntent.type !== 'attack') continue;
    let v = (e.nextIntent.value || 0) + (e._dmgBonus || 0) + (e.strength || 0);
    if (e.weak > 0) v = Math.floor(v * 0.75);
    if (G.vulnerable > 0) v = Math.floor(v * 1.5);
    sum += v * (e.nextIntent.hits || 1);
  }
  return sum;
}

// ============================================================================
// 敌方意图结算（偏差清单 #1）
// ============================================================================
function settleEnemyIntent(enemy) {
  const it = enemy.nextIntent;
  if (!it) return;
  if (enemy.enemyKey === 'jingmo') enemy.reflecting = false; // act_fn 语义
  switch (it.type) {
    case 'attack': {
      const hits = it.hits || 1;
      for (let i = 0; i < hits; i++) {
        if (enemy.hp <= 0) break;
        dealDamageToPlayerSim(it.value, enemy);
      }
      break;
    }
    case 'defend':
      enemy.block += it.value;
      if (enemy.enemyKey === 'jingmo') enemy.reflecting = true;
      break;
    case 'buff':
      if (enemy.enemyKey === 'mohun') enemy.hp = Math.min(enemy.maxHp, enemy.hp + it.value);
      else enemy.strength = (enemy.strength || 0) + it.value;
      break;
    case 'debuff':
      G.vulnerable += 2;
      if (enemy.enemyKey === 'mojie' || enemy.enemyKey === 'cidi') G.weak += 2;
      break;
    case 'special':
      skip('__enemyIntent:special(' + enemy.enemyKey + ')');
      break;
    default:
      skip('__enemyIntent:' + it.type);
  }
}

// ============================================================================
// 单场战斗
// ============================================================================
function resetGForCombat(enemyKey) {
  const def = ENEMY_DEFS[enemyKey];
  G.hp = 50; G.maxHp = 50; G.gold = 0; G.act = def.act;
  G.deck = createStarterDeck();
  G.drawPile = shuffleSim([...G.deck]);
  G.discardPile = []; G.exhaustPile = []; G.hand = [];
  G.energy = 3; G.maxEnergy = 3; G.block = 0;
  G.strength = 0; G.vulnerable = 0; G.weak = 0;
  G.turn = 0; G.sentence = []; G.enemyTargets = [];
  G.allCardsCostZero = false; G.poeticAura = false; G.poeticAuraNext = false;
  G.drawLessNextTurn = 0; G.lastRhymeKey = null; G.rhymeStreak = 0;
  G.combatJournal = []; G.sentenceJournal = [];
  G.combatCount = 2; // 避开首战教学保底逻辑语义
  G._bestLine = null; G._thorns = 0; G._puns = [];
  G._bonusEnergyNext = 0; G._bonusDrawNext = 0; G._blockMult = 1; G._blockDebuffNext = 0;
  G._skipNextPlayerTurn = false; G._reflectDmg = 0;

  G.enemies = [{
    ...def, enemyKey, hp: def.hp, maxHp: def.hp,
    block: 0, strength: 0, vulnerable: 0, weak: 0, _dmgBonus: 0,
    stunned: false, reflecting: false, nextIntent: null, element: null, tc: 0,
  }];
  G.enemies.forEach(e => e.ai(e));
}

function runCombat(enemyKey, strategy) {
  resetGForCombat(enemyKey);
  resetCreativity();   // 词穷/新意/承接台账,整场作用域(照 startCombat)
  const stats = {
    win: false, timeout: false, turns: 0, hpLost: 0, hpLostSelf: 0,
    dmgDealt: 0, sentences: 0, mults: [], uniqueTexts: new Set(),
  };
  const ctx = { repertoire: new Map(), usedTexts: new Set(), usedWords: new Set() };

  for (let t = 1; t <= MAX_TURNS; t++) {
    // ---- 我方回合（对应 startPlayerTurn） ----
    G.turn++;
    G.energy = G.maxEnergy + (G._bonusEnergyNext || 0); G._bonusEnergyNext = 0;
    G.allCardsCostZero = false;
    G.poeticAura = G.poeticAuraNext || false; G.poeticAuraNext = false;
    G.sentence = [];
    let dc = 5 - G.drawLessNextTurn + (G._bonusDrawNext || 0); G._bonusDrawNext = 0;
    if (dc < 1) dc = 1;
    G.drawLessNextTurn = 0;
    if (G._blockDebuffNext) { G._blockMult = 1 - G._blockDebuffNext; G._blockDebuffNext = 0; }
    else G._blockMult = 1;
    drawCardsSim(dc);
    guaranteePunctuationSim();
    guaranteeVerbSim();
    guaranteeCopulaSim();

    stats.turns = t;

    // 每回合枚举一次;后续吟诵只在剩余可用候选里挑（选择用的是吟诵前的旧数值,
    // 实际结算时会重新 evaluate——见偏差 #9)。
    let turnCands = enumerateCandidates();
    for (let chant = 0; chant < MAX_CHANTS_PER_TURN; chant++) {
      if (G.enemies.every(e => e.hp <= 0)) break;
      const cands = chant === 0 ? turnCands : turnCands.filter(c =>
        c.cost <= G.energy &&
        c.cards.every(card => card._isEnemyTarget || card._isSelfTarget || G.hand.includes(card)));
      if (cands.length === 0) break;

      // 第2句起,若预估进攻打穿护甲,优先补防
      let pick;
      const incoming = incomingDamage();
      if (chant > 0 && incoming > G.block) {
        const blockers = cands.filter(c => (c.result.effects.block || 0) > 0);
        if (blockers.length) pick = blockers.reduce((a, b) => ((b.result.effects.block || 0) > (a.result.effects.block || 0) ? b : a));
      }
      if (!pick) pick = pickByStrategy(cands, strategy, ctx);
      if (!pick || (chant > 0 && candValue(pick) <= 0)) break;

      // ---- 吟诵（对应 chantSentence 主干） ----
      G.energy -= pick.cost;
      const result = (() => { try { return evaluateSentence(pick.cards); } catch { return pick.result; } })();
      const text = candText(pick);
      ctx.usedTexts.add(text);
      pick.cards.forEach(c => { if (!c._isEnemyTarget && !c._isSelfTarget) ctx.usedWords.add(c.word); });
      stats.sentences++;
      stats.mults.push(result.totalMult);
      stats.uniqueTexts.add(text);

      // 押韵状态先于结算更新（照抄 chantSentence）
      if (result.effects && result.effects._rhymeInfo) {
        const r = result.effects._rhymeInfo;
        G.rhymeStreak = r.rhymes ? r.streak : 0;
        if (r.key) G.lastRhymeKey = r.key;
      }
      // 创造力台账(照抄 chantSentence:评估后记账,预览纯读)
      recordChantCreativity((result && result.cards) || pick.cards);
      G._continuityStreak = (result.effects && result.effects._continuity)
        ? result.effects._continuity.streak : 0;
      // 用掉的手牌离手（目标卡不占手牌）
      pick.cards.forEach(card => {
        if (card._isEnemyTarget || card._isSelfTarget || card._isFixedWo) return;
        const idx = G.hand.indexOf(card);
        if (idx >= 0) G.hand.splice(idx, 1);
        if (card.exhaust || (card.pos === 'verb' && card._shouldExhaust)) G.exhaustPile.push(card);
        else G.discardPile.push(card);
      });
      settleEffects(result.effects, stats);
      if (G.enemies.every(e => e.hp <= 0)) break;
    }

    if (G.enemies.every(e => e.hp <= 0)) { stats.win = true; break; }

    // ---- 弃手牌（endPlayerTurn） ----
    while (G.hand.length > 0) G.discardPile.push(G.hand.pop());

    // ---- 敌方回合（对应 enemyTurn，无动画时序） ----
    processEnemyPuns(G.enemies);
    for (const enemy of G.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.block = 0; // 敌方护甲在自己回合开始清
      if (enemy.poison && enemy.poison.turns > 0) {
        enemy.hp -= enemy.poison.dmg;
        enemy.poison.turns--;
        if (enemy.poison.turns <= 0) delete enemy.poison;
        if (enemy.hp <= 0) continue;
      }
      if (enemy.confused) {
        enemy.confused = false;
        enemy.hp -= Math.floor((enemy.attackDmg || 5) * 0.5);
        enemy.ai(enemy);
        continue;
      }
      if (enemy.stunned) {
        enemy.stunned = enemy._stunNext || false;
        enemy._stunNext = false;
        enemy.ai(enemy);
        continue;
      }
      settleEnemyIntent(enemy);
      enemy.ai(enemy);
    }
    if (G.enemies.every(e => e.hp <= 0)) { stats.win = true; break; }
    if (G.hp <= 0) break;

    // ---- endRound（照抄） ----
    G.block = 0;
    if (G.vulnerable > 0) G.vulnerable--;
    if (G.weak > 0) G.weak--;
    G.enemies.forEach(e => {
      if (!e || e.hp <= 0) return;
      if (e.vulnerable > 0) e.vulnerable--;
      if (e.weak > 0) e.weak--;
    });

    if (t === MAX_TURNS) stats.timeout = true;
  }

  stats.hpLost = 50 - G.hp;
  return stats;
}

// ============================================================================
// 跑批 + 汇总
// ============================================================================
const enemyKeys = Object.entries(ENEMY_DEFS)
  .filter(([, d]) => d.act === ACT && (d.type === 'normal' || d.type === 'elite' || (INCLUDE_BOSS && d.type === 'boss')))
  .map(([k]) => k);

if (enemyKeys.length === 0) {
  console.error(`act ${ACT} 没有敌人（可选 act: 1/2/3）`);
  process.exit(1);
}

const round2 = (x) => Math.round(x * 100) / 100;
const agg = {}; // strategy -> enemyKey -> aggregate

for (const strategy of STRATEGIES) {
  agg[strategy] = {};
  for (const ek of enemyKeys) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(runCombat(ek, strategy));
    const wins = runs.filter(r => r.win);
    const n = runs.length;
    const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0);
    const allMults = runs.flatMap(r => r.mults);
    agg[strategy][ek] = {
      enemy: ENEMY_DEFS[ek].name, type: ENEMY_DEFS[ek].type, hp: ENEMY_DEFS[ek].hp,
      runs: n,
      winRate: wins.length / n,
      avgTurns: round2(sum(runs, r => r.turns) / n),
      avgTurnsWin: wins.length ? round2(sum(wins, r => r.turns) / wins.length) : null,
      avgHpLost: round2(sum(runs, r => r.hpLost) / n),
      avgHpLostWin: wins.length ? round2(sum(wins, r => r.hpLost) / wins.length) : null,
      avgMult: allMults.length ? round2(allMults.reduce((a, b) => a + b, 0) / allMults.length) : 0,
      avgDmgPerTurn: round2(sum(runs, r => r.dmgDealt) / Math.max(1, sum(runs, r => r.turns))),
      avgSentPerTurn: round2(sum(runs, r => r.sentences) / Math.max(1, sum(runs, r => r.turns))),
      avgUniqueTexts: round2(sum(runs, r => r.uniqueTexts.size) / n),
      timeouts: runs.filter(r => r.timeout).length,
    };
  }
}

// ---- markdown 输出 ----------------------------------------------------------
const lines = [];
lines.push(`# balance-sim — act ${ACT}, ${RUNS} runs/敌, SEED=${SEED}`);
lines.push('');
lines.push('| 策略 | 敌人 | 类型 | 胜率 | 平均回合(胜) | 掉血(胜) | 平均倍率 | 伤害/回合 | 句/回合 | 独特句/场 |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
for (const strategy of STRATEGIES) {
  for (const ek of enemyKeys) {
    const a = agg[strategy][ek];
    lines.push(`| ${strategy} | ${a.enemy} | ${a.type} | ${(a.winRate * 100).toFixed(0)}% | ${a.avgTurns} (${a.avgTurnsWin ?? '-'}) | ${a.avgHpLost} (${a.avgHpLostWin ?? '-'}) | ×${a.avgMult} | ${a.avgDmgPerTurn} | ${a.avgSentPerTurn} | ${a.avgUniqueTexts} |`);
  }
}

// ---- vs BALANCE.md 目标 ------------------------------------------------------
// 目标口径见 BALANCE.md。达标判定用 greedy-damage 作为「基准熟练玩家 bot」。
const TARGETS = {
  normal: { turns: [2, 4], hpLossPct: [0.08, 0.15], winRate: 0.99 },
  elite: { turns: [4, 6], hpLossPct: [0.15, 0.30], winRate: 0.90 },
  boss: { turns: [6, 10], hpLossPct: [0.25, 0.40], winRate: 0.80 },
};
lines.push('');
lines.push('## vs BALANCE.md 目标（基准 bot = greedy-damage，胜场口径）');
lines.push('');
lines.push('| 敌人 | 类型 | 回合 目标/实测 | 掉血% 目标/实测 | 胜率 目标/实测 | 判定 |');
lines.push('|---|---|---|---|---|---|');
for (const ek of enemyKeys) {
  const a = agg['greedy-damage'][ek];
  const tg = TARGETS[a.type];
  if (!tg) continue;
  const turns = a.avgTurnsWin ?? a.avgTurns;
  const hpPct = (a.avgHpLostWin ?? a.avgHpLost) / 50;
  const okTurns = turns >= tg.turns[0] && turns <= tg.turns[1];
  const okHp = hpPct >= tg.hpLossPct[0] && hpPct <= tg.hpLossPct[1];
  const okWin = a.winRate >= tg.winRate;
  const verdict = [okTurns ? '' : `回合${turns < tg.turns[0] ? '过快' : '过慢'}`, okHp ? '' : `掉血${hpPct < tg.hpLossPct[0] ? '过少' : '过多'}`, okWin ? '' : '胜率不足'].filter(Boolean);
  lines.push(`| ${a.enemy} | ${a.type} | ${tg.turns[0]}-${tg.turns[1]} / ${turns} | ${tg.hpLossPct[0] * 100}-${tg.hpLossPct[1] * 100}% / ${(hpPct * 100).toFixed(1)}% | ≥${tg.winRate * 100}% / ${(a.winRate * 100).toFixed(0)}% | ${verdict.length ? '✗ ' + verdict.join(',') : '✓'} |`);
}

// ---- 创造力平价（diverse vs spam） -------------------------------------------
lines.push('');
lines.push('## 创造力平价判据（diverse ≥ spam ?）');
lines.push('');
lines.push('| 敌人 | 指标 | spam | diverse | diverse−spam | 平价? |');
lines.push('|---|---|---|---|---|---|');
for (const ek of enemyKeys) {
  const s = agg['spam'][ek], d = agg['diverse'][ek];
  const rows = [
    ['伤害/回合', s.avgDmgPerTurn, d.avgDmgPerTurn, true],
    ['掉血(胜)', s.avgHpLostWin ?? s.avgHpLost, d.avgHpLostWin ?? d.avgHpLost, false],
    ['平均回合(胜)', s.avgTurnsWin ?? s.avgTurns, d.avgTurnsWin ?? d.avgTurns, false],
  ];
  for (const [name, sv, dv, higherBetter] of rows) {
    const delta = round2(dv - sv);
    const ok = higherBetter ? dv >= sv * 0.95 : dv <= sv * 1.05; // 5% 容差
    lines.push(`| ${s.enemy} | ${name} | ${sv} | ${dv} | ${delta > 0 ? '+' : ''}${delta} | ${ok ? '✓' : '✗'} |`);
  }
}
lines.push('');
lines.push('> 判据: diverse 的 伤害/回合 ≥ spam×0.95 且 掉血/回合数 ≤ spam×1.05 视为「多样造句不吃亏」。');
lines.push('> 当前尚无重复衰减机制，spam 无惩罚——预期 diverse 略差；该差值就是主线要补的衰减/新意奖励的量级。');

console.log(lines.join('\n'));

// ---- skipped 计数 → stderr ---------------------------------------------------
const skippedEntries = Object.entries(skipped).sort((a, b) => b[1] - a[1]);
if (skippedEntries.length) {
  console.error('\n[skipped effects / 未结算字段计数]');
  for (const [k, v] of skippedEntries) console.error(`  ${k}: ${v}`);
} else {
  console.error('\n[skipped effects] 无');
}

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ act: ACT, runs: RUNS, seed: SEED, agg, skipped }, null, 2));
  console.error(`\nJSON 已写入 ${jsonOut}`);
}
