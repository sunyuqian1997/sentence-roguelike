// Per-POS card contributions: how each subject/object/modifier/connector/verb
// turns into combat numbers. Special verb behaviors live in the VERB_SPECIALS
// registry — to add one, define the flag in cards.json and register a handler
// here; do NOT hardcode word checks in the pipeline.
import { G } from '../state.js';

export function applySubjects(ctx) {
  const { effects, bonus } = ctx;

  // A named subject "steps onto the field" as its OWN entity for ANY verb, not
  // just attacks: 影子斩敌 = independent attack; 皇帝挡纸鬼 = independent block;
  // 无名者守我 = blocks FOR me; 月兔治我 = heals me. The primary real verb decides
  // what the co-actor does and at whom.
  const primaryVerb = ctx.realVerbs.find(v => !VERB_SPECIALS.some(([flag]) => v[flag]))
    || ctx.realVerbs[0];
  const coActVerbType = primaryVerb ? (primaryVerb.combatType || 'attack') : null;
  // Target side: an attack lands on the enemy; defense/heal benefit 我 (the
  // poet), unless the verb explicitly targets the enemy.
  const coActTargetsEnemy = coActVerbType === 'attack';
  const canCoAct = !!primaryVerb && (ctx.hasEnemyTarget || coActVerbType !== 'attack');

  ctx.subjects.forEach(s => {
    const b = s.powerBonus || 0;
    const ub = s.upgraded ? Math.ceil(b * 1.5) : b;

    // Co-actor: a named subject acting independently. ctx.coActors was
    // pre-filtered in buildContext to exclude copula-predicate subjects and 你.
    const isCoActor = canCoAct && ctx.coActors.includes(s);
    if (isCoActor) {
      // Power from the subject's martial stat (attack) or generic, min 3.
      const martial = (s.bonusType === 'attack' || s.bonusType === 'all') ? ub : 0;
      const power = Math.max(3, martial);
      (effects._coActors ||= []).push({
        name: s.word, power,
        verbType: coActVerbType,
        targetsEnemy: coActTargetsEnemy,
      });
      const actLabel = coActVerbType === 'attack' ? `独立攻击${power}`
        : coActVerbType === 'defense' ? `独立格挡${power}`
        : coActVerbType === 'heal' ? `独立治疗${power}` : `独立行动${power}`;
      ctx.grammarNotes.push(`🥷 ${s.word}·助战 (${actLabel})`);
      // riders (draw/thorns/etc.) still count; the main stat is the co-actor's
      // own independent action so we do NOT also pad 我's numbers (no double-count).
      if (s.defenseBonus) bonus.subjectDefense += (s.upgraded ? Math.ceil(s.defenseBonus * 1.5) : s.defenseBonus);
      if (s.healBonusSub) bonus.subjectHeal += (s.upgraded ? Math.ceil(s.healBonusSub * 1.5) : s.healBonusSub);
      applySubjectRiders(ctx, s);
      return;
    }

    if (s.bonusType === 'attack') bonus.subjectAttack += ub;
    else if (s.bonusType === 'defense') bonus.subjectDefense += ub;
    else if (s.bonusType === 'heal') bonus.subjectHeal += ub;
    else if (s.bonusType === 'all') { bonus.subjectAttack += ub; bonus.subjectDefense += ub; bonus.subjectHeal += ub; }
    if (s.defenseBonus) bonus.subjectDefense += (s.upgraded ? Math.ceil(s.defenseBonus * 1.5) : s.defenseBonus);
    if (s.healBonusSub) bonus.subjectHeal += (s.upgraded ? Math.ceil(s.healBonusSub * 1.5) : s.healBonusSub);
    applySubjectRiders(ctx, s);
  });
}

// Non-stat subject effects (draw / thorns / aoe / stealth / random); shared by
// both ordinary subjects and co-actors.
function applySubjectRiders(ctx, s) {
  const { effects, bonus } = ctx;
  if (s.draw) effects.draw += (s.upgraded ? s.draw + 1 : s.draw);
  if (s.thorns) effects.thorns += s.thorns;
  if (s.doubleStrength) effects.strengthGain += G.strength;
  if (s.discardRandom && G.hand.length > 0) effects._discardRandom = s.discardRandom;
  if (s.drunkRandom) {
    const roll = Math.floor(Math.random() * 5) + 1;
    bonus.subjectAttack += roll;
    ctx.grammarNotes.push(`🍶 酒仙·攻击+${roll}(随机1-5)`);
  }
  if (s.forceAoeSub) effects.aoe = true;
  if (s.stealthSub) effects.ignoreBlock = true;
  if (s.halfPenetrate) effects._halfPenetrate = true;
  if (s.randomEffect) {
    const roll = Math.random();
    if (roll < 0.33) { bonus.subjectAttack += 4; ctx.grammarNotes.push('🐱 猫·攻击+4'); }
    else if (roll < 0.66) { bonus.subjectDefense += 4; ctx.grammarNotes.push('🐱 猫·格挡+4'); }
    else { effects.draw += 1; ctx.grammarNotes.push('🐱 猫·摸鱼+1牌'); }
  }
}

export function applyObjects(ctx) {
  const { effects, bonus } = ctx;
  ctx.handObjects.forEach(o => {
    const b = o.effectBonus || 0;
    if (o.bonusType === 'attack') bonus.objAttack += b;
    else if (o.bonusType === 'defense') bonus.objDefense += b;
    else if (o.bonusType === 'heal') bonus.objHeal += b;
    else if (o.bonusType === 'all') { bonus.objAttack += b; bonus.objDefense += b; bonus.objHeal += b; }
    if (o.aoe) effects.aoe = true;
    if (o.draw) effects.draw += o.draw;
    if (o.applyVuln) effects.applyVuln += o.applyVuln;
    if (o.goldGain) effects.goldGain += o.goldGain;
    if (o.randomObjBonus) {
      const roll = Math.floor(Math.random() * 6) + 2;
      const types = ['attack', 'defense', 'heal'];
      const t = types[Math.floor(Math.random() * 3)];
      if (t === 'attack') bonus.objAttack += roll;
      else if (t === 'defense') bonus.objDefense += roll;
      else bonus.objHeal += roll;
      ctx.grammarNotes.push(`🎲 命运→${t === 'attack' ? '攻击' : t === 'defense' ? '格挡' : '治疗'}+${roll}`);
    }
    if (o.removeBuffs) effects._removeBuffs = true;
    if (o.bugEffect) {
      const bugRoll = Math.random();
      if (bugRoll < 0.3) {
        effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg || 0) + 5;
        ctx.grammarNotes.push('🐛 bug→打到自己了！');
      } else {
        bonus.objAttack += 10; ctx.grammarNotes.push('🐛 bug→伤害翻倍效果！');
      }
    }
    if (o.critObj) {
      effects._crit = true;
      ctx.grammarNotes.push('🎯 要害→暴击+50%伤害');
    }
    if (o.selfTargetObj) effects._selfTargetFromObj = true;
    if (o.critChanceBonus) {
      if (Math.random() < o.critChanceBonus) { effects._crit = true; ctx.grammarNotes.push('👋 打脸→暴击！'); }
    }
    if (o.confuseObj) { effects._confuse = true; ctx.grammarNotes.push('🌀 节奏→敌人混乱'); }
    if (o.xintaiDebuff) { effects.applyWeak += 3; effects.applyVuln += 3; ctx.grammarNotes.push('💔 心态崩了→敌全属性降'); }
    if (o.poetryObjBonus) { ctx.literaryMult += o.poetryObjBonus; ctx.literaryNotes.push(`${o.word}诗意 +${o.poetryObjBonus}`); }
    if (o.windPenetrate) { effects.ignoreBlock = true; ctx.grammarNotes.push('🌬️ 长风穿透格挡'); }
  });
}

export function applyModifiers(ctx) {
  const { effects, bonus } = ctx;
  let hasStealth = false;
  ctx.modifiers.forEach(m => {
    const mult = m.multiplier || 1;
    if (m.bonusType === 'attack') bonus.attackMod *= mult;
    else if (m.bonusType === 'defense') bonus.defenseMod *= mult;
    else if (m.bonusType === 'heal') bonus.healMod *= mult;
    else if (m.bonusType === 'all') { bonus.attackMod *= mult; bonus.defenseMod *= mult; bonus.healMod *= mult; }
    if (m.draw) effects.draw += m.draw;
    if (m.selfDmgMod) bonus.modSelfDmg += m.selfDmgMod;
    if (m.healBonusMod) bonus.modHealBonus += m.healBonusMod;
    if (m.stealthMod) hasStealth = true;
    if (m.ignoreAllLimits) bonus.hasIgnoreAllLimits = true;
    if (m.drawLessNextMod) effects.drawLessNext += m.drawLessNextMod;
    if (m.fullPenetrateMod) effects.ignoreBlock = true;
    if (m.doubleExecute) effects._doubleExecute = true;
    if (m.partialPenetrate) effects._partialPenetrate = Math.max(effects._partialPenetrate || 0, m.partialPenetrate);
    if (m.ignoreBuffsMod) effects._ignoreBuffs = true;
    if (m.noCounterMod) effects._noCounter = true;
    if (m.healOnAttackMod) effects._healOnAttack = (effects._healOnAttack || 0) + m.healOnAttackMod;
    if (m.forceAoeMod) effects.aoe = true;
    if (m.ignoreSelfDmg) effects._ignoreSelfDmg = true;
    if (m.flatBonus) effects._flatAttackBonus = (effects._flatAttackBonus || 0) + m.flatBonus;
    if (m.weakenMod) effects.applyWeak = Math.max(effects.applyWeak, m.weakenMod);
  });
  if (hasStealth) effects.ignoreBlock = true;
}

export function applyConnectors(ctx) {
  const { effects, bonus } = ctx;
  ctx.connectors.forEach(c => {
    if (c.draw) effects.draw += c.draw;
    if (c.splitAttackToBlock) bonus.splitAttackToBlock = true;
    if (c.orRandom) bonus.orRandomMult = true;
    if (c.doubleExecuteConn) bonus.doubleExecuteConn = true;
    if (c.helpConnector) {
      const helpers = ctx.subjects.filter(s => s.word !== '我');
      helpers.forEach(h => {
        if (h.randomEffect) {
          const roll = Math.random();
          if (roll < 0.33) { bonus.subjectAttack += 4; ctx.grammarNotes.push(`🤝 帮·${h.word}→攻击+4`); }
          else if (roll < 0.66) { bonus.subjectDefense += 4; ctx.grammarNotes.push(`🤝 帮·${h.word}→格挡+4`); }
          else { effects.draw += 1; ctx.grammarNotes.push(`🤝 帮·${h.word}→抽1牌`); }
        } else if (h.drunkRandom) {
          const roll = Math.floor(Math.random() * 5) + 1;
          bonus.subjectAttack += roll; ctx.grammarNotes.push(`🤝 帮·${h.word}→攻击+${roll}`);
        } else {
          const b = h.powerBonus || 0;
          if (b > 0) {
            bonus.subjectAttack += b; ctx.grammarNotes.push(`🤝 帮·${h.word}→+${b}`);
          }
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// VERB SPECIALS registry. Ordered: first matching flag wins and the generic
// combatType handling is skipped for that verb. Handler args:
//   v: the verb card · ctx: evaluation context · power: upgraded base power
//   subjectIsEnemy: sentence subject refers to an enemy (or enemy target used)
// ---------------------------------------------------------------------------
const upgPower = (v) => (v.upgraded ? v.upgPower : v.basePower);

export const VERB_SPECIALS = [
  ['moyuSpecial', (v, ctx, power, subjectIsEnemy) => {
    const { effects, bonus } = ctx;
    if (subjectIsEnemy) {
      effects.applyVuln += (v.upgraded ? 4 : 3);
      ctx.grammarNotes.push(`🐟 摸鱼→敌人易伤${v.upgraded ? 4 : 3}回合`);
    } else {
      effects.heal += Math.floor((upgPower(v) + bonus.subjectHeal + bonus.objHeal) * bonus.healMod);
      ctx.grammarNotes.push(`🐟 摸鱼→我方回血${upgPower(v)}`);
    }
  }],
  ['bailanSpecial', (v, ctx, power, subjectIsEnemy) => {
    const { effects, bonus } = ctx;
    if (subjectIsEnemy) {
      effects._stunEnemy = true;
      ctx.grammarNotes.push('🦥 摆烂→敌人跳过下次攻击');
    } else {
      effects.block += Math.floor((upgPower(v) + bonus.subjectDefense + bonus.objDefense) * bonus.defenseMod);
      effects.drawLessNext += v.drawLessNext || 1;
      ctx.grammarNotes.push(`🦥 摆烂→格挡${upgPower(v)}，少抽1`);
    }
  }],
  ['liuleSpecial', (v, ctx, power, subjectIsEnemy) => {
    const { effects, bonus } = ctx;
    if (subjectIsEnemy) {
      effects.applyWeak += 2;
      ctx.grammarNotes.push('🏃 溜了→敌人降攻击2回合');
    } else {
      effects.block += Math.floor((upgPower(v) + bonus.subjectDefense + bonus.objDefense) * bonus.defenseMod);
      ctx.grammarNotes.push(`🏃 溜了→格挡${upgPower(v)}`);
    }
  }],
  ['huashuiSpecial', (v, ctx, power, subjectIsEnemy) => {
    const { effects, bonus } = ctx;
    if (subjectIsEnemy) {
      effects.applyWeak += 2;
      ctx.grammarNotes.push('🏊 划水→敌人降攻击2回合');
    } else {
      effects.heal += Math.floor((upgPower(v) + bonus.subjectHeal + bonus.objHeal) * bonus.healMod);
      ctx.grammarNotes.push(`🏊 划水→回血${upgPower(v)}`);
    }
  }],
  ['pengciSpecial', (v, ctx) => {
    ctx.effects._reflectDmg = 0.5;
    ctx.grammarNotes.push('🤕 碰瓷→本回合反弹50%伤害');
  }],
  ['tiredSpecial', (v, ctx, power, subjectIsEnemy) => {
    const { effects } = ctx;
    if (subjectIsEnemy) {
      effects._stunEnemy = true;
      ctx.grammarNotes.push('😴 累了→敌人跳过下次攻击');
    } else {
      effects.heal += 4;
      effects.drawLessNext += 2;
      ctx.grammarNotes.push('😴 累了→回血4，少抽2');
    }
  }],
  ['sleepSpecial', (v, ctx, power, subjectIsEnemy) => {
    // "睡" is dual-mode: with object/enemy target = attack (stun enemy)
    // without object = self-buff (full heal but skip turn)
    const { effects, bonus } = ctx;
    const hasTarget = ctx.hasEnemyTarget || ctx.handObjects.length > 0;
    if (hasTarget || subjectIsEnemy) {
      effects._stunEnemy = true;
      effects._stunEnemy2 = true;
      effects.damage += v.basePower + bonus.subjectAttack;
      ctx.grammarNotes.push('💤 睡→目标眩晕2回合');
    } else {
      effects.heal += G.maxHp;
      effects._skipNextTurn = true;
      ctx.grammarNotes.push('💤 睡→全回血但跳过下回合');
    }
  }],
  ['fallenSpecial', (v, ctx, power, subjectIsEnemy) => {
    const { effects } = ctx;
    if (subjectIsEnemy) {
      effects._reduceStrength = 3;
      ctx.grammarNotes.push('🕳️ 堕落→敌人-3力量');
    } else {
      effects.strengthGain += 3;
      effects._vulnSelfNext = true;
      ctx.grammarNotes.push('🕳️ 堕落→+3力量但易伤2回合');
    }
  }],
  ['shuaiguoSpecial', (v, ctx) => {
    ctx.effects._transferDebuffs = true;
    ctx.grammarNotes.push('🍳 甩锅→debuff转给敌人');
  }],
  ['tangyingSpecial', (v, ctx) => {
    const { effects, bonus } = ctx;
    effects.block += Math.floor((upgPower(v) + bonus.subjectDefense + bonus.objDefense) * bonus.defenseMod);
    effects._goldOnKill = (effects._goldOnKill || 0) + 10;
    ctx.grammarNotes.push(`😴 躺赢→格挡${upgPower(v)}+击杀+10金币`);
  }],
  ['kaibaiSpecial', (v, ctx) => {
    const { effects } = ctx;
    effects.block += 99;
    effects.damage = 0;
    effects._noAttack = true;
    ctx.grammarNotes.push('🫠 开摆→无敌但无法攻击');
  }],
  ['puaSpecial', (v, ctx) => {
    ctx.effects.applyWeak += 3;
    ctx.grammarNotes.push('😈 PUA→敌人攻击-3持续2回合');
  }],
  ['stealStrength', (v, ctx, power) => {
    const { effects, bonus } = ctx;
    let dmg = (power + bonus.subjectAttack + bonus.objAttack + G.strength) * bonus.attackMod;
    if (G.weak > 0 && !bonus.hasIgnoreAllLimits) dmg *= 0.75;
    effects.damage += Math.floor(dmg);
    effects.strengthGain += v.stealStrength;
    effects._stealStrength = v.stealStrength;
    ctx.grammarNotes.push(`🦶 拉踩→偷${v.stealStrength}力量`);
  }],
  ['poisonVerb', (v, ctx) => {
    ctx.effects._poison = { dmg: upgPower(v), turns: v.poisonDuration || 3 };
    ctx.grammarNotes.push(`🌱 种草→中毒${v.poisonDuration}回合`);
  }],
  ['dodgeNext', (v, ctx) => {
    ctx.effects.block += 99;
    ctx.grammarNotes.push('🏃 溜了→闪避(格挡99)');
  }],
  ['executeVerb', (v, ctx) => {
    const { effects } = ctx;
    effects._execute = {
      threshold: v.executeThreshold || 0.3,
      percent: v.executePercent || 0.3,
    };
    if (v.selfDmgVerb) { effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg || 0) + v.selfDmgVerb; }
    ctx.grammarNotes.push(`💀 斩杀(≤${Math.round((v.executeThreshold || 0.3) * 100)}%击杀/否则扣${Math.round((v.executePercent || 0.3) * 100)}%血)，自伤${v.selfDmgVerb || 0}`);
  }],
];

// Is this card an enemy-subject reference? (clicked enemy-target, the literal
// 敌人, 你/尔/汝, or a card whose word matches a live enemy's name.)
const isEnemySubjectCard = (c) => {
  if (!c) return false;
  if (c._isEnemyTarget) return true;
  const w = c.word;
  return w === '敌人' || w === '你' || w === '尔' || w === '汝'
    || G.enemies.some(e => e.name === w);
};

// Split cards into comma-delimited clauses so subject roles stay clause-local
// ("我摸鱼，你斩我": clause 1 has no enemy subject — 你 belongs to clause 2).
function buildClauses(cards) {
  const clauses = [];
  let cur = [];
  for (const c of cards) {
    if (c.pos === 'punctuation' && c.punctType === 'comma') { clauses.push(cur); cur = []; }
    else cur.push(c);
  }
  clauses.push(cur);
  return clauses;
}

export function applyVerbs(ctx) {
  const { effects, bonus } = ctx;
  const clauses = buildClauses(ctx.cards);
  const clauseOf = (verb) => clauses.find(cl => cl.includes(verb)) || ctx.cards;

  for (const v of ctx.realVerbs) {
    let power = v.upgraded ? (v.upgPower || v.basePower) : v.basePower;
    if (v.spendGold) {
      if (G.gold >= v.spendGold) {
        effects._spendGold = (effects._spendGold || 0) + v.spendGold;
      } else {
        power = Math.floor(power * 0.3);
        ctx.grammarNotes.push('💸 金币不足，氪金减弱');
      }
    }

    // Clause-local subject role: an enemy is the SUBJECT only when an enemy ref
    // stands BEFORE the verb in this verb's own clause ("纸鬼摸鱼"/"你斩我"). An
    // enemy ref after the verb is the OBJECT ("我斩纸鬼" → subject is 我, not 敌).
    // forceSubjectIsEnemy (imperatives) still overrides globally.
    const clause = clauseOf(v);
    const vIdx = clause.indexOf(v);
    const subjectIsEnemy = ctx.forceSubjectIsEnemy
      || (vIdx > 0 && clause.slice(0, vIdx).some(isEnemySubjectCard));

    const special = VERB_SPECIALS.find(([flag]) => v[flag]);
    if (special) {
      special[1](v, ctx, power, subjectIsEnemy);
      continue;
    }

    if (v.combatType === 'attack') {
      let dmg = (power + bonus.subjectAttack + bonus.objAttack + G.strength) * bonus.attackMod;
      if (G.weak > 0 && !bonus.hasIgnoreAllLimits) dmg *= 0.75;
      const hits = v.hits || 1;
      effects.damage += Math.floor(dmg) * hits;
      if (v.forceAoe) effects.aoe = true;
      if (v.ignoreBlock) effects.ignoreBlock = true;
      if (v.applyWeakVerb) effects.applyWeak = Math.max(effects.applyWeak, v.applyWeakVerb);
      if (v.kickbackVerb) effects._kickback = true;
      if (v.reduceBlockVerb) effects._reduceEnemyBlock = (effects._reduceEnemyBlock || 0) + v.reduceBlockVerb;
      if (v.selfDmgVerb) { effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg || 0) + v.selfDmgVerb; }
      if (v.bounceVerb) effects._bounce = true;
      if (v.tauntVerb) effects._taunt = true;
      if (v.confuseVerb) effects._confuse = true;
    } else if (v.combatType === 'defense') {
      effects.block += Math.floor((power + bonus.subjectDefense + bonus.objDefense) * bonus.defenseMod);
      if (v.drawLessNext) effects.drawLessNext += v.drawLessNext;
      if (v.healAlsoVerb) effects.heal += v.healAlsoVerb;
      if (v.vulnSelfNext) effects._vulnSelfNext = true;
    } else if (v.combatType === 'heal') {
      effects.heal += Math.floor((power + bonus.subjectHeal + bonus.objHeal) * bonus.healMod);
      if (v.blockAlso) effects.block += Math.floor((v.upgraded ? Math.ceil(v.blockAlso * 1.5) : v.blockAlso) * bonus.defenseMod);
    } else if (v.combatType === 'buff') {
      effects.strengthGain += v.upgraded ? (v.upgPower || v.basePower) : v.basePower;
      if (v.blockAlso) effects.block += Math.floor((v.upgraded ? Math.ceil(v.blockAlso * 1.5) : v.blockAlso) * bonus.defenseMod);
    } else if (v.combatType === 'special') {
      if (v.special === 'zeroCost') effects.zeroCost = true;
    }
    if (v.draw) effects.draw += (v.upgraded && v.draw ? v.draw + 1 : v.draw);
    if (v.exhaust) v._shouldExhaust = true;
  }
}

export function applyCardEffects(ctx) {
  applySubjects(ctx);
  applyObjects(ctx);
  applyModifiers(ctx);
  applyConnectors(ctx);
  applyVerbs(ctx);
}
