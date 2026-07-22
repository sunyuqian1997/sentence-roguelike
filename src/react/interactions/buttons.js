import { animate, hover, press } from 'motion';

const BUTTON_SELECTOR = 'button, [role="button"], .btn';
const ROOT_CONTROLLERS = new WeakMap();

const BUTTON_SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 32,
  mass: 0.64,
};

function isHTMLElement(value) {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;
}

function isDisabled(element) {
  return element.matches(':disabled, [disabled], [aria-disabled="true"], [data-disabled="true"]')
    || element.closest('[aria-disabled="true"], [data-disabled="true"]') !== null;
}

function isCardLike(element) {
  return element.matches('.card, .sentence-mini-card, .target-card');
}

function animatePose(state, immediate = false) {
  state.poseAnimation?.stop?.();
  const active = !state.disabled;
  const lift = active && state.pressed ? '1px' : active && state.hovered ? '-2px' : '0px';
  const scale = active && state.pressed ? 0.955 : active && state.hovered ? 1.018 : 1;
  state.poseAnimation = animate(state.element, {
    '--motion-button-lift': lift,
    '--motion-button-scale': scale,
  }, state.reducedMotion() || immediate ? { duration: 0 } : BUTTON_SPRING);
}

function bindButton(element, reducedMotion) {
  const state = {
    element,
    reducedMotion,
    disabled: isDisabled(element),
    hovered: false,
    pressed: false,
    poseAnimation: null,
    focusAnimation: null,
  };

  element.classList.add('motion-button-interaction');
  element.toggleAttribute('data-motion-disabled', state.disabled);

  const cancelHover = hover(element, () => {
    state.disabled = isDisabled(element);
    if (state.disabled) return undefined;
    state.hovered = true;
    element.classList.add('is-motion-hovered');
    animatePose(state);

    return () => {
      state.hovered = false;
      element.classList.remove('is-motion-hovered');
      animatePose(state);
    };
  });

  const cancelPress = press(element, () => {
    state.disabled = isDisabled(element);
    if (state.disabled) return undefined;
    state.pressed = true;
    element.classList.add('is-motion-pressed');
    animatePose(state);

    return () => {
      state.pressed = false;
      element.classList.remove('is-motion-pressed');
      animatePose(state);
    };
  });

  const animateFocus = (visible) => {
    state.focusAnimation?.stop?.();
    state.focusAnimation = animate(element, {
      '--motion-button-focus': visible ? 1 : 0,
    }, state.reducedMotion() ? { duration: 0 } : {
      duration: visible ? 0.16 : 0.1,
      ease: 'easeOut',
    });
  };

  const onFocus = () => {
    const focusVisible = element.matches(':focus-visible');
    element.classList.toggle('is-motion-focus-visible', focusVisible);
    animateFocus(focusVisible);
  };

  const onBlur = () => {
    element.classList.remove('is-motion-focus-visible');
    animateFocus(false);
  };

  element.addEventListener('focus', onFocus);
  element.addEventListener('blur', onBlur);
  animatePose(state, true);
  animateFocus(false);

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
      animatePose(state);
    },
    cleanup() {
      cancelHover();
      cancelPress();
      element.removeEventListener('focus', onFocus);
      element.removeEventListener('blur', onBlur);
      state.poseAnimation?.stop?.();
      state.focusAnimation?.stop?.();
      element.classList.remove(
        'motion-button-interaction',
        'is-motion-hovered',
        'is-motion-pressed',
        'is-motion-focus-visible',
      );
      element.removeAttribute('data-motion-disabled');
      ['--motion-button-lift', '--motion-button-scale', '--motion-button-focus']
        .forEach((property) => element.style.removeProperty(property));
    },
  };
}

function createController(root) {
  const bindings = new Map();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => media.matches;

  const bind = (element) => {
    if (!isHTMLElement(element) || isCardLike(element) || bindings.has(element)) return;
    bindings.set(element, bindButton(element, reducedMotion));
  };

  const unbind = (element) => {
    const binding = bindings.get(element);
    if (!binding) return;
    binding.cleanup();
    bindings.delete(element);
  };

  const visit = (node, callback) => {
    if (!isHTMLElement(node)) return;
    if (node.matches(BUTTON_SELECTOR)) callback(node);
    node.querySelectorAll(BUTTON_SELECTOR).forEach(callback);
  };

  root.querySelectorAll(BUTTON_SELECTOR).forEach(bind);
  if (isHTMLElement(root) && root.matches(BUTTON_SELECTOR)) bind(root);

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'attributes') {
        const element = record.target;
        if (!isHTMLElement(element)) return;
        if (element.matches(BUTTON_SELECTOR)) {
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
    bindings.forEach(({ state }) => animatePose(state, true));
  };
  media.addEventListener?.('change', onMotionPreferenceChange);

  return () => {
    observer.disconnect();
    media.removeEventListener?.('change', onMotionPreferenceChange);
    [...bindings.keys()].forEach(unbind);
  };
}

/** Attach Motion DOM gestures to current and future button-like nodes. */
export function initButtonInteractions(root = globalThis.document) {
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

export { BUTTON_SELECTOR };
