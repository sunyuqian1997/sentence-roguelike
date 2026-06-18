// 英文语言包:组装 LanguagePack。
import { parse, isWellFormed } from './parse.js';

export const enPack = {
  lang: 'en',
  isWellFormed,
  parse,
  scoreHooks: [],   // LLM 评委以后作为 async 钩子加入(本版留空,接口预留)。
};
