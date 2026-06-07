// Thematic motifs + rhyme detection
// Used by sentence.js to apply theme-debuffs to tagged enemies and grant rhyme bonuses

// ---------- THEMATIC MOTIFS ----------
// Each motif matches keywords in the chanted sentence.
// targetTags: which enemy tags get hit. effect: applied per matching enemy.
// Effect keys: vuln (+vulnerable turns), weak (+weak turns), strength (-strength now),
//   block (-block now), soak (drench: +vuln 2 + strip block), burn (+burn dot), bind (stun if not stunned)
export const MOTIFS = [
  {
    id: 'soak_paper',
    test: /沉海|沉江|入海|入水|淹|沉|溺|落水|泡水|湿|大雨/,
    targetTags: ['paper'],
    label: '📜💧 纸鬼沉海',
    flavor: '纸遇水则烂',
    effect: { soak: 1, vuln: 2, stripBlock: true, bonusDmgPct: 0.5 },
  },
  {
    id: 'burn_paper',
    test: /烧|焚|燃|火|焰|炎|灼/,
    targetTags: ['paper','ghost','word','fragment'],
    label: '🔥 焚纸',
    flavor: '一炬付之',
    effect: { burn: 3, vuln: 1, bonusDmgPct: 0.4 },
  },
  {
    id: 'tear_paper',
    test: /撕|裂|碎|破/,
    targetTags: ['paper','word','fragment'],
    label: '✂️ 撕裂',
    flavor: '寸寸断',
    effect: { vuln: 2, stripBlock: true, bonusDmgPct: 0.3 },
  },
  {
    id: 'wind_disperse',
    test: /风|吹|散|飘|扬/,
    targetTags: ['paper','wind','ghost','spirit'],
    label: '🌬️ 风散',
    flavor: '随风消散',
    effect: { weak: 2, bonusDmgPct: 0.2 },
  },
  {
    id: 'ink_dissolve',
    test: /水|墨|洗|涤|净/,
    targetTags: ['ink'],
    label: '💧 墨化',
    flavor: '墨入清水',
    effect: { vuln: 2, weak: 2, bonusDmgPct: 0.4 },
  },
  {
    id: 'mirror_break',
    test: /碎|裂|破|击/,
    targetTags: ['mirror'],
    label: '💥 镜破',
    flavor: '镜破不复圆',
    effect: { stripBlock: true, vuln: 3, bonusDmgPct: 0.5 },
  },
  {
    id: 'banish_ghost',
    test: /镇|驱|斩|破|散|超度/,
    targetTags: ['ghost','spirit'],
    label: '👻 驱魂',
    flavor: '魂飞魄散',
    effect: { weak: 2, vuln: 2, bonusDmgPct: 0.3 },
  },
  {
    id: 'sunlight_dark',
    test: /光|日|阳|明/,
    targetTags: ['dark','ghost'],
    label: '☀️ 日光',
    flavor: '魑魅惧光',
    effect: { vuln: 2, bonusDmgPct: 0.3 },
  },
  {
    id: 'humble_scholar',
    test: /骂|斥|呸|呵|笑/,
    targetTags: ['scholar','celestial'],
    label: '😤 折辱',
    flavor: '斯文扫地',
    effect: { weak: 2, reduceStrength: 1, bonusDmgPct: 0.2 },
  },
];

// Returns an array of triggered motifs (with the matching enemy indices).
// enemies: G.enemies array.
export function detectMotifs(sentenceText, enemies) {
  const triggered = [];
  for (const m of MOTIFS) {
    if (!m.test.test(sentenceText)) continue;
    const matchIdx = [];
    enemies.forEach((e, i) => {
      if (!e || e.hp <= 0) return;
      const tags = e.tags || [];
      if (m.targetTags.some(t => tags.includes(t))) matchIdx.push(i);
    });
    if (matchIdx.length > 0) {
      triggered.push({ motif: m, enemyIdx: matchIdx });
    }
  }
  return triggered;
}

// ---------- RHYME ----------
// Coarse Mandarin rhyme groups (final + main vowel). Not strict pinyin —
// the goal is "sounds like it rhymes when read aloud", not philological accuracy.
// Each entry maps a single Han character to a rhyme key.
const RHYME_GROUPS = {
  // -a / -ia / -ua
  a: '啊吧爸把妈麻马骂他她它大花家话下夏麻沙萨打卡哈巴吗吧妈呀呐拿啦娃挂瓜画家加价假驾架嘉夸花化滑',
  // -e / -ie / -ue (蛇韵)
  e: '德格客喝乐了么呢色舍这者哲遮车扯歌哥河喝鹅恶饿和合何科可',
  // -i (衣韵, including zhi/chi/shi/ri/zi/ci/si as "ï")
  i: '一衣以已意忆易益亿七西气起齐其奇期理力丽利里立例你尼泥逆迷米密蜜技几纪计记济寄替体提题题谁是事时十时持知之直只指志智字此次思死师诗史使始事示士市世式视试饰',
  // -u (呜韵)
  u: '不步部布父父母目木目都读独度毒度肚怒努路鲁卢露虎户互护户图涂土吐塗书输熟猪住助主珠柱注组祖足族苦哭酷库',
  // -ü (鱼韵)
  v: '鱼语雨女予余于雩雩雩遇玉欲虚需须许去趣取曲屈居举句具据距聚续蓄须叙绪',
  // -ai (开韵)
  ai: '爱哀挨百白拜败排牌派来赖蓝才材财采菜在再载灾该改盖海开凯',
  // -ei (灰韵)
  ei: '北背杯被悲飞肥废费给类雷累泪美没每妹内贼追醉嘴',
  // -ao (豪韵)
  ao: '保宝抱报暴包饱草操好号毛貌闹脑高告搞郊交叫骄教觉笑小晓孝校',
  // -ou (尤韵)
  ou: '不否走奏头投透收手守受售搜某楼漏流留刘留牛留偶口扣后厚候构狗够久旧酒咎九救',
  // -an (寒韵)
  an: '安岸案三山闪扇善单担但旦弹但谈坛炭难看砍抗安暗按办半伴判',
  // -en (痕韵)
  en: '本笨分坟粉份门闷们人忍认任申神慎深生甚什身森审审身',
  // -ang (江韵)
  ang: '长场常唱厂上当党挡荡刚港光逛黄行航将江讲匠帮邦旁忙忘王往望网亡杨阳样让',
  // -eng (庚韵)
  eng: '冯彭朋等灯能成承城诚程登冷僧风丰封峰冰兵冰冰冻冻',
  // -ong (东韵)
  ong: '东冬动同童铜痛通统总从冲虫崇松送宋公共工功红宏鸿洪轰空孔控懂中钟终种重',
  // -ang/eng/ing — separate group for -ing (青韵)
  ing: '丁定听亭停庭萍平瓶兵冰名命明命星行星醒心心心情景京经精境境镜冷',
  // -an/-ian merged into ian-special when needed
  ian: '边变面眠年念千前钱浅天田填见现县线点店电电念见间健剑减简',
  // -un (谆韵)
  un: '昏婚混滚棍论轮文闻问温存村寸',
  // -uo (戈韵)
  uo: '波多罗落作做错过国哥说脱拖躲所',
};

const CHAR_TO_RHYME = {};
for (const key of Object.keys(RHYME_GROUPS)) {
  for (const ch of RHYME_GROUPS[key]) {
    CHAR_TO_RHYME[ch] = key;
  }
}

// Return rhyme key for the LAST character of the sentence (ignoring punctuation).
// Returns null if char unknown.
export function getRhymeKey(sentenceText) {
  if (!sentenceText) return null;
  // strip punctuation/whitespace
  const stripped = sentenceText.replace(/[，。！？；：、\.\!\?\,\s「」『』\"\']/g, '');
  if (!stripped) return null;
  const last = stripped[stripped.length - 1];
  return CHAR_TO_RHYME[last] || null;
}

// Compares current rhyme key with the previous one.
// Returns { rhymes: bool, key, prevKey }
export function checkRhyme(currentKey, prevKey) {
  if (!currentKey || !prevKey) return { rhymes: false, key: currentKey, prevKey };
  return { rhymes: currentKey === prevKey, key: currentKey, prevKey };
}
