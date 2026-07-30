import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/test-app';

// These tests require a running database and full app context.
// They are skipped by default and run separately in CI with services.
describe.skip('Auth (e2e)', () => {
  let app: INestApplication;

  const testUser = {
    email: `e2e-${Date.now()}@test.com`,
    password: 'SecurePass123!',
    firstName: 'E2E',
    lastName: 'Tester',
  };

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe(testUser.email);
    });

    it('should return 409 for duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should return 401 for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPass123!' })
        .expect(401);
    });
  });

  describe('GET /api/v1/users/me', () => {
    it('should get profile with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(testUser.email);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');

      // Update tokens for subsequent tests
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 for existing email (prevent enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200);
    });

    it('should return 200 for non-existing email (prevent enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' })
        .expect(200);
    });
  });

  describe('Rate limiting on login', () => {
    it('should block the 6th login attempt', async () => {
      const attempts = Array.from({ length: 6 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: testUser.email, password: 'WrongPass123!' }),
      );

      const results = await Promise.all(attempts);
      const blocked = results.some((res) => res.status === 429);

      expect(blocked).toBe(true);
    });
  });
});
