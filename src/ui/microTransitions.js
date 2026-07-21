// Native-DOM adaptation of Amicro's interaction vocabulary: spring hover,
// glare sweep, focus grouping, tap compression, and expanding click rings.
// Presentation only: no game state and no layout measurements are mutated.

const INTERACTIVE = [
  '.card',
  '.sentence-mini-card',
  'button',
  '.map-node',
  '.pack-item',
  '.rest-option',
  '.event-choice',
  '.os-window-title i',
].join(',');

const WINDOW = [
  '.os-window',
  '.reward-content',
  '.rest-content',
  '.event-content',
  '.shop-content',
  '.poetry-content',
  '.end-content',
  '.meta-section',
].join(',');

let initialized = false;

function interactiveFrom(event) {
  const el = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null;
  return el instanceof HTMLElement ? el : null;
}

function replayClass(el, name) {
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
}

function addGlare(el) {
  let glare = [...el.children].find(child => child.classList?.contains('micro-glare-sweep'));
  if (!glare) {
    glare = document.createElement('span');
    glare.className = 'micro-glare-sweep';
    glare.setAttribute('aria-hidden', 'true');
    el.appendChild(glare);
  }
  replayClass(glare, 'is-running');
}

function addClickRing(el, event) {
  const rect = el.getBoundingClientRect();
  const ring = document.createElement('span');
  ring.className = 'micro-expand-ring';
  ring.setAttribute('aria-hidden', 'true');
  ring.style.left = `${event.clientX - rect.left}px`;
  ring.style.top = `${event.clientY - rect.top}px`;
  el.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
}

function animateWindow(el) {
  if (!(el instanceof HTMLElement) || !el.matches(WINDOW)) return;
  replayClass(el, 'micro-window-enter');
  el.addEventListener('animationend', () => el.classList.remove('micro-window-enter'), { once: true });
}

export function initMicroTransitions() {
  if (initialized) return;
  initialized = true;
  document.documentElement.classList.add('micro-transitions-ready');

  document.addEventListener('pointerover', (event) => {
    const el = interactiveFrom(event);
    if (!el || (event.relatedTarget instanceof Node && el.contains(event.relatedTarget))) return;
    el.classList.add('micro-hover');
    addGlare(el);
  });

  document.addEventListener('pointermove', (event) => {
    const el = interactiveFrom(event);
    if (!el || !el.matches('.card, .sentence-mini-card')) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    el.style.setProperty('--micro-tilt', `${(x * 2.2).toFixed(2)}deg`);
  }, { passive: true });

  document.addEventListener('pointerout', (event) => {
    const el = interactiveFrom(event);
    if (!el || (event.relatedTarget instanceof Node && el.contains(event.relatedTarget))) return;
    el.classList.remove('micro-hover');
    el.style.removeProperty('--micro-tilt');
  });

  document.addEventListener('click', (event) => {
    const el = interactiveFrom(event);
    if (!el || el.matches('[disabled], [aria-disabled="true"]')) return;
    replayClass(el, 'micro-tap');
    addClickRing(el, event);
    window.setTimeout(() => el.classList.remove('micro-tap'), 260);
  }, true);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const host = record.target;
        if (host instanceof HTMLElement && host.classList.contains('active')) {
          if (host.matches(WINDOW)) animateWindow(host);
          host.querySelectorAll(WINDOW).forEach(animateWindow);
        }
      } else {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(WINDOW)) animateWindow(node);
          node.querySelectorAll?.(WINDOW).forEach(animateWindow);
        });
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('.active').forEach((host) => {
    if (host.matches?.(WINDOW)) animateWindow(host);
    host.querySelectorAll?.(WINDOW).forEach(animateWindow);
  });
}
