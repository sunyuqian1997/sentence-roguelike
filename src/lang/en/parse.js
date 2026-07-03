// English language-pack parser — 卡序列 → IR(与 zh parse 同形,供 core/settle 消费)。
// 英文卡用简单数值模型(pos + power 字段),不含中文 meme-verb 特例,保持语言包干净自包含。
import { G } from '../../game/state.js';
import { createIR } from '../../game/eval-core/ir.js';
import { buildContextEn, isSelfRefEn, isEnemyRefEn } from './context.js';
import { applyGrammarEn } from './grammar.js';
import { applyQualityEn, detectParallelEn } from './poetics.js';
import { isWellFormed as enWellFormed } from './wellformed.js';
import { textRepeatCount, skeletonRepeatCount, newWordsIn, continuityLinks } from '../../game/creativity.js';

// Creativity economy — mirrors the zh rules (repetition_decay/novelty/continuity
// in src/lang/zh/rules/quality.js) with English notes. Ledger is language-neutral
// (creativity.js); combat.js advances it on every real chant regardless of lang.
function applyCreativityEn(ctx) {
  const links = continuityLinks(ctx.cards);
  if (links.length) {
    const streak = (G._continuityStreak || 0) + 1;
    const bonus = streak >= 3 ? 0.4 : streak >= 2 ? 0.3 : 0.2;
    ctx.literaryMult += bonus;
    ctx.literaryNotes.push(`🔗 Callback "${links[0]}" +${bonus.toFixed(1)}${streak > 1 ? ` (×${streak})` : ''}`);
    ctx.effects._continuity = { words: links, streak, bonus };
  }
  const n = textRepeatCount(ctx.cards);
  if (n > 0) {
    const f = Math.pow(0.6, n);
    ctx.literaryMult = Math.max(0.1, ctx.literaryMult * f);
    ctx.literaryNotes.push(`😮‍💨 Same line again ×${f.toFixed(2)}`);
    ctx.effects._repetition = { kind: 'exact', n };
  } else {
    const m = skeletonRepeatCount(ctx.cards);
    if (m > 0) {
      const f = Math.pow(0.85, m);
      ctx.literaryMult = Math.max(0.1, ctx.literaryMult * f);
      ctx.literaryNotes.push(`🥱 Same shape ×${f.toFixed(2)}`);
      ctx.effects._repetition = { kind: 'skeleton', n: m };
    }
  }
  const fresh = newWordsIn(ctx.cards);
  if (fresh.length) {
    const bonus = Math.min(0.3, fresh.length * 0.06);
    ctx.literaryMult += bonus;
    ctx.literaryNotes.push(`✨ Fresh: ${fresh.slice(0, 3).join(', ')}${fresh.length > 3 ? '…' : ''} +${bonus.toFixed(2)}`);
    ctx.effects._novelty = { words: fresh, bonus };
  }
}

export { enWellFormed as isWellFormed };

// 标点评分 + 英文对句(detectParallelEn 与 detectDuizhang 同形)。
function applyPunctuationEn(ctx) {
  if (ctx.hasPeriod) { ctx.punctMult *= 1.15; ctx.punctNotes.push('Period . closes ×1.15'); }
  if (ctx.hasExclamation) { ctx.punctMult *= 1.3; ctx.punctNotes.push('Exclamation ! burst ×1.3'); }
  if (ctx.hasQuestion) { ctx.punctNotes.push('Question ? → weaken enemy'); }
  if (ctx.hasComma) {
    const p = detectParallelEn(ctx.cards);
    ctx.duizhangResult = p;
    if (p) { ctx.punctMult *= p.multiplier; ctx.punctNotes.push(p.label); }
    else { ctx.punctMult *= 1.1; ctx.punctNotes.push('Comma , compound ×1.1'); }
  }
}

// 感叹词倍率(镜像 zh exclamation 的核心:每个叹词按 excType 乘 attack/defense/heal)。
function applyExclamationsEn(ctx) {
  ctx.exclamationCards.forEach(c => {
    const m = c.excMult || 1.2;
    if (c.excType === 'attack') ctx.exc.attackMult *= m;
    else if (c.excType === 'defense') ctx.exc.defenseMult *= m;
    else { ctx.exc.attackMult *= m; ctx.exc.defenseMult *= m; ctx.exc.healMult *= m; }
    if (c.excHeal) ctx.exc.extraHeal += c.excHeal;
    if (c.excDraw) ctx.exc.extraDraw += c.excDraw;
    if (m !== 1) ctx.excNotes.push(`${c.word} ×${m}`);
  });
  ctx.exc.posResult = { legal: true, penalty: 1.0 };   // 英文暂不做叹词位置惩罚
}

// 英文卡基础数值:按 pos + power 字段累加(简单模型)。
function applyCardEffectsEn(ctx) {
  const { effects, bonus } = ctx;
  const power = (c) => c.upgraded ? (c.upgPower ?? c.basePower ?? 0) : (c.basePower ?? 0);

  ctx.realVerbs.forEach(v => {
    const p = power(v);
    if (v.combatType === 'defense') effects.block += p;
    else if (v.combatType === 'heal') effects.heal += p;
    else effects.damage += p;            // 默认攻击
    if (v.ignoreBlock) effects.ignoreBlock = true;
    if (v.draw) effects.draw += v.draw;
  });
  ctx.subjects.forEach(s => {
    const b = s.powerBonus || 0;
    if (s.bonusType === 'attack') bonus.subjectAttack += b;
    else if (s.bonusType === 'defense') bonus.subjectDefense += b;
    else if (s.bonusType === 'heal') bonus.subjectHeal += b;
  });
  ctx.handObjects.forEach(o => {
    const b = o.powerBonus || o.effectBonus || 0;
    if (o.bonusType === 'defense') bonus.objDefense += b;
    else if (o.bonusType === 'heal') bonus.objHeal += b;
    else bonus.objAttack += b;
    if (o.aoe) effects.aoe = true;
    if (o.goldGain) effects.goldGain += o.goldGain;
  });
  ctx.modifiers.forEach(mod => {
    const mult = mod.multiplier || 1;
    if (mod.bonusType === 'defense') bonus.defenseMod *= mult;
    else if (mod.bonusType === 'heal') bonus.healMod *= mult;
    else bonus.attackMod *= mult;
  });

  // 把 subject/object 加成 + modifier 倍率落到 effects(镜像 zh finalize 之前的合并)。
  effects.damage = Math.round((effects.damage + bonus.subjectAttack + bonus.objAttack) * bonus.attackMod);
  effects.block = Math.round((effects.block + bonus.subjectDefense + bonus.objDefense) * bonus.defenseMod);
  effects.heal = Math.round((effects.heal + bonus.subjectHeal + bonus.objHeal) * bonus.healMod);
}

// 英文敌我角色(原 zh finalize 前半段的英文对应)。
function detectRolesEn(ctx) {
  const { effects } = ctx;
  const isComma = (c) => c.pos === 'punctuation' && c.punctType === 'comma';
  const clauses = []; { let cur = [];
    for (const c of ctx.cards) { if (isComma(c)) { clauses.push(cur); cur = []; } else cur.push(c); }
    clauses.push(cur);
  }
  const enemyStrikesMe = !effects._imperative && clauses.some(clause => {
    const vIdx = clause.findIndex(c => (c.pos === 'verb' || c.pos === 'special') && c.combatType === 'attack');
    if (vIdx < 0) return false;
    const after = clause.slice(vIdx + 1);
    if (!after.some(isSelfRefEn)) return false;
    const enemyBefore = clause.slice(0, vIdx).some(isEnemyRefEn);
    const enemyAfter = after.some(isEnemyRefEn);
    return enemyBefore || !enemyAfter;
  });
  if ((ctx.hasSelfTarget || enemyStrikesMe) && effects.damage > 0) {
    effects.selfHarm = true;
    effects.selfHarmDmg = (effects.selfHarmDmg || 0) + effects.damage;
    effects.selfHarmBuff = enemyStrikesMe ? 0 : 2;
    effects.damage = 0;
    ctx.grammarNotes.push(enemyStrikesMe ? '🩸 Enemy is subject — you take the hit' : 'Self-harm: +2 strength');
  }
  if (ctx.hasQuestion && effects.damage > 0 && !effects.selfHarm) effects.damage = 0;
}

function buildClausesEn(cards) {
  const out = []; let cur = [];
  for (const c of cards) {
    if (c.pos === 'punctuation' && c.punctType === 'comma') { out.push(cur); cur = []; } else cur.push(c);
  }
  out.push(cur);
  return out.filter(cl => cl.length).map(clause => {
    const vIdx = clause.findIndex(c => c.pos === 'verb' || c.pos === 'special');
    if (vIdx < 0) {
      const a = clause.some(isSelfRefEn) ? 'self' : clause.some(isEnemyRefEn) ? 'enemy' : 'none';
      return { agent: a, action: 'none', patient: 'none', coActor: null };
    }
    const v = clause[vIdx], before = clause.slice(0, vIdx), after = clause.slice(vIdx + 1);
    return {
      agent: before.some(isEnemyRefEn) ? 'enemy' : before.some(isSelfRefEn) ? 'self'
           : before.some(c => c.pos === 'subject') ? 'coactor' : 'none',
      action: v.combatType === 'defense' ? 'defend' : v.combatType === 'heal' ? 'heal' : 'attack',
      patient: after.some(isSelfRefEn) ? 'self' : after.some(c => c._isEnemyTarget || c.pos === 'object') ? 'enemy' : 'none',
      coActor: null,
    };
  });
}

export function parse(rawCards) {
  const ir = createIR();
  ir.debug.lang = 'en';
  ir.wellFormed = enWellFormed(rawCards);

  const ctx = buildContextEn(rawCards);
  applyGrammarEn(ctx);
  applyPunctuationEn(ctx);
  applyQualityEn(ctx);
  applyCreativityEn(ctx);
  applyExclamationsEn(ctx);
  applyCardEffectsEn(ctx);
  detectRolesEn(ctx);

  ir.debug.text = ctx.text;
  ir.debug.cards = ctx.cards;
  ir.clauses = buildClausesEn(ctx.cards);
  ir.notes = { grammar: ctx.grammarNotes, poetic: ctx.literaryNotes, punct: ctx.punctNotes, exc: ctx.excNotes };
  ir.mults = {
    grammar: ctx.grammarMult, poetic: ctx.literaryMult, punct: ctx.punctMult,
    excAttack: ctx.exc.attackMult, excDefense: ctx.exc.defenseMult, excHeal: ctx.exc.healMult,
    excPosScale: 1.0, excPosPenalty: 1.0,
  };
  ir.poeticScore = ctx.literaryMult;
  ir.effectsSeed = ctx.effects;
  ir.ctxSeed = {
    bonus: ctx.bonus, exc: ctx.exc,
    realVerbs: ctx.realVerbs, duizhangResult: ctx.duizhangResult,
    hasQuestion: ctx.hasQuestion, hasMultiTarget: ctx.hasMultiTarget,
    multiTargetIndices: ctx.multiTargetIndices,
    text: ctx.text, cards: ctx.cards, grammarNotes: ctx.grammarNotes,
  };
  return ir;
}
