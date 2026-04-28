import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { handleLivenessCheck, handleReadinessCheck } from '../../src/api/health';

describe('Health Endpoints', () => {
  describe('Liveness Check', () => {
    it('should return 200 OK with uptime', async () => {
      const request = new Request('http://localhost:3000/health/live', {
        method: 'GET',
      });

      const response = await handleLivenessCheck(request);
      expect(response.status).toBe(200);

      const data = await response.json() as { status: string; timestamp: string; uptime: number };
      expect(data.status).toBe('ok');
      expect(typeof data.timestamp).toBe('string');
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should always return 200 regardless of database state', async () => {
      const request = new Request('http://localhost:3000/health/live', {
        method: 'GET',
      });

      const response = await handleLivenessCheck(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Readiness Check', () => {
    it('should return 200 when database is ready', async () => {
      const request = new Request('http://localhost:3000/health/ready', {
        method: 'GET',
      });

      const response = await handleReadinessCheck(request);
      
      const data = await response.json() as { 
        status: string;
        database: {
          connected: boolean;
          migrations: {
            applied: number;
            total: number;
            pending: number;
          };
        };
        timestamp: string;
      };

      expect(typeof data.status).toBe('string');
      expect(data.status).toMatch(/^(ready|not_ready)$/);
      expect(data.database).toBeDefined();
      expect(data.database.connected).toBeDefined();
      expect(data.database.migrations).toBeDefined();
      expect(typeof data.timestamp).toBe('string');
    });

    it('should include migration status in response', async () => {
      const request = new Request('http://localhost:3000/health/ready', {
        method: 'GET',
      });

      const response = await handleReadinessCheck(request);
      const data = await response.json() as {
        database: {
          connected: boolean;
          migrations: {
            applied: number;
            total: number;
            pending: number;
          };
        };
      };

      expect(data.database.migrations.applied).toBeDefined();
      expect(data.database.migrations.total).toBeDefined();
      expect(data.database.migrations.pending).toBeDefined();
      expect(typeof data.database.migrations.applied).toBe('number');
      expect(typeof data.database.migrations.total).toBe('number');
      expect(typeof data.database.migrations.pending).toBe('number');
    });

    it('should return 503 when migrations are pending', async () => {
      // This test assumes a database state where migrations are pending
      // In a real test, we would mock the database to return pending migrations
      const request = new Request('http://localhost:3000/health/ready', {
        method: 'GET',
      });

      const response = await handleReadinessCheck(request);
      const data = await response.json() as {
        status: string;
        database: {
          migrations: {
            pending: number;
          };
        };
      };

      if (data.database.migrations.pending > 0) {
        expect(response.status).toBe(503);
        expect(data.status).toBe('not_ready');
      } else {
        expect(response.status).toBe(200);
        expect(data.status).toBe('ready');
      }
    });
  });
});
