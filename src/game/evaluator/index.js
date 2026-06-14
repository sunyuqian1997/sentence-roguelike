// Sentence evaluator — the pipeline that turns a card sequence into combat
// effects. Stages run in fixed order, all reading/writing one ctx object:
//
//   buildContext   meanings + normalize + classify + effects init
//   applyGrammar   predicate/structure/word-order → grammarMult
//   applyPunctuation  。！？，+ 对仗 → punctMult
//   applyQuality   pluggable QUALITY_RULES (poetry/rhyme/motif/pun) → literaryMult
//   applyExclamations  感叹词 multipliers + position legality
//   applyCardEffects   per-POS numeric contributions (VERB_SPECIALS registry)
//   finalize       cross-cutting math → final effects + result shape
//
// The result shape is the project-wide contract (see HANDOFF §4.4) — keep it
// stable; callers include combat.js (chant) and render.js (live preview).
import { G } from '../state.js';
import { buildContext, normalizeSentence } from './context.js';
import { applyConstructions, CONSTRUCTIONS } from './constructions.js';
import { applyGrammar, checkWordOrder } from './grammar.js';
import { applyPunctuation, detectDuizhang } from './punctuation.js';
import { applyQuality, QUALITY_RULES } from './quality.js';
import { applyExclamations, checkExclamationPosition } from './exclamation.js';
import { applyCardEffects, VERB_SPECIALS } from './cardEffects.js';

export {
  normalizeSentence, checkWordOrder, detectDuizhang,
  checkExclamationPosition, QUALITY_RULES, VERB_SPECIALS, CONSTRUCTIONS,
};

function finalize(ctx) {
  const { effects, bonus, exc } = ctx;

  if (bonus.modHealBonus > 0) effects.heal += bonus.modHealBonus;
  if (bonus.modSelfDmg > 0) { effects.selfHarm = true; effects.selfHarmDmg = bonus.modSelfDmg; effects.selfHarmBuff = 0; }

  // Semantic roles by position: who stands before the verb is the agent,
  // who stands after it is the patient. "纸鬼碎我" = the enemy strikes ME
  // (damage lands on the player, no masochism bonus); "我斩我" (explicit
  // self-target) keeps the +2 strength trade.
  const firstVerbIdx = ctx.cards.findIndex(c => c.pos === 'verb' || c.pos === 'special');
  const isMe = (c) => c._isSelfTarget || c._isFixedWo || (c.pos === 'subject' && c.word === '我');
  const enemyBeforeVerb = firstVerbIdx > 0 && ctx.cards.slice(0, firstVerbIdx).some(c => c._isEnemyTarget);
  const meAfterVerb = firstVerbIdx >= 0 && ctx.cards.slice(firstVerbIdx + 1).some(isMe);
  // Imperatives ("纸鬼给我戳") reassign roles — never the self-harm path.
  const enemyStrikesMe = enemyBeforeVerb && meAfterVerb && !effects._imperative;

  if ((ctx.hasSelfTarget || enemyStrikesMe) && effects.damage > 0) {
    effects.selfHarm = true;
    effects.selfHarmDmg = (effects.selfHarmDmg || 0) + effects.damage;
    effects.selfHarmBuff = enemyStrikesMe ? 0 : 2;
    effects.damage = 0;
    ctx.grammarNotes.push(enemyStrikesMe ? '🩸 敌为主语——伤害由我承受' : '自伤：伤害自身，+2力量');
  }

  if (ctx.hasQuestion && effects.damage > 0 && !effects.selfHarm) {
    effects.damage = 0;
  }

  if (bonus.splitAttackToBlock && effects.damage > 0) {
    const half = Math.floor(effects.damage / 2);
    effects.damage -= half;
    effects.block += half;
    ctx.grammarNotes.push('「但是」攻守兼备');
  }

  const excPosPenalty = exc.posResult.penalty;
  const totalMult = ctx.grammarMult * ctx.literaryMult * ctx.punctMult * excPosPenalty;

  // Illegal exclamation placement halves the exclamation bonus part only.
  const excPosScale = exc.posResult.legal ? 1.0 : 0.5;
  const finalExcAttack = 1 + (exc.attackMult - 1) * excPosScale;
  const finalExcDefense = 1 + (exc.defenseMult - 1) * excPosScale;
  const finalExcHeal = 1 + (exc.healMult - 1) * excPosScale;

  if (effects._flatAttackBonus) effects.damage += effects._flatAttackBonus;
  if (effects._healOnAttack && effects.damage > 0) effects.heal += effects._healOnAttack;
  if (effects._ignoreSelfDmg && effects.selfHarm) { effects.selfHarm = false; effects.selfHarmDmg = 0; }
  if (effects._reverseNeg) {
    if (effects.selfHarm) { effects.heal += effects.selfHarmDmg; effects.selfHarm = false; effects.selfHarmDmg = 0; }
    if (effects.drawLessNext > 0) { effects.draw += effects.drawLessNext; effects.drawLessNext = 0; }
  }

  effects.damage = Math.floor(effects.damage * totalMult * finalExcAttack);
  if (effects._crit) effects.damage = Math.floor(effects.damage * 1.5);

  // Imperative settlement (给我V / 让NP V): the commanded enemy hurts ITSELF.
  if (effects._imperative) {
    const imp = effects._imperative;
    effects.damage = Math.floor(effects.damage * imp.mult);
    if (imp.ignoreBlock) effects.ignoreBlock = true;
    if (imp.enemyIdx >= 0) {
      effects.targetEnemyIdx = imp.enemyIdx;
    } else {
      const alive = G.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length > 0) effects.targetEnemyIdx = alive[Math.floor(Math.random() * alive.length)];
    }
    effects.aoe = false;
  }
  effects.block = Math.floor(effects.block * totalMult * finalExcDefense);
  effects.heal = Math.floor(effects.heal * totalMult * finalExcHeal);
  if (effects.selfHarm) effects.selfHarmDmg = Math.floor(effects.selfHarmDmg * totalMult);
  effects.draw += exc.extraDraw;
  effects.heal += exc.extraHeal;
  if (exc.extraEnergy > 0) effects._bonusEnergy = exc.extraEnergy;

  effects._poetryLevel = ctx.literaryMult;

  if (bonus.orRandomMult && effects.damage > 0) {
    effects.damage = Math.floor(effects.damage * 1.5);
    const alive = G.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
    if (alive.length > 0) {
      effects.targetEnemyIdx = alive[Math.floor(Math.random() * alive.length)];
      effects.aoe = false;
      effects.multiTargetIndices = null;
      ctx.grammarNotes.push(`🎲「或」→随机目标×1.5`);
    }
  }

  if (bonus.doubleExecuteConn || effects._doubleExecute) {
    effects.damage = Math.floor(effects.damage * 2);
    effects.block = Math.floor(effects.block * 2);
    effects.heal = Math.floor(effects.heal * 2);
    ctx.grammarNotes.push('🔁 效果×2！');
  }

  // An attack verb always lands at least a scratch.
  if (ctx.realVerbs.some(v => v.combatType === 'attack') && !effects.selfHarm && !ctx.hasQuestion && effects.damage < 1) {
    effects.damage = 1;
  }

  if (ctx.hasMultiTarget) {
    effects.multiTargetIndices = ctx.multiTargetIndices;
    ctx.grammarNotes.push(`🎯 多目标×${ctx.multiTargetIndices.length}`);
  }

  // Co-actors strike as their own entities — each its own damage instance,
  // scaled by the sentence's quality just like the main blow.
  if (effects._coActors && effects._coActors.length) {
    effects._coActors.forEach(a => {
      a.damage = Math.floor(a.power * totalMult * finalExcAttack);
      a.targetEnemyIdx = effects.targetEnemyIdx;
      a.ignoreBlock = effects.ignoreBlock;
    });
  }

  return {
    text: ctx.text,
    grammarMult: ctx.grammarMult, grammarNotes: ctx.grammarNotes,
    literaryMult: ctx.literaryMult, literaryNotes: ctx.literaryNotes,
    punctMult: ctx.punctMult, punctNotes: ctx.punctNotes,
    excNotes: ctx.excNotes,
    excAttackMult: exc.attackMult, excDefenseMult: exc.defenseMult, excHealMult: exc.healMult,
    totalMult,
    effects,
    cards: ctx.cards,
    duizhangResult: ctx.duizhangResult,
  };
}

export function evaluateSentence(rawCards) {
  if (rawCards.length === 0) return null;
  const ctx = buildContext(rawCards);
  applyConstructions(ctx);
  applyGrammar(ctx);
  applyPunctuation(ctx);
  applyQuality(ctx);
  applyExclamations(ctx);
  applyCardEffects(ctx);
  return finalize(ctx);
}
