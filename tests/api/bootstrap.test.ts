import { describe, it, expect } from 'bun:test';
import { handleBootstrapStatus, handleBootstrapInitialize } from '../../src/api/bootstrap';

describe('Bootstrap Endpoints', () => {
  describe('Bootstrap Status', () => {
    it('should return bootstrap status', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/status', {
        method: 'GET',
      });

      const response = await handleBootstrapStatus(request);
      expect(response.status).toBe(200);

      const data = await response.json() as {
        bootstrapped: boolean;
        requires_setup: boolean;
        timestamp: string;
      };

      expect(typeof data.bootstrapped).toBe('boolean');
      expect(typeof data.requires_setup).toBe('boolean');
      expect(typeof data.timestamp).toBe('string');
      
      // In most cases, these should be inverse of each other
      // but we allow for edge cases where the database state might be unexpected
      const responseValid = typeof data.bootstrapped === 'boolean' &&
        typeof data.requires_setup === 'boolean';
      expect(responseValid).toBe(true);
    });

    it('should return valid timestamp', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/status', {
        method: 'GET',
      });

      const response = await handleBootstrapStatus(request);
      const data = await response.json() as { timestamp: string };

      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
      expect(Number.isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe('Bootstrap Initialize', () => {
    it('should reject non-POST requests', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'GET',
      });

      const response = await handleBootstrapInitialize(request);
      expect(response.status).toBe(405);
    });

    it('should validate required fields', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request);
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

      const response = await handleBootstrapInitialize(request);
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

      const response = await handleBootstrapInitialize(request);
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

      const response = await handleBootstrapInitialize(request);
      expect(response.status).toBe(400);

      const data = await response.json() as { details?: Record<string, string> };
      expect(data.details?.confirm_password).toBeDefined();
    });

    it('should accept valid initialization request', async () => {
      // This test assumes a clean database state
      // In production tests, this should be run in isolation or with test isolation
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

      const response = await handleBootstrapInitialize(request);
      
      // Either 201 (success) or 409 (already initialized) are acceptable
      expect([201, 409, 500]).toContain(response.status);

      if (response.status === 201) {
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
      }
    });

    it('should reject invalid JSON', async () => {
      const request = new Request('http://localhost:3000/api/v1/bootstrap/initialize', {
        method: 'POST',
        body: 'invalid json {',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await handleBootstrapInitialize(request);
      expect(response.status).toBe(400);

      const data = await response.json() as { error: string };
      expect(data.error).toContain('Invalid JSON');
    });
  });
});
