export const VFX = {
  shake(intensity = 'sm') {
    const el = document.getElementById('game');
    el.classList.remove('screen-shake-sm', 'screen-shake-md', 'screen-shake-lg');
    void el.offsetWidth;
    el.classList.add(`screen-shake-${intensity}`);
    const dur = intensity === 'lg' ? 500 : intensity === 'md' ? 400 : 300;
    setTimeout(() => el.classList.remove(`screen-shake-${intensity}`), dur);
  },

  damageNum(element, text, color, size = 2.2) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'dmg-num-v2';
    d.textContent = text;
    d.style.color = color;
    d.style.fontSize = size + 'rem';
    d.style.left = (rect.left + rect.width / 2) + 'px';
    d.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 950);
  },

  enemyHit(enemyEl) {
    if (!enemyEl) return;
    enemyEl.classList.remove('enemy-hit-flash', 'enemy-shake');
    void enemyEl.offsetWidth;
    enemyEl.classList.add('enemy-hit-flash', 'enemy-shake');
    setTimeout(() => enemyEl.classList.remove('enemy-hit-flash', 'enemy-shake'), 450);
  },

  enemyDeath(enemyEl) {
    if (!enemyEl) return;
    enemyEl.classList.add('enemy-death');
  },

  inkRipple() {
    const r = document.createElement('div');
    r.className = 'ink-ripple';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 850);
  },

  inkSplash(x, y, color) {
    const el = document.createElement('div');
    el.className = 'ink-splash';
    if (color) el.style.background = `radial-gradient(circle, ${color}, transparent 70%)`;
    el.style.left = (x || window.innerWidth / 2) + 'px';
    el.style.top = (y || window.innerHeight / 2) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
  },

  brushStrike() {
    const el = document.createElement('div');
    el.className = 'brush-strike';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
  },

  turnCircle() {
    const c = document.createElement('div');
    c.className = 'turn-start-circle';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 750);
  },

  excFlash(color) {
    const f = document.createElement('div');
    f.className = 'exc-flash';
    const c = color || 'rgba(197,75,60,0.3)';
    f.style.background = `radial-gradient(circle, ${c}, transparent 70%)`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 400);
  },

  excChainPop(text, color, delay, size = 3) {
    setTimeout(() => {
      const d = document.createElement('div');
      d.className = 'exc-chain-num';
      d.textContent = text;
      d.style.color = color || 'var(--gold)';
      d.style.fontSize = size + 'rem';
      d.style.left = '50%';
      d.style.top = '40%';
      document.body.appendChild(d);
      VFX.shake(size > 3 ? 'md' : 'sm');
      setTimeout(() => d.remove(), 700);
    }, delay);
  },

  rollHp(element) {
    if (!element) return;
    element.classList.remove('hp-rolling');
    void element.offsetWidth;
    element.classList.add('hp-rolling');
    setTimeout(() => element.classList.remove('hp-rolling'), 350);
  },

  spawnInkParticles() {
    const area = document.getElementById('combat-screen');
    if (!area) return;
    area.querySelectorAll('.ink-particle').forEach(p => p.remove());
    for (let i = 0; i < 4; i++) {
      const p = document.createElement('div');
      p.className = 'ink-particle';
      const size = 60 + Math.random() * 100;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (20 + Math.random() * 60) + '%';
      p.style.animationDuration = (18 + Math.random() * 22) + 's';
      p.style.animationDelay = (-Math.random() * 18) + 's';
      area.appendChild(p);
    }
  },
};
