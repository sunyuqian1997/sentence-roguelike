export const VFX = {
  // Screen shake
  shake(intensity = 'sm') {
    const el = document.getElementById('game');
    el.classList.remove('screen-shake-sm','screen-shake-md','screen-shake-lg');
    void el.offsetWidth; // force reflow
    el.classList.add(`screen-shake-${intensity}`);
    setTimeout(() => el.classList.remove(`screen-shake-${intensity}`), intensity==='lg'?500:intensity==='md'?400:300);
  },

  // Floating damage number (big, fixed position)
  damageNum(element, text, color, size = 2.2) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'dmg-num-v2';
    d.textContent = text;
    d.style.color = color;
    d.style.fontSize = size + 'rem';
    d.style.left = (rect.left + rect.width/2) + 'px';
    d.style.top = (rect.top + rect.height/2) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 950);
  },

  // Enemy hit effect
  enemyHit(enemyEl) {
    if (!enemyEl) return;
    enemyEl.classList.remove('enemy-hit-flash','enemy-shake');
    void enemyEl.offsetWidth;
    enemyEl.classList.add('enemy-hit-flash','enemy-shake');
    setTimeout(() => enemyEl.classList.remove('enemy-hit-flash','enemy-shake'), 450);
  },

  // Enemy death
  enemyDeath(enemyEl) {
    if (!enemyEl) return;
    enemyEl.classList.add('enemy-death');
  },

  // Ink ripple (chant)
  inkRipple() {
    const r = document.createElement('div');
    r.className = 'ink-ripple';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 850);
  },

  // Turn start circle
  turnCircle() {
    const c = document.createElement('div');
    c.className = 'turn-start-circle';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 750);
  },

  // Exclamation flash
  excFlash(color) {
    const f = document.createElement('div');
    f.className = 'exc-flash';
    f.style.background = `radial-gradient(circle, ${color}40, transparent 70%)`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 400);
  },

  // Exclamation chain pop (Balatro style)
  excChainPop(text, color, delay, size = 3) {
    setTimeout(() => {
      const d = document.createElement('div');
      d.className = 'exc-chain-num';
      d.textContent = text;
      d.style.color = color;
      d.style.fontSize = size + 'rem';
      d.style.left = '50%';
      d.style.top = '40%';
      document.body.appendChild(d);
      VFX.shake(size > 3 ? 'md' : 'sm');
      setTimeout(() => d.remove(), 700);
    }, delay);
  },

  // HP rolling animation
  rollHp(element) {
    if (!element) return;
    element.classList.remove('hp-rolling');
    void element.offsetWidth;
    element.classList.add('hp-rolling');
    setTimeout(() => element.classList.remove('hp-rolling'), 350);
  },

  // Spawn ink particles in combat background
  spawnInkParticles() {
    const area = document.getElementById('combat-screen');
    area.querySelectorAll('.ink-particle').forEach(p => p.remove());
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('div');
      p.className = 'ink-particle';
      const size = 80 + Math.random() * 160;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (20 + Math.random() * 60) + '%';
      p.style.animationDuration = (15 + Math.random() * 20) + 's';
      p.style.animationDelay = (-Math.random() * 15) + 's';
      area.appendChild(p);
    }
  },
};
