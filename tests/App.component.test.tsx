import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { App } from '@z0/src/App';

if (typeof globalThis.document === 'undefined') {
  GlobalRegistrator.register({
    url: 'http://localhost/',
  });
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

async function flushReact(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(assertion: () => void, attempts = 30): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushReact();
    }
  }

  throw lastError;
}

function textContent(node: ParentNode): string {
  return node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function getButtonByText(container: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((element) => textContent(element) === label);
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button as HTMLButtonElement;
}

function getInput(container: ParentNode, name: string): HTMLInputElement {
  const input = container.querySelector(`input[name="${name}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${name}`);
  }

  return input;
}

async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const view = input.ownerDocument.defaultView;
    const valueSetter = view
      ? Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set
      : undefined;

    if (!valueSetter) {
      throw new Error('HTMLInputElement value setter not available');
    }

    if (!view) {
      throw new Error('Input window is not available');
    }

    valueSetter.call(input, value);
    input.dispatchEvent(new view.Event('input', { bubbles: true }));
    input.dispatchEvent(new view.Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function submitForm(container: ParentNode): Promise<void> {
  const form = container.querySelector('form');
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Form not found');
  }

  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}

async function renderApp(pathname: string): Promise<{ container: HTMLDivElement; root: Root; unmount: () => Promise<void> }> {
  window.history.replaceState({}, '', pathname);
  const container = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App />);
  });

  return {
    container,
    root,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
let mountedRoot: { unmount: () => Promise<void> } | null = null;

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  document.body.innerHTML = '';
  globalThis.fetch = mock(() => {
    throw new Error('fetch mock not configured');
  }) as typeof fetch;
});

afterEach(async () => {
  if (mountedRoot) {
    await mountedRoot.unmount();
    mountedRoot = null;
  }

  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  window.history.replaceState({}, '', '/');
  document.body.innerHTML = '';
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

describe('App mounted setup wizard behavior', () => {
  it('shows the setup status notice and form when the bootstrap check fails', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('bootstrap unavailable');
    }) as typeof fetch;

    mountedRoot = await renderApp('/');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Bootstrap status could not be verified. Continue setup if this is a new deployment.');
      expect(textContent(mountedRoot!.container)).toContain('Setup wizard');
      expect(textContent(mountedRoot!.container)).toContain('Initialize platform');
    });
  });

  it('redirects to /console when the bootstrap check reports setup is not required', async () => {
    globalThis.fetch = mock(async () => jsonResponse({
      bootstrapped: true,
      requires_setup: false,
      timestamp: '2026-04-29T12:00:00.000Z',
    })) as typeof fetch;

    mountedRoot = await renderApp('/');

    await waitFor(() => {
      expect(window.location.href).toContain('/console');
    });
  });

  it('focuses the first invalid field on invalid submit', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('bootstrap unavailable');
    }) as typeof fetch;

    mountedRoot = await renderApp('/');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Setup wizard');
    });

    await submitForm(mountedRoot.container);

    const platformName = getInput(mountedRoot.container, 'platformName');
    await waitFor(() => {
      expect(document.activeElement).toBe(platformName);
      expect(textContent(mountedRoot!.container)).toContain('Platform name is required');
      expect(platformName.getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('maps the first API validation field error back to the matching field and focuses it', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/v1/bootstrap/status') {
        throw new Error('bootstrap unavailable');
      }

      if (url === '/api/v1/bootstrap/initialize' && init?.method === 'POST') {
        return jsonResponse({
          error: 'Validation failed',
          details: {
            admin_email: 'Admin email already exists',
            platform_name: 'Platform name is required',
          },
        }, {
          status: 400,
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    }) as typeof fetch;

    mountedRoot = await renderApp('/');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Setup wizard');
    });

    await setInputValue(getInput(mountedRoot.container, 'platformName'), 'Acme Identity');
    await setInputValue(getInput(mountedRoot.container, 'adminEmail'), 'admin@example.com');
    await setInputValue(getInput(mountedRoot.container, 'adminPassword'), 'ValidPassword123!');
    await setInputValue(getInput(mountedRoot.container, 'confirmPassword'), 'ValidPassword123!');
    await submitForm(mountedRoot.container);

    const adminEmail = getInput(mountedRoot.container, 'adminEmail');
    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Admin email already exists');
      expect(document.activeElement).toBe(adminEmail);
      expect(adminEmail.getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('shows success state and follows the redirect timer path after a successful submit', async () => {
    let redirectTimer: (() => void) | null = null;

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/v1/bootstrap/status') {
        throw new Error('bootstrap unavailable');
      }

      if (url === '/api/v1/bootstrap/initialize' && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    }) as typeof fetch;

    globalThis.setTimeout = ((handler: TimerHandler) => {
      redirectTimer = () => {
        if (typeof handler === 'function') {
          handler();
        }
      };

      return 1 as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    mountedRoot = await renderApp('/');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Setup wizard');
    });

    await setInputValue(getInput(mountedRoot.container, 'platformName'), 'Acme Identity');
    await setInputValue(getInput(mountedRoot.container, 'adminEmail'), 'admin@example.com');
    await setInputValue(getInput(mountedRoot.container, 'adminPassword'), 'ValidPassword123!');
    await setInputValue(getInput(mountedRoot.container, 'confirmPassword'), 'ValidPassword123!');
    await submitForm(mountedRoot.container);

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Platform initialized');
      expect(textContent(mountedRoot!.container)).toContain('Redirecting to the operator console');
    });

    expect(redirectTimer).not.toBeNull();

    await act(async () => {
      redirectTimer?.();
    });

    expect(window.location.href).toContain('/console');
  });
});

describe('App mounted operator console behavior', () => {
  it('loads bootstrap, readiness, and liveness panels when mounted on /console', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/v1/bootstrap/status') {
        return jsonResponse({
          bootstrapped: true,
          requires_setup: false,
          timestamp: '2026-04-29T12:00:00.000Z',
        });
      }

      if (url === '/health/ready') {
        return jsonResponse({
          status: 'ready',
          database: {
            connected: true,
            migrations: {
              applied: 5,
              total: 5,
              pending: 0,
            },
          },
          timestamp: '2026-04-29T12:00:00.000Z',
        });
      }

      if (url === '/health/live') {
        return jsonResponse({
          status: 'ok',
          timestamp: '2026-04-29T12:00:00.000Z',
          uptime: 42,
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    mountedRoot = await renderApp('/console');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Bootstrap completed successfully.');
      expect(textContent(mountedRoot!.container)).toContain('5/5 migrations applied.');
      expect(textContent(mountedRoot!.container)).toContain('Uptime 42s.');

      const openApiLink = mountedRoot!.container.querySelector('a[href="/.well-known/openapi.json"]');
      expect(openApiLink).not.toBeNull();
      expect(textContent(openApiLink!)).toBe('Open OpenAPI JSON');
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/bootstrap/status');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/health/ready');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/health/live');
  });

  it('shows the top-level failure notice when any console panel request fails', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/v1/bootstrap/status') {
        return jsonResponse({
          bootstrapped: true,
          requires_setup: false,
          timestamp: '2026-04-29T12:00:00.000Z',
        });
      }

      if (url === '/health/ready') {
        return jsonResponse({
          status: 'ready',
          database: {
            connected: true,
            migrations: {
              applied: 5,
              total: 5,
              pending: 0,
            },
          },
          timestamp: '2026-04-29T12:00:00.000Z',
        });
      }

      if (url === '/health/live') {
        return new Response('Service unavailable', {
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }

      if (url === '/health') {
        return new Response('Service unavailable', {
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    }) as typeof fetch;

    mountedRoot = await renderApp('/console');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('One or more operator checks failed to load. Review the individual panels and retry after the service is reachable.');
      expect(textContent(mountedRoot!.container)).toContain('Service unavailable');
    });
  });

  it('disables refresh while a refresh is in flight and re-enables it when requests settle', async () => {
    const refreshBootstrap = createDeferred<Response>();
    const refreshReadiness = createDeferred<Response>();
    const refreshLiveness = createDeferred<Response>();
    let callCount = 0;

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      callCount += 1;
      const url = String(input);

      if (callCount <= 3) {
        if (url === '/api/v1/bootstrap/status') {
          return jsonResponse({
            bootstrapped: true,
            requires_setup: false,
            timestamp: '2026-04-29T12:00:00.000Z',
          });
        }

        if (url === '/health/ready') {
          return jsonResponse({
            status: 'ready',
            database: {
              connected: true,
              migrations: {
                applied: 5,
                total: 5,
                pending: 0,
              },
            },
            timestamp: '2026-04-29T12:00:00.000Z',
          });
        }

        if (url === '/health/live') {
          return jsonResponse({
            status: 'ok',
            timestamp: '2026-04-29T12:00:00.000Z',
            uptime: 42,
          });
        }
      }

      if (callCount === 4 && url === '/api/v1/bootstrap/status') {
        return refreshBootstrap.promise;
      }

      if (callCount === 5 && url === '/health/ready') {
        return refreshReadiness.promise;
      }

      if (callCount === 6 && url === '/health/live') {
        return refreshLiveness.promise;
      }

      throw new Error(`Unhandled request: ${url}`);
    }) as typeof fetch;

    mountedRoot = await renderApp('/console');

    await waitFor(() => {
      const refreshButton = getButtonByText(mountedRoot!.container, 'Refresh');
      expect(refreshButton.disabled).toBe(false);
    });

    await clickButton(getButtonByText(mountedRoot.container, 'Refresh'));

    await waitFor(() => {
      const refreshButton = getButtonByText(mountedRoot!.container, 'Refreshing...');
      expect(refreshButton.disabled).toBe(true);
    });

    refreshBootstrap.resolve(jsonResponse({
      bootstrapped: true,
      requires_setup: false,
      timestamp: '2026-04-29T12:05:00.000Z',
    }));
    refreshReadiness.resolve(jsonResponse({
      status: 'ready',
      database: {
        connected: true,
        migrations: {
          applied: 5,
          total: 5,
          pending: 0,
        },
      },
      timestamp: '2026-04-29T12:05:00.000Z',
    }));
    refreshLiveness.resolve(jsonResponse({
      status: 'ok',
      timestamp: '2026-04-29T12:05:00.000Z',
      uptime: 84,
    }));

    await waitFor(() => {
      const refreshButton = getButtonByText(mountedRoot!.container, 'Refresh');
      expect(refreshButton.disabled).toBe(false);
      expect(textContent(mountedRoot!.container)).toContain('Uptime 1m 24s.');
    });
  });
});

describe('App mounted route branching', () => {
  it('mounts the operator console on /console and the setup flow on non-console routes', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/v1/bootstrap/status') {
        return jsonResponse({
          bootstrapped: true,
          requires_setup: true,
          timestamp: '2026-04-29T12:00:00.000Z',
        });
      }

      if (url === '/health/ready') {
        return jsonResponse({
          status: 'ready',
          database: {
            connected: true,
            migrations: {
              applied: 5,
              total: 5,
              pending: 0,
            },
          },
          timestamp: '2026-04-29T12:00:00.000Z',
        });
      }

      if (url === '/health/live') {
        return jsonResponse({
          status: 'ok',
          timestamp: '2026-04-29T12:00:00.000Z',
          uptime: 42,
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    mountedRoot = await renderApp('/console');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Deployment verification');
      expect(textContent(mountedRoot!.container)).toContain('Bootstrap verification');
    });

    await mountedRoot.unmount();
    mountedRoot = await renderApp('/setup');

    await waitFor(() => {
      expect(textContent(mountedRoot!.container)).toContain('Setup wizard');
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/bootstrap/status');
    });
  });
});
