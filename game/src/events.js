export function createEventBus() {
  const handlers = new Map();

  function on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    handlers.get(event)?.delete(fn);
  }

  function emit(event, payload) {
    const set = handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${event}" threw:`, err);
      }
    }
  }

  return { on, off, emit };
}

export const events = createEventBus();
