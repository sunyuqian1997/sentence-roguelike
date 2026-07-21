# React + Motion 迁移执行方案

## 目标

在保留现有游戏规则、存档、Vercel API 和复古视觉布局的前提下，引入 React 与 Motion，优先重做所有卡牌、按钮、窗口和 AVG 的互动反馈，并建立可独立检查的动效调试页。

## 原则

1. 不重写 `src/game/`、`src/lang/` 的规则内核。
2. 同一个 DOM 节点只能由旧渲染器或 React 其中一方管理。
3. 迁移期间提供 legacy/react-motion 切换和回滚路径。
4. 不同时升级 Vite 主版本；React 插件选择与 Vite 6 兼容的版本。
5. 动效必须支持 `prefers-reduced-motion`，并避免 blur、渐隐和影响角色原图的滤镜。

## 阶段

### 1. React/Motion 基础层

- 安装并锁定 React、React DOM、Motion 与兼容的 Vite React 插件。
- 建立 React interaction root、Error Boundary、MotionConfig 和统一动效 token。
- 建立可缓存快照的 UI bridge，兼容当前可变 `G` 状态。
- 保留原页面为默认回滚路径。

### 2. 可检查的动效实验室

- 新增仅开发环境可见的动效 debug 页面。
- 展示普通/稀有/升级/禁用/拖拽中的卡牌。
- 展示普通窗口、模态窗口、AVG 对话框、设置窗口与战斗 HUD。
- 支持逐项开关 hover、press、layout、enter、exit 和 reduced-motion。

### 3. 全局互动接入

- 卡牌：弹簧抬升、指针倾斜、按压、手牌重排、从手牌进入句子的共享布局反馈。
- 窗口：进入、退出、焦点切换和遮罩，不改变既有定位 transform。
- 按钮：hover、press、disabled 与音效同步。
- AVG：对话切换、角色/文本节奏、点击推进反馈。
- 移除旧 `microTransitions.js` 的重复效果，避免双重动画。

### 4. 页面级 React islands

- 先迁移设置、提示、卡牌 tooltip、句子记录等独立模块。
- 再迁移标题页、地图/奖励/商店等低风险页面。
- 战斗手牌和造句区最后迁移；戏台 Sprite/时间轴在行为完全一致后再接管。

### 5. 集成与验收

- 每阶段运行规则测试、效果审计和生产构建。
- 浏览器检查标题、教程、单/双敌人战斗、守护、召唤、地图和结算。
- 对比 1240×640 设计画布与常用桌面尺寸截图。
- React 模式验收后设为默认，legacy 保留一个提交周期后再删除。

## Sub-agent 分工

并发只发生在互不重叠的文件范围：

- Runtime agent：依赖、Vite、React root、UI bridge。
- Card motion agent：卡牌/按钮 motion recipe 与组件。
- Window motion agent：窗口/AVG recipe 与动效 debug 页面。
- 主线程：入口集成、旧代码去重、浏览器验收、测试和提交。

Sub-agent 不修改 `src/main.js`、`index.html`、`vite.config.js` 等共享入口；这些文件由主线程统一整合。

## 每阶段门禁

```bash
npm run test:deck-loop
npm run test:battle-rules
npm run test:judge
npm run audit:effects
npm run build
```

只有全部通过、截图无错位、legacy 可回滚时才允许进入下一阶段。

