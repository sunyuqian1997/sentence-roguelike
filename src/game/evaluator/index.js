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
import { resolveIdentityTrait, isYouCard } from '../poetics.js';

export {
  normalizeSentence, checkWordOrder, detectDuizhang,
  checkExclamationPosition, QUALITY_RULES, VERB_SPECIALS, CONSTRUCTIONS,
};

function finalize(ctx) {
  const { effects, bonus, exc } = ctx;

  if (bonus.modHealBonus > 0) effects.heal += bonus.modHealBonus;
  if (bonus.modSelfDmg > 0) { effects.selfHarm = true; effects.selfHarmDmg = bonus.modSelfDmg; effects.selfHarmBuff = 0; }

  // Semantic roles by position: who stands before the verb is the agent, who
  // stands after it is the patient. "纸鬼碎我"/"你斩我" = the enemy strikes ME
  // (damage lands on the player, no masochism bonus); "我斩我" (explicit
  // self-target) keeps the +2 strength trade.
  //
  // Role detection is CLAUSE-LOCAL but scans EVERY clause: a comma ends a clause,
  // so "敌摸鱼，我斩敌" must NOT read 敌 (clause 1) as agent striking 我 (clause 2)
  // — but "我摸鱼，敌斩我" SHOULD fire (the attack is in clause 2). We split on
  // commas and look for any single clause with [enemy-ref … verb … 我].
  const isMe = (c) => c._isSelfTarget || c._isFixedWo || (c.pos === 'subject' && c.word === '我');
  // An enemy reference as a sentence subject: a clicked enemy-target OR 你/尔/汝.
  const isEnemyRef = (c) => c._isEnemyTarget || isYouCard(c);
  const isComma = (c) => c.pos === 'punctuation' && c.punctType === 'comma';
  const clauses = [];
  { let cur = [];
    for (const c of ctx.cards) {
      if (isComma(c)) { clauses.push(cur); cur = []; } else cur.push(c);
    }
    clauses.push(cur);
  }
  const enemyStrikesMe = !effects._imperative && clauses.some(clause => {
    // Only an ATTACK verb landing on 我 hurts me — 守我/治我 are beneficial.
    const vIdx = clause.findIndex(c => (c.pos === 'verb' || c.pos === 'special') && c.combatType === 'attack');
    if (vIdx < 0) return false;
    const after = clause.slice(vIdx + 1);
    const meAfterVerb = after.some(isMe);
    if (!meAfterVerb) return false;
    const enemyBeforeVerb = clause.slice(0, vIdx).some(isEnemyRef);
    // 我 is the patient. Either an explicit enemy agent ("纸鬼碎我"), OR the attack
    // has no enemy object so it just lands on 我 ("碎我"). An enemy ALSO after the
    // verb means 我 isn't the sole patient.
    const enemyAfterVerb = after.some(isEnemyRef);
    return (enemyBeforeVerb || !enemyAfterVerb);
  });

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
  // scaled by the sentence's quality just like the main blow. "我是皇帝" and the
  // like (identity self-buff with a strength delta) is a全军 rally: the麾下
  // co-actors share the leader's strength bonus (黄袍加身，将士同享).
  if (effects._coActors && effects._coActors.length) {
    const coActorNames = new Set(effects._coActors.map(a => a.name));
    let sharedStrength = 0;       // 我是皇帝 → 全军 rally
    const perActorStrength = {};  // 无名者是皇帝 → only 无名者 gets the buff
    (effects._predicates || []).forEach(p => {
      if (p.kind !== 'identity') return;
      const trait = resolveIdentityTrait(p.identityWord, p.identityIsEnemyName);
      const str = (trait.selfEffect && trait.selfEffect.strength) || 0;
      if (!str) return;
      if (p.target === 'self') sharedStrength += str;
      else if (coActorNames.has(p.subjectWord)) {
        // "无名者是皇帝": the co-actor claims the identity → that actor is buffed.
        perActorStrength[p.subjectWord] = (perActorStrength[p.subjectWord] || 0) + str;
      }
    });
    effects._coActors.forEach(a => {
      const bonus = sharedStrength + (perActorStrength[a.name] || 0);
      const scaled = Math.floor((a.power + bonus) * totalMult);
      if (a.verbType === 'defense') {
        a.block = Math.floor(scaled * finalExcDefense);     // independent block (for 我)
      } else if (a.verbType === 'heal') {
        a.heal = Math.floor(scaled * finalExcHeal);          // independent heal (for 我)
      } else {
        a.damage = Math.floor(scaled * finalExcAttack);      // independent attack (on enemy)
        a.targetEnemyIdx = effects.targetEnemyIdx;
        a.ignoreBlock = effects.ignoreBlock;
      }
      if (bonus > 0) a.rallied = bonus;
    });
    if (sharedStrength > 0) ctx.grammarNotes.push(`👑 黄袍加身：麾下独立个体+${sharedStrength}`);
    Object.entries(perActorStrength).forEach(([name, str]) =>
      ctx.grammarNotes.push(`👑 ${name}称帝：独立个体+${str}`));
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
