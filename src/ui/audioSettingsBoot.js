import '../styles/system-settings.css';

import {
  initAmbientMusicOnFirstInteraction,
  initAudioSettings,
} from '../game/audio.js';

initAudioSettings();
initAmbientMusicOnFirstInteraction();

// The game has two authoritative top bars: the desktop menubar and the battle
// status bar. Keep one settings control, but mount it inside whichever bar is
// currently visible so it never floats over the interface.
const settingsButton = document.getElementById('settings-btn');
const desktopBar = document.getElementById('os-menubar');
const desktopSpacer = desktopBar?.querySelector('.os-menubar-spacer');
const combatBar = document.getElementById('combat-top');
const combatScreen = document.getElementById('combat-screen');
const settingsPanel = document.getElementById('audio-settings-panel');

function positionSettingsPanel() {
  if (!settingsButton || !settingsPanel) return;
  settingsPanel.style.left = `${settingsButton.offsetLeft}px`;
  settingsPanel.style.top = `${settingsButton.offsetTop + settingsButton.offsetHeight + 4}px`;
}

function syncSettingsButtonHost() {
  if (!settingsButton || !desktopBar || !combatBar || !combatScreen) return;
  if (combatScreen.classList.contains('active')) {
    if (settingsButton.parentElement !== combatBar) combatBar.prepend(settingsButton);
  } else if (settingsButton.parentElement !== desktopBar) {
    desktopBar.insertBefore(settingsButton, desktopSpacer || null);
  }
  positionSettingsPanel();
}

syncSettingsButtonHost();
if (combatScreen) {
  new MutationObserver(syncSettingsButtonHost).observe(combatScreen, {
    attributes: true,
    attributeFilter: ['class'],
  });
}
settingsButton?.addEventListener('click', () => requestAnimationFrame(positionSettingsPanel));
window.addEventListener('resize', positionSettingsPanel);
