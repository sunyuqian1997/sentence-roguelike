# 词灵录 (Sentence Roguelike) — Handoff Document

Status snapshot: 2026-07-02 · 创造力经济+句式扩展+吐槽气泡+数值校准+拖拽引擎 · 循环状态见 GAME-LOOP.md/BALANCE.md
Author of original direction: project owner (referred to below as "user")
Author of this handoff: Claude (fable session) → 交接给新 session
工作区状态：见 git log(分支 feat/lang-ir-engine)；未追踪仅 chantlog.ndjson(日志,已 gitignore) + public/bgm/。
**新 session 先读:本文件 §A-decies(最新一轮) + GAME-LOOP.md(backlog/教训) + BALANCE.md(数值目标与现状)。**

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
    ⚠️ 此项经历多次反复(分两侧→删卡改点立绘→又回手牌区)，**最终状态见 A-sexies #30**，以那个为准。
12. **真 MP3 BGM**：放 `public/bgm/{ambient,combat,boss}.mp3`，audio.js 优先播 mp3、
    缺失自动回退合成音；mp3 播放时已停掉合成 loop 不叠加。

### A-bis. 2026-06-14 第二轮 UI/语义修复
13. **自陈 pun → 我方增益**：`我是给` 等"我是X(pun卡)"不再只飘字。`PUN_STATUS[tag].selfPun`
    新增 `{ label, selfEffect }`，combat.js#applyEffects 的 self 分支按 selfEffect 给玩家加
    block/heal/draw/strength/poeticAuraNext，新增 `charmEnemiesNext`(全敌 stunned 跳过下次攻击)。
    映射：gay→敌被勾引+挡4 / numb→挡6 / doomed→力+2 / fleeing→抽2 / lying→回5 / juan→抽1力+1 /
    sad→挡3+下回合诗意 / old→回4 / daylight→力+1挡3。puppets.js 预览/吟诵改为诗人 heal 姿态(原来误打敌人)。
14. **目标牌分两侧**：`我`(蓝)留在手牌区左端，各敌人目标牌(红)移到手牌区**右端**(`#target-cards-enemy`，
    左侧虚线分隔)。render.js#renderTargetCards 拆双容器，pixel.css 加镜像样式。
15. **独立个体待命小人不再与诗人重合**：puppets.js 三个常量 `COACTOR_BASE_LEFT/STEP/SCALE`
    (30%/10%/0.6) 统一控制站位，co-actor 站在诗人与中线之间的空档。puppet-stage 加宽到 min(640px,98%)。

### A-ter. 2026-06-14 第三轮 语义修复（含 Codex 二审）
16. **「你」=敌方**：`isYouCard`(poetics.js，你/尔/汝)统一识别。`你是X`→debuff 敌人(等价敌是X，
    detectPredicates 给 subjectKind=enemy、idx=-1 由 combat.js#resolveEnemy 解析为首个存活敌)；
    `你` 不再作我方助战独立个体(context.js coActors / puppets.js standby 排除)；
    `你摸鱼`等特殊动词按敌方主语处理(cardEffects.js isEnemySubjectCard)。
17. **「我是皇帝」全军共享身份 buff**：identity self-buff 的 strength delta 同时加给同句我方
    独立个体(index.js finalize 的 _coActors 块，note「👑 黄袍加身」，co-actor.rallied 记录)。
18. **逗号分句角色判定彻底 clause-local**（Codex P1/P2 复审后修）：
    - `enemyStrikesMe`(index.js)改为**遍历所有逗号分句**，任一子句出现[敌ref…动词…我]即触发；
      敌ref 含 你/尔/汝。修了"我摸鱼，敌斩我"(攻击在后句)漏判 + "你斩我"漏判。
    - `subjectIsEnemy`(cardEffects.js)改为**按当前动词所在子句**判定，且敌 ref 必须在动词**前**
      (动词后是宾语，"我斩纸鬼"主语仍是我)。修了"我摸鱼，你斩我"前句摸鱼被误判敌方易伤。

### A-quater. 2026-06-14 第四轮 UI/体验大批量（设计审查 + Codex 终审）
19. **tooltip 残留修复**：renderCombat() 开头 `hideTooltip()`——重渲销毁 hover 的 DOM 致 mouseleave 不触发。
20. **诗册可读**：pixel.css 覆盖 .round-journal-title/line 为像素字 + `--ink` 深色 + 大字号行高。
21. ~~**删除目标小牌，改为直接点立绘选目标**~~ — **已被 A-sexies #30 推翻**：目标卡又回到手牌区了。
    点立绘选我(`#player-char-card`→`addSelfTarget`)作为兼容保留，但主路径是手牌区目标卡。
22. **背景提亮**：`--stage-bg`#1E2530→#313C4C，`--stage-mid`→#455065，扫描线/暗角透明度减半，顶栏石板色。
23. **金币/卡包价**(sub-agent)：fight 35-50、elite 65-100、boss 90-150；最贵卡包 60→50。
24. **棍人状态音效**：audio.js 加 charm/doom/daze/old/summon/forbidden；puppets.js POSE_SFX+cuePose
    (带 _lastCue 去抖)在 updatePuppets 触发，新 standby 出场播 summon。
25. **独立个体专属 SVG**：puppets.js COACTOR_SVG(猫=耳+尾+须 / 初音=双马尾+耳机 / 影子=填充剪影 /
    剑客女侠将军=刀+发髻 / 通用兜底)。makeStandby 改 innerHTML 构建(不再克隆诗人)；CSS 在 components.css。
    standby 加 removing 标记 + 取消重加竞态(Codex P2 修)。
26. **结算页最帅句+动态重放**：combat.js 跟踪 `G._bestLine`(最高 totalMult)；showRewardScreen 调
    `playBestVerseReplay`(puppets.js) 克隆 #puppet-player/#puppet-enemy 建迷你台重演，co-actor
    **直接用 `effects._coActors`**(Codex P2 修，不再正则重扫)。combatVictory 兜底缺失 map node。

### A-quinque. 2026-06-14 第五轮 布局崩坏修复（宽屏/全屏，design agent 审）
27. **棍人顶出舞台**：根因 `.puppet height: clamp(170px,22vw,240px)` 用 **vw(横向)** 控纵向高度，
    宽屏被钉死 240px 比舞台还高。改 `height: clamp(88px,86%,240px); width:auto; aspect-ratio:80/100`
    (绑舞台高度%)，`#puppet-stage` 改 `height:100%;max-height:360px;overflow:hidden`(pixel.css)。
28. **判定预览条压造句标题**：`#sentence-topbar flex-wrap:wrap` 致预览换行盖到 label。改 `nowrap`+
    label/preview 都加 `min-width:0`(可收缩不换行)(pixel.css)。
29. **吟诵行被裁出视口**：`#combat-stage min-height:200px` 抢高 + dock 无收缩契约。改 stage `min-height:0`
    (成为唯一弹簧)，`#sentence-dock flex:0 0 auto`(随内容、不裁 slots)，棍人 floor 88px 给 stage 留压缩空间(screens.css)。
    **教训(design agent)**：纵向尺寸永远绑纵向参照系(% / fr / vh)，别用 vw。

### A-sexies. 2026-06-15 第六轮 结算页两栏 + 身份变体型 + 目标卡/状态最终形态
> 本轮经历了几次 UI 反复，**以下是当前真实状态**(覆盖前面相关条目)。
30. **目标卡最终落点 = 手牌区左端一排**(commit f4d869b)：我(蓝)+各敌(红)目标卡回到 `#target-cards`
    (在 `#hand-cards` 左侧、虚线分隔)，点击选目标。render.js#renderTargetCards 恢复并重写。
    点玩家立绘选我(addSelfTarget)仍兼容保留。**A-quater #21 的"删卡改点立绘"已废弃。**
31. **状态角标做到目标卡上**(f4d869b)：易伤/弱/力/盾/pun/💤 = 目标卡底部彩色角标(`.tgt-st`，
    render.js#targetStatusHTML 读 G/enemy 状态)。**根因**：之前放立绘列/敌牌会被容器底边截断；
    放卡上则"跟卡走"不会截。立绘列/敌牌里旧的 status-icon 仍在(次要展示)，可按需删。
32. ~~**状态徽章上小人头顶**~~(commit 9c05464 加、e9ec028 撤)：试过把 `.puppet-status` 放小人头顶，
    但舞台框矮、多状态会裁剪/重叠，**已整体回退**(DOM/JS/CSS 全删)。教训：矮容器别堆头顶徽章。
33. **身份变体型**(9c05464，保留)：`IDENTITY_TRAITS` 加 `bodyScale`：我是儿子→0.6 / 巨人→1.5 /
    皇帝→1.2 / 将军→1.25 / 猫→0.8。puppets.js#setBodyScale 缩放小人 `.puppet-svg`(从脚底 transform-origin)。
    顺手新增了 儿子/巨人/将军 三个 identity 词条的 buff。
34. **结算页改两栏**(3ac0ce5，保留)：`.reward-two-col` flex 行——左栏=回顾(best-verse 动态重放+本局诗篇)，
    右栏=战利品(战胜/金币/选牌/跳过/卡包)。窄屏/竖屏(≤760px 或 portrait)回退单栏可滚动
    (列 flex:0 0 auto 避免塌成 0 高)。screens.css。
35. **结算预览命中规则可读**(9c05464，保留)：`.sp-rules` 改可换行深色描边 chip(0.82rem)、倍率徽章加大、
    预览盒 max-height 提到 130px。修了"算攻击力那些看不清"。

### A-septies. 2026-06-17 第七轮 成句性硬门槛 + 整轮状态作用域 + 试玩调优 loop
> 本轮核心:新增一道**真·汉语句法「成句性」硬门槛**(之前只靠"有没有动词"太弱),并把战斗
> 状态改成**整轮作用域**。全部 commit + fuzzer/探针/截图验证。

36. **成句性硬门槛 `src/game/evaluator/wellformed.js`**(新文件,唯一会"拒绝"一串卡牌的地方):
    - 下游 grammar/quality 仍是**软评分**(只降倍率、永远放行);wellformed 是**硬拒绝**不成句的废串。
    - 按现代汉语句型建模:主谓/主谓宾/连动/省略/祈使/判断句(A是B)/兼语(让NP V)/并列主语/非主谓感叹。
    - `connector` 细分 5 类功能角色(`roleOf`):COORD并列(和/或/而)、CAUSATIVE兼语(让/帮)、
      COPULA系词(是/为,带 copulaConn)、ADV副词性(就/还/不/也是/倒是)、SEQUENCE顺承(然后)。
    - **动词链骨架**校验:拒「守戳挡我猫」(V V V N N 乱堆)、纯动词堆(V链≥3无主无宾)、动宾交错;
      并列主语「我和你走」通过折叠 `NP COORD NP→NP` 仍放行。
    - **系词表语提升**:`A 是 B` 里紧跟系词的词(谐音"给/日"等 connector)算表语 NP,否则会被
      "结尾连词悬空"误杀(修了"残句怪是给"被拦的 bug)。
    - **感叹句收紧**:合法只有 纯叹词「啊!」或 单一名词主体+叹词「明月啊!」;多名词混叹词=乱堆,拒。
    - 接入点:`combat.js#chantSentence` 在召唤判定后、扣费前调 `isWellFormed`,不成句弹红字"✗ 不成句:原因"+`forbidden` 音效。召唤式不受此门槛约束。
    - 回归语料 `scripts/test-wellformed.mjs`(78 例,`node scripts/test-wellformed.mjs`),codex 双审 + 对抗集。
37. **整轮状态作用域**(combat.js#`endRound`):一轮 = 我方回合 + 敌方回合。所有"按轮"衰减/清零
    集中到 `endRound()`(敌方回合走完、下个我方回合前),不再散在两个半轮边界。
    - 我方护甲撑过敌方回合才清;易伤/虚弱整轮**只减一次**(旧版半轮各减=减两次)。
    - 敌方护甲仍在其回合开始清(撑过我方下回合,否则刚加的防御立刻失效)。
    - 用户诉求:同回合出多句,前句 buff(我是猫等)持续到轮结束才复原。
38. **开局教学组合**(combat.js#`guaranteeTutorialCombo`):第一场战斗(`G.combatCount===1`,
    **不能**用 floorsCleared——visitNode 在进战斗前已 ++ 它)前两回合保证手牌有「是/给/猫」。
39. **敌人随层递进**(startCombat):同 act 内按 `G.currentRow` 深度缩放——每层 +8% HP、
    每深 2 层 +1 固定伤害(`_dmgBonus`,在 damage.js#dealDamageToPlayer 加);boss 不缩放。
40. **新机制**(试玩 loop 产出):
    - **诗意暴击**(quality.js#`poetic_crit`):literaryMult≥3.0 → ×1.5(复用 finalize 的 `_crit`)+ banner。
    - **「对」卡**(cards.json#`dui`,稀有谓语):真·工对(lushi/jueju/perfect)时伤害 ×1.4(原 ×2 会与
      对仗倍率双重计酬,已降);finalize 里实现,不侵入 cardEffects。
    - **怕字敌人**:残句怪 `fearWord:'全'`——句中带"全"则该敌虚弱(quality.js#`fear_words` 检测、combat.js 落地)。
    - **对仗须工对**(punctuation.js#detectDuizhang):五言/七言高倍(×2.5/×3.0)必须词性对称(struct1===struct2),
      否则降级 ×1.5(修了"凑5字白吃×2.5"的 bug)。

### A-octies. 2026-06-17 第八轮 多语言 IR/事实引擎重构 + 英文版(分支 feat/lang-ir-engine)
> 大重构:把评估器拆成「语言包(parse→IR) + 语言无关 core(settle)」三段式(Storyteller 式事实引擎),
> 并新建可玩英文语言包。**在分支 feat/lang-ir-engine 上,未合并 master。**

41. **三段式架构**(为多语言 + 长期迭代):
    - `src/game/eval-core/`:`ir.js`(IR 契约)、`settle.js`(语言无关数值结算=原 finalize 数学部分)、
      `pipeline.js`(编排:getLangPack().parse(cards)→settle(ir))。**core 不认识任何中英文字。**
    - `src/lang/zh/`:`parse.js`(句子→IR,含原 finalize 的中文敌我语义)+ `rules/`(原 evaluator 八模块迁入,
      import 深度改 `../../../game/`)。`src/lang/en/`:英文对应物。
    - `src/lang/registry.js`:`getLangPack()` 按 `getLang()` 返回 zh|en pack。
    - `src/game/evaluator/index.js` 降为 facade,re-export 自新路径,**调用方(combat/render/screens)接口零改**。
42. **IR 形状**(eval-core/ir.js):wellFormed/clauses(agent/action/patient 抽象事实)/base/mults/flags/
    riders/notes/poeticScore + 重构期载荷 effectsSeed+ctxSeed(语言包算好的数值/结构,settle 消费)。
43. **英文玩法**(src/lang/en/):SVO 成句(wellformed.js,38 例测试 scripts/test-wellformed-en.mjs)、
    英语诗意(poetics.js:头韵 alliteration / 词尾押韵 / 音节 meter / detectParallelEn 与 detectDuizhang 同形)、
    SVO 语序评分(grammar.js)、38 张英文卡(cards.json,含 concept/rhymeKey/alliterationKey/pun/copula"is")、
    UI_STRINGS_EN(ui.js)。cards.js 按 isEn() 选卡库,createStarterDeck 有英文起手牌。
44. **LLM 评分预留**:pack.scoreHooks=[](pipeline 会跑钩子链乘 poetic 倍率)。LLM 评委以后作为 async 钩子
    加入此数组,core/IR 不用改。本版留空不实现。
45. **golden master 安全网**:`golden-zh.json`(25 句确定性,排除随机卡猫/draw)+ `scripts/golden-run.mjs`
    (独立 CDP 跑,**不碰用户浏览器**)/`golden-verify.mjs`。改语言逻辑后比对,数值不一致即回归。
46. **已知待办(UI 收尾,非引擎)**:部分 UI chrome 仍中文(费/吟诵/文力/抽弃)、敌人名未本地化、
    偶有英文卡 word 未解析、英文 identity/motif/pun 深度系统未做(留扩展位)。引擎层完成。

### A-nonies. 2026-07-02 第九轮 pointer 拖拽 juice + CDP 交互验证器
> 循环工程式推进(状态文件 JUICE-LOOP.md):每改一轮过三道门 A=逻辑单测 B=interact.mjs
> 真拖真放断言 C=多视口(1280×720/1920×1080/812×375,全部 deviceScaleFactor=1 即 100% 缩放)截图肉眼审。

47. **拖拽全面重写**(`src/ui/dragSort.js`,替换 HTML5 DnD):统一 press→drag 引擎,
    6px 阈值内仍是点击(移除/入句行为不变)。四种手势:
    - 造句区拖排序:兄弟卡实时让位开口(transform ±1 slot,gap 算法=「去源后插入」),拖影抬起态
      (scale1.07+rotate2.5°+投影,内层 card 过渡=拾起缓入而拖影零延迟跟手)
    - 手牌拖入造句区:落点即插入位(`combat.js#addToSentenceAt`,复用 forbidden/逗号守卫),
      dock 金色虚线呼吸高亮(`drop-ready`,components.css 需 !important 盖 pixel.css 背景)
    - 造句区卡拖出 dock = 移除(拖影灰化预告,飞回对应手牌)
    - 无效拖拽 260ms 回弹原位;落下 squash&stretch(`drop-pop`);全程 transform 无 reflow
    - 触屏就绪:pointer events + `touch-action:none`;drop 后吞一次 click 防误触移除
    - **坑**:ghost 克隆要剥掉 `drag-source` 类(先加类后克隆会把"变灰"克隆走)+ `animation:none`
      (否则 slot 入场 fade 在拖影上重播)
48. **CDP 交互验证器**(`scripts/interact.mjs`):合成真实鼠标序列(mousePressed→moved×N→released,
    Chrome 自动派生 pointer 事件,setPointerCapture 兼容)。动作:drag/click/down/move/up(可暂停
    中途 eval+截图)/eval/assert/shot。端口 9223 不与 shot.mjs 冲突。拖拽行为从此可自动化回归:
    `node scripts/interact.mjs <url> '[{"a":"down",...},...]'`,assert 失败/页面报错 exit 1。

### A-decies. 2026-07-02 第十轮 创造力经济 + 句式/表现扩展 + 数值校准 + 拖拽防死锁(多 agent 并行)
> 用户给了九个 idea(韵律鼓励/连续句上下文/结算短篇/换场景/景物词/连环画/道具/用X戳/吐槽气泡),
> 按 GAME-LOOP.md 的 P0-P7 分期推进。本轮完成 P0-P4 + 补强;P5 场景系统进行中;P6/P7 待做。
> 方法论:四道门(A逻辑单测/B interact.mjs 真交互断言/C 三视口100%缩放截图/D balance-sim 曲线),
> subagent 并行(P0 数值/P4 气泡/P5 场景),主线 P1→P2→P3。用户已定向:语义评判纯规则(scoreHooks 留LLM位)/
> 衰减+新意/STS 正常难度/连环画程序化 SVG。

49. **创造力经济**(`src/game/creativity.js` 语言无关台账 + zh/en quality 规则):
    - 重复衰减:本场原句重复 ×0.6^n(词穷)、同骨架(词性序列+动词) ×0.85^n;换宾语=温和衰减,换动词=全新句
    - 新意奖励:本场首用词 +0.06/个封顶 +0.3(首句无基准不给)
    - 承接链:上句内容词(主/宾,我你I/you/me 除外)在本句复现 → 🔗+0.2/0.3/0.4 链式(G._continuityStreak)
    - **时序契约(重要)**:台账只在真吟诵后推进(combat.js#chantSentence 评估后 recordChantCreativity),
      预览永远纯读 → 预览条实时显示"再念一遍会掉到多少"。journals 在评估前 push,不能用它做重复计数!
    - 回归:`node scripts/test-economy.mjs`(21 例)。en 包同规则(en/parse.js#applyCreativityEn)。
50. **「用X戳」工具格句式**(constructions.js#yong_instrumental + 新卡「用」进起手):
    任何名词皆可为器,INSTRUMENT_TRAITS 表(猫/明月/椅子/影子/骨/灰烬)+「万物皆兵」兜底;
    器物之利伤害在 zh/parse.js#detectRoles 于 cardEffects 后追加。意外好联动:用猫戳时猫 co-actor
    自动上台助战("猫对此很不满")。回归:`node scripts/test-instrument.mjs`(12 例)。
51. **吐槽气泡**(puppets.js#BUBBLE_TRIGGERS,subagent 产出):组句未结算时棍人头顶冒话——
    斩杀预告(敌"等等!")/自伤("这不好吧……")/高倍率("这也行?")/谐音命中("你礼貌吗")/
    co-actor 登场("交给我")。签名去抖(重渲不重建 DOM)、2.2s 淡出不重播、吟诵时清场、zh/en 双语。
    气泡读 `G._previewEval`(render.js#renderSentenceSlots 缓存)。
52. **数值地基与第一刀校准**(subagent 产出 + 主线校准):
    - `BALANCE.md`:STS 口径目标(普通2-4回合/掉血8-15%/精英/boss)+创造力平价判据+两轮测量记录
    - `scripts/balance-sim.mjs`:headless 模拟器,import 真实评估器,4 策略 bot(greedy-mult/
      greedy-damage/spam/diverse),SEED 复现;已接创造力台账。`scripts/chant-stats.mjs` 日志统计
    - act1 校准(enemies.js):墨妖 20→32/纸鬼 24→36/残句怪 16→28/文曲星 48→78/仓颉 95→115,攻击同步上调
    - **结果:普通战/boss 进靶区;diverse 全面 ≥ spam(boss 胜率 93% vs 85%)——"鼓励创造"成为可量化事实**
    - 未解决:倍率表演分(纯状态句高倍无收益,greedy-mult 胜率垫底)、act2/3 整幕校准、对仗门槛过高
53. **拖拽引擎防死锁(用户实机踩到的严重bug)**:延时 renderCombat(吟诵结算/敌人回合)中途销毁
    被拖元素 → pointerup 永久丢失 → active 卡死 → 后续所有拖拽失灵。修法(dragSort.js):
    监听挂 window 而非元素 + finish try/finally + buttons===0 僵尸检测 + window blur 取消 +
    forceCleanupDrag 每次按压前兜底。headless 合成事件测不出此 bug(不会中途撞结算重渲)。
54. **韵表扩充**(poetics.js#RHYME_GROUPS):卡库尾字覆盖 38%→100%(补 113 字,新增 üe/ie 组)。
    之前"我/鬼/月/海"都查不到韵。配套:手牌韵脚预告角标🎵(renderHand,上句韵脚可续的卡亮标)。
55. **短视口紧凑档**(pixel.css @media max-height:430px):修 812×375 棍人剧场被压 0 高——
    stage 硬地板+侧立绘列隐藏+卡牌/预览/顶栏瘦身,iPhone 横屏全 UI 可见可点。
56. **按压反馈**:手牌/目标卡/造句卡 :active 下沉缩小,禁用按钮 not-allowed 光标。
57. **taptap-maker MCP** 已装(~/.claude.json),工具需新 session 才加载,尚未使用。用户希望用它优化游戏。
58. **P5 场景系统(进行中,subagent)**:地点卡(月下/海边/酒馆/战场)+qu_verb 动词卡+
    qu_movement 句式(去/到/入+地点→effects._sceneChange)+`src/game/scenes.js`(场景buff/景物注册表)+
    舞台变景(data-scene)+景物词上台(G.sceneryProps,上限3)。G.scenesVisited 为 P6 连环画攒原料。
    **若本条无后续完成标记,git status 未 commit 的改动即 agent 半成品,验收流程见 GAME-LOOP.md 四道门。**

### B. 已知的未解决判定问题 (新 session 可继续，基于日志复盘)
1. **identity 身份 buff 数值不进 effects**：如"我是皇帝→力+2"在 notes 显示了，但实际是
   combat.js#applyEffects 里直接改 G.strength，**没写进 result.effects**，导致预览/日志看不到该数值、
   且与倍率体系脱节。建议把 identity 的 selfEffect 写进 effects 再统一结算。
2. ~~**逗号分句的主语污染**~~ — 已修(见 A-ter #18)：role/subject 判定均 clause-local。
3. **高倍率乘 0 伤害显虚高**：纯状态句(如只施加易伤)totalMult 可能 ×2+ 但实际伤害 0，
   玩家觉得倍率虚标。考虑无主要数值时弱化倍率展示。
4. **"给我V"被"是给"抢**：句中同时有"是"和"给我V"时，gei_pun(priority10) 压过 gei_imperative(8)，
   "X是给我砍"被判成 gay 谐音而非祈使。可能需要按子句判定优先级。

### C. 自测工具链 (新 session 必看 — opus 模型下可用，详见 §9)
- `node scripts/test-economy.mjs` — 创造力经济回归(21 例:衰减/骨架/新意/承接/预览纯读)
- `node scripts/test-instrument.mjs` — 「用X戳」工具格回归(12 例)
- `node scripts/balance-sim.mjs [act] [runs] [--boss]` — headless 数值模拟(4 策略 bot,SEED 复现,对照 BALANCE.md)
- `node scripts/chant-stats.mjs` — chantlog.ndjson 统计(句频/倍率分桶/规则命中)
- `node scripts/interact.mjs <url> '<actions json>'` — CDP 真实交互驱动(drag/click/down/move/up/eval/assert/shot,
  env CDP_PORT 避免并行冲突);**改拖拽/交互必跑**
- `node scripts/golden-verify.mjs` — golden master(25 句确定性数值);改评估逻辑必跑,机制性全局改动则重生成+review
- `node scripts/test-wellformed.mjs` — 成句性判定回归(83 例带标准答案,无需浏览器,**改 wellformed.js 必跑**)
- `node scripts/fuzz-sentences.mjs [count] [maxLen]` — 随机组句 fuzzer:从真实卡库随机拼句跑判定,
  统计通过率 + 抽样展示通过/拒绝,**人眼复核漏网**(需 dev server)。注意:fuzzer 通过率 ~50% 含大量
  "结构合法但语义随机"的句子——pos 级语法门槛判不了语义,这是上限,别指望 0% 废话通过。
- `node test-eval.node.mjs` — 39 个句子评估单测(无需浏览器)
- `node shot.mjs <out.png> <url> [waitMs]` — headless Chrome 截图(支持 SHOT_W/SHOT_H 环境变量)
- `node probe.mjs <url> "<JS表达式>" [waitMs]` — 读真实页面运行时状态
- URL 加 `?autocombat=1&enemy=moyao&sentence=我,斩,墨妖` 直接进战斗+预填造句区
- 这三个工具依赖 dev 依赖 `ws`，且需先 `npm run dev`(默认 5173)
- **重要**：执行 Bash 需安全分类器在线，`claude-fable-5` 模型下分类器常挂导致命令跑不了，
  用 `claude-opus-4-8` 正常。
- **autocombat 的坑(本 session 踩过)**：
  - `?autocombat=1` **只 spawn 1 个敌人**，且**忽略** `enemy=a,b` 的逗号列表(只取第一个/随机)。要多敌得改 cheats。
  - 预填 `sentence=我,锤,纸鬼` **不会**把"纸鬼"转成 `_isEnemyTarget` 卡(它只是普通名词卡)。
    要验证 co-actor 助战/目标卡/状态，得自写 CDP 脚本手动 push `{_isEnemyTarget:true,_enemyIdx:0}` 卡 +
    `{_isFixedWo:true}` 的我卡，再 `window.__renderCombat()`。模板见下方。
  - 想截结算页：组句→`combat.chantSentence()`→等~2.6s→`G.enemies.forEach(e=>e.hp=0); damage.checkEnemies()`。
    `combatVictory` 已兜底缺失 map node(autocombat 下 currentRow=-1)，所以能正常进结算屏。
- **本 session 既定流程(用户要求，已写进记忆)**：每次改完游戏代码 → ①自己玩(headless驱动到相关界面) →
  ②查运行时状态(probe 读 window.G / 角标 DOM / chantlog) → ③发最终截图给用户。光跑单测不够。
- **多次 UI 反复的教训**：目标牌位置改了 4 次、状态显示改了 3 次。动 UI 布局前先问清最终形态、
  并在多个视口(含 2000×1080 全屏 + 窄屏)截图验证，避免"在某分辨率好、换一个就崩"。

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
