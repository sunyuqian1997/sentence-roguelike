// Facade — 评估器已重构成「语言包(parse→IR) + core(settle)」三段式。
// 本文件保持历史 import 表面稳定:combat.js / render.js / sentence.js 等照常 import,无需改。
//   - evaluateSentence / isWellFormed: 走 eval-core/pipeline(语言无关编排)
//   - 其余 re-export 自 lang/zh/rules(中文规则,供 render.js 预览/screens.js 诗册等直接调)
export { evaluateSentence, isWellFormed } from '../eval-core/pipeline.js';
export { normalizeSentence } from '../../lang/zh/rules/context.js';
export { checkWordOrder } from '../../lang/zh/rules/grammar.js';
export { detectDuizhang } from '../../lang/zh/rules/punctuation.js';
export { checkExclamationPosition } from '../../lang/zh/rules/exclamation.js';
export { QUALITY_RULES } from '../../lang/zh/rules/quality.js';
export { VERB_SPECIALS } from '../../lang/zh/rules/cardEffects.js';
export { CONSTRUCTIONS } from '../../lang/zh/rules/constructions.js';
