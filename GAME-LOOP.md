# Game Loop 状态文件 (v2 — 机制大循环)

前身 JUICE-LOOP.md(拖拽 juice, 已全部完成 commit 9cbce7f)。本文件跟踪九个 idea 的实现循环。
用户已定向: 语义评判=纯规则 / 创造力经济=衰减+新意 / 难度=STS 正常 / 连环画=程序化 SVG。

## 四道门 (每轮全过才 commit)

- A 逻辑: node test-eval.node.mjs + scripts/test-wellformed.mjs + golden-verify (机制改动需重生成 golden 并人工 review diff)
- B 交互: scripts/interact.mjs 真实操作断言 (CDP_PORT 环境变量避免并行冲突: 主线9224/agent9223)
- C 视觉: 1280×720 / 1920×1080 / 812×375, deviceScaleFactor=1 (100% 缩放) 截图肉眼审
- D 数值: scripts/balance-sim.mjs 曲线 vs BALANCE.md 目标; 核心判据 = 多样造句策略收益 ≥ 刷句策略

## Backlog

- [ ] P0 数值地基: BALANCE.md + balance-sim.mjs + chant-stats.mjs 【agent A 后台跑】
- [x] P1 创造力经济: 衰减+新意 d06f1ca; 韵脚角标(render.js 未提交,随 P4 一起)
- [x] P2 连续句承接链 3a4807d
- [x] P3 「用X戳」工具格 c9d9c58 — 意外联动:猫既是武器又自动 co-actor 助战,保留
- [ ] P4 吐槽气泡 【agent B 后台跑】
- [ ] P5 场景系统: 地点卡+去句式+舞台变景+全局buff; 景物词=舞台道具
  ⚠️ 「去」已有感叹卡(qu: 我去!/我去V), 加地点句式时用 meanings 多义裁决
- [ ] P6 结算短篇选句奖励 + 通关连环画 (程序化 SVG)
- [ ] P7 文房道具 (小丑牌式遗物) + 终局平衡大循环
- [ ] 补: 韵表覆盖太小(我/鬼/月/海都不在) — 扩 RHYME_GROUPS, 配合韵脚角标才有存在感
- [ ] 补: en 语言包补 P1-P3 对应规则(economy/continuity/instrument)

## 轮次记录

- 2026-07-02: loop v2 启动。agent A(P0)/agent B(P4) 并行, 主线 P1→P2→P3 三连 commit。
  P1 踩坑:journals 在评估前 push,经济台账必须评估后记账(creativity.js 时序契约)。
  Gate B 踩坑:并行 agent 改文件触发 vite 热重载会重置 G,交互断言偶发假阴性 → 重跑即可。

## 教训 (承袭 JUICE-LOOP)

- shot/interact 均 100% 缩放; interact.mjs 支持 CDP_PORT。
- 盖 pixel.css 要 !important。测试句必须语法合法否则撞成句性门槛。
- 改按轮状态记得 startCombat/endRound 两处作用域 (HANDOFF A-septies #37)。
- golden 是安全网不是圣旨: 机制性全局改动 → 重生成 + review diff 而不是硬保平。
