// Facade — the evaluator implementation lives in ./evaluator/ (pipeline of
// context → grammar → punctuation → quality rules → exclamations → card
// effects → finalize). Summons live in ./summons.js. This module just keeps
// the historical import surface stable for combat.js / render.js.
export {
  evaluateSentence,
  normalizeSentence,
  checkWordOrder,
  checkExclamationPosition,
  detectDuizhang,
  QUALITY_RULES,
  VERB_SPECIALS,
  isWellFormed,
} from './evaluator/index.js';

export { detectSummon, SUMMON_EFFECTS } from './summons.js';
