// ============================================================
// CHEATS · 起司的开挂模块
// ============================================================
// 入口三种：
//   1. URL 参数：?cheat=1   (打开页面自动开启)
//   2. Console 函数：cheat() / giveGold(n) / 无限金币()
//   3. 键盘快捷键：按反引号 ` 切换；按 G 键加 999 金币
// ============================================================

import { G, META, saveMeta } from './game/state.js';
import { WORD_DEFS, createStarterDeck } from './data/cards.js';

// Debug helper: drop words straight into the sentence area by their Chinese
// text (for screenshots / autocombat). Enemy names become enemy-target cards.
function prefillSentence(words) {
  const byWord = {};
  for (const [key, def] of Object.entries(WORD_DEFS)) {
    if (!(def.word in byWord)) byWord[def.word] = key;
  }
  G.sentence = [];
  let uid = 0;
  for (const w of words) {
    const trimmed = w.trim();
    if (!trimmed) continue;
    const enemyIdx = (G.enemies || []).findIndex(e => e.name === trimmed);
    if (enemyIdx >= 0) {
      G.sentence.push({ word: trimmed, pos: 'object', cost: 0, _isEnemyTarget: true, _enemyIdx: enemyIdx, id: 'dbg' + (uid++) });
    } else if (trimmed === '我') {
      G.sentence.push({ ...WORD_DEFS.wo, key: 'wo', _isFixedWo: true, id: 'dbg' + (uid++) });
    } else if (byWord[trimmed]) {
      G.sentence.push({ ...WORD_DEFS[byWord[trimmed]], key: byWord[trimmed], id: 'dbg' + (uid++) });
    }
  }
  if (window.__renderCombat) window.__renderCombat();
}

const CHEAT_GOLD_FLOOR = 9999;
let cheatMode = false;
let bannerEl = null;

function refreshGoldUI() {
  const ids = ['map-gold', 'shop-gold'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.textContent = G.gold;
  }
}

function showBanner(text) {
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.id = 'cheat-banner';
    bannerEl.style.cssText = [
      'position:fixed', 'top:14px', 'left:50%', 'transform:translateX(-50%)',
      'padding:6px 14px', 'background:rgba(40,20,10,0.85)', 'color:#f5d77e',
      'font-size:0.75rem', 'letter-spacing:0.1em', 'border:1px solid #b8862e',
      'border-radius:4px', 'z-index:9999', 'pointer-events:none',
      'font-family:"Cormorant Garamond","Noto Serif SC",serif',
      'box-shadow:0 0 12px rgba(184,134,46,0.4)',
    ].join(';');
    document.body.appendChild(bannerEl);
  }
  bannerEl.textContent = text;
  bannerEl.style.opacity = '1';
  clearTimeout(bannerEl._t);
  bannerEl._t = setTimeout(() => { bannerEl.style.opacity = '0.0'; }, 1800);
  bannerEl.style.transition = 'opacity 0.4s';
}

export function setCheatMode(on) {
  cheatMode = !!on;
  if (cheatMode) {
    // 同时把 meta 文气也拉满，方便商店购买永久升级
    META.ink = Math.max(META.ink, 9999);
    saveMeta();
    G.gold = Math.max(G.gold, CHEAT_GOLD_FLOOR);
    refreshGoldUI();
    showBanner('✦ 无限金币模式 已开启 ✦');
  } else {
    showBanner('— 无限金币模式 已关闭 —');
  }
  return cheatMode;
}

export function toggleCheat() {
  return setCheatMode(!cheatMode);
}

export function giveGold(n = 999) {
  G.gold = (G.gold || 0) + n;
  refreshGoldUI();
  showBanner(`+${n} 文银`);
}

export function isCheatOn() {
  return cheatMode;
}

export function initCheats() {
  // URL 参数自动开启
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cheat') === '1' || params.get('cheat') === 'true') {
      setCheatMode(true);
    }
    // 调试/截图入口：?autocombat=1 直接进入一场战斗（跳过地图与剧情），
    // 可选 ?enemy=zhigui 指定敌人，?sentence=纸鬼,给,我,戳 预填造句区。
    if (params.get('autocombat') === '1') {
      const enemyKey = params.get('enemy') || 'zhigui';
      const tryStart = () => {
        if (!window.__startCombat || !window.__ENEMY_DEFS) { setTimeout(tryStart, 120); return; }
        try {
          const defs = window.__ENEMY_DEFS;
          const def = defs[enemyKey] || Object.values(defs)[0];
          // __startCombat skips startGame, so seed a deck or drawCards finds nothing.
          if (!G.deck || G.deck.length === 0) G.deck = createStarterDeck();
          window.__startCombat([{ ...def }]);
          const pre = params.get('sentence');
          if (pre) setTimeout(() => prefillSentence(pre.split(',')), 200);
        } catch (e) { console.error('autocombat failed', e); }
      };
      tryStart();
    }
  } catch (e) { /* ignore */ }

  // Console 入口
  window.cheat = toggleCheat;
  window.giveGold = giveGold;
  window['无限金币'] = () => setCheatMode(true);
  window.cheatStatus = () => cheatMode;

  // 键盘快捷键
  window.addEventListener('keydown', (ev) => {
    // 在输入框里按键时跳过
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (ev.key === '`' || ev.key === '~') {
      ev.preventDefault();
      toggleCheat();
    } else if (ev.key === 'g' || ev.key === 'G') {
      // 单纯加金币（不切换模式）
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return; // 别和浏览器快捷键打架
      giveGold(999);
    }
  });

  // 持续补金币：cheatMode 开启时每 400ms 把金币拉回 9999
  setInterval(() => {
    if (!cheatMode) return;
    if (G.gold < CHEAT_GOLD_FLOOR) {
      G.gold = CHEAT_GOLD_FLOOR;
      refreshGoldUI();
    }
  }, 400);

  // 在控制台打个招呼，方便起司找到入口
  try {
    const style = 'color:#f5d77e;background:#2a1810;padding:4px 8px;border-radius:3px;font-weight:bold;';
    // eslint-disable-next-line no-console
    console.log('%c词灵录 · 作弊菜单已加载', style);
    // eslint-disable-next-line no-console
    console.log(
      '可用指令：\n' +
      '  cheat()       切换无限金币模式\n' +
      '  giveGold(n)   立即获得 n 文银（默认 999）\n' +
      '  无限金币()    强制开启无限金币\n' +
      '  cheatStatus() 查询当前是否开挂\n' +
      '快捷键：\n' +
      '  按  `  键     切换无限金币模式\n' +
      '  按  G  键     +999 文银\n' +
      'URL：附加 ?cheat=1 自动开启'
    );
  } catch (e) { /* ignore */ }
}
