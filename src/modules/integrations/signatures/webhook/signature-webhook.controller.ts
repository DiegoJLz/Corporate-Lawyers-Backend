import {
  Controller,
  Post,
  Body,
  Headers,
  ForbiddenException,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { Request } from 'express';
import { Public } from '../../../../core/security/decorators/public.decorator';
import { SignatureService } from '../signature.service';

@ApiTags('Webhooks')
@Controller({ version: '1', path: 'webhooks/signatures' })
export class SignatureWebhookController {
  private readonly logger = new Logger(SignatureWebhookController.name);

  constructor(
    private readonly signatureService: SignatureService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Handle signature provider webhook' })
  async handleWebhook(
    @Body() payload: Record<string, any>,
    @Headers('x-signature') signature: string,
    @Headers('x-timestamp') timestamp: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const secret = this.configService.get<string>(
      'SIGNATURE_WEBHOOK_SECRET',
      'dev-webhook-secret',
    );

    // Verify HMAC signature with timestamp
    const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    if (!signature || signature !== expectedSignature) {
      this.logger.warn('Invalid webhook signature received');
      throw new ForbiddenException('Invalid webhook signature');
    }

    this.logger.log('Valid webhook signature verified, processing payload');

    await this.signatureService.handleWebhook(payload);

    return { received: true };
  }
}
