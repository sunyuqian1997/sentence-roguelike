# 词灵录 (Sentence Roguelike) — Handoff Document

Status snapshot: 2026-06-12 · Commit head: `cde573c`
Author of original direction: project owner (referred to below as "user")
Author of this handoff: prior dev assistant

---

## 0. 一句话总览

把"造句"做成 Slay-the-Spire 风格的回合制卡牌战斗。每张卡牌是一个汉语词(名/动/形/连/标点/感叹)，玩家把手里的卡组成一句符合语法的中文句子，按"吟诵"结算成攻击/防御/治疗/状态。**核心趣味在于"语法 + 谐音梗 + 网络流行语"驱动的不确定写作体验**，不是优化数值组合的传统 deckbuilder。

---

## 1. 设计理念 (Why this exists)

按重要性排序：

### 1.1 写诗式的玩法体验
- 玩家应该感觉自己在"写诗"，不是在出牌
- 一局结束应留下一组真的能读出来的句子（已实现：`G.sentenceJournal`、`#round-journal` 卷轴、诗册 overlay）
- 5/7 字诗意加成、押韵连击、对仗、主题母题(motif)、长句加成 — 都奖励"读起来像句子"的输出，不奖励纯数值碾压

### 1.2 中文特有的谐音/双关玩法
- 一张卡可以有多种用法：作动词 / 作主语 / 作连词谐音 / …  
  实现：`src/game/meanings.js` 多义系统，UI 用 💡 角标 + 紫色"作动词"caption 提示玩家
- 例："给"默认作动词(挡3+回血3+抽1)，但放在"是/为"后面则变成 connector + 给≈gay 的 pun
- 例："纸鬼是给" → 给纸鬼施加 `gay` tag → 当场上有 2 个 gay 标签敌人时，下一回合互相魅惑跳过攻击
- **本作没有"对错"，只有"识别出来 vs 没识别"**：句子语义不一定通顺，能让引擎/玩家会心一笑就给分

### 1.3 中国网络/古诗双轨语料
卡牌词库覆盖两种气质，同一副牌里混着用：
- **古诗意象**：山/海/明月/灰烬/影子/骨/无名者…
- **网络梗/网络生活**：内卷/躺平/摆烂/麻了/666/卧槽/给/老/日/皇帝你儿子是给…
- 起始牌组 38 张包含两类各半，新增 motif 时建议同时考虑两类语境

### 1.4 视觉直接反应玩家在做什么
- 造句区上方一对 SVG 棍人（玩家 vs 敌人）随句子姿态切换
  - 句子里有"斩/锤/砍" + enemy target → 玩家 attack pose，敌人 hit pose
  - 句子里有"守/挡/沉" → 玩家 defend pose
  - 触发 pun → 敌人立刻进入 charmed❤️ / doomed💀 / old👴 / lying / dazed 等
  - 触发 motif (笑/欢笑/沉溺/暂停/深度思考) → 敌人 dazed 😂
- 吟诵和敌人行动时棍人有 1 秒"冲过去打"的动作序列
- **关键约束**：组句过程中频繁出牌不能让 UI 闪烁 — 棍人姿态切换通过 `data-pose` 属性 + CSS transition，不重建 DOM

### 1.5 移动端优先 + 立绘个性
- 必须在 iPhone (375×812) 横屏可玩，所有按钮和手牌可见
- 左右两侧分别放玩家立绘 PNG 和敌人卡片栏 (敌方目前无立绘，只立卡)
- 玩家立绘从屏幕顶端开始 (角色感强，无 frame 包框)
- 配色 **淡蓝主调** (`--paper: #EAF1F7`)，文字水墨写意

---

## 2. 当前已实现的功能 (What works today)

### 2.1 基础战斗 (从原版继承)
- 28+10 张起始牌组，3 章节 roguelike 地图，敌人/精英/Boss/休息/事件/商店节点
- 卡牌词性：subject / verb / object / modifier / connector / punctuation / exclamation / special
- 文银货币 + 文气 meta 货币 + 文渊阁 perk 系统
- 评估流水线：grammar mult × literary mult × punctuation mult × exclamation position penalty → 决定 damage/block/heal/draw

### 2.2 主题母题 motif 系统
文件 `src/game/poetics.js`  
特定关键词命中带特定 tag 的敌人时给额外效果：
- 纸鬼沉海 (paper + 沉/淹/落水): 浸湿 + 易伤2 + 扒挡 + 伤害+50%
- 焚纸、撕裂、风散、墨化、镜破、驱魂、日光、折辱、沉溺欢笑 (笑停)
- 敌人 `tags: ['paper','ghost','ink','scholar', ...]` 在 `src/data/enemies.js`

### 2.3 押韵奖励
粗略普通话韵母分组表（a/e/i/u/ai/ei/ao/ou/an/en/ang/eng/ong/ing/ian/un/uo），尾字与上一句同韵：
- 单押 +0.4，连押×2 +0.6，连押×3 +0.8
- 战斗起算清零，整局诗册保留

### 2.4 谐音/双关 pun 系统
`src/game/poetics.js#detectPredicates`  
识别 `A 是 B` 结构（是/为 = `copulaConn: true`），给主语施加 B 卡的 pun tag。

10 种 pun tag + 联动 (pairEffect)：
| tag | label | 单实例 | 2 + 敌人共享时联动 |
|---|---|---|---|
| gay | 🌈 魅惑 | — | 互相魅惑双方跳过攻击 |
| numb | 😶 麻木 | — | 全员弱2 |
| doomed | 💀 寄了 | — | 全员易伤3 |
| fleeing | 🏃 溜了 | — | 各自 50% 跳过 |
| lying | 🛌 躺平 | — | 全员跳过攻击 |
| juan | 🌀 内卷 | — | 各自-6HP 互殴 |
| sad | 😞 emo | — | 全员跳过 |
| old | 👴 衰老 | 弱+2, 力-1 | 全员弱3, 力-2 |
| daylight | ☀️ 日光 | 易伤+1 | 鬼/暗-4HP, 其余易伤2 |

判定逻辑：
- 主语是敌人 (enemy-target) → 仅作用该敌人
- 主语是"我"(self) → 玩家自陈 (目前只做视觉，未给玩家加 buff)
- 主语是普通名词 (subject) → 广播全场敌人 (如"皇帝你儿子是给")

### 2.5 多义卡框架
`src/game/meanings.js`  
卡牌 schema 可加 `meanings: [Meaning]`，evaluator 在 `evaluateSentence` 入口处先 `applyMeaningsToSentence` 一遍。

```js
// Meaning shape
{
  id: 'gei_pun',
  label: '谐音·gay',
  emoji: '🌈',
  pos: 'connector',           // 覆盖默认 pos
  priority: 10,                // 多义同时命中时取最高
  when: {                      // 任一条件匹配即触发
    afterCopulaWithin: 3,      // 在 是/为 后 N 张内
    prevSubjectOrEnemy: true,  // 前面有主语/敌人卡
    prevVerb: true,            // 前面有动词
    nearText: /.../,           // 句子原文正则
    custom: (ctx) => bool,     // 自定义函数 (JS 模块用)
    notAfterCopula: true,      // 硬排除：不在 是/为 之后
  },
  patch: { combatType: 'attack', basePower: 6 },  // 覆盖卡字段
  pun: { tag: 'gay', label: '🌈 魅惑', flavor: '给≈gay' }
}
```

已加多义示范：给 (verb / gay-pun) · 日 (subject / verb / daylight-pun) · 老 (modifier / 副词加成 / 衰老-pun)

UI: 卡片左上 💡 角标呼吸动画；造句区每张卡下方 caption "作动词·日" / "🌈 谐音·gay" / "⚪ 默认用法"；命中非默认 meaning 时卡片紫边 + caption 发光

### 2.6 造句区棍人剧场 (Puppet Stage)
DOM 见 `index.html` `#puppet-stage`，逻辑见 `src/ui/render.js`：
- `updatePuppets(G.sentence)` — 每次 renderCombat 调用，根据当前句子内容只修改 `[data-pose]` 属性，CSS 自动过渡
- `playChantPuppetAnim(effects)` — 吟诵时玩家滑 +80px 攻击/防御/治疗 → 720ms 滑回
- `playEnemyPuppetAnim(intent, opts)` — 敌人 act 时镜像版本：敌人滑 -80px → 玩家 hit/dazed

12 种姿态: idle / attack / defend / heal / targeted / hit / charmed / doomed / old / juan / lying / dazed
所有姿态通过 CSS `.puppet[data-pose="..."]` 选择器 + transition 实现，加单个标点不闪。

### 2.7 输入 / 操作交互
- 点击手牌入造句区，有 FLIP 动画从原位置滑到目标位置 (280ms)
- 造句区卡片可拖拽重排序 (HTML5 drag-and-drop，竖线指示插入位)
- 点击造句区卡片移除
- 点击立绘下方"我"卡选自身为目标
- 点击右侧敌人卡选敌人为目标
- 吟诵按钮 → chantSentence，结束按钮 → endPlayerTurn

### 2.8 持久化与诗册
- `G.combatJournal`: 本场战斗已吟诵的句子，战斗开始清零，造句区上方常驻"本场诗册"卷轴展示
- `G.sentenceJournal`: 整局累积，诗册 overlay 完整列表，死亡 / 胜利屏汇总
- `G.rhymeStreak`, `G.lastRhymeKey`: 押韵连击追踪
- localStorage 持久化 META: 文气、解锁牌、解锁卡包、perks

---

## 3. 项目结构

```
sentence-roguelike/
├─ index.html                  # 所有 screen DOM；战斗布局 = combat-arena (左立绘 | 中央 | 右敌人)
├─ vite.config.js / package.json / vercel.json
├─ public/
│  ├─ lqz.png                  # 玩家立绘 (李清照)
│  ├─ zhihui.png               # 纸鬼立绘 (filename mismatch: ENEMY_DEFS[zhigui].portrait = '/zhihui.png')
│  └─ canjuguai.png            # 残句怪立绘
├─ src/
│  ├─ main.js                  # 入口；暴露 window.G / window.__renderCombat / window.__startCombat 用于调试
│  ├─ cheats.js                # ?cheat=1 URL param + 反引号热键 + 控制台命令
│  ├─ i18n.js                  # zh/en 双语
│  ├─ utils.js                 # showFloatingText, shuffleArray, getPosColor
│  ├─ data/
│  │  ├─ cards.json            # 所有卡牌定义 (源数据)
│  │  ├─ cards.js              # 加载 cards.json 并 wrap WORD_DEFS + createStarterDeck + randomCardWeighted
│  │  ├─ enemies.js            # ENEMY_DEFS = { [id]: { name, hp, act, type, emoji, portrait?, tags, ai, act_fn } }
│  │  ├─ events.js / packs.js / story.json
│  ├─ game/
│  │  ├─ state.js              # const G = { ... }  全局状态对象
│  │  ├─ combat.js             # startGame, startCombat, startPlayerTurn, addToSentence,
│  │  │                        # chantSentence, applyEffects, enemyTurn, combatVictory, showRewardScreen
│  │  ├─ sentence.js           # evaluateSentence, normalizeSentence, checkWordOrder,
│  │  │                        # checkExclamationPosition, detectDuizhang, detectSummon, SUMMON_EFFECTS
│  │  ├─ poetics.js            # MOTIFS, detectMotifs, getRhymeKey, checkRhyme,
│  │  │                        # detectPredicates, PUN_STATUS, PUN_ON_APPLY, processEnemyPuns
│  │  ├─ meanings.js           # resolveMeaning(card, sentence, idx) + applyMeaningPatch
│  │  ├─ damage.js             # dealDamageToEnemy, dealDamageToPlayer, checkEnemies
│  │  ├─ audio.js              # WebAudio 程序合成音效
│  │  └─ map.js                # generateMap, renderMap, getRandomEnemies
│  ├─ ui/
│  │  ├─ render.js             # renderCombat 主循环；createCardElement, createSentenceWordEl;
│  │  │                        # updatePuppets, playChantPuppetAnim, playEnemyPuppetAnim,
│  │  │                        # renderRoundJournal, renderEnemies, renderHand, showTooltip
│  │  ├─ screens.js            # 非战斗屏：rest, event, shop, deck overlay, journal overlay, meta
│  │  ├─ vfx.js                # VFX.shake, damageNum, inkRipple, brushStrike, ...
│  │  ├─ svgArt.js             # getEnemyPortraitSVG (后备 emoji)
│  │  ├─ storyOverlay.js       # 章节剧情对话框
│  │  └─ inkShader.js          # WebGL 水墨背景
│  └─ styles/
│     ├─ variables.css         # 颜色/字号/缓动 CSS 变量
│     ├─ base.css              # reset + body
│     ├─ components.css        # 卡牌/按钮/敌人卡/诗册/puppet (主要 CSS)
│     ├─ screens.css           # 战斗 arena 布局 + 立绘 rail + map + reward 屏
│     ├─ overlays.css          # 评分弹层/词库/诗册 overlay
│     ├─ animations.css        # @keyframes
│     ├─ responsive.css        # 768/600/400 三个断点
│     └─ index.css             # @import 入口
└─ HANDOFF.md                  # 本文件
```

---

## 4. 数据结构速查

### 4.1 G (全局状态, `src/game/state.js`)
```js
{
  hp, maxHp, gold, act,
  deck, drawPile, discardPile, exhaustPile, hand,
  energy, maxEnergy, block,
  strength, vulnerable, weak,
  map, currentRow, currentNodeIndex,
  enemies, turn, combatRewards,
  floorsCleared, elitesKilled, bossesKilled, sentencesChanted,
  sentence: [],            // 当前正在写的句子
  enemyTargets: [],
  allCardsCostZero, poeticAura, poeticAuraNext,
  shopInventory, drawLessNextTurn,
  sentenceJournal: [],     // 整局已吟诵句子
  combatJournal: [],       // 本场已吟诵句子
  lastRhymeKey, rhymeStreak,
  _puns: [],               // 玩家自陈的 pun tags (目前未消费)
}
```

### 4.2 卡牌 (`cards.json` schema)
```js
{
  word: '给',
  pos: 'verb' | 'subject' | 'object' | 'modifier' | 'connector' | 'punctuation' | 'exclamation' | 'special',
  cost: 1,
  rarity: 'starter' | 'common' | 'uncommon' | 'rare',
  desc: '描述 (可含 {power} 模板)',
  flavor: '...',
  combatType: 'attack' | 'defense' | 'heal' | 'buff' | 'special',
  basePower: 3, upgPower: 5,
  // 加成相关
  powerBonus, bonusType, poetryBonus, poetryBonusMod, poeticMultVerb,
  hits, aoe, ignoreBlock, draw, excMult, excType, excDraw, excHeal,
  multiTarget, grammarBonus, ...
  // 主语/连词专属字段太多，详见 sentence.js 评估代码
  // 特殊 verb behaviors: moyuSpecial, bailanSpecial, liuleSpecial, sleepSpecial, ...
  // pun 系统
  pun: { tag, label, flavor },
  meanings: [Meaning],
  // 谐音连词
  copulaConn: true,        // 是/为
  // i18n
  en: { word, desc },
  // 解锁
  unlockable: true, pack: 'caodong',
}
```

### 4.3 敌人 (`enemies.js`)
```js
{
  id, name, hp, maxHp,         // maxHp 在 startCombat 时从 hp 设置
  act: 1|2|3, type: 'normal'|'elite'|'boss',
  emoji, portrait: '/xxx.png',
  tags: ['paper','ghost', ...],     // 决定 motif 命中
  ai(e) { e.nextIntent = {...} },   // 每回合开始调用，设定下回合意图
  act_fn(e) { ... },                // 实际执行 nextIntent
  // 运行时字段 (战斗中):
  block, strength, vulnerable, weak, stunned, reflecting,
  nextIntent: { type:'attack'|'defend'|'buff'|'debuff'|'special',
                value, hits?, icon, label? },
  poison: { dmg, turns },
  _puns: ['gay'],            // 由谐音系统施加
  _soaked, _stunNext,
  element: <DOM>,            // 渲染后挂上来给 floating text 用
  tc: 0,                     // turn counter, 由 ai 自己维护
}
```

### 4.4 句子评估返回值 (`evaluateSentence(rawCards)`)
```js
{
  text: '我斩纸鬼',
  grammarMult, grammarNotes: ['✓ 有谓语','主+谓+宾 ×1.0',...],
  literaryMult, literaryNotes: ['五言诗意 ×1.3！','🎵 押韵 +0.4','🌈 魅惑：纸鬼是给',...],
  punctMult, punctNotes: ['感叹号「！」爆发 ×1.3', '✓ 完美对仗 ×2.0',...],
  excNotes, excAttackMult, excDefenseMult, excHealMult,
  totalMult,                              // = grammar × literary × punct × excPosPenalty
  effects: {
    damage, block, heal, strengthGain, draw,
    aoe, applyVuln, applyWeak,
    selfHarm, selfHarmDmg, selfHarmBuff,
    targetEnemyIdx, multiTargetIndices, ignoreBlock,
    goldGain, thorns, drawLessNext,
    _motifTriggers: [{ motif, enemyIdx: [...] }],
    _rhymeInfo: { rhymes, key, prevKey, streak },
    _predicates: [{ subjectKind:'enemy'|'self'|'subject', subjectEnemyIdx, subjectWord, pun, srcWord, copulaWord }],
    _poetryLevel: 1.8,                     // = literaryMult 的拷贝, 用于高诗意攻击回血
    // 其他特殊字段太多, 详见 sentence.js 评估末尾
  },
  cards,                                   // 标准化后的卡列表
  duizhangResult: { matched, type, multiplier, label }
}
```

---

## 5. 主流程 (一回合)

1. `startPlayerTurn()` (combat.js)
   - 回合数+1，能量重置，block 清零
   - drawCards(5 或 6 含 perk)
   - `guaranteePunctuation()`, `guaranteeVerb()`, `guaranteeCopula()` 保证手里至少有标点/动词/系动词
   - renderCombat() → updatePuppets() 自动 idle
2. 玩家拖卡入造句区 → `addToSentence(handIndex)`
   - FLIP 动画把手牌克隆飞到造句区
   - renderCombat → renderSentenceSlots 重渲造句区，每张卡 resolveMeaning 显示 caption
   - updatePuppets 根据句子内容自动切姿态
3. 玩家按吟诵 → `chantSentence()`
   - 校验有动词/召唤/宣言 + 能量足够
   - 检测 summon 模式 (感叹+逗号+特定人名) OR 普通 evaluateSentence
   - 把句子文本 push 到 `G.combatJournal` + `G.sentenceJournal`
   - 更新 `G.lastRhymeKey` / `G.rhymeStreak`
   - `playChantPuppetAnim(result.effects)` — 玩家滑去打 (1000ms)
   - `showScoreAnimation(result, callback)` — 评分卡 overlay (1500-2000ms)
   - callback 里 `applyEffects(result.effects)` 实际造成伤害/施加 pun/触发 motif debuff
4. 玩家按结束 → `endPlayerTurn()` → 弃手牌 → setTimeout 300ms → `enemyTurn()`
   - `processEnemyPuns(G.enemies)` 触发 pun 联动 (双 gay 互魅惑等)
   - 每个敌人:
     - poison tick, vulnerable/weak 减1, confused 检查
     - `playEnemyPuppetAnim(enemy.nextIntent, { stunned: enemy.stunned })`
     - 实际 `enemy.act_fn(enemy)` 造成伤害 / 加 block / buff
     - 敌人 `enemy.ai(enemy)` 设定下回合 nextIntent
     - renderCombat
   - 700ms 间隔
5. 所有敌人完 → 等 400ms → `startPlayerTurn()`
6. `dealDamageToEnemy` 在 damage.js 内部检查 enemy.hp<=0 → `checkEnemies()` 触发 `combatVictory` → 战利品屏

---

## 6. 关键 API 速查

```js
// 状态
import { G, META } from './game/state.js';

// 造句
import { addToSentence, removeSentenceWord, chantSentence } from './game/combat.js';

// 评估
import { evaluateSentence, detectDuizhang, detectSummon } from './game/sentence.js';

// 多义
import { resolveMeaning, applyMeaningPatch, applyMeaningsToSentence } from './game/meanings.js';

// 母题 / 押韵 / 谐音
import { detectMotifs, getRhymeKey, checkRhyme, detectPredicates,
         PUN_STATUS, PUN_ON_APPLY, processEnemyPuns } from './game/poetics.js';

// 渲染
import { renderCombat, updatePuppets, playChantPuppetAnim, playEnemyPuppetAnim,
         createCardElement } from './ui/render.js';

// 调试入口 (浏览器 console)
window.G              // 直接读写全局状态
window.__renderCombat()
window.__startCombat([{...window.__ENEMY_DEFS.zhigui}])
window.__ENEMY_DEFS
window.cheat() / window.giveGold(999)
```

---

## 7. 加新东西的步骤

### 7.1 加一张普通卡
1. `src/data/cards.json` 加一项，参考已有 entry 结构
2. 起始牌组要有的话，`src/data/cards.js#createStarterDeck` 加 `tryAdd('xxx')`
3. 想让奖励池抽到，确保 `rarity` 是 common/uncommon/rare 且 `unlockable` 不为 true，或加到对应 pack
4. 如果是特殊 verb 行为 (类似 sleepSpecial)，需要在 `src/game/sentence.js#evaluateSentence` verb 大循环里加 if 分支

### 7.2 加一个新的 pun tag
1. cards.json: 给某张卡加 `pun: { tag: 'newtag', label, flavor }`
2. `src/game/poetics.js#PUN_STATUS` 加一项 `{ label, pairEffect(enemies){...} }`
3. (可选) `PUN_ON_APPLY` 加单实例瞬时效果
4. `src/ui/render.js#updatePuppets` 和 `#playChantPuppetAnim` 的 `punToPose` 字典里加映射，敌人棍人会切对应姿态

### 7.3 给一张卡加多义
1. cards.json: 加 `meanings: [Meaning]` 数组
2. when 条件支持: `afterCopulaWithin`, `prevSubjectOrEnemy`, `prevVerb`, `nearText` (regex source 字符串), `notAfterCopula`
3. 复杂条件需要 JS 函数的，要么改写 `src/game/meanings.js#matchesWhen` 支持新条件类型，要么在 evaluateSentence 里特判
4. 不需要改 UI，💡 角标和 caption 自动出现

### 7.4 加一个 motif
`src/game/poetics.js#MOTIFS` 数组 push 一项：
```js
{
  id: 'my_motif',
  test: /关键词1|关键词2/,
  targetTags: ['paper','ghost'],    // 命中带这些 tag 的敌人才生效
  label: '🔥 标题',
  flavor: '小描述',
  effect: {
    vuln: 2, weak: 2, stripBlock: true, reduceStrength: 1, burn: 3,
    soak: 1, stunChance: 1.0,        // 0..1 概率眩晕
    bonusDmgPct: 0.3                 // literaryMult 直接加这么多
  }
}
```
新效果字段需要在 `src/game/combat.js#applyEffects` 的 `_motifTriggers` 处理段里加分支。

### 7.5 加一个敌人
1. `src/data/enemies.js` 加一项 `xxx: { name, hp, act, type, emoji, portrait?, tags, ai, act_fn }`
2. 准备 PNG 放 `public/xxx.png` (or 任意文件名，写到 portrait 字段)
3. 加入怪物池: enemies 池子在 `src/game/map.js#getRandomEnemies` 按 `act` + `type` 过滤，所以新敌人加好 act/type 就自动入池

### 7.6 给敌人加新的 puppet 反应
- 当前 5 种 intent type: attack / defend / buff / debuff / special — 都在 `src/ui/render.js#playEnemyPuppetAnim` 里
- 想加新的 type 比如 `'summon'` `'curse'`，在 `playEnemyPuppetAnim` 里加分支

---

## 8. 已知问题 / TODO (按优先级)

### 高优先级
1. **多义系统的"撤销"路径不完整** — 现在 `applyMeaningsToSentence` 只在 evaluateSentence 内部走一次，临时构造的 patched 卡 (含 _activeMeaning) 不传出去。UI 单独再调一次 resolveMeaning 来显示 caption 是冗余的、且可能与评估不同步。建议把 active meaning 写到 result.cards 里然后让 UI 读。
2. **detectPredicates 离 copula 最近的主语判定**对"皇帝你儿子是给"取到的是"儿子"作为主语，但实际广播全场 — 这个语义和注释里写的"取最近主语"是矛盾的，应该重写。
3. **puppet stage 的"我"标签和左立绘有视觉重复** — 左侧已有李清照立绘，造句区的小人又写"我"。可能改成 emoji / 角色简化图标更清爽。
4. **敌人 hit 动画与 dealDamageToEnemy 的红色飞字时序不同步** — playEnemyPuppetAnim 在 act_fn 之前就开始，但 dealDamageToPlayer 在 act_fn 内同步触发，两边动画时间没对齐。

### 中优先级
5. **加 LLM 兜底创意识别** — 现在 motif/pun 都是正则/规则匹配，玩家写出"皇帝你儿子是给"会识别，但写"狗皇帝你大儿子是个 gay 比" 就识别不到。可考虑后端 API 接 LLM 判断"句子是否在表达 gay/嘲讽/抒情/…"，给一个 fallback +0.5 倍率。
6. **音效与 puppet 动作没绑定** — 现在 audio.js 的 playSFX 只在固定时机播。puppet impact 时应该一起触发"重锤"音。
7. **敌人 PNG 放大版 (Boss战)** — 目前敌人卡是小卡，Boss 应有更夸张的展示。
8. **横屏适配** — 现在只优化了竖屏，横屏 max-height: 500px 时太挤。

### 低优先级
9. **诗册可分享** — 整局结束时导出"本局诗集" PNG / 文本，让玩家发朋友圈
10. **多人对战** — 灵感来自截图里的"活字乱刷"，类似 SkribblIO，2-6人各出一张卡共建一句话，剩下玩家投票通顺度
11. **英语版评估** — i18n 已经有 en，但 evaluateSentence 是中文 grammar 写的，英语版要重写

---

## 9. 调试 / 开发流程

```bash
npm install
npm run dev       # 开发 server，热重载 http://localhost:5173
npm run build     # 产出 dist/
```

调试时建议：
- URL 加 `?cheat=1` 自动开金币 + 文气，加 `?t=随便填` 绕过 vite 缓存
- 控制台 `window.G` 可以直接改任何状态
- `window.__startCombat([{...window.__ENEMY_DEFS.zhigui}])` 直接进战斗，跳过地图/剧情
- 修改 cards.json 不需要重启 dev，vite HMR 自动重载

截图 / 自动化：
- 用 headless chrome + remote-debugging-port 走 CDP，详见 `/tmp/sentence-roguelike-shots/shot.js` (示例脚本)
- **不要** 直接 `await import()` 然后改模块导出的 G — vite 给每个 module 加 `?t=` cache-bust，dynamic import 拿到的可能是新实例。应该用 `window.G` 操作主线程内的实例。

部署：
- vercel.json 已配置 `framework: vite`，push master 自动部署
- 静态 SPA，不依赖后端

---

## 10. 用户原话摘录 (设计意图)

> 我想让它形成有梗的句子 比如 皇帝你儿子是gay。 gay这部分就应该用 给 这个卡。给这个卡，可以当作gay的谐音，也可以是 给 这个动词。
> 这个系统应该聪明地判断出我们的创造力并且能识别。
> 纸鬼是给 就应该被判定为 A is B, gay这个状态是有含义的（比如 现场有两个纸鬼，就可以互相魅惑，进入魅惑状态，完全停止攻击我）

> 你要设计规则和框架允许一个卡的多种法 而且视觉有相应表现提醒

> 写诗的过程也有相应小人就会直接有相应的变化，我就觉得比较好玩。
> 我能单个一个标点符号行不行？他还在写东。它会频繁地刷新。
> 有点像baba is you

> 敌人打我的时候 也该有相应动态吧 总之各种动作都应该有相应动态

> 沉溺于欢笑，暂停深度思考 这个我也要

> 把日和老加进去 老可以是形容词，也可以是副词 (我老打XXX，老纸鬼 - 应该变虚弱)。 日 你懂吧，可以是主语也可以是动词

---

## 11. 给下一位 AI / 开发者的建议

1. **不要把它做成数值优化游戏**。它的乐趣在玩家"发现自己写出了一句有梗的话"，不在最优 deckbuilding。所有新机制都先想"这能给玩家提供什么写作素材"，再想"数值平衡"。

2. **谐音 / 双关是核心**。每张新加的卡都问一遍：能不能加 pun？能不能加 meanings？哪怕是一个不强的小彩蛋。

3. **视觉表达 ≥ 数值精确**。棍人姿态 / 立绘反应 / 屏幕震屏 / 浮字 — 这些"感觉到了事"比"恰好打 13 点"更重要。

4. **写 commit message 用中文 + 描述意图**。我看到的所有历史 commit 都是这个风格，保持即可。

5. **JSON 文件不要用未转义的中文引号**。`"...是/为..."` 用全角 `「是/为」` 或全文不打引号。否则 build 会炸。

6. **改 cards.json 时多义系统是脚手架**。如果只是想让一张卡多用法，直接加 `meanings: [...]`，不要硬编码到 sentence.js。

7. **`G` 是上帝对象**，所有状态都挂上面。新加状态字段：
   - 加到 `src/game/state.js` 的 G default
   - 在 `startGame` 和 `startCombat` 里看是否需要 reset
   - localStorage 持久化的只能放 META (state.js 顶部)

8. **render.js 已经有点大** (~500 行)。如果要加新的 UI 模块（比如新 overlay），考虑独立文件。

9. **棍人姿态 data-pose 切换不能在动画期间被打断**。所以 `updatePuppets` 检 `dataset.chanting === '1'` 跳过。新加动作时务必保持这个约束。

10. **测试谐音/pun 最快的方式**是浏览器 console 里：
    ```js
    const r = await import('/src/game/sentence.js');
    const c = await import('/src/data/cards.js');
    r.evaluateSentence([{...c.WORD_DEFS.huangdi,id:'a'},{...c.WORD_DEFS.shi_copula,id:'b'},{...c.WORD_DEFS.gei,id:'c'}]).literaryNotes
    ```
    会列出所有命中的 motif / pun / 押韵 / 多义。

---

End of handoff.
