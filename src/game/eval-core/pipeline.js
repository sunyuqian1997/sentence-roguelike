// 语言无关的评估管线:取当前语言包 → parse 出 IR → settle 出最终 result。
// 加语言/加诗意钩子都不动这里。
import { getLangPack } from '../../lang/registry.js';
import { settle } from './settle.js';

export function evaluateSentence(rawCards) {
  if (!rawCards || rawCards.length === 0) return null;
  const pack = getLangPack();
  const ir = pack.parse(rawCards);

  // 诗意评分钩子链(同步)。LLM 评委以后作为 async 钩子加入 pack.scoreHooks(本版多为空)。
  for (const hook of pack.scoreHooks) {
    const r = hook(ir, rawCards);
    if (r && r.multiplier) {
      ir.mults.poetic *= r.multiplier;
      ir.poeticScore = ir.mults.poetic;
      if (r.note) ir.notes.poetic.push(r.note);
    }
  }

  return settle(ir);
}

export function isWellFormed(rawCards) {
  return getLangPack().isWellFormed(rawCards || []);
}
