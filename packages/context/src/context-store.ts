import { AsyncLocalStorage } from "node:async_hooks";
import type { RuntimeContext } from "./runtime-context";

/**
 * AsyncLocalStorage-backed store that propagates a {@link RuntimeContext} across
 * asynchronous boundaries without threading it through every function signature.
 */
export class RuntimeContextStore {
  private readonly storage = new AsyncLocalStorage<RuntimeContext>();

  /** Run `fn` with the given context active for its entire async subtree. */
  run<T>(context: RuntimeContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /** The active context, or `undefined` when none is set. */
  get(): RuntimeContext | undefined {
    return this.storage.getStore();
  }

  /** The active context, throwing when none is set. */
  getOrThrow(): RuntimeContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error("No runtime context is active");
    }
    return context;
  }

  /** Merge a partial update into the active context and return the result. */
  update(partial: Partial<RuntimeContext>): RuntimeContext {
    const next: RuntimeContext = { ...this.getOrThrow(), ...partial };
    this.storage.enterWith(next);
    return next;
  }
}

/** Process-wide default context store. */
export const runtimeContextStore = new RuntimeContextStore();
