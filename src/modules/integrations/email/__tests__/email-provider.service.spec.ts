import { Test, TestingModule } from '@nestjs/testing';
import { EmailProviderService } from '../email-provider.service';
import { TemplateService } from '../templates/template.service';
import { IEmailProvider, EmailMessage, EmailResult } from '../providers/email-provider.interface';

// ─── Fixtures ───────────────────────────────────────────────────────

const successResult: EmailResult = {
  messageId: 'msg-001',
  accepted: true,
  provider: 'ses',
};

const failResult: EmailResult = {
  messageId: '',
  accepted: false,
  provider: 'ses',
};

const basicMessage: EmailMessage = {
  to: 'client@example.com',
  subject: 'Test Email',
  html: '<p>Hello</p>',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('EmailProviderService', () => {
  let service: EmailProviderService;

  const mockProvider: jest.Mocked<IEmailProvider> = {
    send: jest.fn(),
    sendBatch: jest.fn(),
  };

  const mockTemplateService = {
    render: jest.fn(),
    hasTemplate: jest.fn(),
    getTemplateNames: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProviderService,
        { provide: 'EMAIL_PROVIDER', useValue: mockProvider },
        { provide: TemplateService, useValue: mockTemplateService },
      ],
    }).compile();

    service = module.get<EmailProviderService>(EmailProviderService);
  });

  // ─── send ──────────────────────────────────────────────────────

  describe('send', () => {
    it('should delegate to the injected provider', async () => {
      mockProvider.send.mockResolvedValue(successResult);

      await service.send(basicMessage);

      expect(mockProvider.send).toHaveBeenCalledWith(basicMessage);
      expect(mockProvider.send).toHaveBeenCalledTimes(1);
    });

    it('should return the provider result on success', async () => {
      mockProvider.send.mockResolvedValue(successResult);

      const result = await service.send(basicMessage);

      expect(result).toEqual(successResult);
      expect(result.accepted).toBe(true);
      expect(result.messageId).toBe('msg-001');
    });

    it('should return accepted:false when provider reports failure', async () => {
      mockProvider.send.mockResolvedValue(failResult);

      const result = await service.send(basicMessage);

      expect(result.accepted).toBe(false);
      expect(result.provider).toBe('ses');
    });

    it('should handle provider error gracefully via circuit breaker fallback', async () => {
      mockProvider.send.mockRejectedValue(new Error('SMTP connection refused'));

      const result = await service.send(basicMessage);
      expect(result.accepted).toBe(false);
      expect(result.provider).toBe('circuit-open');
    });

    it('should handle array of recipients in to field', async () => {
      mockProvider.send.mockResolvedValue(successResult);
      const msg: EmailMessage = {
        ...basicMessage,
        to: ['a@example.com', 'b@example.com'],
      };

      const result = await service.send(msg);

      expect(mockProvider.send).toHaveBeenCalledWith(msg);
      expect(result.accepted).toBe(true);
    });
  });

  // ─── renderAndSend ────────────────────────────────────────────

  describe('renderAndSend', () => {
    it('should render template then send the message', async () => {
      const renderedHtml = '<h1>Bienvenido, Carlos!</h1>';
      mockTemplateService.render.mockReturnValue(renderedHtml);
      mockProvider.send.mockResolvedValue(successResult);

      const result = await service.renderAndSend(
        'client@example.com',
        'welcome',
        { firstName: 'Carlos' },
        { subject: 'Bienvenido' },
      );

      expect(mockTemplateService.render).toHaveBeenCalledWith('welcome', {
        firstName: 'Carlos',
      });
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'client@example.com',
          subject: 'Bienvenido',
          html: renderedHtml,
        }),
      );
      expect(result).toEqual(successResult);
    });

    it('should throw when template is not found', async () => {
      mockTemplateService.render.mockImplementation(() => {
        throw new Error('Email template "nonexistent" not found');
      });

      await expect(
        service.renderAndSend('client@example.com', 'nonexistent', {}),
      ).rejects.toThrow('Email template "nonexistent" not found');

      expect(mockProvider.send).not.toHaveBeenCalled();
    });

    it('should use templateName as subject fallback when no subject option and no data.subject', async () => {
      mockTemplateService.render.mockReturnValue('<p>Content</p>');
      mockProvider.send.mockResolvedValue(successResult);

      await service.renderAndSend('client@example.com', 'welcome', {
        firstName: 'Maria',
      });

      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'welcome',
        }),
      );
    });

    it('should render template with data and pass from/replyTo options', async () => {
      mockTemplateService.render.mockReturnValue('<p>Invoice</p>');
      mockProvider.send.mockResolvedValue(successResult);

      await service.renderAndSend(
        ['a@test.com', 'b@test.com'],
        'invoice-sent',
        { clientName: 'Acme Corp', invoiceNumber: 'FAC-001' },
        {
          subject: 'Nueva Factura',
          from: 'billing@firm.com',
          replyTo: 'support@firm.com',
        },
      );

      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['a@test.com', 'b@test.com'],
          subject: 'Nueva Factura',
          from: 'billing@firm.com',
          replyTo: 'support@firm.com',
          html: '<p>Invoice</p>',
        }),
      );
    });
  });
});
