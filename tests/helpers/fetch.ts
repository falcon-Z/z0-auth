type FetchHandler = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

/** Keep Bun's fetch.preconnect API when replacing the request handler in tests. */
export function mockFetch(handler: FetchHandler): typeof fetch {
  return Object.assign(handler, { preconnect: globalThis.fetch.preconnect });
}
