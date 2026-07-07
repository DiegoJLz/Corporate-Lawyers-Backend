import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../../core/database/prisma.module';
import { AuditModule } from '../../../services/audit/audit.module';
import { StorageModule } from '../../../services/storage/storage.module';
import { SignatureService } from './signature.service';
import { SignatureController, DocumentSignatureController } from './signature.controller';
import { SignatureWebhookController } from './webhook/signature-webhook.controller';
import { DocuSignProvider } from './providers/docusign.provider';

@Module({
  imports: [PrismaModule, AuditModule, StorageModule, ConfigModule],
  controllers: [SignatureController, DocumentSignatureController, SignatureWebhookController],
  providers: [
    SignatureService,
    {
      provide: 'SIGNATURE_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>(
          'SIGNATURE_PROVIDER',
          'docusign',
        );

        // TODO: Add additional provider implementations as needed
        // For now, DocuSign (mock) is the only supported provider
        if (provider === 'docusign' || provider === 'none') {
          return new DocuSignProvider(configService);
        }

        return new DocuSignProvider(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [SignatureService],
})
export class SignatureModule {}
