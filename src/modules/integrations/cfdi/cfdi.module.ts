import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CfdiService } from './cfdi.service';
import { CfdiController } from './cfdi.controller';
import { FacturapiProvider } from './providers/facturapi.provider';
import { AuditModule } from '../../../services/audit/audit.module';

@Module({
  imports: [ConfigModule, AuditModule],
  controllers: [CfdiController],
  providers: [
    {
      provide: 'CFDI_PROVIDER',
      useFactory: (configService: ConfigService) => {
        // Currently only Facturapi is supported.
        // To add more providers, check an env var like CFDI_PROVIDER
        // and instantiate the appropriate class.
        return new FacturapiProvider(configService);
      },
      inject: [ConfigService],
    },
    CfdiService,
  ],
  exports: [CfdiService],
})
export class CfdiModule {}
