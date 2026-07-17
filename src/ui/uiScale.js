// 2D 游戏式 UI Scaler —— 游戏内部永远是固定设计分辨率 DESIGN_W×DESIGN_H,
// 用 transform: scale 整体等比适配窗口(居中,信箱留边由 body 背景兜底)。
// 从此不存在"每个视口各自排版":任何缩放/窗口下构图像素级一致。
//
// 坐标系约定:
//   · 屏幕坐标 = getBoundingClientRect / clientX 等浏览器原生值
//   · 设计坐标 = #game 内部的 CSS px(布局、transform 都以它为准)
//   · 换算: design = (screen - gameOrigin) / scale
// 所有"量屏幕距离 → 应用到 #game 内 transform"的代码必须除以 uiScale()
// (dragSort 让位间距、puppets 冲刺距离、手牌 FLIP);所有"挂进 #game 的
// fixed 浮层"用 toGameRect 换算(拖拽幽灵、飞卡、伤害数字、墨渍)。
export const DESIGN_W = 1240;
export const DESIGN_H = 640;
// The authoritative design preview fits the 1240×640 desktop inside a
// 12px presentation gutter on every side (1264×664 fitting box).
const FIT_GUTTER = 12;
const MAX_SCALE = 1.4;

let scale = 1;
let originX = 0, originY = 0;

export const uiScale = () => scale;

// 屏幕 rect/点 → 设计坐标
export function toGameRect(r) {
  return {
    left: (r.left - originX) / scale,
    top: (r.top - originY) / scale,
    width: r.width / scale,
    height: r.height / scale,
  };
}
export const toGameX = (x) => (x - originX) / scale;
export const toGameY = (y) => (y - originY) / scale;

export function initUiScale() {
  const g = document.getElementById('game');
  if (!g) return;
  const fit = () => {
    scale = Math.min(
      window.innerWidth / (DESIGN_W + FIT_GUTTER * 2),
      window.innerHeight / (DESIGN_H + FIT_GUTTER * 2),
      MAX_SCALE,
    );
    originX = Math.round((window.innerWidth - DESIGN_W * scale) / 2);
    originY = Math.round((window.innerHeight - DESIGN_H * scale) / 2);
    Object.assign(g.style, {
      width: DESIGN_W + 'px',
      height: DESIGN_H + 'px',
      position: 'absolute',
      left: originX + 'px',
      top: originY + 'px',
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
    });
    window.__uiScale = scale; // 调试/断言用
  };
  fit();
  window.addEventListener('resize', fit);
}
