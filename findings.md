# Findings & Decisions

## Requirements
- 当前代码已提交后再写计划。
- 评估引入 React 是否可行。
- 目标是显著改善卡牌、窗口和 AVG/战斗反馈的动效品质。
- 后续执行允许多个 sub-agent 并行，但必须避免界面错乱。
- 需要形成可持续执行的计划文档，而不是立即重写。

## Research Findings
- 当前项目由 Vite 构建，但 `package.json` 没有 React、React DOM 或 Motion 依赖。
- UI 入口集中在 `src/main.js`，现有结构是原生 JavaScript + DOM + CSS。
- 游戏规则已经拆到 `src/game/` 与 `src/lang/`，这为保留规则内核、只迁移 UI 提供了良好基础。
- 现有测试覆盖句子判定、战斗规则、牌组循环与效果审计，可作为迁移回归门禁。
- 当前约有 9,747 行 UI/样式相关代码；高风险集中在 `src/ui/render.js`、`src/ui/screens.js`、`index.html` 和大量全局 CSS，`src/game/combat.js` 本身也有 1,533 行并负责战斗时序。
- `index.html` 含大量静态界面和 inline `onclick`；`render.js/screens.js` 通过 `innerHTML`、`createElement`、直接绑定事件和修改 style/class 更新画面。
- React 官方明确支持在现有页面内建立多个独立 root，再逐渐向上迁移；这与当前项目最匹配。
- React root 首次渲染会清空挂载节点内部现有 HTML，因此每个迁移边界必须先有专用空容器，不能直接把 root 挂到仍由旧代码管理的节点上。
- Motion 的 `AnimatePresence` 可处理退出动画，`layout`/`layoutId` 可处理卡牌重排与共享布局；需要注意 transform 会改变绝对定位子元素的 offset parent。
- 当前 Vite 为 6.x；最新 React 插件面向更新的 Vite 主版本，因此迁移时不能顺手升级 Vite，应该先选择与 Vite 6 兼容的 `@vitejs/plugin-react` 版本并锁定依赖，构建工具升级另开任务。
- `G` 是全局可变对象，且写入分散在多个 game/ui 模块。React 初期应通过一个带版本号和缓存快照的 external-store adapter 订阅，不能直接让 `getSnapshot()` 每次返回新对象。
- 战斗模块含大量 `setTimeout` 和直接 `renderCombat()` 调用；要先抽成可取消的 timeline/phase 层，再把舞台演出交给 Motion，否则 React 重渲染可能与旧定时器争抢同一节点。
- Vercel 配置只是 Vite 静态输出加现有 `/api` Functions，引入客户端 React 不需要改变部署模型。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 不做 Big Bang 重写 | 容易破坏教程、战斗时序、动画、音频和存档 |
| React 负责视图与互动状态，规则内核保持纯 JS | 降低迁移范围并保留现有测试价值 |
| 动效层采用 Motion，而非手写更多全局 CSS | 更适合可中断弹簧、布局动画、存在动画和序列化反馈 |
| 第一批只迁移共用原子组件与独立页面 | 可快速验证视觉收益和架构正确性 |
| 初期使用多个 React islands，成熟后合并为单一 App root | 官方支持渐进接入，也能避免旧 DOM 与 React 同时拥有同一节点 |
| 暂不迁移到 TypeScript | 先控制变量；迁移稳定后再评估类型化 |
| 不在同一批升级 Vite 主版本 | 避免把框架迁移和构建工具迁移的风险叠加 |
| 先建立 `uiStore` 适配器，不立即引入 Zustand/Redux | 当前状态形态简单但可变；先用 React 官方 external-store 接口降低依赖与改动范围 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 规划技能首次路径定位错误 | 使用正确的 `.codex/skills/planning-with-files` 路径继续 |

## Resources
- 项目入口：`src/main.js`
- UI 渲染：`src/ui/render.js`、`src/ui/screens.js`
- 游戏内核：`src/game/`、`src/lang/`
- 回归命令：`npm run test:deck-loop`、`npm run test:battle-rules`、`npm run test:judge`、`npm run audit:effects`
- React 渐进接入：https://react.dev/learn/add-react-to-an-existing-project
- React `createRoot`：https://react.dev/reference/react-dom/client/createRoot
- Motion React：https://motion.dev/docs/react
- Motion 布局动画：https://motion.dev/docs/react-layout-animations
- Motion 退出动画：https://motion.dev/docs/react-animate-presence
- React `useSyncExternalStore`：https://react.dev/reference/react/useSyncExternalStore
- Vite React 支持：https://vite.dev/guide/features.html

## Visual/Browser Findings
- 本轮尚未进行新的浏览器视觉检查；计划阶段将以现有页面结构和已通过的浏览器验收为基线。
