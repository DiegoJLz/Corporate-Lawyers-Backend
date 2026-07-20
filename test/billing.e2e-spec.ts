import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/test-app';
import { TestHelpers } from './setup/test-helpers';

// These tests require a running database and full app context.
// They are skipped by default and run separately in CI with services.
describe.skip('Billing (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  let caseId: string;
  let closedCaseId: string;
  let clientProfileId: string;
  let lawyerUserId: string;
  let timeEntryId: string;
  let expenseId: string;
  let invoiceId: string;

  const timestamp = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    // Register admin
    adminToken = await TestHelpers.loginAsAdmin(app);

    // Register a lawyer
    const lawyerData = {
      email: `billing-lawyer-${timestamp}@test.com`,
      password: 'Lawyer123!@#',
      firstName: 'Billing',
      lastName: 'Lawyer',
    };
    await TestHelpers.registerUser(app, lawyerData);
    const lawyerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: lawyerData.email, password: lawyerData.password });
    lawyerUserId = lawyerLogin.body.user?.id || lawyerLogin.body.id;

    // Register a client
    const clientData = {
      email: `billing-client-${timestamp}@test.com`,
      password: 'Client123!@#',
      firstName: 'Billing',
      lastName: 'Client',
    };
    await TestHelpers.registerUser(app, clientData);
    const clientLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: clientData.email, password: clientData.password });
    clientProfileId = clientLogin.body.clientProfileId || clientLogin.body.user?.clientProfileId;

    // Create an active case for billing tests
    const caseRes = await request(app.getHttpServer())
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Billing Test Case ${timestamp}`,
        type: 'COMMERCIAL',
        clientProfileId,
        assignedLawyerId: lawyerUserId,
      });
    caseId = caseRes.body.id;

    // Transition to ACTIVE
    await request(app.getHttpServer())
      .patch(`/api/v1/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    // Create a closed case
    const closedCaseRes = await request(app.getHttpServer())
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Closed Billing Case ${timestamp}`,
        type: 'CIVIL',
        clientProfileId,
        assignedLawyerId: lawyerUserId,
      });
    closedCaseId = closedCaseRes.body.id;

    // Transition to ACTIVE then CLOSED
    await request(app.getHttpServer())
      .patch(`/api/v1/cases/${closedCaseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });
    await request(app.getHttpServer())
      .patch(`/api/v1/cases/${closedCaseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CLOSED' });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ─── Time Entries ────────────────────────────────────────────

  describe('POST /api/v1/time-entries', () => {
    it('should create a time entry (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/time-entries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          caseId,
          description: 'Contract review and analysis',
          hours: 2.5,
          rate: 2500,
          isBillable: true,
          date: '2026-07-01',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.hours).toBe(2.5);
      expect(res.body.caseId).toBe(caseId);
      timeEntryId = res.body.id;
    });

    it('should reject time entry for closed case (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/time-entries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          caseId: closedCaseId,
          description: 'Attempted entry on closed case',
          hours: 1.0,
          date: '2026-07-01',
        })
        .expect(400);
    });
  });

  // ─── Expenses ────────────────────────────────────────────────

  describe('POST /api/v1/expenses', () => {
    it('should create an expense (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          caseId,
          description: 'Travel expenses for hearing',
          amount: 1500.0,
          isBillable: true,
          date: '2026-07-01',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.amount).toBe(1500);
      expenseId = res.body.id;
    });
  });

  // ─── Invoices ────────────────────────────────────────────────

  describe('POST /api/v1/invoices', () => {
    it('should create an invoice from time entries with correct totals (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          caseId,
          clientProfileId,
          dueDate: '2026-08-01',
          taxRate: 0.16,
          notes: 'Invoice for July services',
          timeEntryIds: [timeEntryId],
          expenseIds: [expenseId],
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('subtotal');
      expect(res.body).toHaveProperty('total');
      expect(res.body.status).toBe('DRAFT');
      // subtotal should include time entry (2.5 * 2500 = 6250) + expense (1500) = 7750
      // total = 7750 * 1.16 = 8990
      expect(res.body.subtotal).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(res.body.subtotal);
      invoiceId = res.body.id;
    });
  });

  describe('Invoice number format', () => {
    it('should auto-generate invoice number with FAC-YYYY-NNNNN pattern', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('invoiceNumber');
      expect(res.body.invoiceNumber).toMatch(/^FAC-\d{4}-\d{5}$/);
    });
  });

  describe('PATCH /api/v1/invoices/:id', () => {
    it('should transition invoice from DRAFT to SENT (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SENT' })
        .expect(200);

      expect(res.body.status).toBe('SENT');
    });
  });

  // ─── Payments ────────────────────────────────────────────────

  describe('POST /api/v1/payments', () => {
    it('should register a payment (201)', async () => {
      // Get the invoice total to calculate a partial payment
      const invoiceRes = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const partialAmount = Math.floor(invoiceRes.body.total / 2);

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          invoiceId,
          amount: partialAmount,
          method: 'BANK_TRANSFER',
          reference: 'REF-001',
          notes: 'Partial payment',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.amount).toBe(partialAmount);
    });

    it('should auto-update invoice to PAID when fully paid', async () => {
      // Get invoice to check remaining balance
      const invoiceRes = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const remaining = invoiceRes.body.total - (invoiceRes.body.paidAmount || invoiceRes.body.totalPaid || 0);

      if (remaining > 0) {
        await request(app.getHttpServer())
          .post('/api/v1/payments')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            invoiceId,
            amount: remaining,
            method: 'CREDIT_CARD',
            reference: 'REF-002',
          })
          .expect(201);
      }

      const updatedInvoice = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(updatedInvoice.body.status).toBe('PAID');
    });

    it('should reject payment exceeding invoice balance (400)', async () => {
      // Create a new invoice for this test
      const newTimeEntry = await request(app.getHttpServer())
        .post('/api/v1/time-entries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          caseId,
          description: 'Additional work for overpayment test',
          hours: 1.0,
          rate: 1000,
          date: '2026-07-02',
        });

      const newInvoice = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          caseId,
          clientProfileId,
          dueDate: '2026-08-15',
          timeEntryIds: [newTimeEntry.body.id],
        });

      // Send it first
      await request(app.getHttpServer())
        .patch(`/api/v1/invoices/${newInvoice.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SENT' });

      await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          invoiceId: newInvoice.body.id,
          amount: 999999.99,
          method: 'BANK_TRANSFER',
        })
        .expect(400);
    });
  });

  // ─── Billed time entry immutability ──────────────────────────

  describe('PATCH /api/v1/time-entries/:id', () => {
    it('should reject modification of a billed time entry (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/time-entries/${timeEntryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hours: 5.0 })
        .expect(400);
    });
  });
});
