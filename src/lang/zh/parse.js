// 中文语言包 parser — 把卡序列翻译成语言无关的 IR。
//
// 这一层是**唯一懂中文**的地方:跑现有规则链(context→constructions→grammar→punctuation→
// quality→exclamation→cardEffects)算出 ctx,再做「敌我角色判定」(原 finalize 前半段的中文语义),
// 然后把结果装进 IR 的 effectsSeed/ctxSeed/clauses,交给 core/settle 做语言无关的数值结算。
//
// 迁移原则:逻辑零改,只是重新组织。golden master 比对数值必须与重构前完全一致。
import { G } from '../../game/state.js';
import { isYouCard } from '../../game/poetics.js';
import { buildContext } from './rules/context.js';
import { applyConstructions } from './rules/constructions.js';
import { applyGrammar } from './rules/grammar.js';
import { applyPunctuation } from './rules/punctuation.js';
import { applyQuality } from './rules/quality.js';
import { applyExclamations } from './rules/exclamation.js';
import { applyCardEffects } from './rules/cardEffects.js';
import { isWellFormed as zhWellFormed } from './rules/wellformed.js';
import { createIR } from '../../game/eval-core/ir.js';

export { zhWellFormed as isWellFormed };

// 把一个分句的卡序列抽象成 {agent, action, patient}(Storyteller 式事实)。
// 仅用于 IR.clauses 的可读/调试展示;数值结算仍走 ctxSeed(保 golden 一致)。
function clauseToFact(clause) {
  const isMe = (c) => c._isSelfTarget || c._isFixedWo || (c.pos === 'subject' && c.word === '我');
  const isEnemyRef = (c) => c._isEnemyTarget || isYouCard(c);
  const vIdx = clause.findIndex(c => c.pos === 'verb' || c.pos === 'special');
  if (vIdx < 0) {
    const hasMe = clause.some(isMe), hasEnemy = clause.some(isEnemyRef);
    return { agent: hasMe ? 'self' : hasEnemy ? 'enemy' : 'none', action: 'none',
             patient: 'none', coActor: null };
  }
  const v = clause[vIdx];
  const before = clause.slice(0, vIdx), after = clause.slice(vIdx + 1);
  const agent = before.some(isEnemyRef) ? 'enemy' : before.some(isMe) ? 'self'
              : before.some(c => c.pos === 'subject') ? 'coactor' : 'none';
  const patient = after.some(isMe) ? 'self' : after.some(isEnemyRef) ? 'enemy'
               : after.some(c => c.pos === 'object') ? 'enemy' : 'none';
  const action = v.combatType === 'attack' ? 'attack' : v.combatType === 'defense' ? 'defend'
               : v.combatType === 'heal' ? 'heal' : 'attack';
  return { agent, action, patient, coActor: null };
}

function buildClauses(cards) {
  const out = []; let cur = [];
  for (const c of cards) {
    if (c.pos === 'punctuation' && (c.punctType === 'comma' || c.punctType === 'period')) { out.push(cur); cur = []; }
    else cur.push(c);
  }
  out.push(cur);
  return out.filter(cl => cl.length).map(clauseToFact);
}

// 原 finalize 前半段:敌我角色判定(中文语义),写进 effects.selfHarm 等。语言专属,留在 zh。
function detectRoles(ctx) {
  const { effects } = ctx;
  // 器物之利(yong_instrumental):cardEffects 算完基础伤害后加平斩加成。
  // 放在敌我转移之前——"纸鬼用椅子碎我"也吃器物加成,物理一致。
  if (effects._instrument && effects.damage > 0) {
    effects.damage += effects._instrument.dmg;
    ctx.grammarNotes.push(`🔧 器物之利 +${effects._instrument.dmg}`);
  }
  if (ctx.bonus.modHealBonus > 0) effects.heal += ctx.bonus.modHealBonus;
  if (ctx.bonus.modSelfDmg > 0) { effects.selfHarm = true; effects.selfHarmDmg = ctx.bonus.modSelfDmg; effects.selfHarmBuff = 0; }

  const isMe = (c) => c._isSelfTarget || c._isFixedWo || (c.pos === 'subject' && c.word === '我');
  const isEnemyRef = (c) => c._isEnemyTarget || isYouCard(c);
  const isClauseBreak = (c) => c.pos === 'punctuation'
    && (c.punctType === 'comma' || c.punctType === 'period');
  const clauses = []; { let cur = [];
    for (const c of ctx.cards) { if (isClauseBreak(c)) { clauses.push(cur); cur = []; } else cur.push(c); }
    clauses.push(cur);
  }
  const enemyStrikesMe = !effects._imperative && clauses.some(clause => {
    const vIdx = clause.findIndex(c => (c.pos === 'verb' || c.pos === 'special') && c.combatType === 'attack');
    if (vIdx < 0) return false;
    const after = clause.slice(vIdx + 1);
    if (!after.some(isMe)) return false;
    const enemyBeforeVerb = clause.slice(0, vIdx).some(isEnemyRef);
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
  if (ctx.hasQuestion && effects.damage > 0 && !effects.selfHarm) effects.damage = 0;
  if (ctx.bonus.splitAttackToBlock && effects.damage > 0) {
    const half = Math.floor(effects.damage / 2);
    effects.damage -= half; effects.block += half;
    ctx.grammarNotes.push('「但是」攻守兼备');
  }
}

export function parse(rawCards) {
  const ir = createIR();
  ir.debug.lang = 'zh';
  ir.wellFormed = zhWellFormed(rawCards);

  const ctx = buildContext(rawCards);
  applyConstructions(ctx);
  applyGrammar(ctx);
  applyPunctuation(ctx);
  applyQuality(ctx);
  applyExclamations(ctx);
  applyCardEffects(ctx);
  detectRoles(ctx);   // 中文敌我语义(原 finalize 前半段)

  ir.debug.text = ctx.text;
  ir.debug.cards = ctx.cards;
  ir.clauses = buildClauses(ctx.cards);
  ir.notes = { grammar: ctx.grammarNotes, poetic: ctx.literaryNotes, punct: ctx.punctNotes, exc: ctx.excNotes };
  ir.mults = {
    grammar: ctx.grammarMult, poetic: ctx.literaryMult, punct: ctx.punctMult,
    excAttack: ctx.exc.attackMult, excDefense: ctx.exc.defenseMult, excHeal: ctx.exc.healMult,
    excPosScale: ctx.exc.posResult.legal ? 1.0 : 0.5,
    excPosPenalty: ctx.exc.posResult.penalty,
  };
  ir.poeticScore = ctx.literaryMult;

  // settle 需要的语言无关结算上下文(数值/结构,非语言语义)。
  ir.effectsSeed = ctx.effects;
  ir.ctxSeed = {
    bonus: ctx.bonus, exc: ctx.exc,
    realVerbs: ctx.realVerbs, duizhangResult: ctx.duizhangResult,
    hasQuestion: ctx.hasQuestion, hasMultiTarget: ctx.hasMultiTarget,
    multiTargetIndices: ctx.multiTargetIndices,
    text: ctx.text, cards: ctx.cards,
    grammarNotes: ctx.grammarNotes,
  };
  return ir;
}
