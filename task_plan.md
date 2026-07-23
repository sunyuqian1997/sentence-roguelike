# Task Plan: 教程修整与句法成长循环

## Goal
修正造句区与教程的视觉/叙事错误，并通过多轮真实句子模拟，升级每关后的选牌，让玩家的可表达句式随进程稳定变丰富。

## Current Phase
Complete

## Phases

### Phase 1: UI / Tutorial Diagnosis
- [x] 核对用户截图与当前造句区样式
- [x] 定位主语误加边框、长句挤压、教程透明层扩散原因
- [x] 修正教程台词与人物呈现
- **Status:** complete

### Phase 2: Expressive Progression Design
- [x] 盘点现有卡池、语法支持和奖励算法
- [x] 建立跨楼层的“可组成句式”模拟与质量指标
- [x] 设计并实现避免废选项的奖励三选一
- **Status:** complete

### Phase 3: Dogfood & Tuning
- [x] 自动跑多轮成长路线，记录每层新句式与重复度
- [x] 在浏览器中从教程到奖励页实际游玩
- [x] 根据结果调奖励节奏、示例和视觉层级
- **Status:** complete

### Phase 4: Verification & Commit
- [x] 回归句法、战斗、教程、React Motion 与构建
- [x] 完成 DOM/样式验收（截图接口超时，使用可访问树与实际 computed/class 状态）
- [x] 按 UI 修复与玩法循环分批提交
- **Status:** complete

## Key Questions
1. 现有奖励是否真的增加“句式”，还是只增加近义词和数值？
2. 如何确保三选一至少包含一个能与现有牌组组成新句子的选择？
3. 教程何时让戏台角色由半透明变为实体，才能与玩家放词动作一致？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 仅戏台小人使用教程幽灵态 | 用户明确两侧立绘和造句区不应透明 |
| 主语不使用患者边框 | 边框只表达及物动作的受动对象 |
| 奖励按句法互补性分槽 | 随机稀有度无法保证表达能力成长 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 暂无 | — | — |

## Notes
- 保留现有 React Motion 渐进运行时，不在本轮重写页面。
- 所有新增奖励示例必须通过当前真实成句判定与效果结算。
