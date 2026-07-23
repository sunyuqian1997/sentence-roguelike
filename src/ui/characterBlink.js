const GIRL_FRAMES = Object.freeze([
  { src: '/main_characters/girl/00.png', duration: 3000 },
  { src: '/main_characters/girl/01.png', duration: 200 },
  { src: '/main_characters/girl/02.png', duration: 200 },
  { src: '/main_characters/girl/01.png', duration: 200 },
]);

const GIRL_SELECTOR = [
  '#battle-sprite-player img',
  '#player-portrait-img',
  '.tutorial-portrait[data-character="girl"]',
  '#story-portrait img[data-character="girl"]',
].join(',');

let blinkTimer = 0;
let blinkIndex = 0;
let blinkStarted = false;

function renderBlinkFrame() {
  const frame = GIRL_FRAMES[blinkIndex];
  document.querySelectorAll(GIRL_SELECTOR).forEach((img) => {
    if (img.getAttribute('src') !== frame.src) img.setAttribute('src', frame.src);
  });
}

function scheduleBlink() {
  window.clearTimeout(blinkTimer);
  if (document.hidden) return;
  renderBlinkFrame();
  blinkTimer = window.setTimeout(() => {
    blinkIndex = (blinkIndex + 1) % GIRL_FRAMES.length;
    scheduleBlink();
  }, GIRL_FRAMES[blinkIndex].duration);
}

export function initCharacterBlink() {
  if (blinkStarted) return;
  blinkStarted = true;
  GIRL_FRAMES.forEach(({ src }) => {
    const preload = new Image();
    preload.src = src;
  });
  document.addEventListener('visibilitychange', () => {
    window.clearTimeout(blinkTimer);
    if (!document.hidden) {
      blinkIndex = 0;
      scheduleBlink();
    }
  });
  scheduleBlink();
}
