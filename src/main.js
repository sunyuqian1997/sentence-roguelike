import './styles/index.css';

import { G, META } from './game/state.js';
import { toggleMute } from './game/audio.js';
import { initInkBackground } from './ui/inkShader.js';
import { getLang, setLang } from './i18n.js';
import { startGame, endPlayerTurn, chantSentence, addToSentence, removeSentenceWord, skipReward } from './game/combat.js';
import {
  showRestScreen, restHeal, restUpgrade, closeUpgrade,
  showEventScreen, showShopScreen, shopRemoveCard, closeRemove, leaveShop,
  viewDeck, closeDeck,
  gameOver, showVictoryScreen,
  showMetaScreen, closeMetaScreen, buyPerk, buyCardMeta,
  showPoetryScreen, submitPoetry, skipPoetry,
} from './ui/screens.js';

// Expose functions to window for HTML inline onclick handlers
window.startGame = startGame;
window.showMetaScreen = showMetaScreen;
window.closeMetaScreen = closeMetaScreen;
window.viewDeck = viewDeck;
window.closeDeck = closeDeck;
window.chantSentence = chantSentence;
window.endPlayerTurn = endPlayerTurn;
window.skipReward = skipReward;
window.restHeal = restHeal;
window.restUpgrade = restUpgrade;
window.closeUpgrade = closeUpgrade;
window.shopRemoveCard = shopRemoveCard;
window.leaveShop = leaveShop;
window.closeRemove = closeRemove;
window.toggleMute = toggleMute;
window.buyPerk = buyPerk;
window.buyCardMeta = buyCardMeta;
window.submitPoetry = submitPoetry;
window.skipPoetry = skipPoetry;
window.toggleLang = function() {
  try {
    const next = getLang() === 'zh' ? 'en' : 'zh';
    setLang(next);
    window.location.href = window.location.href.split('#')[0] + '?t=' + Date.now();
  } catch (e) {
    alert('Language switch failed: ' + e.message);
  }
};

// Init
(function init() {
  initInkBackground();

  const currentLang = getLang();
  console.log('[i18n] META.lang =', META.lang, '| getLang() =', currentLang, '| localStorage =', JSON.parse(localStorage.getItem('sentence_rogue_meta') || '{}').lang);
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.textContent = currentLang === 'zh' ? 'EN / 中文' : '中文 / EN';
  if (currentLang === 'en') {
    document.querySelector('#title-screen h1').textContent = 'Ink & Verse';
    document.querySelector('#title-screen .subtitle').textContent = 'Words as swords, sentences as shields';
  }

  const el = document.getElementById('title-ink-display');
  if (el && META.totalInk > 0) el.textContent = `文气: ${META.ink} | 冒险: ${META.runs}`;

  try {
    const titleScreen = document.getElementById('title-screen');
    for (let i = 0; i < 6; i++) {
      const p = document.createElement('div');
      p.className = 'ink-particle';
      const size = 40 + Math.random() * 80;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (10 + Math.random() * 80) + '%';
      p.style.animationDuration = (15 + Math.random() * 20) + 's';
      p.style.animationDelay = (-Math.random() * 15) + 's';
      titleScreen.insertBefore(p, titleScreen.firstChild);
    }
  } catch (e) { /* ignore */ }
})();
