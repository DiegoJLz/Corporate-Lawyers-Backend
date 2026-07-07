import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PdfService } from '../pdf.service';
import { InvoicePdfGenerator } from '../generators/invoice-pdf.generator';
import { PrismaService } from '../../../../core/database/prisma.service';
import { TemplateService } from '../../email/templates/template.service';
import { StorageService } from '../../../../services/storage/storage.service';

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');

const mockInvoice = {
  id: 'inv-1',
  invoiceNumber: 'FAC-2026-00001',
  caseId: 'case-1',
  subtotal: 10000,
  taxRate: 0.16,
  taxAmount: 1600,
  total: 11600,
  notes: 'Pago a 30 dias',
  createdAt: NOW,
  dueDate: new Date('2026-08-01'),
  items: [
    {
      id: 'item-1',
      description: 'Consultoria legal',
      quantity: 4,
      unitPrice: 2500,
      amount: 10000,
    },
  ],
  payments: [],
  case: { id: 'case-1', caseNumber: 'CORP-2026-00001', title: 'Juicio Mercantil' },
  clientProfile: {
    companyName: 'Acme Corp',
    rfc: 'ACM010101AAA',
    fiscalAddress: 'Av. Reforma 123, CDMX',
    user: { firstName: 'Carlos', lastName: 'Lopez', email: 'carlos@acme.com' },
  },
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

describe('PdfService', () => {
  let pdfService: PdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfService],
    }).compile();

    pdfService = module.get<PdfService>(PdfService);
  });

  describe('generateFromHtml', () => {
    it('should return a Buffer from HTML string', async () => {
      const html = '<h1>Hello PDF</h1>';

      const result = await pdfService.generateFromHtml(html);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString('utf-8')).toBe(html);
    });

    it('should return a buffer with correct byte length', async () => {
      const html = '<p>Factura con acentos: total $11,600.00</p>';

      const result = await pdfService.generateFromHtml(html);

      expect(result.length).toBeGreaterThan(0);
      expect(result.toString('utf-8')).toContain('$11,600.00');
    });
  });
});

describe('InvoicePdfGenerator', () => {
  let generator: InvoicePdfGenerator;

  const mockPrismaInvoice = createMockModel();

  const mockPdfService = { generateFromHtml: jest.fn() };
  const mockTemplateService = { render: jest.fn() };
  const mockStorageService = { upload: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicePdfGenerator,
        {
          provide: PrismaService,
          useValue: {
            get invoice() { return mockPrismaInvoice; },
          },
        },
        { provide: PdfService, useValue: mockPdfService },
        { provide: TemplateService, useValue: mockTemplateService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    generator = module.get<InvoicePdfGenerator>(InvoicePdfGenerator);
  });

  describe('generate', () => {
    function setupGenerateMocks() {
      mockPrismaInvoice.findFirst.mockResolvedValue(mockInvoice);
      mockTemplateService.render.mockReturnValue('<html>PDF Content</html>');
      mockPdfService.generateFromHtml.mockResolvedValue(Buffer.from('<html>PDF Content</html>'));
      mockStorageService.upload.mockResolvedValue(undefined);
      mockPrismaInvoice.update.mockResolvedValue({});
    }

    it('should load invoice data with items, payments, case, and clientProfile', async () => {
      setupGenerateMocks();

      await generator.generate('inv-1');

      expect(mockPrismaInvoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          include: expect.objectContaining({
            items: true,
            payments: expect.any(Object),
            case: expect.any(Object),
            clientProfile: expect.any(Object),
          }),
        }),
      );
    });

    it('should generate HTML via template service with invoice-pdf template', async () => {
      setupGenerateMocks();

      await generator.generate('inv-1');

      expect(mockTemplateService.render).toHaveBeenCalledWith(
        'invoice-pdf',
        expect.objectContaining({
          invoiceNumber: 'FAC-2026-00001',
          clientName: 'Acme Corp',
          clientRfc: 'ACM010101AAA',
          caseNumber: 'CORP-2026-00001',
          caseTitle: 'Juicio Mercantil',
          items: expect.arrayContaining([
            expect.objectContaining({ description: 'Consultoria legal' }),
          ]),
        }),
      );
    });

    it('should upload the generated PDF to storage', async () => {
      setupGenerateMocks();

      await generator.generate('inv-1');

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          mimetype: 'application/pdf',
          originalname: 'FAC-2026-00001.pdf',
          buffer: expect.any(Buffer),
        }),
        'invoices/inv-1/FAC-2026-00001.pdf',
      );
    });

    it('should update invoice.pdfUrl after upload', async () => {
      setupGenerateMocks();

      await generator.generate('inv-1');

      expect(mockPrismaInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { pdfUrl: 'invoices/inv-1/FAC-2026-00001.pdf' },
      });
    });

    it('should return pdfUrl and buffer', async () => {
      setupGenerateMocks();

      const result = await generator.generate('inv-1');

      expect(result.pdfUrl).toBeDefined();
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should throw NotFoundException for missing invoice', async () => {
      mockPrismaInvoice.findFirst.mockResolvedValue(null);

      await expect(generator.generate('nonexistent')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockTemplateService.render).not.toHaveBeenCalled();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });
  });
});
