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
}

export function recordChantCreativity(cards) {
  if (!cards || !cards.length) return;
  if (!G._chantTextCounts) resetCreativity();
  const text = sentenceText(cards);
  const sk = sentenceSkeleton(cards);
  G._chantTextCounts[text] = (G._chantTextCounts[text] || 0) + 1;
  G._skeletonCounts[sk] = (G._skeletonCounts[sk] || 0) + 1;
  cards.forEach(c => { if (c.pos !== 'punctuation') G._usedWords.add(c.word); });
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
