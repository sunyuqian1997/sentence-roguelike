import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactRuntimeErrorBoundary } from './ErrorBoundary.jsx';
import { ReactInteractionRuntime } from './InteractionRuntime.jsx';
import { uiBridge } from './uiBridge.js';

const mountedRoots = new WeakMap();

function resolveContainer(container) {
  const resolved = typeof container === 'string'
    ? document.querySelector(container)
    : container;
  if (!resolved || typeof resolved !== 'object' || resolved.nodeType !== 1) {
    throw new TypeError('mountReactMotionRuntime(container) requires a DOM element or selector.');
  }
  return resolved;
}

function mergeOptions(current, next) {
  return {
    ...current,
    ...next,
    binders: next.binders
      ? { ...(current.binders || {}), ...next.binders }
      : current.binders,
    context: next.context
      ? { ...(current.context || {}), ...next.context }
      : current.context,
  };
}

function RuntimeTree({ host, options, resetKey }) {
  const bridge = options.bridge || uiBridge;
  return (
    <ReactRuntimeErrorBoundary
      fallback={options.fallback}
      onError={options.onError}
      resetKey={resetKey}
    >
      <MotionConfig reducedMotion="user">
        <ReactInteractionRuntime
          root={options.interactionRoot || host}
          bridge={bridge}
          binders={options.binders}
          context={options.context}
          onError={options.onError}
        >
          {options.children ?? null}
        </ReactInteractionRuntime>
      </MotionConfig>
    </ReactRuntimeErrorBoundary>
  );
}

/**
 * Mounts the React/Motion compatibility runtime without taking ownership of
 * the game's legacy DOM outside `container`.
 */
export function mountReactMotionRuntime(container, options = {}) {
  const host = resolveContainer(container);
  const existing = mountedRoots.get(host);
  if (existing) {
    existing.update(options);
    return existing.api;
  }

  const root = createRoot(host);
  const record = {
    root,
    options: { ...options },
    resetKey: 0,
    mounted: true,
    api: null,
    render() {
      root.render(<RuntimeTree host={host} options={record.options} resetKey={record.resetKey} />);
    },
    update(nextOptions = {}) {
      if (!record.mounted) throw new Error('Cannot update an unmounted React runtime.');
      record.options = mergeOptions(record.options, nextOptions);
      record.resetKey += 1;
      record.render();
    },
  };

  record.api = Object.freeze({
    root,
    get bridge() { return record.options.bridge || uiBridge; },
    update: (nextOptions) => record.update(nextOptions),
    emit: (event, detail) => (record.options.bridge || uiBridge).emit(event, detail),
    unmount: () => {
      if (!record.mounted) return;
      record.mounted = false;
      mountedRoots.delete(host);
      root.unmount();
    },
  });

  mountedRoots.set(host, record);
  record.render();
  return record.api;
}
