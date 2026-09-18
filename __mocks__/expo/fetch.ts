/**
 * Jest mock for expo/fetch: tests inject their own fake fetch implementations
 * or never exercise streaming; the real expo/fetch needs native modules.
 */

export const fetch = globalThis.fetch;
export const dispatchEvent = () => {};
