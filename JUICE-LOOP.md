# Juice Loop 状态文件

目标: 卡牌拖拽 juicy 化 — 造句区可排序、手牌可拖入、100% 缩放多视口验证 UI 正常。
三道门: A=逻辑(test-eval/wellformed/golden) B=交互(interact.mjs 真拖+断言 G.sentence) C=视觉(shot.mjs 三视口截图肉眼审)。

## Backlog

- [x] 0. 处理上个 session 未提交改动(猫SVG/大哥/及物逼近) — commit cef66b1
- [x] 1. 建 scripts/interact.mjs — CDP 合成 pointer 拖拽 + 中途截图 + 断言
- [x] 2. 重写造句区排序为 pointer-events 拖拽(替换 HTML5 DnD) — commit 9cbce7f
- [x] 3. 拖动时其他卡实时让位开口
- [x] 4. 手牌直接拖入造句区(保留点击), 落点=插入位; 追加:拖出 dock=移除
- [x] 5. 落下回弹 squash&stretch + 音效 + 预览条即时刷新; 无效拖拽弹回原位
- [x] 6. 多视口终验(1280×720 / 1920×1080 / 812×375, deviceScaleFactor=1) — 全过

## 轮次记录

- 2026-07-02 R1: interact.mjs 建成并冒烟(eval/shot/click)。
- 2026-07-02 R2: dragSort.js 排序手势。Gate B 发现拖影变灰 bug(克隆带上了 drag-source 类)→修。
  重排断言 PASS(我斩纸鬼→斩我纸鬼→斩纸鬼我), 让位 transform 验证 PASS。
- 2026-07-02 R3: 手牌拖入(落点=位1 PASS)+无效拖拽回弹 PASS。drop-ready 高亮太淡(pixel.css
  背景压制+脉冲透明度过低)→ !important + 稳定呼吸(outline-offset 脉冲)。
- 2026-07-02 R4: 拖出=移除 PASS, 空区拖入 PASS。Gate A(39 eval/83 wellformed/25 golden)全绿。
- 2026-07-02 R5 终验: 1920×1080 拖拽+吟诵+伤害落地 PASS; 812×375 重排 PASS。
  途中发现「斩我纸鬼」被 wellformed 拒 — 是正确游戏行为,测试句要用合法语序。

## 教训

- shot.mjs/interact.mjs 均 deviceScaleFactor:1 (100% 缩放), SHOT_W/SHOT_H 控视口。
- HTML5 DnD 无法被 CDP Input.dispatchMouseEvent 驱动; pointer-events 方案才可自动化验证。
- ghost 克隆先于/后于加 drag-source 类顺序敏感 → makeGhost 里统一剥类最稳。
- 盖 pixel.css 的背景需要 !important(它是最后加载的皮肤层)。
- 拖拽测试句必须语法合法, 否则吟诵断言撞上成句性硬门槛。
