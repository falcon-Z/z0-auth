import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import {
  describeBootstrapStatus,
  describeLivenessStatus,
  describeReadinessStatus,
  extractApiError,
  fetchAuthState,
  fetchJson,
  fetchReadiness,
  formatUptime,
  mapApiFieldToSetupField,
  readErrorResponse,
  validateSetupForm,
} from '@z0/src/App';

describe('frontend helpers', () => {
  it('validates the setup form in operator-facing priority order', () => {
    expect(validateSetupForm({
      platformName: '',
      adminEmail: 'admin@example.com',
      adminPassword: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
    })).toEqual({
      field: 'platformName',
      message: 'Platform name is required',
    });

    expect(validateSetupForm({
      platformName: 'AB',
      adminEmail: 'admin@example.com',
      adminPassword: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
    })).toEqual({
      field: 'platformName',
      message: 'Platform name must be at least 3 characters',
    });

    expect(validateSetupForm({
      platformName: 'A'.repeat(256),
      adminEmail: 'admin@example.com',
      adminPassword: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
    })).toEqual({
      field: 'platformName',
      message: 'Platform name must be 255 characters or fewer',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: '',
      adminPassword: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
    })).toEqual({
      field: 'adminEmail',
      message: 'Admin email is required',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'bad-email',
      adminPassword: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
    })).toEqual({
      field: 'adminEmail',
      message: 'Invalid email format',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'admin@example.com',
      adminPassword: 'short',
      confirmPassword: 'short',
    })).toEqual({
      field: 'adminPassword',
      message: 'Password must be at least 12 characters',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'admin@example.com',
      adminPassword: 'VALIDPASSWORD123!',
      confirmPassword: 'VALIDPASSWORD123!',
    })).toEqual({
      field: 'adminPassword',
      message: 'Password must contain lowercase letters',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'admin@example.com',
      adminPassword: 'validpassword123!',
      confirmPassword: 'validpassword123!',
    })).toEqual({
      field: 'adminPassword',
      message: 'Password must contain uppercase letters',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'admin@example.com',
      adminPassword: 'ValidPassword!!!',
      confirmPassword: 'ValidPassword!!!',
    })).toEqual({
      field: 'adminPassword',
      message: 'Password must contain numbers',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'admin@example.com',
      adminPassword: 'ValidPassword1234',
      confirmPassword: 'ValidPassword1234',
    })).toEqual({
      field: 'adminPassword',
      message: 'Password must contain special characters (@$!%*?&)',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'admin@example.com',
      adminPassword: 'ValidPassword123!',
      confirmPassword: 'Mismatch123!',
    })).toEqual({
      field: 'confirmPassword',
      message: 'Passwords do not match',
    });

    expect(validateSetupForm({
      platformName: 'Acme Identity',
      adminEmail: 'admin@example.com',
      adminPassword: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
    })).toBeNull();
  });

  it('prefers detailed API validation messages over generic error text', () => {
    expect(extractApiError({
      error: 'Validation failed',
      details: {
        confirm_password: 'Passwords do not match',
      },
    })).toBe('Passwords do not match');

    expect(extractApiError({ error: 'Platform already initialized' })).toBe('Platform already initialized');
    expect(extractApiError({ details: { admin_email: 42 } }, 'Fallback message')).toBe('Fallback message');
    expect(extractApiError(null, 'Fallback message')).toBe('Fallback message');
  });

  it('maps API detail keys back to setup fields', () => {
    expect(mapApiFieldToSetupField('platform_name')).toBe('platformName');
    expect(mapApiFieldToSetupField('admin_email')).toBe('adminEmail');
    expect(mapApiFieldToSetupField('admin_password')).toBe('adminPassword');
    expect(mapApiFieldToSetupField('confirm_password')).toBe('confirmPassword');
    expect(mapApiFieldToSetupField('unknown_field')).toBeNull();
  });

  it('formats uptime into compact operator-facing text', () => {
    expect(formatUptime(0)).toBe('0s');
    expect(formatUptime(65)).toBe('1m 5s');
    expect(formatUptime(3661)).toBe('1h 1m 1s');
    expect(formatUptime(59.8)).toBe('59s');
    expect(formatUptime(-1)).toBe('0s');
  });

  it('maps bootstrap and health responses into operator summaries', () => {
    expect(describeBootstrapStatus(null)).toEqual({
      label: 'Unknown',
      tone: 'neutral',
      summary: 'Bootstrap state unavailable',
      detail: 'The console has not received a bootstrap response yet.',
    });

    expect(describeBootstrapStatus({
      bootstrapped: false,
      requires_setup: true,
      timestamp: '2026-04-29T12:00:00.000Z',
    }).summary).toBe('Platform initialization has not completed.');

    expect(describeBootstrapStatus({
      bootstrapped: true,
      requires_setup: false,
      timestamp: '2026-04-29T12:00:00.000Z',
    }).label).toBe('Verified');

    expect(describeBootstrapStatus({
      bootstrapped: false,
      requires_setup: false,
      timestamp: '2026-04-29T12:00:00.000Z',
    })).toMatchObject({
      label: 'Inconsistent',
      tone: 'warning',
    });

    expect(describeReadinessStatus(null).label).toBe('Unknown');

    expect(describeReadinessStatus({
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
    }).detail).toBe('5/5 migrations applied.');

    expect(describeReadinessStatus({
      status: 'not_ready',
      database: {
        connected: false,
        migrations: {
          applied: 3,
          total: 5,
          pending: 2,
        },
      },
      timestamp: '2026-04-29T12:00:00.000Z',
    }).summary).toBe('Dependencies still need attention before traffic should be sent.');

    expect(describeLivenessStatus(null).label).toBe('Unknown');

    expect(describeLivenessStatus({
      status: 'ok',
      timestamp: '2026-04-29T12:00:00.000Z',
      uptime: 42,
    }).detail).toBe('Uptime 42s.');
  });
});

describe('frontend API integration helpers', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(() => {
      throw new Error('fetch mock not configured');
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('normalizes permission failures for operator console requests', async () => {
    const message401 = await readErrorResponse(new Response('ignored', {
      status: 401,
    }));
    const message403 = await readErrorResponse(new Response('ignored', {
      status: 403,
    }));

    expect(message401).toBe('Access denied for this endpoint.');
    expect(message403).toBe('Access denied for this endpoint.');
  });

  it('extracts structured and plain-text API failures from bootstrap requests', async () => {
    const structured = await readErrorResponse(new Response(JSON.stringify({
      error: 'Validation failed',
      details: {
        admin_email: 'Admin email is required',
      },
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    const plainText = await readErrorResponse(new Response('Service unavailable', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain',
      },
    }));

    expect(structured).toBe('Admin email is required');
    expect(plainText).toBe('Service unavailable');
  });

  it('falls back from /health/live to /health after a 404', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/health/live') {
        return new Response('Not found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }

      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: '2026-04-29T12:00:00.000Z',
        uptime: 42,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchJson<{ status: string; uptime: number }>(['/health/live', '/health']);

    expect(result).toEqual({
      status: 'ok',
      timestamp: '2026-04-29T12:00:00.000Z',
      uptime: 42,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/health/live');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/health');
  });

  it('throws when a successful response body is not valid JSON', async () => {
    globalThis.fetch = mock(async () =>
      new Response('not-json{{{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;

    await expect(fetchJson(['/api/v1/bootstrap/status'])).rejects.toThrow();
  });

  it('throws the last meaningful error when all request paths fail', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/v1/bootstrap/status') {
        return new Response(JSON.stringify({
          error: 'Bootstrap unavailable',
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      throw new Error('Network request failed.');
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchJson(['/api/v1/bootstrap/status'])).rejects.toThrow('Bootstrap unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchReadiness', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the readiness payload when /health/ready responds 503 (degraded-but-valid state)', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        status: 'not_ready',
        database: {
          connected: false,
          migrations: { applied: 3, total: 5, pending: 2 },
        },
        timestamp: '2026-04-29T12:00:00.000Z',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;

    const result = await fetchReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.database.connected).toBe(false);
    expect(result.database.migrations.pending).toBe(2);
  });

  it('returns the readiness payload when /health/ready responds 200 (ready state)', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        status: 'ready',
        database: {
          connected: true,
          migrations: { applied: 11, total: 11, pending: 0 },
        },
        timestamp: '2026-04-29T12:00:00.000Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;

    const result = await fetchReadiness();
    expect(result.status).toBe('ready');
    expect(result.database.migrations.applied).toBe(11);
  });

  it('throws for unexpected error status codes from /health/ready', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;

    await expect(fetchReadiness()).rejects.toThrow('Internal server error');
  });

  it('throws for network errors from /health/ready', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('Network request failed.');
    }) as typeof fetch;

    await expect(fetchReadiness()).rejects.toThrow('Network request failed.');
  });
});

describe('fetchAuthState', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(() => {
      throw new Error('fetch mock not configured');
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns authenticated when session endpoint responds 200', async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    await expect(fetchAuthState()).resolves.toBe('authenticated');
  });

  it('returns unauthenticated when session endpoint responds 401', async () => {
    globalThis.fetch = mock(async () => new Response('Unauthorized', { status: 401 })) as typeof fetch;

    await expect(fetchAuthState()).resolves.toBe('unauthenticated');
  });

  it('returns unsupported when session endpoint is not implemented', async () => {
    globalThis.fetch = mock(async () => new Response('Not found', { status: 404 })) as typeof fetch;

    await expect(fetchAuthState()).resolves.toBe('unsupported');
  });
});
