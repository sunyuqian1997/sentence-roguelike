// Creativity economy bookkeeping — language-neutral, per-combat scope.
//
// Design (user-approved): repeating the exact same sentence decays hard,
// re-using the same skeleton (pos sequence + verbs) decays mildly, and words
// never chanted this combat earn a novelty bonus. The counters live here;
// the multipliers are applied by each language pack's quality rules (zh:
// repetition_decay / novelty in src/lang/zh/rules/quality.js).
//
// Timing contract: evaluateSentence runs BOTH for the live preview and for the
// real chant. These counters must therefore only advance on a real chant
// (combat.js#chantSentence calls recordChantCreativity AFTER evaluating), so a
// preview always scores against "what has actually been chanted so far".
import { G } from './state.js';

// Canonical text — must match what recordChantCreativity stores.
export function sentenceText(cards) {
  return (cards || []).map(c => c.word).join('');
}

// Skeleton = the sentence's structural fingerprint: pos sequence (minus
// punctuation) + the actual verbs. 我斩纸鬼/我斩残句怪 share one skeleton
// (mild decay); swapping the verb (我锤纸鬼) is a fresh skeleton.
export function sentenceSkeleton(cards) {
  const seq = (cards || []).filter(c => c.pos !== 'punctuation').map(c => c.pos).join('-');
  const verbs = (cards || []).filter(c => c.pos === 'verb').map(c => c.word).sort().join(',');
  return seq + '|' + verbs;
}

export function resetCreativity() {
  G._chantTextCounts = {};
  G._skeletonCounts = {};
  G._usedWords = new Set();
  G._prevContentWords = [];
  G._continuityStreak = 0;
}

// "Content words" anchor sentence-to-sentence continuity: subjects and objects
// (incl. enemy-target cards, whose pos is object after normalization). Pronouns
// (我/你 · I/you/me) are excluded — chaining on them would be free money.
export function contentWordsOf(cards) {
  return [...new Set((cards || [])
    .filter(c => (c.pos === 'subject' || c.pos === 'object')
      && !/^([我你尔汝]|[Ii]|[Yy]ou|[Mm]e)$/.test(c.word))
    .map(c => c.word))];
}

export function recordChantCreativity(cards) {
  if (!cards || !cards.length) return;
  if (!G._chantTextCounts) resetCreativity();
  const text = sentenceText(cards);
  const sk = sentenceSkeleton(cards);
  G._chantTextCounts[text] = (G._chantTextCounts[text] || 0) + 1;
  G._skeletonCounts[sk] = (G._skeletonCounts[sk] || 0) + 1;
  cards.forEach(c => { if (c.pos !== 'punctuation') G._usedWords.add(c.word); });
  G._prevContentWords = contentWordsOf(cards);
}

// Which of the previous sentence's content words this sentence carries on.
export function continuityLinks(cards) {
  const prev = G._prevContentWords;
  if (!prev || !prev.length) return [];
  const cur = new Set((cards || []).filter(c => c.pos !== 'punctuation').map(c => c.word));
  return prev.filter(w => cur.has(w));
}

export const textRepeatCount = (cards) =>
  (G._chantTextCounts || {})[sentenceText(cards)] || 0;

export const skeletonRepeatCount = (cards) =>
  (G._skeletonCounts || {})[sentenceSkeleton(cards)] || 0;

// Words in `cards` never chanted this combat. Returns [] before the first
// chant — the first sentence has no baseline to be "novel" against.
export function newWordsIn(cards) {
  const used = G._usedWords;
  if (!used || used.size === 0) return [];
  return [...new Set((cards || []).filter(c => c.pos !== 'punctuation').map(c => c.word))]
    .filter(w => !used.has(w));
}
