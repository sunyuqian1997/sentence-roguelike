// 语言无关的数值结算 —— 原 finalize 的后半段(总倍率/暴击/对牌/imperative/co-actor/min-1)。
// 只读 IR(effectsSeed + ctxSeed + mults),不认识任何中英文字。两种语言产出同形 IR,共用此结算。
import { G } from '../state.js';
import { resolveIdentityTrait } from '../poetics.js';

export function settle(ir) {
  const effects = ir.effectsSeed;
  const { bonus, exc, realVerbs, duizhangResult, hasQuestion, hasMultiTarget,
          multiTargetIndices, text, cards, grammarNotes } = ir.ctxSeed;
  const m = ir.mults;

  const excPosPenalty = m.excPosPenalty;
  const totalMult = m.grammar * m.poetic * m.punct * excPosPenalty;

  const excPosScale = m.excPosScale;
  const finalExcAttack = 1 + (m.excAttack - 1) * excPosScale;
  const finalExcDefense = 1 + (m.excDefense - 1) * excPosScale;
  const finalExcHeal = 1 + (m.excHeal - 1) * excPosScale;

  if (effects._flatAttackBonus) effects.damage += effects._flatAttackBonus;
  if (effects._healOnAttack && effects.damage > 0) effects.heal += effects._healOnAttack;
  if (effects._ignoreSelfDmg && effects.selfHarm) { effects.selfHarm = false; effects.selfHarmDmg = 0; }
  if (effects._reverseNeg) {
    if (effects.selfHarm) { effects.heal += effects.selfHarmDmg; effects.selfHarm = false; effects.selfHarmDmg = 0; }
    if (effects.drawLessNext > 0) { effects.draw += effects.drawLessNext; effects.drawLessNext = 0; }
  }

  effects.damage = Math.floor(effects.damage * totalMult * finalExcAttack);
  if (effects._crit) effects.damage = Math.floor(effects.damage * 1.5);

  if (realVerbs.some(v => v.duizhangDouble) && duizhangResult
      && duizhangResult.matched && duizhangResult.type !== 'basic') {
    effects.damage = Math.floor(effects.damage * 1.4);
    grammarNotes.push('🀄「对」工对加成:伤害×1.4');
  }

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
  // 驱虎吞狼:敌 A 打敌 B —— 伤害重定向到宾语敌人 B(默认 targetEnemyIdx 取
  // 句中第一个敌卡=主语 A,会打错人)。祈使句优先级更高,不覆盖它的重定向。
  if (effects._enemyVsEnemy && !effects._imperative) {
    const eve = effects._enemyVsEnemy;
    const dst = G.enemies[eve.dstIdx];
    if (dst && dst.hp > 0) {
      effects.targetEnemyIdx = eve.dstIdx;
      effects.aoe = false;
      effects.multiTargetIndices = null;
    }
  }
  effects.block = Math.floor(effects.block * totalMult * finalExcDefense);
  effects.heal = Math.floor(effects.heal * totalMult * finalExcHeal);
  if (effects.selfHarm) effects.selfHarmDmg = Math.floor(effects.selfHarmDmg * totalMult);
  effects.draw += exc.extraDraw;
  effects.heal += exc.extraHeal;
  if (exc.extraEnergy > 0) effects._bonusEnergy = exc.extraEnergy;

  effects._poetryLevel = m.poetic;

  if (bonus.orRandomMult && effects.damage > 0) {
    effects.damage = Math.floor(effects.damage * 1.5);
    const alive = G.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
    if (alive.length > 0) {
      effects.targetEnemyIdx = alive[Math.floor(Math.random() * alive.length)];
      effects.aoe = false; effects.multiTargetIndices = null;
      grammarNotes.push(`🎲「或」→随机目标×1.5`);
    }
  }

  if (bonus.doubleExecuteConn || effects._doubleExecute) {
    effects.damage = Math.floor(effects.damage * 2);
    effects.block = Math.floor(effects.block * 2);
    effects.heal = Math.floor(effects.heal * 2);
    grammarNotes.push('🔁 效果×2！');
  }

  if (realVerbs.some(v => v.combatType === 'attack') && !effects.selfHarm && !hasQuestion && effects.damage < 1) {
    effects.damage = 1;
  }

  if (hasMultiTarget) {
    effects.multiTargetIndices = [...new Set(multiTargetIndices)];
    const targetCount = effects.multiTargetIndices.length;
    if (targetCount > 1 && effects.damage > 0) {
      effects.damage = Math.max(1, Math.floor(effects.damage / targetCount));
      grammarNotes.push(`🎯 多目标×${targetCount}（总伤均分）`);
    } else grammarNotes.push(`🎯 多目标×${targetCount}`);
  }

  if (effects._coActors && effects._coActors.length) {
    const coActorNames = new Set(effects._coActors.map(a => a.name));
    let sharedStrength = 0;
    const perActorStrength = {};
    (effects._predicates || []).forEach(p => {
      if (p.kind !== 'identity') return;
      const trait = resolveIdentityTrait(p.identityWord, p.identityIsEnemyName);
      const str = (trait.selfEffect && trait.selfEffect.strength) || 0;
      if (!str) return;
      if (p.target === 'self') sharedStrength += str;
      else if (coActorNames.has(p.subjectWord)) {
        perActorStrength[p.subjectWord] = (perActorStrength[p.subjectWord] || 0) + str;
      }
    });
    effects._coActors.forEach(a => {
      const b = sharedStrength + (perActorStrength[a.name] || 0);
      const scaled = Math.floor((a.power + b) * totalMult);
      if (a.verbType === 'defense') a.block = Math.floor(scaled * finalExcDefense);
      else if (a.verbType === 'heal') a.heal = Math.floor(scaled * finalExcHeal);
      else {
        a.damage = Math.floor(scaled * finalExcAttack);
        if (a.targetEnemyIdx == null || a.targetEnemyIdx < 0) a.targetEnemyIdx = effects.targetEnemyIdx;
        a.ignoreBlock = effects.ignoreBlock;
      }
      if (b > 0) a.rallied = b;
    });
    if (sharedStrength > 0) grammarNotes.push(`👑 黄袍加身：麾下独立个体+${sharedStrength}`);
    Object.entries(perActorStrength).forEach(([name, str]) =>
      grammarNotes.push(`👑 ${name}称帝：独立个体+${str}`));
  }

  return {
    text,
    grammarMult: m.grammar, grammarNotes,
    literaryMult: m.poetic, literaryNotes: ir.notes.poetic,
    punctMult: m.punct, punctNotes: ir.notes.punct,
    excNotes: ir.notes.exc,
    excAttackMult: exc.attackMult, excDefenseMult: exc.defenseMult, excHealMult: exc.healMult,
    totalMult,
    effects,
    cards,
    duizhangResult,
  };
}
