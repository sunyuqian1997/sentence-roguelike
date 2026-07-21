// Grammar scoring: predicate presence, sentence structure, word order,
// connector bonuses. Writes ctx.grammarMult + ctx.grammarNotes.

function checkClauseOrder(clauseCards) {
  // Flexible phase map: allows poetic inversions like 明月(obj)高悬(verb), 宾语前置
  const phaseMap = { modifier: [0, 2, 4], subject: [1, 3], connector: [1, 2], verb: [3, 4], object: [1, 5], special: [3] };
  let phase = 0, violations = 0;
  for (const c of clauseCards) {
    const allowed = phaseMap[c.pos] || [phase];
    const min = Math.min(...allowed);
    if (min >= phase) phase = min;
    else violations++;
  }
  return violations;
}

export function checkWordOrder(cards) {
  const hasComma = cards.some((c, index) => c.pos === 'punctuation'
    && (c.punctType === 'comma' || c.punctType === 'period')
    && cards.slice(index + 1).some(next => next.pos !== 'punctuation' && next.pos !== 'exclamation'));
  const notes = [];

  if (hasComma) {
    const commaIdx = cards.findIndex((c, index) => c.pos === 'punctuation'
      && (c.punctType === 'comma' || c.punctType === 'period')
      && cards.slice(index + 1).some(next => next.pos !== 'punctuation' && next.pos !== 'exclamation'));
    const clause1 = cards.slice(0, commaIdx).filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation');
    const clause2 = cards.slice(commaIdx + 1).filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation');

    const totalV = checkClauseOrder(clause1) + checkClauseOrder(clause2);

    const sub1 = clause1.filter(c => c.pos === 'subject').length;
    const sub2 = clause2.filter(c => c.pos === 'subject' || c._isEnemyTarget).length;
    const verb1 = clause1.filter(c => c.pos === 'verb').length;
    const verb2 = clause2.filter(c => c.pos === 'verb').length;

    let bonus = 0;
    if (sub1 >= 1 && sub2 >= 1 && verb1 >= 1 && verb2 >= 1) {
      bonus = 0.1;
      notes.push('复合句（双主语双谓语）+10%');
    } else if (sub1 >= 1 && verb1 >= 1 && verb2 >= 1) {
      notes.push('复合句（承前省略）');
    }

    let score;
    if (totalV === 0) { score = 1.0 + bonus; if (notes.length === 0) notes.push('语序正确'); }
    else if (totalV <= 2) { score = 0.85 + bonus; notes.push('语序小错 ×0.85'); }
    else { score = 0.65; notes.push('语序混乱 ×0.65'); }
    return { score, notes };
  }

  const nonPunct = cards.filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation' && !c._isEnemyTarget && !c._isSelfTarget);
  if (nonPunct.length === 0) return { score: 1.0, notes: [] };

  const violations = checkClauseOrder(nonPunct);
  const posCounts = {};
  nonPunct.forEach(c => { posCounts[c.pos] = (posCounts[c.pos] || 0) + 1; });
  let dupPenalty = 0;
  if ((posCounts['subject'] || 0) > 2) {
    dupPenalty += (posCounts['subject'] - 2) * 0.05;
    notes.push(`主语过多 -${((posCounts['subject'] - 2) * 5)}%`);
  }
  if ((posCounts['verb'] || 0) > 2) {
    dupPenalty += (posCounts['verb'] - 2) * 0.05;
    notes.push(`谓语过多 -${((posCounts['verb'] - 2) * 5)}%`);
  }

  let score;
  if (violations === 0) { score = 1.0; if (notes.length === 0) notes.push('语序正确'); }
  else if (violations === 1) { score = 0.8; notes.push('语序小错 ×0.8'); }
  else { score = 0.6; notes.push('语序混乱 ×0.6'); }

  score = Math.max(0.4, score - dupPenalty);
  return { score, notes };
}

export function applyGrammar(ctx) {
  const { cards, subjects, realVerbs, modifiers, connectors, handObjects,
          hasVerb, isDeclaration, hasEnemyTarget, hasSelfTarget, hasClauseBreak } = ctx;

  let baseMult = hasVerb ? 1.0 : isDeclaration ? 0.8 : 0.3;
  if (!hasVerb && !isDeclaration) ctx.grammarNotes.push('⚠ 没有谓语！废句 ×0.3');
  else if (isDeclaration) ctx.grammarNotes.push('✓ 宣言句（主语+感叹）×0.8');
  else ctx.grammarNotes.push('✓ 有谓语');

  let structMult = 0.7;
  const hasSubject = subjects.length > 0;
  const hasObject = handObjects.length > 0 || hasEnemyTarget || hasSelfTarget;
  const hasModifier = modifiers.length > 0;

  const isCompound = hasClauseBreak && subjects.length > 1 && realVerbs.length > 1;
  if (hasVerb) {
    if (isCompound) { structMult = 1.35; ctx.grammarNotes.push('复合句（多主多谓）×1.35'); }
    else if (hasSubject && hasObject && hasModifier) { structMult = 1.25; ctx.grammarNotes.push('修+主+谓+宾 ×1.25'); }
    else if (hasSubject && hasObject) { structMult = 1.0; ctx.grammarNotes.push('主+谓+宾 ×1.0'); }
    else if (hasSubject) { structMult = 0.85; ctx.grammarNotes.push('主+谓 ×0.85'); }
    else { structMult = 0.7; ctx.grammarNotes.push('仅谓语 ×0.7'); }
  } else if (isDeclaration) {
    structMult = subjects.length > 1 ? 1.0 : 0.85;
    ctx.grammarNotes.push(subjects.length > 1 ? '主+主+感叹 ×1.0' : '主+感叹 ×0.85');
  }

  const orderResult = checkWordOrder(cards);
  orderResult.notes.forEach(n => ctx.grammarNotes.push(n));

  let connBonus = 0;
  connectors.forEach(c => { connBonus += (c.grammarBonus || 0.05); });
  if (connectors.length > 0) ctx.grammarNotes.push(`连词 +${(connBonus * 100).toFixed(0)}%`);

  ctx.grammarMult = (baseMult * structMult * orderResult.score + connBonus) * (ctx.constructionGrammarMult || 1);
}
