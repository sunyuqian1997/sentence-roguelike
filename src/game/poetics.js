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
  {
    id: 'laughter_pause',
    test: /欢笑|大笑|哈哈|沉溺|暂停|深度思考/,
    targetTags: ['scholar','celestial','word','ghost','spirit','paper','ink','fragment','mirror','wind','dark','human'],
    label: '😄 沉溺欢笑',
    flavor: '笑到忘记招式：暂停深度思考',
    effect: { stunChance: 1.0, weak: 1, bonusDmgPct: 0.2 },
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

// ---------- PREDICATE / PUN DETECTION ----------
// Detect "A 是 B" patterns where B has a `pun` field.
// A can be: enemy-target card, subject card (我 OK), 我-fixed card.
// Returns array of { targetIdx: <enemy index> | 'self', pun: <pun obj>, label, flavor, srcCard }.
// Only returns when there's a copula connector (是/为) AND a punned card adjacent (after).
const isSubjectish = (c) =>
  !!(c && (c._isEnemyTarget || c._isSelfTarget || c._isFixedWo || c.pos === 'subject'));

const isMeCard = (c) =>
  !!(c && (c._isSelfTarget || c._isFixedWo || (c.pos === 'subject' && c.word === '我')));

// ---------- IDENTITY TRAITS (Baba-is-you style "A 是 B") ----------
// When B is an identity word (subject card / enemy name), the copula rewrites
// who A *is*. Direction decides flavor:
//   enemy 是 X → X's enemyEffect debuffs that enemy ("纸鬼是猫" = 爪软犯困)
//   我 是 X   → X's selfEffect buffs the player   ("我是影子" = 身形飘忽)
//   X 是 我   → claiming an identity = self-buff   ("皇帝是我" = 黄袍加身)
//   敌 是 我  → FORBIDDEN (僭越) — invalid, scored as a penalty
//   我 是 我  → tautology, tiny poetry nod
// Effect fields are declarative; combat.js#applyEffects interprets them.
//   enemyEffect: { weak, vulnerable, strengthDelta, stunChance }
//   selfEffect:  { block, heal, draw, strength, vulnerable, poeticAuraNext }
export const IDENTITY_TRAITS = {
  '猫': {
    emoji: '🐱',
    enemyLabel: '变成猫：爪软犯困', enemyEffect: { weak: 2, stunChance: 0.3 },
    selfLabel: '猫步轻盈：挡4抽1', selfEffect: { block: 4, draw: 1 },
  },
  '影子': {
    emoji: '🌑',
    enemyLabel: '化为影：虚而易穿', enemyEffect: { vulnerable: 2, strengthDelta: -1 },
    selfLabel: '身形飘忽：挡6', selfEffect: { block: 6 },
  },
  '无名者': {
    emoji: '👤',
    enemyLabel: '失其名：迷茫弱化', enemyEffect: { weak: 1, stunChance: 0.5 },
    selfLabel: '无名之力：抽2', selfEffect: { draw: 2 },
  },
  '李清照': {
    emoji: '📜',
    enemyLabel: '文气压制：弱2', enemyEffect: { weak: 2 },
    selfLabel: '词魂附体：回3+下回合诗意', selfEffect: { heal: 3, poeticAuraNext: true },
  },
  '皇帝': {
    emoji: '👑',
    enemyLabel: '僭越遭谴：易伤2', enemyEffect: { vulnerable: 2 },
    selfLabel: '黄袍加身：力+2', selfEffect: { strength: 2 },
  },
  '初音未来': {
    emoji: '🎤',
    enemyLabel: '被迫打call：跳过回合', enemyEffect: { stunChance: 1.0 },
    selfLabel: '元气满满：回5', selfEffect: { heal: 5 },
  },
  '剑客': {
    emoji: '🗡️',
    enemyLabel: '缴械：力-2', enemyEffect: { strengthDelta: -2 },
    selfLabel: '剑心通明：力+2', selfEffect: { strength: 2 },
  },
  '书生': {
    emoji: '📚',
    enemyLabel: '手无缚鸡之力：弱2', enemyEffect: { weak: 2 },
    selfLabel: '书生献策：抽2', selfEffect: { draw: 2 },
  },
  '月兔': {
    emoji: '🐰',
    enemyLabel: '怯懦：弱1易伤1', enemyEffect: { weak: 1, vulnerable: 1 },
    selfLabel: '月兔祝福：回4', selfEffect: { heal: 4 },
  },
  '僧人': {
    emoji: '🙏',
    enemyLabel: '顿悟放下：力-1弱1', enemyEffect: { weak: 1, strengthDelta: -1 },
    selfLabel: '禅定：回4', selfEffect: { heal: 4 },
  },
};

// Fallbacks: any subject word still means something ("各种语义组合必须有意义")
export const DEFAULT_IDENTITY_TRAIT = {
  emoji: '❓',
  enemyLabel: '身份错乱：弱1易伤1', enemyEffect: { weak: 1, vulnerable: 1 },
  selfLabel: '自我重塑：回3', selfEffect: { heal: 3 },
};
// B is an enemy's name ("我是纸鬼" — becoming the monster)
export const MIMIC_IDENTITY_TRAIT = {
  emoji: '👻',
  enemyLabel: '认贼作父：弱1易伤1', enemyEffect: { weak: 1, vulnerable: 1 },
  selfLabel: '化形入魔：力+2但易伤1', selfEffect: { strength: 2, vulnerable: 1 },
};

export function resolveIdentityTrait(word, isEnemyName) {
  if (IDENTITY_TRAITS[word]) return IDENTITY_TRAITS[word];
  return isEnemyName ? MIMIC_IDENTITY_TRAIT : DEFAULT_IDENTITY_TRAIT;
}

// Detect "A 是 B" clauses. Returns records of:
//   { kind: 'pun'|'identity'|'forbidden'|'tautology',
//     target: 'enemy'|'self'|'broadcast',
//     subjectKind, subjectEnemyIdx, subjectWord,
//     srcWord, copulaWord,
//     pun?,                      // kind === 'pun'
//     identityWord?, identityIsEnemyName? }  // kind === 'identity'
export function detectPredicates(cards) {
  const results = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!c || !c.copulaConn) continue;

    // Predicate (B): first meaningful card after the copula. Modifiers and
    // exclamations may sit in between ("A 是 很 给"); a comma ends the clause.
    let predIdx = -1;
    let predType = null; // 'pun' | 'me' | 'subject' | 'enemyName'
    for (let j = i + 1; j < cards.length; j++) {
      const pc = cards[j];
      if (!pc) continue;
      if (pc.pos === 'punctuation') {
        if (pc.punctType === 'comma') break;
        continue;
      }
      if (pc.pun) { predIdx = j; predType = 'pun'; break; }
      if (isMeCard(pc)) { predIdx = j; predType = 'me'; break; }
      if (pc._isEnemyTarget) { predIdx = j; predType = 'enemyName'; break; }
      if (pc.pos === 'subject') { predIdx = j; predType = 'subject'; break; }
      if (pc.pos === 'modifier' || pc.pos === 'exclamation') continue;
      break;
    }
    if (predIdx < 0) continue;
    const pred = cards[predIdx];

    // Subject (A): nearest subject-ish card before the copula.
    let head = -1;
    for (let k = i - 1; k >= 0; k--) {
      if (isSubjectish(cards[k])) { head = k; break; }
    }
    if (head < 0) continue;
    const sc = cards[head];
    let subjectKind, subjectEnemyIdx = -1;
    if (sc._isEnemyTarget) { subjectKind = 'enemy'; subjectEnemyIdx = sc._enemyIdx; }
    else if (isMeCard(sc)) subjectKind = 'self';
    else subjectKind = 'subject';

    // For display, take the full contiguous subject phrase ("皇帝你儿子"),
    // not just the head word ("儿子").
    let start = head;
    while (start > 0 && isSubjectish(cards[start - 1])) start--;
    const subjectWord = cards.slice(start, head + 1).map(x => x.word).join('');

    const base = {
      subjectKind, subjectEnemyIdx, subjectWord,
      srcWord: pred.word, copulaWord: c.word,
    };

    if (predType === 'pun') {
      const target = subjectKind === 'enemy' ? 'enemy' : subjectKind === 'self' ? 'self' : 'broadcast';
      results.push({ ...base, kind: 'pun', target, pun: pred.pun });
    } else if (predType === 'me') {
      if (subjectKind === 'enemy') {
        results.push({ ...base, kind: 'forbidden', target: 'enemy' });
      } else if (subjectKind === 'self') {
        results.push({ ...base, kind: 'tautology', target: 'self' });
      } else {
        // "皇帝是我" — claiming an identity buffs the player with A's trait
        results.push({
          ...base, kind: 'identity', target: 'self',
          identityWord: subjectWord, identityIsEnemyName: false,
        });
      }
    } else {
      // B is a subject card or an enemy name → identity rewrite
      const target = subjectKind === 'enemy' ? 'enemy' : subjectKind === 'self' ? 'self' : 'broadcast';
      results.push({
        ...base, kind: 'identity', target,
        identityWord: pred.word,
        identityIsEnemyName: predType === 'enemyName',
      });
    }
  }
  return results;
}

// ---------- STATUS DEFINITIONS ----------
// What each pun tag does on application + pair-interaction it triggers between enemies.
export const PUN_STATUS = {
  gay: {
    label: '🌈 魅惑',
    onApply(e) { /* applied via _puns array */ },
    // When 2+ enemies share this tag, they cuddle: both skip attack
    pairEffect(enemies) {
      enemies.forEach(e => { e.stunned = true; e._gayCuddle = true; });
      return { msg: '🌈 一对纸鬼互相魅惑！双方跳过攻击' };
    },
  },
  numb: {
    label: '😶 麻木',
    // Numb enemies take 50% reduced damage but can't apply debuffs themselves
    pairEffect(enemies) {
      enemies.forEach(e => { e.weak = (e.weak || 0) + 2; });
      return { msg: '😶 麻木集体感染 → 全员虚弱2' };
    },
  },
  doomed: {
    label: '💀 寄了',
    // Doomed enemies take +50% damage; if all enemies doomed → 30% instant kill chance
    pairEffect(enemies) {
      enemies.forEach(e => { e.vulnerable = (e.vulnerable || 0) + 3; });
      return { msg: '💀 集体寄了 → 全员易伤3' };
    },
  },
  fleeing: {
    label: '🏃 溜了',
    // Fleeing enemies have a chance to skip turn; if 2+ → they flee together (50% chance miss)
    pairEffect(enemies) {
      enemies.forEach(e => { if (Math.random() < 0.5) e.stunned = true; });
      return { msg: '🏃 互相裹挟逃跑 → 各自50%跳过' };
    },
  },
  lying: {
    label: '🛌 躺平',
    // Lying enemies skip attacks
    pairEffect(enemies) {
      enemies.forEach(e => { e.stunned = true; });
      return { msg: '🛌 集体躺平 → 全员跳过攻击' };
    },
  },
  juan: {
    label: '🌀 内卷',
    // Juan enemies attack each other (self-damage)
    pairEffect(enemies) {
      const dmg = 6;
      enemies.forEach(e => { e.hp = Math.max(0, e.hp - dmg); });
      return { msg: '🌀 内卷互殴 → 各自-' + dmg + 'HP' };
    },
  },
  sad: {
    label: '😞 emo',
    // Sad enemies don't attack but heal each other (mixed effect)
    pairEffect(enemies) {
      enemies.forEach(e => { e.stunned = true; });
      return { msg: '😞 集体emo → 全员跳过' };
    },
  },
  old: {
    label: '👴 衰老',
    pairEffect(enemies) {
      enemies.forEach(e => { e.weak = (e.weak || 0) + 3; if (e.strength) e.strength = Math.max(0, e.strength - 2); });
      return { msg: '👴 老态龙钟 → 全员弱3，力量-2' };
    },
  },
  daylight: {
    label: '☀️ 日光',
    pairEffect(enemies) {
      // Sunlight burns ghosts: deal 4 to anyone with ghost/dark tag among the group
      let burned = 0;
      enemies.forEach(e => {
        const tags = e.tags || [];
        if (tags.includes('ghost') || tags.includes('dark')) {
          e.hp = Math.max(0, e.hp - 4); burned++;
        } else {
          e.vulnerable = (e.vulnerable || 0) + 2;
        }
      });
      return { msg: '☀️ 日光普照 → 鬼/暗系-4，其余易伤2' };
    },
  },
};

// On-apply (single-instance) tweaks. Some pun tags have an immediate effect
// when applied (eg 衰老 should immediately lower strength).
export const PUN_ON_APPLY = {
  old: (e) => { e.weak = (e.weak || 0) + 2; if (e.strength) e.strength = Math.max(0, e.strength - 1); },
  daylight: (e) => { e.vulnerable = (e.vulnerable || 0) + 1; },
};

// Triggers the pair-effect for enemies that share a pun tag.
// Returns array of { msg, tag } describing what fired.
export function processEnemyPuns(enemies) {
  const fired = [];
  const aliveByTag = {};
  enemies.forEach((e, i) => {
    if (!e || e.hp <= 0) return;
    if (!e._puns) return;
    e._puns.forEach(tag => {
      (aliveByTag[tag] ||= []).push(e);
    });
  });
  for (const tag of Object.keys(aliveByTag)) {
    const group = aliveByTag[tag];
    if (group.length < 2) continue;
    const def = PUN_STATUS[tag];
    if (!def || !def.pairEffect) continue;
    const r = def.pairEffect(group);
    if (r && r.msg) fired.push({ msg: r.msg, tag });
  }
  return fired;
}
