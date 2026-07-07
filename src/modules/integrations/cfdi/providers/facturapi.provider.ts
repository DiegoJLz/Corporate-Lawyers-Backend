import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ICfdiProvider, CfdiInvoiceData, CfdiResult } from './cfdi-provider.interface';

/**
 * Mock Facturapi provider.
 *
 * TODO: Replace with real Facturapi integration:
 *   - Install: npm install facturapi
 *   - import Facturapi from 'facturapi';
 *   - const facturapi = new Facturapi(apiKey);
 *   - stamp: facturapi.invoices.create({ ... })
 *   - cancel: facturapi.invoices.cancel(uuid, { motive: '...' })
 *   - getStatus: facturapi.invoices.retrieve(uuid)
 *
 * The mock generates fake UUIDs and returns simulated results
 * to allow development and testing without a Facturapi account.
 */
@Injectable()
export class FacturapiProvider implements ICfdiProvider {
  private readonly logger = new Logger(FacturapiProvider.name);
  private readonly apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('FACTURAPI_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('FACTURAPI_API_KEY not configured -- using mock implementation');
    }
  }

  async stamp(data: CfdiInvoiceData): Promise<CfdiResult> {
    this.logger.log(`[Mock] Stamping CFDI for ${data.receptor.rfc} | Serie: ${data.serie} Folio: ${data.folio} | Total: ${data.total}`);

    // TODO: Real implementation would call Facturapi API
    // const invoice = await this.facturapi.invoices.create({
    //   customer: { legal_name: data.receptor.nombre, tax_id: data.receptor.rfc, ... },
    //   items: data.conceptos.map(c => ({ product: { ... }, quantity: c.cantidad, ... })),
    //   payment_form: data.formaPago,
    //   payment_method: data.metodoPago,
    //   series: data.serie,
    //   folio_number: parseInt(data.folio),
    // });

    const uuid = randomUUID();

    return {
      uuid,
      xmlUrl: `https://mock.facturapi.io/v2/invoices/${uuid}/xml`,
      pdfUrl: `https://mock.facturapi.io/v2/invoices/${uuid}/pdf`,
      status: 'valid',
    };
  }

  async cancel(uuid: string, motivo: string): Promise<CfdiResult> {
    this.logger.log(`[Mock] Cancelling CFDI ${uuid} | Motivo: ${motivo}`);

    // TODO: Real implementation:
    // await this.facturapi.invoices.cancel(uuid, { motive: motivo });

    return {
      uuid,
      xmlUrl: '',
      pdfUrl: '',
      status: 'cancelled',
    };
  }

  async getStatus(uuid: string): Promise<CfdiResult> {
    this.logger.log(`[Mock] Getting CFDI status for ${uuid}`);

    // TODO: Real implementation:
    // const invoice = await this.facturapi.invoices.retrieve(uuid);
    // return { uuid: invoice.uuid, ... };

    return {
      uuid,
      xmlUrl: `https://mock.facturapi.io/v2/invoices/${uuid}/xml`,
      pdfUrl: `https://mock.facturapi.io/v2/invoices/${uuid}/pdf`,
      status: 'valid',
    };
  }
}
