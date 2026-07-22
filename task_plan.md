# Task Plan: React 渐进式迁移方案

## Goal
在不破坏现有游戏规则、存档、视觉布局和 Vercel/API 能力的前提下，形成一份可由多个 sub-agent 分阶段执行、以 React 与 Motion 提升互动品质的迁移计划。

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] 确认用户希望引入 React，并允许后续用多个 sub-agent 协作
- [x] 盘点当前入口、渲染方式、状态边界与高风险模块
- [x] 核对 React/Motion 官方集成方式
- **Status:** complete

### Phase 2: Architecture & Migration Design
- [x] 选择渐进迁移策略与组件边界
- [x] 设计 React UI 与现有纯函数游戏内核的接口
- [x] 设计状态、动画、音频、存档和调试兼容方案
- **Status:** complete

### Phase 3: Agent Workstreams & Acceptance Gates
- [x] 拆分互不冲突的 sub-agent 工作流
- [x] 定义每阶段测试、截图和回滚门槛
- [x] 定义提交顺序与集成责任
- **Status:** complete

### Phase 4: Deliverable
- [x] 编写 `docs/REACT_MIGRATION_PLAN.md`
- [x] 审阅文档，确认可执行性
- [x] 提交规划文档
- **Status:** complete

### Phase 5: React/Motion Runtime
- [x] 创建迁移分支
- [x] 引入依赖、React root、MotionConfig 和 UI bridge
- [x] 保留 legacy 回滚路径
- **Status:** complete

### Phase 6: Interaction Recipes & Debug Loop
- [x] 并行实现卡牌/按钮 recipe
- [x] 并行实现窗口/AVG recipe
- [x] 建立开发环境动效 debug 页面
- **Status:** complete

### Phase 7: Integration & Browser QA
- [x] 统一接入全部卡牌、按钮和窗口
- [x] 移除重复旧动效
- [x] 完整测试、视觉/DOM 验收、效果审计和生产构建
- [x] 分阶段提交
- **Status:** complete

## Key Questions
1. 是否应该一次性重写？预期答案：不应该，应渐进迁移。
2. 哪些模块应继续保持框架无关？预期：语言解析、战斗结算、AI 判定、存档 schema。
3. 第一阶段怎样产生肉眼可见的动效提升，同时控制风险？
4. 多个 sub-agent 怎样避免同时修改同一个入口和 CSS 文件？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 先规划、后迁移 | 当前游戏已经可玩且规则复杂，直接重写风险过高 |
| 使用渐进式 React 壳层 | 可逐屏替换 DOM，同时保留游戏逻辑和已有测试 |
| 正式方案独立放在 `docs/` | 便于团队执行、评审和版本管理 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 首次读取技能时使用了错误目录 `/Users/Sunyuqian/.agents/...` | 1 | 根据技能根映射改用 `/Users/Sunyuqian/.codex/skills/...` |

## Notes
- 本任务只输出迁移计划，不修改运行时架构。
- 后续执行必须保持主线程负责集成、截图验收与最终提交。
