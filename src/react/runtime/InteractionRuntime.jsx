import React, { useEffect } from 'react';
import { uiBridge as defaultBridge } from './uiBridge.js';

const EMPTY_BINDERS = Object.freeze({});
const EMPTY_CONTEXT = Object.freeze({});
const BINDER_ORDER = ['cards', 'windows', 'avg'];

function reportBinderError(onError, error, phase, binder) {
  if (onError) {
    try {
      onError(error, { phase, binder });
    } catch (reportingError) {
      console.error('[react-runtime] error reporter failed', reportingError);
    }
    return;
  }
  console.error(`[react-runtime] ${binder} binder ${phase} failed`, error);
}

function asCleanup(result) {
  if (typeof result === 'function') return result;
  if (!result || typeof result !== 'object') return null;
  for (const method of ['cleanup', 'dispose', 'destroy', 'unmount']) {
    if (typeof result[method] === 'function') {
      return () => result[method]();
    }
  }
  return null;
}

function invokeBinder(binder, context) {
  if (typeof binder === 'function') return binder(context);
  if (binder && typeof binder.mount === 'function') return binder.mount(context);
  if (binder && typeof binder.bind === 'function') return binder.bind(context);
  throw new TypeError('A runtime binder must be a function or expose mount()/bind().');
}

/**
 * Headless React host for incremental migration of legacy DOM interactions.
 * Each binder receives { root, bridge, signal, ...context } and may return a
 * cleanup function (or an object exposing cleanup/dispose/destroy/unmount).
 */
export function ReactInteractionRuntime({
  root = null,
  bridge = defaultBridge,
  binders = EMPTY_BINDERS,
  context = EMPTY_CONTEXT,
  onError,
  children = null,
}) {
  const interactionRoot = root || (typeof document !== 'undefined' ? document : null);
  const runtimeBinders = binders || EMPTY_BINDERS;
  const cardsBinder = runtimeBinders.cards;
  const windowsBinder = runtimeBinders.windows;
  const avgBinder = runtimeBinders.avg;

  useEffect(() => {
    const controller = new AbortController();
    const cleanups = [];
    let active = true;
    const runtimeContext = {
      ...context,
      root: interactionRoot,
      bridge,
      signal: controller.signal,
    };
    const selectedBinders = {
      cards: cardsBinder,
      windows: windowsBinder,
      avg: avgBinder,
    };

    BINDER_ORDER.forEach((name) => {
      const binder = selectedBinders[name];
      if (!binder) return;
      try {
        const result = invokeBinder(binder, runtimeContext);
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).then((resolved) => {
            const cleanup = asCleanup(resolved);
            if (!cleanup) return;
            if (active) cleanups.push({ name, cleanup });
            else {
              try {
                cleanup();
              } catch (error) {
                reportBinderError(onError, error, 'cleanup', name);
              }
            }
          }).catch((error) => reportBinderError(onError, error, 'mount', name));
          return;
        }
        const cleanup = asCleanup(result);
        if (cleanup) cleanups.push({ name, cleanup });
      } catch (error) {
        reportBinderError(onError, error, 'mount', name);
      }
    });

    bridge.emit('runtime:mounted', { binders: BINDER_ORDER.filter((name) => selectedBinders[name]) });

    return () => {
      active = false;
      controller.abort();
      for (let index = cleanups.length - 1; index >= 0; index -= 1) {
        const { name, cleanup } = cleanups[index];
        try {
          cleanup();
        } catch (error) {
          reportBinderError(onError, error, 'cleanup', name);
        }
      }
      bridge.emit('runtime:unmounted');
    };
  }, [interactionRoot, bridge, context, onError, cardsBinder, windowsBinder, avgBinder]);

  return children;
}
