import { Test, TestingModule } from '@nestjs/testing';
import { WebhookDispatcherService } from '../../webhooks/webhook-dispatcher.service';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus } from '@prisma/client';
import { CfdiService } from '../cfdi.service';
import { PrismaService } from '../../../../core/database/prisma.service';
import { AuditService } from '../../../../services/audit/audit.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockInvoice: Record<string, any> = {
  id: 'inv-1',
  invoiceNumber: 'FAC-2026-00001',
  caseId: 'case-1',
  status: InvoiceStatus.SENT,
  subtotal: 10000,
  taxRate: 0.16,
  taxAmount: 1600,
  total: 11600,
  cfdiUuid: null,
  cfdiXmlUrl: null,
  items: [
    {
      id: 'item-1',
      description: 'Consultoria legal',
      quantity: 4,
      unitPrice: 2500,
      amount: 10000,
    },
  ],
  case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Juicio Mercantil' },
  clientProfile: {
    companyName: 'Acme Corp',
    rfc: 'ACM010101AAA',
    user: { firstName: 'Carlos', lastName: 'Lopez' },
  },
};

const stampDto = {
  codigoPostalReceptor: '06600',
  formaPago: '03',
  metodoPago: 'PUE',
};

const cfdiStampResult = {
  uuid: 'cfdi-uuid-001',
  xmlUrl: 'https://cfdi.example.com/xml/cfdi-uuid-001.xml',
  pdfUrl: 'https://cfdi.example.com/pdf/cfdi-uuid-001.pdf',
  status: 'active',
};

const cfdiCancelResult = {
  uuid: 'cfdi-uuid-001',
  xmlUrl: '',
  pdfUrl: '',
  status: 'cancelled',
};

// ─── Mock models ────────────────────────────────────────────────────

function createMockModel() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('CfdiService', () => {
  let service: CfdiService;

  const mockPrismaInvoice = createMockModel();
  const mockPrismaCaseTimeline = createMockModel();

  const mockCfdiProvider = {
    stamp: jest.fn(),
    cancel: jest.fn(),
    getStatus: jest.fn(),
  };

  const mockAuditService = { log: jest.fn() };

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: string) => {
      const config: Record<string, string> = {
        EMISOR_RFC: 'XAXX010101000',
        EMISOR_NOMBRE: 'Corporate Lawyers S.C.',
      };
      return config[key] ?? defaultVal;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CfdiService,
        {
          provide: PrismaService,
          useValue: {
            get invoice() { return mockPrismaInvoice; },
            get caseTimeline() { return mockPrismaCaseTimeline; },
          },
        },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'CFDI_PROVIDER', useValue: mockCfdiProvider },
        { provide: WebhookDispatcherService, useValue: { dispatch: jest.fn() } },
      ],
    }).compile();

    service = module.get<CfdiService>(CfdiService);
  });

  // ─── stampInvoice ─────────────────────────────────────────────

  describe('stampInvoice', () => {
    function setupStampMocks(invoiceOverrides?: Partial<typeof mockInvoice>) {
      const invoice = { ...mockInvoice, ...invoiceOverrides };
      mockPrismaInvoice.findFirst.mockResolvedValue(invoice);
      mockCfdiProvider.stamp.mockResolvedValue(cfdiStampResult);
      mockPrismaInvoice.update.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});
      mockAuditService.log.mockResolvedValue(undefined);
    }

    it('should stamp successfully and update cfdiUuid / cfdiXmlUrl', async () => {
      setupStampMocks();

      const result = await service.stampInvoice('inv-1', stampDto, 'user-1');

      expect(mockCfdiProvider.stamp).toHaveBeenCalledWith(
        expect.objectContaining({
          emisor: expect.objectContaining({ rfc: 'XAXX010101000' }),
          receptor: expect.objectContaining({ rfc: 'ACM010101AAA', nombre: 'Acme Corp' }),
          subtotal: 10000,
          total: 11600,
        }),
      );
      expect(mockPrismaInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: expect.objectContaining({
          cfdiUuid: 'cfdi-uuid-001',
          cfdiXmlUrl: 'https://cfdi.example.com/xml/cfdi-uuid-001.xml',
        }),
      });
      expect(result.cfdiUuid).toBe('cfdi-uuid-001');
      expect(result.xmlUrl).toBe('https://cfdi.example.com/xml/cfdi-uuid-001.xml');
    });

    it('should reject DRAFT invoice', async () => {
      setupStampMocks({ status: InvoiceStatus.DRAFT });

      await expect(
        service.stampInvoice('inv-1', stampDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);

      expect(mockCfdiProvider.stamp).not.toHaveBeenCalled();
    });

    it('should reject already-stamped invoice', async () => {
      setupStampMocks({ cfdiUuid: 'existing-uuid' });

      await expect(
        service.stampInvoice('inv-1', stampDto, 'user-1'),
      ).rejects.toThrow();

      expect(mockCfdiProvider.stamp).not.toHaveBeenCalled();
    });

    it('should reject CANCELLED invoice', async () => {
      setupStampMocks({ status: InvoiceStatus.CANCELLED });

      await expect(
        service.stampInvoice('inv-1', stampDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);

      expect(mockCfdiProvider.stamp).not.toHaveBeenCalled();
    });

    it('should create a timeline entry after stamping', async () => {
      setupStampMocks();

      await service.stampInvoice('inv-1', stampDto, 'user-1');

      expect(mockPrismaCaseTimeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            eventType: 'CFDI_STAMPED',
            title: expect.stringContaining('cfdi-uuid-001'),
          }),
        }),
      );
    });

    it('should create an audit log entry after stamping', async () => {
      setupStampMocks();

      await service.stampInvoice('inv-1', stampDto, 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'CFDI_STAMP',
          entityType: 'Invoice',
          entityId: 'inv-1',
          newValue: expect.objectContaining({
            cfdiUuid: 'cfdi-uuid-001',
          }),
        }),
      );
    });

    it('should throw NotFoundException when invoice does not exist', async () => {
      mockPrismaInvoice.findFirst.mockResolvedValue(null);

      await expect(
        service.stampInvoice('nonexistent', stampDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should map payment method correctly (metodoPago defaults to PUE)', async () => {
      setupStampMocks();
      const dto = { ...stampDto, metodoPago: 'PPD' };

      await service.stampInvoice('inv-1', dto, 'user-1');

      expect(mockCfdiProvider.stamp).toHaveBeenCalledWith(
        expect.objectContaining({
          metodoPago: 'PPD',
          formaPago: '03',
        }),
      );
    });
  });

  // ─── cancelCfdi ───────────────────────────────────────────────

  describe('cancelCfdi', () => {
    it('should clear CFDI fields after cancellation', async () => {
      const stampedInvoice = {
        ...mockInvoice,
        cfdiUuid: 'cfdi-uuid-001',
        cfdiXmlUrl: 'https://cfdi.example.com/xml/cfdi-uuid-001.xml',
        case: { id: 'case-1', caseNumber: 'CORP-2026-00001' },
      };
      mockPrismaInvoice.findFirst.mockResolvedValue(stampedInvoice);
      mockCfdiProvider.cancel.mockResolvedValue(cfdiCancelResult);
      mockPrismaInvoice.update.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});
      mockAuditService.log.mockResolvedValue(undefined);

      const result = await service.cancelCfdi(
        'inv-1',
        { motivo: 'Error en datos del receptor' },
        'user-1',
      );

      expect(mockPrismaInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { cfdiUuid: null, cfdiXmlUrl: null },
      });
      expect(result.cancelledUuid).toBe('cfdi-uuid-001');
    });

    it('should create an audit log entry on cancellation', async () => {
      const stampedInvoice = {
        ...mockInvoice,
        cfdiUuid: 'cfdi-uuid-001',
        cfdiXmlUrl: 'https://cfdi.example.com/xml/cfdi-uuid-001.xml',
        case: { id: 'case-1', caseNumber: 'CORP-2026-00001' },
      };
      mockPrismaInvoice.findFirst.mockResolvedValue(stampedInvoice);
      mockCfdiProvider.cancel.mockResolvedValue(cfdiCancelResult);
      mockPrismaInvoice.update.mockResolvedValue({});
      mockPrismaCaseTimeline.create.mockResolvedValue({});
      mockAuditService.log.mockResolvedValue(undefined);

      await service.cancelCfdi(
        'inv-1',
        { motivo: 'Error en datos del receptor' },
        'user-1',
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'CFDI_CANCEL',
          entityType: 'Invoice',
          entityId: 'inv-1',
          oldValue: { cfdiUuid: 'cfdi-uuid-001' },
        }),
      );
    });
  });

  // ─── getStatus ────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return provider status result for stamped invoice', async () => {
      mockPrismaInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'FAC-2026-00001',
        cfdiUuid: 'cfdi-uuid-001',
        cfdiXmlUrl: 'https://cfdi.example.com/xml/cfdi-uuid-001.xml',
      });
      mockCfdiProvider.getStatus.mockResolvedValue({
        uuid: 'cfdi-uuid-001',
        xmlUrl: '',
        pdfUrl: '',
        status: 'active',
      });

      const result = await service.getStatus('inv-1');

      expect(mockCfdiProvider.getStatus).toHaveBeenCalledWith('cfdi-uuid-001');
      expect(result).toEqual(
        expect.objectContaining({
          hasCfdi: true,
          cfdiUuid: 'cfdi-uuid-001',
          status: 'active',
        }),
      );
    });

    it('should return hasCfdi:false when invoice has no cfdiUuid', async () => {
      mockPrismaInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'FAC-2026-00001',
        cfdiUuid: null,
        cfdiXmlUrl: null,
      });

      const result = await service.getStatus('inv-1');

      expect(mockCfdiProvider.getStatus).not.toHaveBeenCalled();
      expect(result.hasCfdi).toBe(false);
      expect(result.status).toBeNull();
    });
  });
});
