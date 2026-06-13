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

const isMeCard = (c) =>
  !!(c && (c._isSelfTarget || c._isFixedWo || (c.pos === 'subject' && c.word === '我')));

// "给我V" anchor: the NEXT card is 我 (must be adjacent), then a verb follows
// within ≤2 modifiers ("给我狠狠戳" ok, "给老我戳" not Chinese).
function matchesMeThenVerb(ctx) {
  const next = ctx.sentence[ctx.idx + 1];
  if (!isMeCard(next)) return false;
  let k = ctx.idx + 2;
  let mods = 0;
  while (k < ctx.sentence.length) {
    const c = ctx.sentence[k];
    if (!c) return false;
    if (c.pos === 'modifier' && mods < 2) { mods++; k++; continue; }
    return c.pos === 'verb' || c.pos === 'special';
  }
  return false;
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
  if (when.nextIsMeThenVerb && matchesMeThenVerb(ctx)) any = true;
  if (when.nearText) {
    const re = when.nearText instanceof RegExp ? when.nearText : new RegExp(when.nearText);
    const joined = ctx.sentence.map((c) => (c && c.word) || '').join('');
    if (re.test(joined)) any = true;
  }
  if (typeof when.custom === 'function') {
    try { if (when.custom(ctx)) any = true; } catch (e) { /* ignore */ }
  }
  // If when has no inclusive matchers at all and no hard exclusion failed, accept
  const hasInclusive = !!(when.afterCopulaWithin || when.prevSubjectOrEnemy || when.prevVerb || when.nextIsMeThenVerb || when.nearText || when.custom);
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

// Apply an active meaning onto a working card copy. Returns a NEW object —
// never mutates the input, even when the meaning only overrides pos/pun.
// (A meaning without `patch` used to return the original card, letting callers
// accidentally mutate the player's hand card permanently.)
export function applyMeaningPatch(card, meaning) {
  if (!meaning) return card;
  const patched = { ...card, ...(meaning.patch || {}), _activeMeaning: meaning };
  if (meaning.pos) patched.pos = meaning.pos;
  if (meaning.pun) patched.pun = meaning.pun;
  return patched;
}

// Single source of truth for "what does each card mean in this sentence".
// Returns a new array of cards with active meanings resolved and patched in
// (_activeMeaning set). Both the evaluator and the UI must consume this so
// they can never disagree about a card's active usage.
export function applyMeaningsToSentence(cards) {
  return cards.map((c, i) => {
    if (!c) return c;
    const m = resolveMeaning(c, cards, i);
    return m ? applyMeaningPatch(c, m) : c;
  });
}
