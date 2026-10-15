import { AsyncLocalStorage } from "node:async_hooks";

// Per-request context: concurrent requests must never borrow another request's
// Queue binding or waitUntil lifetime. No durable state is kept in the isolate.
const wakeup = new AsyncLocalStorage<() => void>();

export function withOutboxWakeup<T>(notify: () => void, run: () => T): T {
  return wakeup.run(notify, run);
}

/** Call only after the transaction creating the durable outbox has committed. */
export function notifyOutboxCommitted(): void {
  try {
    wakeup.getStore()?.();
  } catch {
    // The committed command remains successful. The hourly sweep recovers a
    // missing hint; it is never the source of truth for the work itself.
    console.warn("outbox_wakeup_unavailable");
  }
}
