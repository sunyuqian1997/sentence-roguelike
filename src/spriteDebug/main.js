import '../styles/sprite-debug.css';

const root = document.querySelector('#sprite-debug-root');

if (!import.meta.env.DEV) {
  document.title = '404 · Not Found';
  root.innerHTML = `
    <main class="production-lock" role="main">
      <p class="eyebrow">404 / RELEASE BUILD</p>
      <h1>Sprite 检视台仅在本地开发环境开放</h1>
      <p>此页面未连接游戏菜单，也不会在正式版本中提供调试数据。</p>
    </main>`;
} else {
  boot().catch((error) => {
    root.innerHTML = `
      <main class="production-lock" role="main">
        <p class="eyebrow">DEV TOOL ERROR</p>
        <h1>无法载入 Sprite 检视台</h1>
        <pre>${escapeHtml(error instanceof Error ? error.stack || error.message : String(error))}</pre>
      </main>`;
    console.error('[sprite-debug]', error);
  });
}

async function boot() {
  const [contractResponse, manifestResponse, conceptResponse] = await Promise.all([
    fetch('/sprites/atlas-contract.json', { cache: 'no-store' }),
    fetch('/__sprite-debug/manifest', { cache: 'no-store' }),
    fetch(`/sprites/concepts/manifest.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
  ]);
  if (!contractResponse.ok) throw new Error(`图集契约读取失败：HTTP ${contractResponse.status}`);
  if (!manifestResponse.ok) throw new Error(`开发清单读取失败：HTTP ${manifestResponse.status}`);

  const contract = await contractResponse.json();
  const manifest = await manifestResponse.json();
  const conceptContentType = conceptResponse?.headers?.get('content-type') || '';
  const conceptManifest = conceptResponse?.ok && conceptContentType.includes('application/json')
    ? await conceptResponse.json().catch(() => null)
    : null;
  const app = new SpriteDebugApp(root, contract, manifest, conceptManifest);
  app.mount();
}

const CHARACTER_NAMES = Object.freeze({
  lqz: '林夕',
  coactor: '我方变身 / 协演',
  moyao: '墨妖',
  zhigui: '纸鬼',
  canju: '残句怪',
  wenqu: '文曲星',
  bijing: '笔精',
  cangjie: '仓颉之影',
  mohun: '墨魂',
  luoren: '落人',
  jingmo: '镜墨',
  shisheng: '诗圣残魂',
  xuwen: '虚文',
  mojie: '墨劫',
  cidi: '词帝幽灵',
  cat: '猫 · 身份/协演',
  miku: '初音未来 · 身份/协演',
  shadow: '影子 · 身份/协演',
  emperor: '皇帝 · 身份/协演',
  son: '儿子 · 身份/协演',
});

const CLIP_NAMES = Object.freeze({
  idle: '待机',
  ready: '预备',
  attack: '攻击',
  hurt: '受击',
  defend: '防御',
  heal: '治疗',
});

const REQUIRED_CONCEPTS = Object.freeze([
  { key: 'cat', name: '猫', expectedPath: '/sprites/concepts/cat.png' },
  { key: 'miku', name: '初音未来', expectedPath: '/sprites/concepts/miku.png' },
  { key: 'shadow', name: '影子', expectedPath: '/sprites/concepts/shadow.png' },
  { key: 'emperor', name: '皇帝', expectedPath: '/sprites/concepts/emperor.png' },
  { key: 'son', name: '儿子', expectedPath: '/sprites/concepts/son.png' },
]);

class SpriteDebugApp {
  constructor(host, contract, manifest, conceptManifest) {
    this.host = host;
    this.contract = contract;
    this.manifest = manifest;
    this.concepts = normalizeConceptManifest(conceptManifest);
    this.players = [];
    this.isPlaying = true;
    this.speed = 1;
    this.zoom = 1;
    this.background = 'checker';
    this.lastTime = performance.now();
    this.raf = 0;
  }

  mount() {
    const clips = Object.entries(this.contract.clips || {});
    const grid = this.contract.grid || { columns: 4, rows: 4 };
    this.host.innerHTML = `
      <header class="debug-header">
        <div>
          <p class="eyebrow">LOCAL DEVELOPMENT / SPRITE QA</p>
          <h1>角色动作检视台</h1>
          <p class="lede">每个动作同时播放；黄标表示代用，红标表示正式图集缺失。</p>
        </div>
        <dl class="contract-strip" aria-label="图集契约">
          <div><dt>ATLAS</dt><dd>${grid.columns} × ${grid.rows}</dd></div>
          <div><dt>FRAME</dt><dd>${grid.frameWidth || '—'} px</dd></div>
          <div><dt>ANCHOR</dt><dd>${escapeHtml(this.contract.anchor?.name || '—')}</dd></div>
          <div><dt>ROLES</dt><dd>${this.manifest.characters.length}</dd></div>
        </dl>
      </header>

      <section class="concept-review" aria-labelledby="concept-review-title">
        <header class="concept-review-header">
          <div>
            <p class="eyebrow">STATIC CONCEPT REVIEW / IDENTITY FORMS</p>
            <h2 id="concept-review-title">「我是——」静态设定稿</h2>
            <p>先在这里验收透明全身造型，再进入下方动作拆帧。页面刷新会重新读取 <code>concepts/manifest.json</code>。</p>
          </div>
          <div class="concept-review-actions">
            <button class="concept-refresh" type="button" title="重新读取静态设定稿清单">↺ 重新扫描</button>
            <fieldset class="concept-background-control">
              <legend>设定稿底色</legend>
              <button class="concept-swatch swatch-cream" data-concept-background="cream" type="button">米白</button>
              <button class="concept-swatch swatch-checker is-active" data-concept-background="checker" type="button">棋盘</button>
              <button class="concept-swatch swatch-stage" data-concept-background="stage" type="button">戏台</button>
            </fieldset>
          </div>
        </header>
        <div class="concept-grid" data-concept-grid>
          ${this.concepts.map((concept, index) => this.conceptMarkup(concept, index)).join('')}
        </div>
      </section>

      <section class="debug-toolbar" aria-label="动画检视控制">
        <div class="transport-group">
          <button class="tool-button tool-button-primary" id="toggle-play" type="button" aria-pressed="true">Ⅱ 暂停全部</button>
          <button class="tool-button" id="restart-all" type="button">↺ 全部重播</button>
          <button class="tool-button step-control" data-step="-1" type="button" title="暂停并后退一帧">← 帧</button>
          <button class="tool-button step-control" data-step="1" type="button" title="暂停并前进一帧">帧 →</button>
        </div>

        <label class="range-control">
          <span>速度 <output id="speed-output">1.00×</output></span>
          <input id="speed-control" type="range" min="0.25" max="2.5" step="0.25" value="1">
        </label>
        <label class="range-control">
          <span>缩放 <output id="zoom-output">100%</output></span>
          <input id="zoom-control" type="range" min="0.65" max="1.8" step="0.05" value="1">
        </label>
        <fieldset class="background-control">
          <legend>底色</legend>
          <button class="swatch swatch-transparent" data-background="transparent" type="button" aria-label="透明底色"></button>
          <button class="swatch swatch-checker is-active" data-background="checker" type="button" aria-label="棋盘底色"></button>
          <button class="swatch swatch-stage" data-background="stage" type="button" aria-label="戏台底色"></button>
        </fieldset>
      </section>

      <main class="roster" style="--clip-count:${clips.length}">
        ${this.manifest.characters.map((character, index) => this.characterMarkup(character, clips, index)).join('')}
      </main>
      <footer class="debug-footer">
        <span>数据源：atlas-contract.json + 运行时 Sprite 注册表</span>
        <span>最近扫描：${new Date(this.manifest.generatedAt).toLocaleTimeString('zh-CN')}</span>
      </footer>`;

    this.bindControls();
    this.bindConceptReview();
    this.createPlayers();
    this.applyBackground();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((time) => this.tick(time));
  }

  conceptMarkup(concept, index) {
    const hasAsset = Boolean(concept.path);
    const isAnimated = concept.statusLabel === 'approved_animated';
    const stateLabel = !hasAsset ? 'PENDING ASSET' : isAnimated ? 'APPROVED / ANIMATED' : 'AWAITING REVIEW';
    const pathLabel = concept.path || concept.expectedPath;
    return `
      <article class="concept-card ${hasAsset ? 'has-concept' : 'is-concept-pending'}" data-concept-key="${escapeHtml(concept.key)}" style="--concept-index:${index}">
        <header>
          <div>
            <span class="concept-index">CONCEPT ${String(index + 1).padStart(2, '0')}</span>
            <h3>${escapeHtml(concept.name)}</h3>
            <code>${escapeHtml(concept.key)}</code>
          </div>
          <span class="concept-review-status">${stateLabel}</span>
        </header>
        <div class="concept-art-well" data-concept-well="checker">
          ${hasAsset
            ? `<img src="${escapeHtml(concept.path)}?review=${Date.now()}" alt="${escapeHtml(concept.name)}透明背景全身设定稿" loading="eager">`
            : `<div class="concept-placeholder" role="img" aria-label="${escapeHtml(concept.name)}设定稿尚未生成">
                <span class="placeholder-figure" aria-hidden="true">◇</span>
                <strong>等待透明全身稿</strong>
                <small>REFRESH AFTER EXPORT</small>
              </div>`}
          <span class="review-stamp">${isAnimated ? 'APPROVED<br>ANIMATED' : 'AWAITING<br>REVIEW'}</span>
        </div>
        <footer>
          <span>${hasAsset ? escapeHtml(concept.statusLabel) : '尚未找到文件'}</span>
          <code title="${escapeHtml(pathLabel)}">${escapeHtml(pathLabel)}</code>
        </footer>
      </article>`;
  }

  bindConceptReview() {
    const section = this.host.querySelector('.concept-review');
    section.querySelector('.concept-refresh').addEventListener('click', () => window.location.reload());
    section.querySelectorAll('[data-concept-background]').forEach((button) => {
      button.addEventListener('click', () => {
        const background = button.dataset.conceptBackground;
        section.querySelectorAll('[data-concept-background]').forEach((candidate) => {
          candidate.classList.toggle('is-active', candidate === button);
        });
        section.querySelectorAll('[data-concept-well]').forEach((well) => {
          well.dataset.conceptWell = background;
        });
      });
    });
    section.querySelectorAll('.concept-card img').forEach((image) => {
      image.addEventListener('error', () => {
        const card = image.closest('.concept-card');
        card.classList.remove('has-concept');
        card.classList.add('is-concept-pending', 'has-load-error');
        image.replaceWith(makeConceptLoadError(image.alt));
        const status = card.querySelector('.concept-review-status');
        status.textContent = 'FILE ERROR';
        card.querySelector('footer > span').textContent = '清单存在，但图片无法读取';
      });
    });
  }

  characterMarkup(character, clips, index) {
    const displayName = CHARACTER_NAMES[character.key] || character.key;
    const status = this.statusFor(character);
    return `
      <section class="character-row mode-${character.mode}" data-character="${escapeHtml(character.key)}" style="--row-index:${index}">
        <header class="character-id">
          <div class="character-number">${String(index + 1).padStart(2, '0')}</div>
          <div>
            <h2>${escapeHtml(displayName)}</h2>
            <code>${escapeHtml(character.key)}</code>
          </div>
          <span class="source-status">${status.label}</span>
          <p>${status.description}</p>
          <code class="source-path">${escapeHtml(character.requestedUrl)}</code>
        </header>
        <div class="clip-grid">
          ${clips.map(([clipName, clip]) => this.clipMarkup(character, clipName, clip)).join('')}
        </div>
      </section>`;
  }

  statusFor(character) {
    if (character.mode === 'missing') {
      return {
        label: 'MISSING / FALLBACK',
        description: `正式图集缺失，当前预览临时代用 ${character.fallbackKey}。`,
      };
    }
    if (character.mode === 'alias') {
      return {
        label: 'ALIAS',
        description: `尚未独立制作，当前注册为 ${character.fallbackKey} 的图集。`,
      };
    }
    return {
      label: 'ORIGINAL',
      description: '角色专属图集已连接。',
    };
  }

  clipMarkup(character, clipName, clip) {
    const sequence = clip.sequence || Array.from({ length: clip.frames }, (_, index) => clip.start + index);
    const sourceLoop = clip.loop ? 'LOOP' : 'ONCE';
    return `
      <article class="clip-card" data-clip="${escapeHtml(clipName)}" data-character="${escapeHtml(character.key)}">
        <header>
          <div><h3>${escapeHtml(CLIP_NAMES[clipName] || clipName)}</h3><code>${escapeHtml(clipName)}</code></div>
          <button class="clip-restart" type="button" title="重播 ${escapeHtml(displayClipName(clipName))}" aria-label="重播 ${escapeHtml(displayClipName(clipName))}">↺</button>
        </header>
        <div class="sprite-well" data-background-well>
          <div class="sprite-frame" role="img" aria-label="${escapeHtml(CHARACTER_NAMES[character.key] || character.key)} · ${escapeHtml(CLIP_NAMES[clipName] || clipName)}" style="background-image:url(&quot;${escapeHtml(character.displayUrl)}&quot;)"></div>
          ${character.mode === 'missing' ? '<span class="fallback-stamp">代用</span>' : ''}
        </div>
        <div class="frame-readout">
          <span>FRAME <b data-frame-output>${sequence[0]}</b></span>
          <span>${clip.fps || 0} FPS</span>
          <span>${sourceLoop}</span>
        </div>
        <div class="local-controls">
          <button type="button" data-local-step="-1" aria-label="上一帧">←</button>
          <span>${sequence.join(' · ')}</span>
          <button type="button" data-local-step="1" aria-label="下一帧">→</button>
        </div>
      </article>`;
  }

  createPlayers() {
    this.host.querySelectorAll('.clip-card').forEach((card) => {
      const clipName = card.dataset.clip;
      const clip = this.contract.clips[clipName];
      this.players.push(new ClipPlayer(card, clip, this.contract.grid));
    });
  }

  bindControls() {
    const playButton = this.host.querySelector('#toggle-play');
    playButton.addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;
      playButton.setAttribute('aria-pressed', String(this.isPlaying));
      playButton.textContent = this.isPlaying ? 'Ⅱ 暂停全部' : '▶ 播放全部';
      this.lastTime = performance.now();
    });
    this.host.querySelector('#restart-all').addEventListener('click', () => {
      this.players.forEach((player) => player.restart());
      this.lastTime = performance.now();
    });
    this.host.querySelectorAll('.step-control').forEach((button) => {
      button.addEventListener('click', () => {
        this.setPaused(playButton);
        const direction = Number(button.dataset.step);
        this.players.forEach((player) => player.step(direction));
      });
    });

    const speedControl = this.host.querySelector('#speed-control');
    speedControl.addEventListener('input', () => {
      this.speed = Number(speedControl.value);
      this.host.querySelector('#speed-output').value = `${this.speed.toFixed(2)}×`;
    });
    const zoomControl = this.host.querySelector('#zoom-control');
    zoomControl.addEventListener('input', () => {
      this.zoom = Number(zoomControl.value);
      this.host.style.setProperty('--sprite-zoom', this.zoom);
      this.host.querySelector('#zoom-output').value = `${Math.round(this.zoom * 100)}%`;
    });

    this.host.querySelectorAll('[data-background]').forEach((button) => {
      button.addEventListener('click', () => {
        this.background = button.dataset.background;
        this.host.querySelectorAll('[data-background]').forEach((candidate) => {
          candidate.classList.toggle('is-active', candidate === button);
        });
        this.applyBackground();
      });
    });

    this.host.querySelectorAll('.clip-card').forEach((card) => {
      card.querySelector('.clip-restart').addEventListener('click', () => this.playerFor(card)?.restart());
      card.querySelectorAll('[data-local-step]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setPaused(playButton);
          this.playerFor(card)?.step(Number(button.dataset.localStep));
        });
      });
    });
  }

  setPaused(playButton) {
    this.isPlaying = false;
    playButton.setAttribute('aria-pressed', 'false');
    playButton.textContent = '▶ 播放全部';
  }

  playerFor(card) {
    return this.players.find((player) => player.card === card);
  }

  applyBackground() {
    this.host.querySelectorAll('[data-background-well]').forEach((well) => {
      well.dataset.background = this.background;
    });
  }

  tick(time) {
    const delta = Math.min(100, time - this.lastTime);
    this.lastTime = time;
    if (this.isPlaying) this.players.forEach((player) => player.update(delta * this.speed));
    this.raf = requestAnimationFrame((nextTime) => this.tick(nextTime));
  }
}

class ClipPlayer {
  constructor(card, clip, grid) {
    this.card = card;
    this.frameEl = card.querySelector('.sprite-frame');
    this.output = card.querySelector('[data-frame-output]');
    this.grid = grid;
    this.frames = clip.sequence || Array.from({ length: clip.frames }, (_, index) => clip.start + index);
    this.fps = clip.fps || 0;
    this.loop = clip.loop === true;
    this.position = 0;
    this.elapsed = 0;
    this.endHold = 0;
    this.draw();
  }

  restart() {
    this.position = 0;
    this.elapsed = 0;
    this.endHold = 0;
    this.card.classList.remove('is-holding');
    this.draw();
  }

  step(direction) {
    if (this.frames.length <= 1) return;
    this.position = (this.position + direction + this.frames.length) % this.frames.length;
    this.elapsed = 0;
    this.endHold = 0;
    this.card.classList.remove('is-holding');
    this.draw();
  }

  update(delta) {
    if (this.fps <= 0 || this.frames.length <= 1) return;
    if (this.endHold > 0) {
      this.endHold -= delta;
      if (this.endHold <= 0) this.restart();
      return;
    }
    this.elapsed += delta;
    const frameDuration = 1000 / this.fps;
    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      if (this.position === this.frames.length - 1) {
        this.position = 0;
      } else {
        this.position += 1;
      }
      this.draw();
      if (!this.loop && this.position === this.frames.length - 1) {
        this.endHold = Math.max(260, frameDuration * 1.6);
        this.card.classList.add('is-holding');
        break;
      }
    }
  }

  draw() {
    const index = this.frames[this.position];
    const col = index % this.grid.columns;
    const row = Math.floor(index / this.grid.columns);
    this.frameEl.style.backgroundSize = `${this.grid.columns * 100}% ${this.grid.rows * 100}%`;
    this.frameEl.style.backgroundPosition = `${percentage(col, this.grid.columns)}% ${percentage(row, this.grid.rows)}%`;
    this.frameEl.dataset.frame = String(index);
    this.output.textContent = String(index);
  }
}

function percentage(index, count) {
  return count <= 1 ? 0 : (index / (count - 1)) * 100;
}

function displayClipName(name) {
  return CLIP_NAMES[name] || name;
}

function normalizeConceptManifest(manifest) {
  const manifestList = manifest?.concepts || manifest?.items || manifest?.entries || manifest?.characters;
  const rawEntries = Array.isArray(manifest)
    ? manifest
    : Array.isArray(manifestList)
      ? manifestList
      : manifest && typeof manifest === 'object'
        ? Object.entries(manifest)
          .filter(([key]) => key !== 'version' && key !== 'generatedAt')
          .map(([key, value]) => (typeof value === 'string' ? { key, path: value } : { key, ...value }))
        : [];

  return REQUIRED_CONCEPTS.map((required) => {
    const entry = rawEntries.find((candidate) => {
      const candidateKey = String(candidate?.key || candidate?.id || '').toLowerCase();
      const candidateName = String(candidate?.name || candidate?.label || '');
      return candidateKey === required.key || candidateName === required.name;
    });
    const path = entry?.path || entry?.src || entry?.url || entry?.file || entry?.image || entry?.asset || '';
    return {
      ...required,
      path: normalizePublicPath(path),
      statusLabel: entry?.statusLabel || entry?.status || '到稿，等待确认',
    };
  });
}

function normalizePublicPath(path) {
  if (!path) return '';
  const value = String(path).trim();
  if (/^(?:https?:|data:|blob:)/.test(value)) return value;
  if (value.startsWith('/')) return value;
  if (value.startsWith('public/')) return `/${value.slice('public/'.length)}`;
  return `/sprites/concepts/${value.replace(/^\.\//, '')}`;
}

function makeConceptLoadError(label) {
  const placeholder = document.createElement('div');
  placeholder.className = 'concept-placeholder concept-load-error';
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute('aria-label', `${label}载入失败`);
  placeholder.innerHTML = `
    <span class="placeholder-figure" aria-hidden="true">×</span>
    <strong>图片读取失败</strong>
    <small>CHECK MANIFEST PATH</small>`;
  return placeholder;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
