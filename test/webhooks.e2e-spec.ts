import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/test-app';
import { TestHelpers } from './setup/test-helpers';

// These tests require a running database and full app context.
// They are skipped by default and run separately in CI with services.
describe.skip('Webhooks (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let webhookId: string;

  const timestamp = Date.now();

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await TestHelpers.loginAsAdmin(app);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ─── Create ──────────────────────────────────────────────────

  describe('POST /api/v1/webhooks', () => {
    it('should create a webhook endpoint with a generated secret (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: `https://example.com/webhook-${timestamp}`,
          events: ['case.updated', 'document.signed'],
          description: 'E2E test webhook',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('secret');
      expect(res.body.secret).toBeTruthy();
      expect(res.body.url).toContain('example.com');
      expect(res.body.events).toContain('case.updated');
      expect(res.body.events).toContain('document.signed');
      webhookId = res.body.id;
    });
  });

  // ─── List ────────────────────────────────────────────────────

  describe('GET /api/v1/webhooks', () => {
    it('should list webhooks without exposing the secret (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Secret should not be included in list responses
      res.body.data.forEach((webhook: any) => {
        expect(webhook.secret).toBeUndefined();
      });
    });
  });

  // ─── Get single ──────────────────────────────────────────────

  describe('GET /api/v1/webhooks/:id', () => {
    it('should return a single webhook with the secret included (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(webhookId);
      expect(res.body).toHaveProperty('secret');
      expect(res.body.secret).toBeTruthy();
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('events');
    });
  });

  // ─── Update ──────────────────────────────────────────────────

  describe('PATCH /api/v1/webhooks/:id', () => {
    it('should update webhook to toggle active state (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(res.body.isActive).toBe(false);

      // Re-enable for subsequent tests
      await request(app.getHttpServer())
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
    });
  });

  // ─── Test ping ───────────────────────────────────────────────

  describe('POST /api/v1/webhooks/:id/test', () => {
    it('should dispatch a test ping event (200)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/${webhookId}/test`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      // Should indicate the ping was dispatched
      expect(typeof res.body).toBe('object');
    });
  });

  // ─── Soft delete ─────────────────────────────────────────────

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('should soft delete the webhook (204)', async () => {
      // Create a disposable webhook for deletion
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: `https://example.com/disposable-${timestamp}`,
          events: ['case.created'],
          description: 'Webhook to be deleted',
        });

      const disposableId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/webhooks/${disposableId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify it no longer appears in listing
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const found = listRes.body.data.find((w: any) => w.id === disposableId);
      expect(found).toBeUndefined();
    });
  });
});
