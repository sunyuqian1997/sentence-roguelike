import { animate, hover, press } from 'motion';

const CARD_SELECTOR = '.card, .sentence-mini-card, .target-card';
const DISABLED_SELECTOR = [
  '[disabled]',
  '[aria-disabled="true"]',
  '[data-disabled="true"]',
  '.unplayable',
  '.in-sentence',
].join(',');

const CARD_SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 30,
  mass: 0.72,
};

const TILT_SPRING = {
  type: 'spring',
  stiffness: 520,
  damping: 38,
  mass: 0.58,
};

const ROOT_CONTROLLERS = new WeakMap();

function isHTMLElement(value) {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;
}

function isDisabled(element) {
  return element.matches(DISABLED_SELECTOR)
    || element.closest('[aria-disabled="true"], [data-disabled="true"]') !== null;
}

function stopAnimation(state, key) {
  const controls = state.animations.get(key);
  controls?.stop?.();
  state.animations.delete(key);
}

function runAnimation(state, key, values, transition = CARD_SPRING) {
  stopAnimation(state, key);
  const controls = animate(
    state.element,
    values,
    state.reducedMotion() ? { duration: 0 } : transition,
  );
  state.animations.set(key, controls);
  return controls;
}

function resetTilt(state, immediate = false) {
  stopAnimation(state, 'tilt');
  const transition = immediate ? { duration: 0 } : TILT_SPRING;
  const controls = animate(state.element, {
    '--motion-card-axis-x': 0,
    '--motion-card-axis-y': 1,
    '--motion-card-angle': '0deg',
  }, state.reducedMotion() ? { duration: 0 } : transition);
  state.animations.set('tilt', controls);
}

function settleCard(state, immediate = false) {
  const elevated = state.hovered && !state.disabled;
  const pressed = state.pressed && !state.disabled;
  const lift = pressed ? '-3px' : elevated ? '-10px' : '0px';
  const scale = pressed ? 0.965 : elevated ? 1.035 : 1;
  runAnimation(
    state,
    'pose',
    {
      '--motion-card-lift': lift,
      '--motion-card-scale': scale,
    },
    immediate ? { duration: 0 } : CARD_SPRING,
  );
  if (!elevated || state.reducedMotion()) resetTilt(state, immediate);
}

function updateTilt(state, event) {
  if (state.disabled || state.reducedMotion()) return;

  state.pointer = { x: event.clientX, y: event.clientY };
  if (state.pointerFrame) return;

  state.pointerFrame = requestAnimationFrame(() => {
    state.pointerFrame = 0;
    if (!state.hovered || state.disabled || !state.pointer) return;

    const rect = state.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = Math.max(-1, Math.min(1, ((state.pointer.x - rect.left) / rect.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((state.pointer.y - rect.top) / rect.height - 0.5) * 2));
    const magnitude = Math.min(1, Math.hypot(x, y));
    const divisor = magnitude || 1;

    runAnimation(state, 'tilt', {
      '--motion-card-axis-x': Number((-y / divisor).toFixed(4)),
      '--motion-card-axis-y': Number((x / divisor).toFixed(4)),
      '--motion-card-angle': `${(magnitude * 3.4).toFixed(2)}deg`,
    }, TILT_SPRING);
  });
}

function ensureGlare(state) {
  let glare = [...state.element.children]
    .find((child) => child.classList?.contains('motion-card-glare'));

  if (!glare) {
    glare = document.createElement('span');
    glare.className = 'motion-card-glare';
    glare.setAttribute('aria-hidden', 'true');
    state.element.appendChild(glare);
    state.ownsGlare = true;
  }

  state.glare = glare;
}

function playGlare(state) {
  if (state.reducedMotion() || !state.glare) return;
  state.glareAnimation?.stop?.();
  state.glareAnimation = animate(state.glare, {
    '--motion-glare-x': ['-75%', '520%'],
    opacity: [0, 0.34, 0],
  }, {
    duration: 0.48,
    ease: [0.22, 1, 0.36, 1],
  });
}

function bindCard(element, reducedMotion) {
  const interactionTarget = element.matches('.sentence-mini-card') && element.parentElement
    ? element.parentElement
    : element;
  const state = {
    element,
    interactionTarget,
    perspectiveHost: element.parentElement,
    reducedMotion,
    disabled: isDisabled(element),
    hovered: false,
    pressed: false,
    pointer: null,
    pointerFrame: 0,
    animations: new Map(),
    glare: null,
    glareAnimation: null,
    ownsGlare: false,
  };

  element.classList.add('motion-card-interaction');
  element.toggleAttribute('data-motion-disabled', state.disabled);
  state.perspectiveHost?.classList.add('motion-card-perspective-context');
  ensureGlare(state);

  const cancelHover = hover(interactionTarget, (_target, startEvent) => {
    state.disabled = isDisabled(element);
    if (state.disabled) return undefined;

    state.hovered = true;
    element.classList.add('is-motion-hovered');
    settleCard(state);
    updateTilt(state, startEvent);
    playGlare(state);

    const onPointerMove = (event) => updateTilt(state, event);
    interactionTarget.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      interactionTarget.removeEventListener('pointermove', onPointerMove);
      state.hovered = false;
      state.pointer = null;
      element.classList.remove('is-motion-hovered');
      settleCard(state);
    };
  });

  const cancelPress = press(interactionTarget, () => {
    state.disabled = isDisabled(element);
    if (state.disabled) return undefined;

    state.pressed = true;
    element.classList.add('is-motion-pressed');
    settleCard(state);

    return () => {
      state.pressed = false;
      element.classList.remove('is-motion-pressed');
      settleCard(state);
    };
  });

  const onFocus = () => {
    const focusVisible = interactionTarget.matches(':focus-visible');
    element.classList.toggle('is-motion-focus-visible', focusVisible);
    runAnimation(state, 'focus', {
      '--motion-card-focus': focusVisible ? 1 : 0,
    }, { duration: focusVisible ? 0.16 : 0.1, ease: 'easeOut' });
  };

  const onBlur = () => {
    element.classList.remove('is-motion-focus-visible');
    runAnimation(state, 'focus', { '--motion-card-focus': 0 }, { duration: 0.1 });
  };

  interactionTarget.addEventListener('focus', onFocus);
  interactionTarget.addEventListener('blur', onBlur);
  settleCard(state, true);
  runAnimation(state, 'focus', { '--motion-card-focus': 0 }, { duration: 0 });

  return {
    state,
    syncDisabled() {
      const disabled = isDisabled(element);
      if (disabled === state.disabled) return;
      state.disabled = disabled;
      element.toggleAttribute('data-motion-disabled', disabled);
      if (disabled) {
        state.hovered = false;
        state.pressed = false;
        element.classList.remove('is-motion-hovered', 'is-motion-pressed');
      }
      settleCard(state);
    },
    cleanup() {
      cancelHover();
      cancelPress();
      interactionTarget.removeEventListener('focus', onFocus);
      interactionTarget.removeEventListener('blur', onBlur);
      if (state.pointerFrame) cancelAnimationFrame(state.pointerFrame);
      state.glareAnimation?.stop?.();
      state.animations.forEach((controls) => controls?.stop?.());
      state.animations.clear();
      if (state.ownsGlare) state.glare?.remove();
      element.classList.remove(
        'motion-card-interaction',
        'is-motion-hovered',
        'is-motion-pressed',
        'is-motion-focus-visible',
      );
      element.removeAttribute('data-motion-disabled');
      [
        '--motion-card-axis-x',
        '--motion-card-axis-y',
        '--motion-card-angle',
        '--motion-card-lift',
        '--motion-card-scale',
        '--motion-card-focus',
      ].forEach((property) => element.style.removeProperty(property));

      const perspectiveHost = state.perspectiveHost;
      if (perspectiveHost && !perspectiveHost.querySelector('.motion-card-interaction')) {
        perspectiveHost.classList.remove('motion-card-perspective-context');
      }
    },
  };
}

function createController(root) {
  const bindings = new Map();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => media.matches;

  const bind = (element) => {
    if (!isHTMLElement(element) || bindings.has(element)) return;
    bindings.set(element, bindCard(element, reducedMotion));
  };

  const unbind = (element) => {
    const binding = bindings.get(element);
    if (!binding) return;
    binding.cleanup();
    bindings.delete(element);
  };

  const visit = (node, callback) => {
    if (!isHTMLElement(node)) return;
    if (node.matches(CARD_SELECTOR)) callback(node);
    node.querySelectorAll(CARD_SELECTOR).forEach(callback);
  };

  root.querySelectorAll(CARD_SELECTOR).forEach(bind);
  if (isHTMLElement(root) && root.matches(CARD_SELECTOR)) bind(root);

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'attributes') {
        const element = record.target;
        if (!isHTMLElement(element)) return;
        if (element.matches(CARD_SELECTOR)) {
          bind(element);
          bindings.get(element)?.syncDisabled();
        } else {
          unbind(element);
        }
        return;
      }

      record.removedNodes.forEach((node) => visit(node, unbind));
      record.addedNodes.forEach((node) => visit(node, bind));
    });
  });

  observer.observe(root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'disabled', 'aria-disabled', 'data-disabled'],
  });

  const onMotionPreferenceChange = () => {
    bindings.forEach(({ state }) => settleCard(state, true));
  };
  media.addEventListener?.('change', onMotionPreferenceChange);

  return () => {
    observer.disconnect();
    media.removeEventListener?.('change', onMotionPreferenceChange);
    [...bindings.keys()].forEach(unbind);
  };
}

/**
 * Attach Motion DOM gestures to current and future card nodes in a root.
 * Repeated calls for the same root share one controller. Every caller receives
 * an idempotent release function; the final release performs the real cleanup.
 */
export function initCardInteractions(root = globalThis.document) {
  if (!root?.querySelectorAll || typeof window === 'undefined') return () => {};

  let entry = ROOT_CONTROLLERS.get(root);
  if (!entry) {
    entry = { references: 0, cleanup: createController(root) };
    ROOT_CONTROLLERS.set(root, entry);
  }
  entry.references += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.references -= 1;
    if (entry.references > 0) return;
    entry.cleanup();
    ROOT_CONTROLLERS.delete(root);
  };
}

export { CARD_SELECTOR };
