import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/test-app';
import { TestHelpers } from './setup/test-helpers';

// These tests require a running database and full app context.
// They are skipped by default and run separately in CI with services.
describe.skip('Cases (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let lawyerToken: string;
  let unassignedLawyerToken: string;
  let clientToken: string;

  let caseId: string;
  let clientProfileId: string;
  let lawyerUserId: string;

  const timestamp = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    // Register admin and get token
    adminToken = await TestHelpers.loginAsAdmin(app);

    // Register a lawyer
    const lawyerData = {
      email: `lawyer-${timestamp}@test.com`,
      password: 'Lawyer123!@#',
      firstName: 'Test',
      lastName: 'Lawyer',
    };
    await TestHelpers.registerUser(app, lawyerData);
    const lawyerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: lawyerData.email, password: lawyerData.password });
    lawyerToken = lawyerLogin.body.accessToken;
    lawyerUserId = lawyerLogin.body.user?.id || lawyerLogin.body.id;

    // Register an unassigned lawyer
    const unassignedData = {
      email: `unassigned-lawyer-${timestamp}@test.com`,
      password: 'Lawyer123!@#',
      firstName: 'Unassigned',
      lastName: 'Lawyer',
    };
    await TestHelpers.registerUser(app, unassignedData);
    const unassignedLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: unassignedData.email, password: unassignedData.password });
    unassignedLawyerToken = unassignedLogin.body.accessToken;

    // Register a client
    const clientData = {
      email: `client-${timestamp}@test.com`,
      password: 'Client123!@#',
      firstName: 'Test',
      lastName: 'Client',
    };
    await TestHelpers.registerUser(app, clientData);
    const clientLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: clientData.email, password: clientData.password });
    clientToken = clientLogin.body.accessToken;
    clientProfileId = clientLogin.body.clientProfileId || clientLogin.body.user?.clientProfileId;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ─── Create ──────────────────────────────────────────────────

  describe('POST /api/v1/cases', () => {
    it('should create a case as admin (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `E2E Case ${timestamp}`,
          type: 'CIVIL',
          priority: 'HIGH',
          description: 'Test case created by e2e',
          legalArea: 'Derecho Civil',
          clientProfileId,
          assignedLawyerId: lawyerUserId,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toContain('E2E Case');
      expect(res.body.status).toBe('INTAKE');
      caseId = res.body.id;
    });
  });

  // ─── List ────────────────────────────────────────────────────

  describe('GET /api/v1/cases', () => {
    it('should list cases with pagination as admin (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('meta');
    });
  });

  // ─── Access control ──────────────────────────────────────────

  describe('GET /api/v1/cases/:id', () => {
    it('should let assigned lawyer view the case (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}`)
        .set('Authorization', `Bearer ${lawyerToken}`)
        .expect(200);

      expect(res.body.id).toBe(caseId);
    });

    it('should reject unassigned lawyer with 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}`)
        .set('Authorization', `Bearer ${unassignedLawyerToken}`)
        .expect(403);
    });
  });

  // ─── Status transitions ──────────────────────────────────────

  describe('PATCH /api/v1/cases/:id/status', () => {
    it('should transition INTAKE to ACTIVE (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE', reason: 'Case accepted' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('should reject invalid status transition (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ARCHIVED' })
        .expect(400);
    });
  });

  // ─── Parties ─────────────────────────────────────────────────

  describe('POST /api/v1/cases/:id/parties', () => {
    it('should add a party to the case (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/parties`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Juan Perez Garcia',
          role: 'PLAINTIFF',
          email: 'juan@ejemplo.com',
          phone: '+525512345678',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Juan Perez Garcia');
      expect(res.body.role).toBe('PLAINTIFF');
    });
  });

  // ─── Notes ───────────────────────────────────────────────────

  describe('POST /api/v1/cases/:id/notes', () => {
    it('should add a note to the case (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Initial consultation completed successfully',
          isInternal: false,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.content).toBe('Initial consultation completed successfully');
    });
  });

  // ─── Timeline ────────────────────────────────────────────────

  describe('GET /api/v1/cases/:id/timeline', () => {
    it('should return the case timeline with entries (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/timeline`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ─── Soft delete ─────────────────────────────────────────────

  describe('DELETE /api/v1/cases/:id', () => {
    it('should soft delete the case as admin (204)', async () => {
      // Create a disposable case for deletion
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Case to Delete ${timestamp}`,
          type: 'COMMERCIAL',
          clientProfileId,
          assignedLawyerId: lawyerUserId,
        });

      const disposableCaseId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/cases/${disposableCaseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  // ─── Client visibility ──────────────────────────────────────

  describe('Client case visibility', () => {
    it('should only show cases belonging to the client', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      if (res.body.data.length > 0) {
        res.body.data.forEach((c: any) => {
          expect(c.clientProfileId).toBe(clientProfileId);
        });
      }
    });
  });

  // ─── Conflict check ─────────────────────────────────────────

  describe('GET /api/v1/cases/conflict-check', () => {
    it('should return conflict check results (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cases/conflict-check')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ name: 'Juan Perez' })
        .expect(200);

      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
    });
  });
});
