// Multi-meaning card framework.
// A card may define `meanings: [Meaning]` to expose alternate uses (e.g. 给 as
// verb of giving vs 给 as gay-pun; 日 as subject "the sun" vs 日 as verb).
//
// resolveMeaning(card, sentence, idx) walks the sentence context and returns
// the active meaning (or null if the default card behavior applies).
//
// A Meaning shape:
// {
//   id: 'gei_pun',
//   label: '谐音·gay',
//   emoji: '🌈',
//   pos: 'connector',          // optional override of pos
//   // priority: higher value wins when multiple meanings match (default 0)
//   priority: 10,
//   // ctx matchers — ANY of these returning true activates the meaning.
//   when: {
//     // after a copula card (是/为) within N positions
//     afterCopulaWithin: 2,
//     // if any prev card is a subject/enemy-target (helps "你 是 给")
//     prevSubjectOrEnemy: true,
//     // if cards adjacent to this match a regex on their joined words
//     nearText: /.../, // optional regex
//     // raw predicate function: (ctx) => bool
//     custom: (ctx) => bool,
//   },
//   // What to do when this meaning is active. Two channels:
//   //   patch: shallow-merge into the card's own fields (for evaluator)
//   //   pun: { tag, label, flavor } — pun applied to subject
//   patch: { combatType: 'defense', basePower: 3 },
//   pun: { tag: 'gay', label: '🌈 魅惑', flavor: '给≈gay' },
// }

// Find the index of the most recent card matching a predicate.
function lastIndexWhere(sentence, idx, predicate) {
  for (let i = idx - 1; i >= 0; i--) {
    if (predicate(sentence[i], i)) return i;
  }
  return -1;
}

function buildCtx(card, sentence, idx) {
  const prev = sentence.slice(0, idx);
  const next = sentence.slice(idx + 1);
  const copulaIdx = lastIndexWhere(sentence, idx, (c) => c && c.copulaConn);
  const hasCopulaBefore = copulaIdx >= 0;
  const distFromCopula = hasCopulaBefore ? (idx - copulaIdx) : Infinity;
  const subjectBefore = lastIndexWhere(sentence, idx, (c) => c && (c._isEnemyTarget || c._isSelfTarget || c._isFixedWo || c.pos === 'subject'));
  const verbBefore = lastIndexWhere(sentence, idx, (c) => c && (c.pos === 'verb' || c.pos === 'special'));
  return { card, sentence, idx, prev, next, copulaIdx, hasCopulaBefore, distFromCopula, subjectBefore, verbBefore };
}

function matchesWhen(when, ctx) {
  if (!when) return true;
  // Hard exclusions first (return false if any hits)
  if (when.notAfterCopula && ctx.hasCopulaBefore) return false;
  // Inclusive matchers — true if ANY hits
  let any = false;
  if (when.afterCopulaWithin && ctx.hasCopulaBefore && ctx.distFromCopula <= when.afterCopulaWithin) any = true;
  if (when.prevSubjectOrEnemy && ctx.subjectBefore >= 0) any = true;
  if (when.prevVerb && ctx.verbBefore >= 0) any = true;
  if (when.nearText) {
    const re = when.nearText instanceof RegExp ? when.nearText : new RegExp(when.nearText);
    const joined = ctx.sentence.map((c) => (c && c.word) || '').join('');
    if (re.test(joined)) any = true;
  }
  if (typeof when.custom === 'function') {
    try { if (when.custom(ctx)) any = true; } catch (e) { /* ignore */ }
  }
  // If when has no inclusive matchers at all and no hard exclusion failed, accept
  const hasInclusive = !!(when.afterCopulaWithin || when.prevSubjectOrEnemy || when.prevVerb || when.nearText || when.custom);
  if (!hasInclusive) return true;
  return any;
}

// Returns the active meaning or null. Selects the highest priority among matchers.
export function resolveMeaning(card, sentence, idx) {
  if (!card || !Array.isArray(card.meanings) || card.meanings.length === 0) return null;
  const ctx = buildCtx(card, sentence, idx);
  let chosen = null;
  let bestPriority = -Infinity;
  for (const m of card.meanings) {
    const ok = matchesWhen(m.when, ctx);
    if (!ok) continue;
    const pri = m.priority ?? 0;
    if (pri > bestPriority) {
      bestPriority = pri;
      chosen = m;
    }
  }
  return chosen;
}

// Apply patch from active meaning onto a working card copy. Used by evaluator.
// Returns a NEW object — never mutates the input.
export function applyMeaningPatch(card, meaning) {
  if (!meaning || !meaning.patch) return card;
  return { ...card, ...meaning.patch, _activeMeaning: meaning };
}
