import './styles/index.css';

import { G, META } from './game/state.js';
import { toggleMute } from './game/audio.js';
import { startGame, endPlayerTurn, chantSentence, addToSentence, removeSentenceWord, skipReward } from './game/combat.js';
import {
  showRestScreen, restHeal, restUpgrade, closeUpgrade,
  showEventScreen, showShopScreen, shopRemoveCard, closeRemove, leaveShop,
  viewDeck, closeDeck,
  gameOver, showVictoryScreen,
  showMetaScreen, closeMetaScreen, buyPerk, buyCardMeta,
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

// Init
(function init() {
  const el = document.getElementById('title-ink-display');
  if (el && META.totalInk > 0) el.textContent = `文气: ${META.ink} | 冒险: ${META.runs}`;

  try {
    const titleScreen = document.getElementById('title-screen');
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'ink-particle';
      const size = 60 + Math.random() * 120;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (10 + Math.random() * 80) + '%';
      p.style.animationDuration = (12 + Math.random() * 18) + 's';
      p.style.animationDelay = (-Math.random() * 12) + 's';
      titleScreen.insertBefore(p, titleScreen.firstChild);
    }
  } catch (e) { /* ignore */ }
})();
