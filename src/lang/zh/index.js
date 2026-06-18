// 中文语言包:组装 LanguagePack。
import { parse, isWellFormed } from './parse.js';

export const zhPack = {
  lang: 'zh',
  isWellFormed,
  parse,
  scoreHooks: [],   // 诗意评分钩子链。LLM 评委以后作为 async 钩子加入此数组(本版留空,接口预留)。
  // cards / ui 由各自模块提供,registry 不强依赖(cards.js 仍直接读 cards.json,过渡期)。
};
