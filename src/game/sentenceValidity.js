import { getLang } from '../i18n.js';
import { isWellFormed as zhWellFormed } from '../lang/zh/rules/wellformed.js';
import { isWellFormed as enWellFormed } from '../lang/en/wellformed.js';
import { detectSummonPattern } from './summonPattern.js';

// Synchronous and deterministic. The LLM judge may score a valid sentence,
// but never gets authority to turn an invalid fragment into a castable line.
export function getSentenceValidity(cards = []) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return Object.freeze({ ok: false, code: 'empty', reason: '请先放入文字' });
  }

  const summon = detectSummonPattern(cards);
  if (summon) {
    return Object.freeze({ ok: true, code: 'summon', reason: '', summon });
  }

  const result = (getLang() === 'en' ? enWellFormed : zhWellFormed)(cards);
  if (!result.ok) {
    return Object.freeze({
      ok: false,
      code: 'ill_formed',
      reason: result.reason || '句子还没有完成',
    });
  }

  return Object.freeze({ ok: true, code: 'sentence', reason: '' });
}
