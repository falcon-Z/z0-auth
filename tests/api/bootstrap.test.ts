import { describe, it, expect, mock } from 'bun:test';
import { handleBootstrapStatus, handleBootstrapInitialize, type BootstrapDependencies } from '../../src/api/bootstrap';

function createDependencies(overrides: Partial<BootstrapDependencies> = {}): BootstrapDependencies {
  return {
    createDatabaseClient: mock(() => ({
      unsafe: mock(async () => [{ platform_count: 0 }]),
      begin: mock(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        unsafe: mock(async (query: string) => {
          if (query.includes('SELECT COUNT(*) as platform_count')) {
            return [{ platform_count: 0 }];
          }
          if (query.includes('RETURNING id')) {
            return [{ id: '550e8400-e29b-41d4-a716-446655440000' }];
          }
          return [];
        }),
      })),
      close: mock(async () => undefined),
    })),
    resolveDatabaseUrl: mock(() => 'postgres://test-db'),
    hashSecret: mock(async () => 'hashed-value'),
    generateRandomString: mock(() => 'bootstrap-token'),
    ...overrides,
  };
}

describe('Bootstrap Endpoints', () => {
  describe('Bootstrap Status', () => {
    it('should return bootstrap status', async () => {
      const deps = createDependencies({
        createDatabaseClient: mock(() => ({
          unsafe: mock(async () => [{ platform_count: 1 }]),
          begin: mock(async () => {
            throw new Error('not used');
          }),
          close: mock(async () => undefined),
        })),
      });

      const request = new Request('http://localhost:3000/api/v1/bootstrap/status', {
        method: 'GET',
      });

      const response = await handleBootstrapStatus(request, deps);
      expect(response.status).toBe(200);

      const data = await response.json() as {
        bootstrapped: boolean;
        requires_setup: boolean;
        timestamp: string;
      };

      expect(typeof data.bootstrapped).toBe('boolean');
      expect(typeof data.requires_setup).toBe('boolean');
      expect(typeof data.timestamp).toBe('string');
      
      expect(data.bootstrapped).toBe(true);
      expect(data.requires_setup).toBe(false);
    });

    it('should return valid timestamp', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/status', {
        method: 'GET',
      });

      const response = await handleBootstrapStatus(request, createDependencies());
      const data = await response.json() as { timestamp: string };

      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
      expect(Number.isNaN(timestamp.getTime())).toBe(false);
    });

    it('should normalize SQL count variants deterministically', async () => {
      const testCases = [
        { count: '0', expectedBootstrapped: false, expectedRequiresSetup: true },
        { count: '1', expectedBootstrapped: true, expectedRequiresSetup: false },
        { count: 0n, expectedBootstrapped: false, expectedRequiresSetup: true },
        { count: 1n, expectedBootstrapped: true, expectedRequiresSetup: false },
      ] as const;

      for (const testCase of testCases) {
        const deps = createDependencies({
          createDatabaseClient: mock(() => ({
            unsafe: mock(async () => [{ platform_count: testCase.count }]),
            begin: mock(async () => {
              throw new Error('not used');
            }),
            close: mock(async () => undefined),
          })),
        });

        const request = new Request('http://localhost:3000/api/v1/bootstrap/status', {
          method: 'GET',
        });

        const response = await handleBootstrapStatus(request, deps);
        expect(response.status).toBe(200);

        const data = await response.json() as {
          bootstrapped: boolean;
          requires_setup: boolean;
        };

        expect(data.bootstrapped).toBe(testCase.expectedBootstrapped);
        expect(data.requires_setup).toBe(testCase.expectedRequiresSetup);
      }
    });

    it('should return 500 when status check fails', async () => {
      const deps = createDependencies({
        createDatabaseClient: mock(() => ({
          unsafe: mock(async () => {
            throw new Error('db down');
          }),
          begin: mock(async () => {
            throw new Error('not used');
          }),
          close: mock(async () => undefined),
        })),
      });

      const request = new Request('http://localhost:3000/api/v1/bootstrap/status', {
        method: 'GET',
      });

      const response = await handleBootstrapStatus(request, deps);
      expect(response.status).toBe(500);

      const data = await response.json() as { error: string };
      expect(data.error).toBe('Failed to check bootstrap status');
    });
  });

  describe('Bootstrap Initialize', () => {
    it('should reject non-POST requests', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'GET',
      });

      const response = await handleBootstrapInitialize(request, createDependencies());
      expect(response.status).toBe(405);
    });

    it('should validate required fields', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, createDependencies());
      expect(response.status).toBe(400);

      const data = await response.json() as { error: string; details?: Record<string, string> };
      expect(data.error).toBe('Validation failed');
      expect(data.details).toBeDefined();
    });

    it('should validate email format', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({
          platform_name: 'Test Platform',
          admin_email: 'invalid-email',
          admin_password: 'SecurePass123!',
          confirm_password: 'SecurePass123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, createDependencies());
      expect(response.status).toBe(400);

      const data = await response.json() as { details?: Record<string, string> };
      expect(data.details?.admin_email).toBeDefined();
    });

    it('should validate password strength', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({
          platform_name: 'Test Platform',
          admin_email: 'admin@example.com',
          admin_password: 'weak',
          confirm_password: 'weak',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, createDependencies());
      expect(response.status).toBe(400);

      const data = await response.json() as { details?: Record<string, string> };
      expect(data.details?.admin_password).toBeDefined();
    });

    it('should validate password confirmation', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({
          platform_name: 'Test Platform',
          admin_email: 'admin@example.com',
          admin_password: 'SecurePass123!',
          confirm_password: 'DifferentPass123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, createDependencies());
      expect(response.status).toBe(400);

      const data = await response.json() as { details?: Record<string, string> };
      expect(data.details?.confirm_password).toBeDefined();
    });

    it('should accept valid initialization request', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({
          platform_name: 'Test Platform',
          admin_email: 'admin@example.com',
          admin_password: 'SecurePass123!',
          confirm_password: 'SecurePass123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, createDependencies());
      expect(response.status).toBe(201);

      const data = await response.json() as {
        platform_id: string;
        bootstrap_token: string;
        admin_email: string;
        setup_complete: boolean;
        timestamp: string;
      };

      expect(typeof data.platform_id).toBe('string');
      expect(typeof data.bootstrap_token).toBe('string');
      expect(data.admin_email).toBe('admin@example.com');
      expect(data.setup_complete).toBe(true);
      expect(typeof data.timestamp).toBe('string');
    });

    it('should return 409 when platform already exists', async () => {
      const deps = createDependencies({
        createDatabaseClient: mock(() => ({
          unsafe: mock(async () => [{ platform_count: 0 }]),
          begin: mock(async (callback: (tx: unknown) => Promise<unknown>) => callback({
            unsafe: mock(async (query: string) => {
              if (query.includes('SELECT COUNT(*) as platform_count')) {
                return [{ platform_count: 1 }];
              }
              return [];
            }),
          })),
          close: mock(async () => undefined),
        })),
      });

      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({
          platform_name: 'Test Platform',
          admin_email: 'admin@example.com',
          admin_password: 'SecurePass123!',
          confirm_password: 'SecurePass123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, deps);
      expect(response.status).toBe(409);

      const data = await response.json() as { error: string };
      expect(data.error).toBe('Platform already initialized');
    });

    it('should return 500 when initialization fails with unexpected error', async () => {
      const deps = createDependencies({
        createDatabaseClient: mock(() => ({
          unsafe: mock(async () => []),
          begin: mock(async () => {
            throw new Error('simulated transaction failure');
          }),
          close: mock(async () => undefined),
        })),
      });

      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({
          platform_name: 'Test Platform',
          admin_email: 'admin@example.com',
          admin_password: 'SecurePass123!',
          confirm_password: 'SecurePass123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, deps);
      expect(response.status).toBe(500);

      const data = await response.json() as { error: string };
      expect(data.error).toBe('Bootstrap initialization failed');
    });

    it('should reject invalid JSON', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: 'invalid json {',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request, createDependencies());
      expect(response.status).toBe(400);

      const data = await response.json() as { error: string };
      expect(data.error).toContain('Invalid JSON');
    });
  });
});
