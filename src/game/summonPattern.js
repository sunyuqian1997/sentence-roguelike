export const KNOWN_SUMMON_NAMES = Object.freeze([
  '初音未来', '李清照', '猫', '僧人', '女侠', '剑客', '酒仙', '月兔', '狐仙', '书生',
]);

const KNOWN = new Set(KNOWN_SUMMON_NAMES);

// Pure recognition kept separate from summon effects, so validity checks and
// tests never import the combat runtime through summons.js.
export function detectSummonPattern(cards = []) {
  const hasVerb = cards.some(c => c.pos === 'verb');
  if (hasVerb) return null;
  const hasExclamation = cards.some(c => c.pos === 'exclamation');
  const hasComma = cards.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  const subjects = cards.filter(c => c.pos === 'subject' && c.word !== '我');
  if (!hasExclamation || !hasComma || subjects.length === 0) return null;
  const summonName = subjects[0].word;
  if (!KNOWN.has(summonName)) return null;
  return {
    summonName,
    exclamationCards: cards.filter(c => c.pos === 'exclamation'),
    text: cards.map(c => c.word).join(''),
  };
}
