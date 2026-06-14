# 词灵录 (Sentence Roguelike) — Handoff Document

Status snapshot: 2026-06-14 · 大量战斗/语义/UI 重构 · 评估器=`src/game/evaluator/` 规则管线
Author of original direction: project owner (referred to below as "user")
Author of this handoff: Claude (4.7 session) → 交接给新 session

---

## ⭐ 0.5 最新进展与交接重点 (2026-06-14，新 session 先读这里)

这几天围绕"判定合理性 + 视觉沉浸 + UI 可读"做了大量改动。本节是给接手者的全景，
旧章节(§1~§11)仍大体有效但部分细节已被下列改动覆盖，以本节为准。

### A. 已完成的大改 (都已 commit + 截图/单测验证)
1. **评估器管线化**：`evaluateSentence` 拆成 `src/game/evaluator/`：
   context → constructions → grammar → punctuation → quality(规则数组) → exclamation → cardEffects → finalize。
   `sentence.js` 现在是 facade(re-export)。召唤独立成 `summons.js`。
2. **多义唯一所有权**：`meanings.js` 的 `applyMeaningsToSentence` 是评估器和 UI 的共同入口。
3. **Baba 式身份系统**(`poetics.js#detectPredicates` + `IDENTITY_TRAITS`)：
   `A是B` 四种 kind — pun(谐音) / identity(身份赋予) / forbidden(僭越) / tautology(我是我)。
   - 敌是X(猫/影子…) → 敌 debuff；我是X → 我 buff；皇帝是我 → 自我宣称 buff；
   - **敌是我 = forbidden(僭越)**，已做**放卡前置拦截**(combat.js#tryAddCard / wouldBeForbidden)：
     放会构成"敌是我"的卡时直接拒绝 + 敌方弹❌，不让事后才发现无效。
   - **敌是敌**(纸鬼是残句怪) = identity(MIMIC trait，敌借敌属性)，合法。
4. **句式系统(constructions)**：`evaluator/constructions.js` 一等抽象。已实现：
   - `gei_imperative` 给我V祈使("纸鬼给我戳"=敌自伤×1.4穿透，2倍于"我戳纸鬼")
   - `rang_jianyu` 让/叫 NP V 兼语
5. **独立个体主语(co-actor)**：非"我"具名主语(猫/影子/初音/无名者…)在"X斩敌"这类
   攻击句里作为**独立施动者**额外出手(自带武力值的独立攻击实例)，不再只给"我"堆数值。
   - 关键修复：`isCopulaPredicate`(poetics.js) 排除"我是影子"里作为身份谓语B的主语
     ——"影子斩敌"(施动)才出场，"我是影子"(属性)不出场。context/cardEffects/puppets 三处统一用。
   - **棍人剧场体现**(puppets.js)：组句时该角色的**待命小人立即站位**(syncStandbyCoActors)，
     吟诵时冲向敌人执行(playCoActors)——给即时组句反馈。
6. **"敌为主语"语义**(evaluator/index.js finalize)：动词前=施事、动词后=受事。
   "纸鬼碎我"=敌打我(伤害落玩家、无+2力补偿)；"我斩我"=自虐换+2力。
7. **结算日志系统**(`chantLog.js` + vite 中间件)：每次吟诵记录完整快照(句子/卡序列含
   激活多义/三分倍率/命中规则/句式/谓词/母题/effects/敌人快照)，**POST 到 dev server 落盘
   `chantlog.ndjson`**(localStorage 跨浏览器 profile 读不到，所以用文件)。
   控制台 `__chantLog()`/`__exportLog()`/`__clearLog()`/`__getLog()`。
8. **整屏 UI 重构**(设计 agent 方案)：删左右边栏 → 纵向四段
   顶栏 / 战斗舞台(左立绘|中央放大棍人对峙|右敌人) / 造句坞 / 手牌。
   配色墨蓝灰三档(#1E2530/#2A3340/#F2EAD8)+青瓷蓝#3E7CA6(我)/朱砂红#B23A2E(敌)/赭金#D9A441。
   像素皮肤 `src/styles/pixel.css`(最后加载，统一接管布局+配色)。Zpix 像素字体 `public/fonts/zpix.ttf`。
9. **判定预览条**移到造句区**上方**(label 同行)，分项彩色 chip + 大倍率徽章 + 命中规则明细单行。
10. **造句框固定宽**(min(760px,96vw) 居中，不再随卡数漂移)。
11. **目标牌进手牌区**：我(蓝边)+各敌人(红边)做成手牌区左端的可点牌(虚线分隔)，点击选目标。
    移除了立绘下方的固定"我"卡槽。两侧大立绘保留作视觉主体。
12. **真 MP3 BGM**：放 `public/bgm/{ambient,combat,boss}.mp3`，audio.js 优先播 mp3、
    缺失自动回退合成音；mp3 播放时已停掉合成 loop 不叠加。

### B. 已知的未解决判定问题 (新 session 可继续，基于日志复盘)
1. **identity 身份 buff 数值不进 effects**：如"我是皇帝→力+2"在 notes 显示了，但实际是
   combat.js#applyEffects 里直接改 G.strength，**没写进 result.effects**，导致预览/日志看不到该数值、
   且与倍率体系脱节。建议把 identity 的 selfEffect 写进 effects 再统一结算。
2. **逗号分句的主语污染**："我是纸鬼，我摸鱼"里后半句"我摸鱼"该回血，但前半句的 enemy-target
   污染了 subjectIsEnemy 判定，摸鱼被判成对敌易伤。需要按逗号分句独立判定每个分句的主语。
3. **高倍率乘 0 伤害显虚高**：纯状态句(如只施加易伤)totalMult 可能 ×2+ 但实际伤害 0，
   玩家觉得倍率虚标。考虑无主要数值时弱化倍率展示。
4. **"给我V"被"是给"抢**：句中同时有"是"和"给我V"时，gei_pun(priority10) 压过 gei_imperative(8)，
   "X是给我砍"被判成 gay 谐音而非祈使。可能需要按子句判定优先级。

### C. 自测工具链 (新 session 必看 — opus 模型下可用，详见 §9)
- `node test-eval.node.mjs` — 39 个句子评估单测(无需浏览器)
- `node shot.mjs <out.png> <url> [waitMs]` — headless Chrome 截图(支持 SHOT_W/SHOT_H 环境变量)
- `node probe.mjs <url> "<JS表达式>" [waitMs]` — 读真实页面运行时状态
- URL 加 `?autocombat=1&enemy=moyao&sentence=我,斩,墨妖` 直接进战斗+预填造句区
- 这三个工具依赖 dev 依赖 `ws`，且需先 `npm run dev`(默认 5173)
- **重要**：执行 Bash 需安全分类器在线，`claude-fable-5` 模型下分类器常挂导致命令跑不了，
  用 `claude-opus-4-8` 正常。

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
DOM 见 `index.html` `#puppet-stage`，逻辑见 `src/ui/puppets.js`（已从 render.js 独立）：
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
├─ index.html                  # 所有 screen DOM；战斗布局=纵向四段(顶栏/combat-stage/sentence-dock/hand-area)
├─ vite.config.js              # 含 chant-log-sink 中间件(POST /__chantlog → chantlog.ndjson)
├─ package.json / vercel.json
├─ test-eval.node.mjs          # 自测：39 句评估单测(node 直跑，无浏览器)
├─ shot.mjs / probe.mjs        # 自测：headless Chrome 截图 / 读运行时状态(CDP，依赖 ws)
├─ chantlog.ndjson             # 吟诵日志(gitignore，玩时落盘，新 session 读它做平衡复盘)
├─ public/
│  ├─ lqz.png                  # 玩家立绘 (李清照)
│  ├─ zhihui.png / canjuguai.png  # 敌人立绘
│  ├─ fonts/zpix.ttf           # Zpix 像素中文字体
│  └─ bgm/{ambient,combat,boss}.mp3  # 真 BGM(用户放，缺失则回退合成音；目前可能未放)
├─ src/
│  ├─ main.js                  # 入口；暴露 window.G/__startCombat/__chantLog 等调试钩子
│  ├─ cheats.js                # ?cheat=1 + ?autocombat=1(直接进战斗+预填) + 热键 + prefillSentence
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
│  │  ├─ sentence.js           # FACADE：re-export evaluator/ + summons.js，调用方导入面不变
│  │  ├─ evaluator/            # 句子评估管线（按阶段拆分，无 DOM 依赖）
│  │  │  ├─ index.js           # evaluateSentence 编排 + finalize 最终数学
│  │  │  ├─ context.js         # buildContext：多义解析→normalize→词性分组→effects 初始化
│  │  │  ├─ constructions.js   # 句式注册表（一等抽象）：给我V祈使、让NP V兼语…
│  │  │  ├─ grammar.js         # checkWordOrder + applyGrammar（结构/语序/连词）
│  │  │  ├─ punctuation.js     # detectDuizhang + applyPunctuation（。！？，+对仗）
│  │  │  ├─ quality.js         # QUALITY_RULES 可插拔规则数组（诗意/意象/押韵/motif/谐音）
│  │  │  ├─ exclamation.js     # checkExclamationPosition + 感叹词倍率
│  │  │  └─ cardEffects.js     # 主/宾/修/连数值贡献 + VERB_SPECIALS 特殊动词注册表
│  │  ├─ summons.js            # SUMMON_EFFECTS + detectSummon（召唤系统，含 DOM 反馈）
│  │  ├─ poetics.js            # MOTIFS, detectMotifs, getRhymeKey, checkRhyme,
│  │  │                        # detectPredicates, PUN_STATUS, PUN_ON_APPLY, processEnemyPuns
│  │  ├─ meanings.js           # resolveMeaning + applyMeaningPatch + applyMeaningsToSentence
│  │  │                        # （多义系统唯一所有者；评估器与 UI 共用同一条解析路径）
│  │  ├─ damage.js             # dealDamageToEnemy, dealDamageToPlayer, checkEnemies
│  │  ├─ audio.js              # 音效 + BGM(优先 mp3，缺失回退 WebAudio 合成；playBgmTrack)
│  │  ├─ chantLog.js           # 吟诵快照日志：logChant + POST 落盘 + printLog/exportLog/clearLog
│  │  └─ map.js                # generateMap, renderMap, getRandomEnemies
│  ├─ ui/
│  │  ├─ render.js             # renderCombat 主循环；createCardElement, createSentenceWordEl;
│  │  │                        # renderHand+renderTargetCards(我/敌目标牌进手牌区), renderEnemies
│  │  ├─ puppets.js            # 棍人剧场：updatePuppets, playChantPuppetAnim, playEnemyPuppetAnim,
│  │  │                        # syncStandbyCoActors/playCoActors(独立个体待命+出击), PUN_TO_POSE, IMPACT_MS
│  │  ├─ screens.js            # 非战斗屏：rest, event, shop, deck overlay, journal overlay, meta
│  │  ├─ vfx.js                # VFX.shake, damageNum, inkRipple, brushStrike, ...
│  │  ├─ svgArt.js             # getEnemyPortraitSVG (后备 emoji)
│  │  ├─ storyOverlay.js       # 章节剧情对话框
│  │  └─ inkShader.js          # WebGL 水墨背景
│  └─ styles/
│     ├─ variables.css         # 颜色/字号/缓动 CSS 变量
│     ├─ base.css              # reset + body
│     ├─ components.css        # 卡牌/按钮/敌人卡/诗册/puppet (主要 CSS)
│     ├─ screens.css           # 战斗舞台 combat-stage 三栏布局 + map + reward 屏
│     ├─ overlays.css          # 评分横幅(顶部)/词库/诗册 overlay
│     ├─ animations.css        # @keyframes
│     ├─ responsive.css        # 断点(部分规则引用旧结构，桌面横屏不受影响)
│     ├─ pixel.css             # ⭐复古像素皮肤(最后 @import)：配色色板+硬边框+扫描线+
│     │                        #   战斗布局收口+目标牌+判定预览条+棍人台。多数布局以此为准
│     └─ index.css             # @import 入口(pixel.css 在最后)
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

// 评估（sentence.js 是 facade；想扩展规则时直接进 evaluator/）
import { evaluateSentence, detectDuizhang, detectSummon,
         QUALITY_RULES, VERB_SPECIALS } from './game/sentence.js';

// 多义（唯一所有者；UI 与评估器都走 applyMeaningsToSentence）
import { resolveMeaning, applyMeaningPatch, applyMeaningsToSentence } from './game/meanings.js';

// 母题 / 押韵 / 谐音
import { detectMotifs, getRhymeKey, checkRhyme, detectPredicates,
         PUN_STATUS, PUN_ON_APPLY, processEnemyPuns } from './game/poetics.js';

// 渲染
import { renderCombat, createCardElement } from './ui/render.js';

// 棍人剧场
import { updatePuppets, playChantPuppetAnim, playEnemyPuppetAnim,
         PUN_TO_POSE, IMPACT_MS } from './ui/puppets.js';

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
4. 如果是特殊 verb 行为 (类似 sleepSpecial)，在 cards.json 定义一个 flag，然后在
   `src/game/evaluator/cardEffects.js#VERB_SPECIALS` 注册表里加 `['yourFlag', handler]`
   —— 不要在管线里硬编码词面判断。注册表按数组顺序匹配，命中即跳过通用 combatType 处理

### 7.2 加一个新的 pun tag
1. cards.json: 给某张卡加 `pun: { tag: 'newtag', label, flavor }`
2. `src/game/poetics.js#PUN_STATUS` 加一项 `{ label, pairEffect(enemies){...} }`
3. (可选) `PUN_ON_APPLY` 加单实例瞬时效果
4. `src/ui/puppets.js#PUN_TO_POSE` 加 `{ pose, emoji }` 映射（唯一一处，预览/吟诵动画共用）

### 7.2a 身份系统（Baba-is-you 式 A是B）
`src/game/poetics.js#IDENTITY_TRAITS`：当 B 是主语卡/敌人名（而不是 pun 卡）时，
copula 改写 A 的身份。方向决定吉凶：
- `纸鬼是猫` → 猫的 enemyEffect debuff 该敌人（弱2+30%打盹）
- `我是影子` → 影子的 selfEffect buff 玩家（挡6）
- `皇帝是我` → 自我宣称 = 该词 selfEffect buff 玩家
- `纸鬼是我` → **禁止**（kind: forbidden，僭越，诗意-0.3，无效果）
- `我是我` → tautology，+0.1 禅意
- `我是纸鬼` → MIMIC_IDENTITY_TRAIT（化形入魔：力+2易伤1）
- 词不在表里 → DEFAULT_IDENTITY_TRAIT 兜底（保证"各种语义组合必须有意义"）
加新身份：IDENTITY_TRAITS 加一项 `{ emoji, enemyLabel, enemyEffect, selfLabel, selfEffect }`，
effect 字段是声明式数据，由 combat.js#applyEffects 解释（enemyEffect: weak/vulnerable/
strengthDelta/stunChance；selfEffect: block/heal/draw/strength/vulnerable/poeticAuraNext）。
另外：`纸鬼碎我`（敌为主语+我为宾语）→ 我承受伤害且无 +2 力量补偿（evaluator/index.js finalize）。

### 7.2a-2 句式系统（Constructions，一等抽象）
`src/game/evaluator/constructions.js`：句式 = 重新分配语义角色的语法模式，
管线位置在 buildContext 之后、applyGrammar 之前。每项 `{ id, label, detect(ctx), apply(ctx, m) }`。
已实现：
- **给我V 祈使**（"纸鬼给我戳"）：敌人被命令对自己执行 V。
  - 触发锚点 = 给卡的 `gei_imperative` meaning（`when.nextIsMeThenVerb`，"给我"必须相邻，我与V之间容≤2修饰词）
  - 多义裁决链：谐音gay(priority 10, copula后) > 祈使(8) > 默认动词 —— meanings 是单一事实源
  - 三变体：command（敌NP在给前→×1.4+穿透+语法×1.15）/ unnamed（无NP→随机敌自伤，无×1.4）/
    benefactive（敌NP在V后"给我戳纸鬼"→仅语法×1.15）
  - 结算：effects._imperative 在 finalize 读取；非攻击动词（给我躺）走 VERB_SPECIALS 敌方分支
    （ctx.forceSubjectIsEnemy）
- **让/叫 NP V 兼语**（"让纸鬼死"）：同语义、委婉版（×1.2 无穿透，语法×1.1）
加新句式（把字句/被字句/叠词连击候选）：CONSTRUCTIONS push 一项即可，约定：成分间容≤2修饰词、逗号断句。

### 7.2b 加一条句子质量规则（含未来 LLM 评价）
`src/game/evaluator/quality.js#QUALITY_RULES` push 一项 `{ id, apply(ctx) }`：
- 可读 ctx.cards / ctx.text / ctx.totalChars / 词性分组
- 加分写 `ctx.literaryMult += x` + `ctx.literaryNotes.push(...)`
- 结构化效果写 `ctx.effects._yourPayload`，再在 combat.js#applyEffects 消费
- LLM 兜底评价的接入点也在这里：异步判定在吟诵前预计算、挂到 G 上，规则同步读取

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
- 当前 5 种 intent type: attack / defend / buff / debuff / special — 都在 `src/ui/puppets.js#playEnemyPuppetAnim` 里
- 想加新的 type 比如 `'summon'` `'curse'`，在 `playEnemyPuppetAnim` 里加分支
- 撞击帧常量 `IMPACT_MS`（420ms）被 combat.js#enemyTurn 用来对齐 act_fn 与动画，改时序两边一起改

---

## 8. 已知问题 / TODO (按优先级)

> 📌 2026-06-14 之后的最新进展、未解决判定问题(身份buff数值脱节/逗号分句主语污染/
> 倍率虚高/给我V优先级)见 **§0.5 B 段**。下面是更早的记录。

### 已修复（2026-06-12 架构重构）
1. ~~多义系统 UI/评估不同步~~ — meanings.js 现在是唯一所有者，`applyMeaningsToSentence` 被评估器
   (evaluator/context.js) 和 UI (render.js 造句区 / puppets.js 姿态预览) 共同消费；同时修复了
   无 patch 的 meaning 会让 `applyMeaningPatch` 返回原对象、导致 pos/pun 写入永久污染手牌卡的 bug。
2. ~~detectPredicates 主语判定矛盾~~ — 已重写：合并双循环、修复逗号 break 永不可达（之前
   `pos==='punctuation'` 先 continue 导致逗号停句逻辑死代码）、主语短语显示取 copula 前连续片段
   （"皇帝你儿子是给" 现在完整显示）。
3. ~~puppet 火柴人粗糙~~ — index.html 重绘为水墨小人（诗人：发髻+长衫+毛笔；敌人：朱砂纸鬼飘带 + 符纸），
   姿态 CSS 全部重做（attack/defend 持物跟手、敌我朝向区分、idle 飘移）。
4. ~~敌人 act 与 puppet 撞击不同步~~ — enemyTurn 现在把 act_fn 延迟到 IMPACT_MS(420ms) 撞击帧执行，
   伤害飞字与动画落点对齐。
5. ~~applyEffects 中 `_confuse` 双重处理~~ — 删除了旧的"立即随机自伤"块，保留 confused 标记 +
   enemyTurn 的混乱结算路径。

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
- URL 加 `?autocombat=1` 直接进战斗（跳过地图/剧情，自动建牌组+发手牌），
  可选 `&enemy=zhigui` 指定敌人、`&sentence=纸鬼,给,我,戳` 预填造句区（敌人名→目标卡，"我"→固定卡）
- 控制台 `window.G` 可以直接改任何状态
- `window.__startCombat([{...window.__ENEMY_DEFS.zhigui}])` 直接进战斗（但需先 `G.deck=createStarterDeck()`）
- 修改 cards.json 不需要重启 dev，vite HMR 自动重载

自测工具链（项目根目录，零运行时依赖、仅 dev 依赖 `ws`）：
- `node test-eval.node.mjs` — 39 个句子评估单测，直接 import evaluator（无需浏览器，评估器是 DOM-free 的）。
  改评估逻辑后必跑，最后一行打印 `ALL N CASES RAN WITHOUT ERROR`
- `node shot.mjs <out.png> <url> [waitMs]` — headless Chrome 走 CDP 截图（1280×720@2x），并捕获 console 报错
- `node probe.mjs <url> "<JS表达式>" [waitMs]` — 在真实页面里求值并打印结果（用于读 G.sentence、evaluateSentence 等运行时状态）
- 三者都需先 `npm run dev`（默认 :5173）。截图里的 `THREE.WebGLRenderer: Error creating WebGL context` 是 headless 无 GPU 所致，真机正常
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

8. **新 UI 模块独立成文件**（puppets.js 是先例）。render.js 只负责渲染主循环。

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
