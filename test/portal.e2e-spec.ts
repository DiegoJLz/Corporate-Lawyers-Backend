import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/test-app';
import { TestHelpers } from './setup/test-helpers';

// These tests require a running database and full app context.
// They are skipped by default and run separately in CI with services.
describe.skip('Client Portal (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;
  let otherClientToken: string;

  let caseId: string;
  let clientProfileId: string;
  let lawyerUserId: string;
  let nonAssignedUserId: string;

  const timestamp = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    // Register admin
    adminToken = await TestHelpers.loginAsAdmin(app);

    // Register a lawyer (will be assigned to the case)
    const lawyerData = {
      email: `portal-lawyer-${timestamp}@test.com`,
      password: 'Lawyer123!@#',
      firstName: 'Portal',
      lastName: 'Lawyer',
    };
    await TestHelpers.registerUser(app, lawyerData);
    const lawyerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: lawyerData.email, password: lawyerData.password });
    lawyerUserId = lawyerLogin.body.user?.id || lawyerLogin.body.id;

    // Register a second lawyer (not assigned to any case)
    const otherLawyerData = {
      email: `portal-other-lawyer-${timestamp}@test.com`,
      password: 'Lawyer123!@#',
      firstName: 'Other',
      lastName: 'Lawyer',
    };
    await TestHelpers.registerUser(app, otherLawyerData);
    const otherLawyerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: otherLawyerData.email, password: otherLawyerData.password });
    nonAssignedUserId = otherLawyerLogin.body.user?.id || otherLawyerLogin.body.id;

    // Register the main client
    const clientData = {
      email: `portal-client-${timestamp}@test.com`,
      password: 'Client123!@#',
      firstName: 'Portal',
      lastName: 'Client',
    };
    await TestHelpers.registerUser(app, clientData);
    const clientLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: clientData.email, password: clientData.password });
    clientToken = clientLogin.body.accessToken;
    clientProfileId = clientLogin.body.clientProfileId || clientLogin.body.user?.clientProfileId;

    // Register another client (for isolation tests)
    const otherClientData = {
      email: `portal-other-client-${timestamp}@test.com`,
      password: 'Client123!@#',
      firstName: 'Other',
      lastName: 'Client',
    };
    await TestHelpers.registerUser(app, otherClientData);
    const otherClientLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: otherClientData.email, password: otherClientData.password });
    otherClientToken = otherClientLogin.body.accessToken;

    // Create a case for the main client
    const caseRes = await request(app.getHttpServer())
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Portal Test Case ${timestamp}`,
        type: 'CIVIL',
        clientProfileId,
        assignedLawyerId: lawyerUserId,
      });
    caseId = caseRes.body.id;

    // Activate the case
    await request(app.getHttpServer())
      .patch(`/api/v1/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    // Add a public note (visible to client)
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'Public update for the client', isInternal: false });

    // Add an internal note (not visible to client)
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'Internal team discussion', isInternal: true });

    // Create a DRAFT invoice (should not be visible to client)
    await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        caseId,
        clientProfileId,
        dueDate: '2026-08-01',
        items: [{ description: 'Draft invoice item', quantity: 1, unitPrice: 5000 }],
      });

    // Create and send a SENT invoice (should be visible to client)
    const sentInvoiceRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        caseId,
        clientProfileId,
        dueDate: '2026-08-15',
        items: [{ description: 'Sent invoice item', quantity: 2, unitPrice: 3000 }],
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/invoices/${sentInvoiceRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SENT' });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ─── Dashboard ───────────────────────────────────────────────

  describe('GET /api/v1/portal/dashboard', () => {
    it('should return client dashboard (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/dashboard')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(typeof res.body).toBe('object');
    });
  });

  // ─── Cases ───────────────────────────────────────────────────

  describe('GET /api/v1/portal/cases', () => {
    it('should list cases belonging to the client (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/cases')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should not show cases belonging to another client (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/portal/cases/${caseId}`)
        .set('Authorization', `Bearer ${otherClientToken}`)
        .expect(404);
    });
  });

  // ─── Timeline (public only) ──────────────────────────────────

  describe('GET /api/v1/portal/cases/:id/timeline', () => {
    it('should show only public timeline entries to client', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/cases/${caseId}/timeline`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      // All returned entries should be public (isInternal: false or isPublic: true)
      res.body.data.forEach((entry: any) => {
        if (entry.isInternal !== undefined) {
          expect(entry.isInternal).toBe(false);
        }
      });
    });
  });

  // ─── Documents (non-confidential only) ───────────────────────

  describe('GET /api/v1/portal/documents', () => {
    it('should show only non-confidential documents to client', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/documents')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((doc: any) => {
        expect(doc.isConfidential).not.toBe(true);
      });
    });
  });

  // ─── Invoices (non-DRAFT only) ──────────────────────────────

  describe('GET /api/v1/portal/invoices', () => {
    it('should show only non-DRAFT invoices to client', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/invoices')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((invoice: any) => {
        expect(invoice.status).not.toBe('DRAFT');
      });
    });
  });

  // ─── Messages ────────────────────────────────────────────────

  describe('POST /api/v1/portal/messages', () => {
    it('should send a message to the lead attorney (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/portal/messages')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          caseId,
          receiverId: lawyerUserId,
          content: 'Hello, I have a question about the case progress.',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.content).toBe('Hello, I have a question about the case progress.');
    });

    it('should reject message to a non-assigned user (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/portal/messages')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          caseId,
          receiverId: nonAssignedUserId,
          content: 'This should be rejected',
        })
        .expect(403);
    });
  });

  describe('GET /api/v1/portal/messages/:caseId', () => {
    it('should auto-mark messages as read on fetch', async () => {
      // First, send a message so there is something to read
      await request(app.getHttpServer())
        .post('/api/v1/portal/messages')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          caseId,
          receiverId: lawyerUserId,
          content: 'Another message for read-tracking test',
        });

      // Fetch messages (should auto-mark as read)
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/messages/${caseId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');

      // Check unread count after fetching - should be 0 for this case
      const unreadRes = await request(app.getHttpServer())
        .get('/api/v1/portal/messages/unread')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      // Unread count for this case should be 0 since we just fetched
      if (Array.isArray(unreadRes.body)) {
        const caseUnread = unreadRes.body.find((u: any) => u.caseId === caseId);
        if (caseUnread) {
          expect(caseUnread.count).toBe(0);
        }
      }
    });
  });

  // ─── Onboarding ──────────────────────────────────────────────

  describe('POST /api/v1/portal/profile/onboarding', () => {
    it('should complete client onboarding and create profile (201)', async () => {
      // Register a fresh client who has not onboarded
      const freshClientData = {
        email: `onboarding-${timestamp}@test.com`,
        password: 'Client123!@#',
        firstName: 'Fresh',
        lastName: 'Client',
      };
      await TestHelpers.registerUser(app, freshClientData);
      const freshLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: freshClientData.email, password: freshClientData.password });
      const freshToken = freshLogin.body.accessToken;

      const res = await request(app.getHttpServer())
        .post('/api/v1/portal/profile/onboarding')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({
          firstName: 'Fresh',
          lastName: 'Client',
          phone: '+525512345678',
          clientType: 'INDIVIDUAL',
          rfc: 'XAXX010101000',
        })
        .expect(201);

      expect(res.body).toBeDefined();
      expect(typeof res.body).toBe('object');
    });
  });
});
