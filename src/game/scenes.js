// 场景系统 (P5) — 数据驱动的两张注册表:
//   SCENES  : 地点卡 + 「去」句式(qu_movement)换出的全局场景 buff。
//             literaryBonus/attackBonus 由 quality.js#scene_aura 逐句读取;
//             turnStart(block/draw) 由 combat.js#startPlayerTurn 每回合读取。
//   SCENERY : 句中景物词(明月/椅子…)化作舞台简笔道具(puppets.js#syncScenery),
//             并给小光环(literary 由 scene_aura 同层读;blockPerTurn 走回合)。
// 状态挂在 G 上: G.currentScene { id, name, sinceTurn } — 整场持续直到再换,
// startCombat 置 null;G.sceneryProps [{id,word,turn}] 上限 3,startCombat 清空;
// G.scenesVisited 跨战斗记录(连环画 P6 的原料),startGame 重置。
// 约定:G.currentScene 为空 + G.sceneryProps 为空时,本文件所有查询都是零效果
// (golden 安全网:单句评估在无场景状态下数值零改动)。
import { isEn } from '../i18n.js';

export const SCENES = {
  yuexia: {
    id: 'yuexia', name: '月下', en: 'Moonlight', emoji: '🌙',
    literaryBonus: 0.2,
    auraNote: '🌙 诗意沐月 +0.2',
    auraNoteEn: '🌙 Bathed in moonlight +0.2',
  },
  haibian: {
    id: 'haibian', name: '海边', en: 'Seaside', emoji: '🌊',
    turnStart: { block: 2 },
    turnNote: '🌊 潮声护体 +2🛡',
    turnNoteEn: '🌊 Tide guard +2🛡',
  },
  jiuguan: {
    id: 'jiuguan', name: '酒馆', en: 'Tavern', emoji: '🍶',
    turnStart: { draw: 1 },
    turnNote: '🍶 酒酣耳热 +1牌',
    turnNoteEn: '🍶 Wine-warmed +1 card',
  },
  zhanchang: {
    id: 'zhanchang', name: '战场', en: 'Battlefield', emoji: '⚔️',
    attackBonus: 2,
    auraNote: '⚔️ 杀伐之地 +2伤',
    auraNoteEn: '⚔️ Killing field +2 dmg',
  },
};

export const sceneName = (sc) => (isEn() ? sc.en : sc.name);

// ---- 景物道具 ----
// svg 是简笔画风格(stroke 线稿,参考 puppets.js 的 COACTOR_SVG),摆在舞台
// 两侧/背景位(style 定位),不挡棍人(z-index 0,puppets 在 2)。
const S = 'fill:none;stroke:#3A2F25;stroke-width:2;stroke-linecap:round';

export const SCENERY = {
  moon: {
    id: 'moon', words: ['明月', '月亮'], label: '明月', en: 'Moon', emoji: '🌕',
    aura: { literary: 0.1 },
    note: '🌕 明月在场 +0.1', noteEn: '🌕 Moon on stage +0.1',
    style: 'left:57%;top:5%;width:52px;height:52px;',
    svg: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="30" r="19" style="${S};fill:rgba(217,164,65,0.22)"/>
      <path d="M22,24 Q25,27 22,30" style="${S};stroke-width:1.5"/>
      <path d="M33,33 Q36,36 33,39" style="${S};stroke-width:1.5"/>
    </svg>`,
  },
  chair: {
    id: 'chair', words: ['椅子'], label: '椅子', en: 'Chair', emoji: '🪑',
    aura: { blockPerTurn: 1 },
    note: '🪑 有椅可凭 +1🛡/回合', noteEn: '🪑 Chair to lean on +1🛡/turn',
    style: 'left:20%;bottom:5%;width:44px;height:56px;',
    svg: `<svg viewBox="0 0 50 64" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="6" x2="12" y2="58" style="${S}"/>
      <line x1="12" y1="34" x2="40" y2="34" style="${S}"/>
      <line x1="40" y1="34" x2="40" y2="58" style="${S}"/>
      <line x1="12" y1="10" x2="20" y2="10" style="${S};stroke-width:1.5"/>
      <line x1="17" y1="38" x2="17" y2="58" style="${S};stroke-width:1.5"/>
    </svg>`,
  },
  vine: {
    id: 'vine', words: ['枯藤'], label: '枯藤', en: 'Withered Vine', emoji: '🥀',
    aura: { literary: 0.1 },
    note: '🥀 枯藤缠台 +0.1', noteEn: '🥀 Vine-wreathed +0.1',
    style: 'left:80%;top:0;width:46px;height:64px;',
    svg: `<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg">
      <path d="M25,0 Q15,16 26,28 Q36,40 24,54 Q18,62 26,68" style="${S}"/>
      <path d="M26,28 Q34,26 38,30" style="${S};stroke-width:1.5"/>
      <path d="M24,54 Q16,52 12,56" style="${S};stroke-width:1.5"/>
    </svg>`,
  },
  lantern: {
    id: 'lantern', words: ['灯'], label: '灯', en: 'Lantern', emoji: '🏮',
    aura: { literary: 0.1 },
    note: '🏮 一灯如豆 +0.1', noteEn: '🏮 Lantern glow +0.1',
    style: 'left:9%;top:4%;width:34px;height:52px;',
    svg: `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="0" x2="20" y2="10" style="${S};stroke-width:1.5"/>
      <ellipse cx="20" cy="28" rx="13" ry="17" style="${S};fill:rgba(197,75,60,0.18)"/>
      <line x1="20" y1="12" x2="20" y2="44" style="${S};stroke-width:1.5"/>
      <line x1="16" y1="46" x2="16" y2="56" style="${S};stroke-width:1.5"/>
      <line x1="24" y1="46" x2="24" y2="54" style="${S};stroke-width:1.5"/>
    </svg>`,
  },
  mountain: {
    id: 'mountain', words: ['山'], label: '山', en: 'Mountain', emoji: '⛰️',
    aura: { blockPerTurn: 1 },
    note: '⛰️ 倚山而立 +1🛡/回合', noteEn: '⛰️ Mountain at back +1🛡/turn',
    style: 'left:38%;bottom:3%;width:110px;height:52px;opacity:0.55;',
    svg: `<svg viewBox="0 0 120 56" xmlns="http://www.w3.org/2000/svg">
      <path d="M4,52 L38,10 L58,36 L74,16 L112,52" style="${S}"/>
      <path d="M32,18 L38,24 L44,18" style="${S};stroke-width:1.5"/>
    </svg>`,
  },
  sea: {
    id: 'sea', words: ['海'], label: '海', en: 'Sea', emoji: '🌊',
    aura: { literary: 0.1 },
    note: '🌊 海在台侧 +0.1', noteEn: '🌊 Sea at stage side +0.1',
    style: 'left:30%;bottom:2%;width:130px;height:26px;opacity:0.6;',
    svg: `<svg viewBox="0 0 140 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M4,10 Q18,2 32,10 T60,10 T88,10 T116,10 T136,10" style="${S}"/>
      <path d="M18,20 Q32,12 46,20 T74,20 T102,20 T126,20" style="${S};stroke-width:1.5"/>
    </svg>`,
  },
};

export const MAX_SCENERY = 3;

const SCENERY_BY_WORD = {};
for (const def of Object.values(SCENERY)) {
  for (const w of def.words) SCENERY_BY_WORD[w] = def;
}

export const sceneryByWord = (word) => SCENERY_BY_WORD[word] || null;

// 句中出现的景物词(非敌方目标卡)→ 词列表(按出现序,去重)。quality.js#scenery_detect 用。
export function detectSceneryWords(cards) {
  const out = [];
  for (const c of cards || []) {
    if (!c || c._isEnemyTarget) continue;
    const def = SCENERY_BY_WORD[c.word];
    if (def && !out.includes(c.word)) out.push(c.word);
  }
  return out;
}

// 把景物词并入道具列表:重复(同 id)不叠加,超上限顶掉最老的。纯函数,combat.js 消费。
export function addSceneryWords(props, words, turn) {
  const next = [...(props || [])];
  const added = [];
  for (const w of words || []) {
    const def = SCENERY_BY_WORD[w];
    if (!def) continue;
    if (next.some(p => p.id === def.id)) continue;
    next.push({ id: def.id, word: w, turn: turn || 0 });
    added.push(def);
    while (next.length > MAX_SCENERY) next.shift();
  }
  return { props: next, added };
}

// 场景 + 景物的「每回合开始」效果(海边+2挡/酒馆+1抽/椅子山 blockPerTurn)。
// combat.js#startPlayerTurn 调;返回声明式数值,避免 scenes→combat 循环依赖。
export function sceneTurnStartEffects(currentScene, sceneryProps) {
  const out = { block: 0, draw: 0, notes: [] };
  const sc = currentScene && SCENES[currentScene.id];
  if (sc && sc.turnStart) {
    out.block += sc.turnStart.block || 0;
    out.draw += sc.turnStart.draw || 0;
    out.notes.push(isEn() ? (sc.turnNoteEn || sc.turnNote) : sc.turnNote);
  }
  for (const p of sceneryProps || []) {
    const def = SCENERY[p.id];
    if (def && def.aura && def.aura.blockPerTurn) {
      out.block += def.aura.blockPerTurn;
      out.notes.push(isEn() ? (def.noteEn || def.note) : def.note);
    }
  }
  return out;
}
