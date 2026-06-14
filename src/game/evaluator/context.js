// Sentence evaluation context.
// buildContext() turns the player's raw card sequence into a single ctx object
// that every evaluation rule reads from and writes to:
//   - rawCards: meaning-resolved cards in原 order (exclamation position checks)
//   - cards:    normalized order (body → exclamations → end punctuation)
//   - POS groups, target flags, punctuation flags
//   - accumulators: grammarMult/literaryMult/punctMult + note arrays + effects
import { G } from '../state.js';
import { applyMeaningsToSentence } from '../meanings.js';
import { isCopulaPredicate } from '../poetics.js';

// Body words keep their order; exclamations float to the end, end-punctuation last.
export function normalizeSentence(cards) {
  const endPuncts = [];
  const exclamations = [];
  const rest = [];
  cards.forEach(c => {
    if (c.pos === 'punctuation' && c.punctType !== 'comma') endPuncts.push(c);
    else if (c.pos === 'exclamation') exclamations.push(c);
    else rest.push(c);
  });
  return [...rest, ...exclamations, ...endPuncts];
}

export function buildContext(inputCards) {
  // Multi-meaning resolution first: every rule sees each card AS USED here.
  const rawCards = applyMeaningsToSentence(inputCards);
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

  const text = cards.map(c => c.word).join('');
  const totalChars = nonPunctCards.map(c => c.word).join('').length;

  const hasSelfTarget = cards.some(c => c._isSelfTarget);
  const enemyObjCards = cards.filter(c => c._isEnemyTarget);
  const hasEnemyTarget = enemyObjCards.length > 0;
  const targetEnemyIdx = hasEnemyTarget ? enemyObjCards[0]._enemyIdx : -1;
  const handObjects = objects.filter(c => !c._isEnemyTarget && !c._isSelfTarget);

  // Co-actors: named subjects OTHER than 我 that act as INDEPENDENT entities
  // ("影子斩敌" → 影子 attacks). A subject that is the predicate B of "A 是 B"
  // ("我是影子" → 影子 is an attribute, not an actor) is excluded.
  const coActors = subjects.filter(c => c.word !== '我' && !isCopulaPredicate(cards, c));

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
    subjects, verbs, realVerbs, objects, handObjects, modifiers, connectors,
    coActors,
    hasSelfTarget, enemyObjCards, hasEnemyTarget, targetEnemyIdx,
    hasPeriod, hasQuestion, hasExclamation, hasComma,
    hasMultiTarget, multiTargetIndices,
    hasVerb, isDeclaration,

    // accumulators
    grammarMult: 1.0,
    literaryMult: 1.0,
    punctMult: 1.0,
    constructions: [],
    constructionGrammarMult: 1.0,
    forceSubjectIsEnemy: false,
    grammarNotes: [],
    literaryNotes: [],
    punctNotes: [],
    excNotes: [],
    duizhangResult: null,

    effects: {
      damage: 0, block: 0, heal: 0, strengthGain: 0, draw: 0,
      aoe: false, applyVuln: 0, zeroCost: false,
      selfHarm: false, selfHarmDmg: 0, selfHarmBuff: 0,
      targetEnemyIdx,
      applyWeak: 0, isQuestion: hasQuestion, ignoreBlock: false,
      goldGain: 0, thorns: 0, drawLessNext: 0,
      _motifTriggers: null,
      _rhymeInfo: null,
      _predicates: null,
    },

    // cross-rule scratch written by card-effect rules, consumed by finalize
    bonus: {
      subjectAttack: 0, subjectDefense: 0, subjectHeal: 0,
      objAttack: 0, objDefense: 0, objHeal: 0,
      attackMod: 1, defenseMod: 1, healMod: 1,
      modSelfDmg: 0, modHealBonus: 0,
      hasIgnoreAllLimits: false,
      splitAttackToBlock: false, orRandomMult: false, doubleExecuteConn: false,
    },
    exc: {
      attackMult: 1, defenseMult: 1, healMult: 1,
      extraDraw: 0, extraHeal: 0, extraEnergy: 0,
      posResult: null,
    },
  };
}
