// English grammar scoring: predicate presence, structure, word order,
// connector bonus. Writes ctx.grammarMult + ctx.grammarNotes.

const BE_WORDS = new Set(['is', 'am', 'are']);

function isBeWord(card) {
  return BE_WORDS.has((card?.word || '').toLowerCase());
}

function getRole(card) {
  if (!card) return null;
  if (card._isEnemyTarget || card._isSelfTarget) return 'object';
  if (card.pos === 'special' && isBeWord(card)) return 'verb';
  if (card.pos === 'verb' || card.pos === 'subject' || card.pos === 'object' || card.pos === 'modifier' || card.pos === 'connector') {
    return card.pos;
  }
  return null;
}

function analyzeClauseOrder(clauseCards) {
  const items = clauseCards
    .filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation')
    .map(c => ({ card: c, role: getRole(c) }))
    .filter(item => item.role);

  if (items.length === 0) return { wrong: false, minor: false, isBeClause: false };

  const verbIdx = items.findIndex(item => item.role === 'verb');
  if (verbIdx < 0) return { wrong: false, minor: false, isBeClause: false };

  const verbCard = items[verbIdx].card;
  const before = items.slice(0, verbIdx);
  const after = items.slice(verbIdx + 1);

  const subjectBefore = before.some(item => item.role === 'subject');
  const subjectAfter = after.some(item => item.role === 'subject');
  const objectBefore = before.some(item => item.role === 'object');
  const objectAfter = after.some(item => item.role === 'object');
  const hasModifierAfter = after.some(item => item.role === 'modifier');
  const hasPredicateTail = after.some(item => item.role === 'object' || item.role === 'modifier' || item.role === 'subject');
  const isBeClause = isBeWord(verbCard);

  if (isBeClause) {
    const validBe = subjectBefore && hasPredicateTail && !objectBefore && !subjectAfter;
    return { wrong: !validBe, minor: false, isBeClause: true };
  }

  if (subjectAfter || objectBefore) return { wrong: true, minor: false, isBeClause: false };
  if (!subjectBefore && objectAfter) return { wrong: false, minor: true, isBeClause: false };
  if (!subjectBefore && hasModifierAfter) return { wrong: false, minor: true, isBeClause: false };
  if (before.some(item => item.role === 'modifier')) return { wrong: false, minor: true, isBeClause: false };

  const laterVerb = after.findIndex(item => item.role === 'verb');
  if (laterVerb >= 0 && after.slice(0, laterVerb).some(item => item.role === 'object')) {
    return { wrong: true, minor: false, isBeClause: false };
  }

  return { wrong: false, minor: false, isBeClause: false };
}

export function checkWordOrderEn(cards) {
  const notes = [];
  const hasComma = cards.some(c => c.pos === 'punctuation' && c.punctType === 'comma');

  const clauses = hasComma
    ? (() => {
        const commaIdx = cards.findIndex(c => c.pos === 'punctuation' && c.punctType === 'comma');
        return [cards.slice(0, commaIdx), cards.slice(commaIdx + 1)];
      })()
    : [cards];

  let hasWrong = false;
  let hasMinor = false;
  let hasBeClause = false;

  clauses.forEach(clause => {
    const result = analyzeClauseOrder(clause);
    hasWrong = hasWrong || result.wrong;
    hasMinor = hasMinor || result.minor;
    hasBeClause = hasBeClause || result.isBeClause;
  });

  if (hasBeClause && !hasWrong && !hasMinor) {
    notes.push('S+be+complement OK ×1.0');
    return { score: 1.0, notes };
  }
  if (hasWrong) {
    notes.push('word order scrambled ×0.7');
    return { score: 0.7, notes };
  }
  if (hasMinor) {
    notes.push('minor word-order issue ×0.85');
    return { score: 0.85, notes };
  }

  notes.push('word order correct ×1.0');
  return { score: 1.0, notes };
}

export function applyGrammarEn(ctx) {
  const {
    cards,
    subjects,
    realVerbs,
    connectors,
    handObjects,
    hasVerb,
    isDeclaration,
    hasComma,
    hasEnemyTarget,
    hasSelfTarget,
  } = ctx;

  const hasSubject = subjects.length > 0;
  const hasObject = handObjects.length > 0 || hasEnemyTarget || hasSelfTarget;

  let baseMult = 0.3;
  if (hasVerb) {
    baseMult = 1.0;
    ctx.grammarNotes.push('predicate present ×1.0');
  } else if (isDeclaration) {
    baseMult = 0.8;
    ctx.grammarNotes.push('declaration ×0.8');
  } else {
    ctx.grammarNotes.push('no predicate, broken sentence ×0.3');
  }

  let structMult = 0.7;
  const isCompound = hasComma && subjects.length > 1 && realVerbs.length > 1;

  if (hasVerb) {
    if (isCompound) {
      structMult = 1.35;
      ctx.grammarNotes.push('compound sentence ×1.35');
    } else if (hasSubject && hasObject) {
      structMult = 1.25;
      ctx.grammarNotes.push('S+V+O ×1.25');
    } else if (hasSubject) {
      structMult = 1.0;
      ctx.grammarNotes.push('S+V ×1.0');
    } else if (hasObject || realVerbs.length === 1) {
      structMult = 0.85;
      ctx.grammarNotes.push(hasObject ? 'imperative V+O ×0.85' : 'imperative bare V ×0.85');
    } else {
      structMult = 0.7;
      ctx.grammarNotes.push('predicate only ×0.7');
    }
  } else if (isDeclaration) {
    structMult = 1.0;
    ctx.grammarNotes.push('declarative exclamation ×1.0');
  }

  const orderResult = checkWordOrderEn(cards);
  orderResult.notes.forEach(note => ctx.grammarNotes.push(note));

  const connBonus = connectors.length > 0 ? 0.05 : 0;
  if (connBonus > 0) ctx.grammarNotes.push('connector +5%');

  ctx.grammarMult = (baseMult * structMult * orderResult.score + connBonus) * (ctx.constructionGrammarMult || 1);
}

/*
Examples:
1. [I][slay][dragon] => base 1.0 * struct 1.25 * order 1.0 = 1.25
2. [slay][dragon] => base 1.0 * struct 0.85 * order 0.85 = 0.7225
3. [I][am][king][,][and][you][are][doomed] => 1.0 * 1.35 * 1.0 + 0.05 = 1.4
*/
