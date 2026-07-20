import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export class TestHelpers {
  /**
   * Registers an admin user and returns the access token.
   */
  static async loginAsAdmin(app: INestApplication): Promise<string> {
    const adminData: RegisterData = {
      email: `admin-${Date.now()}@test.com`,
      password: 'Admin123!@#',
      firstName: 'Test',
      lastName: 'Admin',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(adminData);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminData.email, password: adminData.password });

    return loginRes.body.accessToken;
  }

  /**
   * Registers a new user and returns the response.
   */
  static async registerUser(
    app: INestApplication,
    data: RegisterData,
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(data);
  }

  /**
   * Returns a supertest agent with the Bearer token set.
   */
  static authenticatedRequest(
    app: INestApplication,
    token: string,
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
  ): request.Test {
    return request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
  }
}
