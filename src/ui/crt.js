const CRT_KEY = 'sentence_rogue_crt';

function readCRTPreference() {
  try {
    const saved = localStorage.getItem(CRT_KEY);
    return saved === null ? true : saved !== 'off';
  } catch (error) {
    return true;
  }
}

function applyCRT(enabled) {
  const game = document.getElementById('game');
  const button = document.getElementById('crt-toggle');
  if (!game || !button) return;
  game.classList.toggle('crt-enabled', enabled);
  button.textContent = enabled ? 'CRT ON' : 'CRT OFF';
  button.setAttribute('aria-pressed', String(enabled));
  button.title = enabled ? '关闭 CRT 显示效果' : '开启 CRT 显示效果';
}

export function initCRT() {
  applyCRT(readCRTPreference());
}

export function toggleCRT() {
  const game = document.getElementById('game');
  if (!game) return;
  const enabled = !game.classList.contains('crt-enabled');
  applyCRT(enabled);
  try { localStorage.setItem(CRT_KEY, enabled ? 'on' : 'off'); } catch (error) { /* ignore */ }
}
