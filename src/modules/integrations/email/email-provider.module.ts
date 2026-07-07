import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailProviderService } from './email-provider.service';
import { TemplateService } from './templates/template.service';
import { SendGridProvider } from './providers/sendgrid.provider';
import { SmtpProvider } from './providers/smtp.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'EMAIL_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('EMAIL_PROVIDER', 'smtp');

        if (provider === 'sendgrid') {
          return new SendGridProvider(configService);
        }

        return new SmtpProvider(configService);
      },
      inject: [ConfigService],
    },
    EmailProviderService,
    TemplateService,
  ],
  exports: [EmailProviderService, TemplateService],
})
export class EmailProviderModule {}
