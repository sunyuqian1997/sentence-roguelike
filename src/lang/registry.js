// 语言包注册表:按当前语言返回 LanguagePack。
// 加新语言 = 在此注册一个产出同形 IR 的 pack,core 不动。
import { getLang } from '../i18n.js';
import { zhPack } from './zh/index.js';
// import { enPack } from './en/index.js';  // 阶段1 接入

const PACKS = {
  zh: zhPack,
  // en: enPack,
};

export function getLangPack() {
  return PACKS[getLang()] || PACKS.zh;
}
