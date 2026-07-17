// Fixed-grid battle sprite playback. Each actor owns a 4x4 sheet with a
// bottom-centred feet anchor, so switching clips never changes layout.
const SHEET_COLS = 4;
const SHEET_ROWS = 4;

export const SPRITE_CLIPS = Object.freeze({
  // Generated frame 0 lifts a hand; neutral frames 1/2 form a calm breath.
  idle:   { start: 0,  frames: 4, fps: 3,  loop: true, sequence: [1, 2, 1, 2] },
  ready:  { start: 4,  frames: 1, fps: 0,  loop: true },
  attack: { start: 4,  frames: 4, fps: 12, loop: false },
  hurt:   { start: 8,  frames: 4, fps: 12, loop: false },
  // Defense is a deliberate held guard. Keeping one frame avoids the small
  // generated silhouette differences reading as whole-body jitter.
  defend: { start: 12, frames: 1, fps: 0,  loop: true },
  heal:   { start: 14, frames: 2, fps: 2,  loop: true },
});

const POSE_TO_CLIP = Object.freeze({
  idle: 'idle', targeted: 'idle', charmed: 'idle', old: 'idle', ready: 'ready',
  attack: 'attack', juan: 'attack',
  hit: 'hurt', dazed: 'hurt', doomed: 'hurt', lying: 'hurt',
  defend: 'defend', heal: 'heal',
});

const SPRITE_SHEETS = Object.freeze({
  lqz: '/sprites/lqz/combat.png',
  moyao: '/sprites/moyao/combat.png',
  zhigui: '/sprites/zhigui/combat.png',
  canju: '/sprites/canju/combat.png',
  wenqu: '/sprites/wenqu/combat.png',
  cangjie: '/sprites/cangjie/combat.png',
  cat: '/sprites/cat/combat.png',
  miku: '/sprites/miku/combat.png',
  shadow: '/sprites/shadow/combat.png',
  emperor: '/sprites/emperor/combat.png',
  son: '/sprites/son/combat.png',
  coactor: '/sprites/lqz/combat.png',
});

// Atlases keep their authored direction. Runtime allegiance decides the desired
// direction, and we mirror only when an atlas is reused across sides (notably
// player identity forms that borrow an enemy-shaped atlas).
const NATIVE_FACING = Object.freeze({
  lqz: 'right',
  coactor: 'right',
  moyao: 'left',
  zhigui: 'left',
  canju: 'left',
  wenqu: 'left',
  cangjie: 'left',
  cat: 'right',
  miku: 'right',
  shadow: 'right',
  emperor: 'right',
  son: 'right',
});

export const ENEMY_SPRITE_BY_PORTRAIT = Object.freeze({
  '/enemies/moyao.png': 'moyao',
  '/zhihui.png': 'zhigui',
  '/canjuguai.png': 'canju',
  '/enemies/wenquxing.png': 'wenqu',
  '/enemies/bijing.png': 'bijing',
  '/enemies/cangjie.png': 'cangjie',
  '/enemies/mohun.png': 'mohun',
  '/enemies/luoren.png': 'luoren',
  '/enemies/jingmo.png': 'jingmo',
  '/enemies/shisheng.png': 'shisheng',
  '/enemies/xuwen.png': 'xuwen',
  '/enemies/mojie.png': 'mojie',
  '/enemies/cidi.png': 'cidi',
});

export function spriteKeyForEnemy(enemy) {
  return ENEMY_SPRITE_BY_PORTRAIT[enemy?.portrait] || 'moyao';
}

function sheetFor(key) {
  // Until a role-specific generated atlas is registered, use the first ink
  // student as a pixel fallback. A missing request must never blank the actor.
  return SPRITE_SHEETS[key] || SPRITE_SHEETS.moyao;
}

function desiredFacing(host) {
  if (host.dataset.spriteSide === 'enemy' || host.id === 'puppet-enemy') return 'left';
  return 'right';
}

function nativeFacing(key) {
  // Unknown enemy keys resolve to the moyao fallback sheet, authored leftward.
  return NATIVE_FACING[key] || 'left';
}

export class SpriteAnimator {
  constructor(host) {
    this.host = host;
    this.frameEl = host.querySelector('.sprite-frame');
    this.clipName = '';
    this.frameInClip = 0;
    this.lastTick = 0;
    this.raf = 0;
    this.observer = new MutationObserver(() => this.syncFromHost());
    this.observer.observe(host, { attributes: true, attributeFilter: ['data-pose', 'data-sprite-key'] });
    this.syncFromHost(true);
  }

  syncFromHost(force = false) {
    if (!this.frameEl) return;
    const key = this.host.dataset.spriteKey || (this.host.id === 'puppet-player' ? 'lqz' : 'moyao');
    const url = sheetFor(key);
    if (force || this.frameEl.dataset.sheet !== url) {
      this.frameEl.dataset.sheet = url;
      this.frameEl.style.backgroundImage = `url("${url}")`;
    }
    const facing = desiredFacing(this.host);
    const mirror = nativeFacing(key) === facing ? 1 : -1;
    this.host.dataset.spriteFacing = facing;
    this.frameEl.style.setProperty('--sprite-mirror', String(mirror));
    const nextClip = POSE_TO_CLIP[this.host.dataset.pose] || 'idle';
    if (force || nextClip !== this.clipName) this.play(nextClip);
  }

  play(name) {
    const clip = SPRITE_CLIPS[name] || SPRITE_CLIPS.idle;
    this.clipName = name in SPRITE_CLIPS ? name : 'idle';
    this.frameInClip = 0;
    this.lastTick = performance.now();
    cancelAnimationFrame(this.raf);
    this.draw(this.frameIndex(clip));
    if (clip.fps > 0) this.raf = requestAnimationFrame((now) => this.tick(now));
  }

  tick(now) {
    const clip = SPRITE_CLIPS[this.clipName] || SPRITE_CLIPS.idle;
    if (clip.fps <= 0) return;
    const frameMs = 1000 / clip.fps;
    if (now - this.lastTick >= frameMs) {
      const advances = Math.max(1, Math.floor((now - this.lastTick) / frameMs));
      this.lastTick += advances * frameMs;
      this.frameInClip += advances;
      if (this.frameInClip >= clip.frames) {
        if (clip.loop) this.frameInClip %= clip.frames;
        else {
          // Do not mutate gameplay pose here: just return the visual track to
          // idle while puppets.js keeps ownership of hit timing and state.
          this.clipName = 'idle';
          this.frameInClip = 0;
        }
      }
      const current = SPRITE_CLIPS[this.clipName] || SPRITE_CLIPS.idle;
      this.draw(this.frameIndex(current));
    }
    if (this.host.isConnected) this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  frameIndex(clip) {
    if (clip.sequence) return clip.sequence[this.frameInClip % clip.sequence.length];
    return clip.start + this.frameInClip;
  }

  draw(frameIndex) {
    if (!this.frameEl) return;
    const col = frameIndex % SHEET_COLS;
    const row = Math.floor(frameIndex / SHEET_COLS);
    this.frameEl.style.backgroundSize = `${SHEET_COLS * 100}% ${SHEET_ROWS * 100}%`;
    this.frameEl.style.backgroundPosition = `${(col / (SHEET_COLS - 1)) * 100}% ${(row / (SHEET_ROWS - 1)) * 100}%`;
    this.frameEl.dataset.frame = String(frameIndex);
    this.frameEl.dataset.clip = this.clipName;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
  }
}

export function ensureSpriteAnimator(host) {
  if (!host || host._spriteAnimator || !host.querySelector('.sprite-frame')) return host?._spriteAnimator || null;
  host._spriteAnimator = new SpriteAnimator(host);
  return host._spriteAnimator;
}

export function initPuppetSprites(root = document) {
  root.querySelectorAll('.puppet').forEach(ensureSpriteAnimator);
}

export function makeSpriteMarkup(spriteKey, label, emoji = '') {
  return `<div class="sprite-frame" aria-label="${label}"></div><span class="puppet-emoji" aria-hidden="true">${emoji}</span><div class="puppet-label">${label}</div>`;
}
