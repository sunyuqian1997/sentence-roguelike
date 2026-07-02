# Juice Loop 状态文件

目标: 卡牌拖拽 juicy 化 — 造句区可排序、手牌可拖入、100% 缩放多视口验证 UI 正常。
三道门: A=逻辑(test-eval/wellformed/golden) B=交互(interact.mjs 真拖+断言 G.sentence) C=视觉(shot.mjs 三视口截图肉眼审)。

## Backlog

- [ ] 0. 处理上个 session 未提交改动(猫SVG/大哥/及物逼近) — 验证后 commit
- [ ] 1. 建 scripts/interact.mjs — CDP 合成 pointer 拖拽 + 中途截图 + probe 断言
- [ ] 2. 重写造句区排序为 pointer-events 拖拽(替换 HTML5 DnD): 自定义拖影(抬起/放大/阴影/微倾)
- [ ] 3. 拖动时其他卡 FLIP 让位, 插入间隙指示
- [ ] 4. 手牌直接拖入造句区(保留点击), 落点=插入位
- [ ] 5. 落下回弹 squash&stretch + 音效 + 预览条即时刷新; 无效拖拽弹回原位
- [ ] 6. 多视口终验(1280×720 / 1920×1080 / 375×812, deviceScaleFactor=1) + 收尾 commit

## 轮次记录

(每轮: 日期 / 做了什么 / gate 结果 / 截图 / 教训)

## 教训

- shot.mjs 已是 deviceScaleFactor:1 (100% 缩放), SHOT_W/SHOT_H 控视口。
- HTML5 DnD 无法被 CDP Input.dispatchMouseEvent 可靠驱动, pointer-events 方案才可自动化验证。
