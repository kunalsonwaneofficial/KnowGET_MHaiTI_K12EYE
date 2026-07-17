/**
 * Resolve after the current macrotask, allowing pending microtasks/promises to
 * settle. Useful when asserting on the effects of fire-and-forget async work.
 */
export const flushPromises = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
