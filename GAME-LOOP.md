# Game Loop 状态文件 (v2 — 机制大循环)

前身 JUICE-LOOP.md(拖拽 juice, 已全部完成 commit 9cbce7f)。本文件跟踪九个 idea 的实现循环。
用户已定向: 语义评判=纯规则 / 创造力经济=衰减+新意 / 难度=STS 正常 / 连环画=程序化 SVG。

## 四道门 (每轮全过才 commit)

- A 逻辑: node test-eval.node.mjs + scripts/test-wellformed.mjs + golden-verify (机制改动需重生成 golden 并人工 review diff)
- B 交互: scripts/interact.mjs 真实操作断言 (CDP_PORT 环境变量避免并行冲突: 主线9224/agent9223)
- C 视觉: 1280×720 / 1920×1080 / 812×375, deviceScaleFactor=1 (100% 缩放) 截图肉眼审
- D 数值: scripts/balance-sim.mjs 曲线 vs BALANCE.md 目标; 核心判据 = 多样造句策略收益 ≥ 刷句策略

## Backlog

- [x] P0 数值地基 a90b4c7 + act1 第一刀校准 85dbc16(普通战/boss 进靶区,平价判据翻绿)
- [x] P1 创造力经济 d06f1ca + 韵脚角标 87fd5f3
- [x] P2 连续句承接链 3a4807d
- [x] P3 「用X戳」工具格 c9d9c58 — 意外联动:猫既是武器又自动 co-actor 助战,保留
- [x] P4 吐槽气泡 87fd5f3 + 812×375 紧凑档修复 e54940d
- [x] P5 场景系统 03939f9 — 去哪里换景+景物上台,scenesVisited 已为 P6 备料
- [ ] P6 结算短篇选句奖励 + 通关连环画 (程序化 SVG) — 原料就绪(G.scenesVisited/combatJournal)
- [ ] P7 文房道具 (小丑牌式遗物) + 终局平衡大循环(act2/3 校准 + 大 N 细磨)
- [ ] 补: en 包场景规则(scenes.js 的 en 文案已备好)
- [ ] 试: taptap-maker MCP(已装,新 session 加载后探索其工具用于优化/发布)
- [x] 补: 韵表扩充 86b3b3b(尾字覆盖 38%→100%,新增 üe/ie 组)
- [x] 补: en 包经济规则对齐 09c62c8(instrument 句式 en 版留待后续)
- [ ] 补(P0 发现): 倍率表演分 — 纯状态句高倍率无收益,考虑 totalMult 缩放状态量(vuln/weak)
- [ ] 补(chant-stats 发现): 对仗门槛过高(85/136 拒) — 留给调优循环定夺

## 轮次记录

- 2026-07-02: loop v2 启动。agent A(P0)/agent B(P4) 并行, 主线 P1→P2→P3 三连 commit。
  P1 踩坑:journals 在评估前 push,经济台账必须评估后记账(creativity.js 时序契约)。
  Gate B 踩坑:并行 agent 改文件触发 vite 热重载会重置 G,交互断言偶发假阴性 → 重跑即可。

## 教训 (承袭 JUICE-LOOP)

- **拖拽死锁(用户实机踩到)**:延时 renderCombat(吟诵结算/敌人回合)会中途销毁被拖元素,
  监听挂元素上=pointerup 永久丢失=active 卡死。修法:监听挂 window + finish try/finally +
  buttons===0 僵尸检测 + forceCleanupDrag 兜底。headless 合成事件复现不了这个,
  因为合成流程不会在拖拽中途触发结算重渲——真人节奏才会。
- taptap-maker MCP 装在 ~/.claude.json,工具需重启会话才加载。

- shot/interact 均 100% 缩放; interact.mjs 支持 CDP_PORT。
- 盖 pixel.css 要 !important。测试句必须语法合法否则撞成句性门槛。
- 改按轮状态记得 startCombat/endRound 两处作用域 (HANDOFF A-septies #37)。
- golden 是安全网不是圣旨: 机制性全局改动 → 重生成 + review diff 而不是硬保平。
