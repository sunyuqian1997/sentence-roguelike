// English language-pack context builder — 镜像 zh 的 buildContext,但用英语 pos 分组。
// 产出与 zh 同形的 ctx,让 settle.js 能消费同一套 effectsSeed/ctxSeed。
// 英语卡 pos 用与中文相同的标签集(subject/verb/object/modifier/connector/special/
// punctuation/exclamation),因此分组逻辑可复用;差别在「成句/诗意/语序」的规则(各 agent 写)。
import { G } from '../../game/state.js';

// 英语无中文式多义谐音解析;恒等(未来要 homophone pun 再扩展)。
function applyMeaningsEn(cards) { return cards; }

// 标点不参与分句的浮到末尾(与 zh normalizeSentence 同构)。
export function normalizeSentence(cards) {
  const endP = [], excl = [], rest = [];
  cards.forEach(c => {
    if (c.pos === 'punctuation' && c.punctType !== 'comma') endP.push(c);
    else if (c.pos === 'exclamation') excl.push(c);
    else rest.push(c);
  });
  return [...rest, ...excl, ...endP];
}

export function buildContextEn(inputCards) {
  const rawCards = applyMeaningsEn(inputCards);
  const cards = normalizeSentence(rawCards);

  const punctCards = cards.filter(c => c.pos === 'punctuation');
  const nonPunctCards = cards.filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation');
  const exclamationCards = cards.filter(c => c.pos === 'exclamation');
  const subjects = nonPunctCards.filter(c => c.pos === 'subject');
  const verbs = nonPunctCards.filter(c => c.pos === 'verb' || c.pos === 'special');
  const realVerbs = nonPunctCards.filter(c => c.pos === 'verb');
  const objects = nonPunctCards.filter(c => c.pos === 'object');
  const modifiers = nonPunctCards.filter(c => c.pos === 'modifier');
  const connectors = nonPunctCards.filter(c => c.pos === 'connector');

  const text = cards.map(c => c.word).join(' ');           // 英语用空格分词
  const totalChars = nonPunctCards.length;                  // 英语用「词数」近似中文「字数」

  const hasSelfTarget = cards.some(c => c._isSelfTarget);
  const enemyObjCards = cards.filter(c => c._isEnemyTarget);
  const hasEnemyTarget = enemyObjCards.length > 0;
  const targetEnemyIdx = hasEnemyTarget ? enemyObjCards[0]._enemyIdx : -1;
  const handObjects = objects.filter(c => !c._isEnemyTarget && !c._isSelfTarget);
  const coActors = subjects.filter(c => !isSelfRefEn(c) && !isEnemyRefEn(c));

  const hasPeriod = punctCards.some(c => c.punctType === 'period');
  const hasQuestion = punctCards.some(c => c.punctType === 'question' || c.punctType === 'interrobang');
  const hasExclamation = punctCards.some(c => c.punctType === 'exclamation' || c.punctType === 'interrobang');
  const hasComma = punctCards.some(c => c.punctType === 'comma');

  const hasMultiTarget = (connectors.some(c => c.multiTarget) || hasComma) && enemyObjCards.length > 1;
  const multiTargetIndices = hasMultiTarget ? enemyObjCards.map(c => c._enemyIdx) : [];

  const hasVerb = realVerbs.length > 0 || verbs.length > 0;
  const isDeclaration = !hasVerb && exclamationCards.length > 0 && subjects.length > 0;

  return {
    rawCards, cards, text, totalChars,
    punctCards, nonPunctCards, exclamationCards,
    subjects, verbs, realVerbs, objects, handObjects, modifiers, connectors, coActors,
    hasSelfTarget, enemyObjCards, hasEnemyTarget, targetEnemyIdx,
    hasPeriod, hasQuestion, hasExclamation, hasComma,
    hasMultiTarget, multiTargetIndices, hasVerb, isDeclaration,
    grammarMult: 1.0, literaryMult: 1.0, punctMult: 1.0,
    constructions: [], constructionGrammarMult: 1.0, forceSubjectIsEnemy: false,
    grammarNotes: [], literaryNotes: [], punctNotes: [], excNotes: [], duizhangResult: null,
    effects: {
      damage: 0, block: 0, heal: 0, strengthGain: 0, draw: 0,
      aoe: false, applyVuln: 0, zeroCost: false,
      selfHarm: false, selfHarmDmg: 0, selfHarmBuff: 0,
      targetEnemyIdx, applyWeak: 0, isQuestion: hasQuestion, ignoreBlock: false,
      goldGain: 0, thorns: 0, drawLessNext: 0,
      _motifTriggers: null, _rhymeInfo: null, _predicates: null,
    },
    bonus: {
      subjectAttack: 0, subjectDefense: 0, subjectHeal: 0,
      objAttack: 0, objDefense: 0, objHeal: 0,
      attackMod: 1, defenseMod: 1, healMod: 1,
      modSelfDmg: 0, modHealBonus: 0, hasIgnoreAllLimits: false,
      splitAttackToBlock: false, orRandomMult: false, doubleExecuteConn: false,
    },
    exc: { attackMult: 1, defenseMult: 1, healMult: 1, extraDraw: 0, extraHeal: 0, extraEnergy: 0, posResult: null },
  };
}

// 英语敌我指代(与中文 isYouCard/我 对应)。
export function isSelfRefEn(c) {
  if (!c) return false;
  if (c._isSelfTarget || c._isFixedWo) return true;
  return c.pos === 'subject' && /^(i|me|myself)$/i.test(c.word);
}
export function isEnemyRefEn(c) {
  if (!c) return false;
  if (c._isEnemyTarget) return true;
  return /^(you|the enemy|foe|it)$/i.test(c.word || '');
}
