import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/security/decorators/roles.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller({ version: '1', path: 'settings' })
export class SettingsController {
  constructor(private readonly configService: ConfigService) {}

  @Get('firm')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get firm settings from environment configuration' })
  getFirmSettings() {
    return {
      name: this.configService.get<string>('FIRM_NAME', 'Corporate Lawyers S.C.'),
      rfc: this.configService.get<string>('FIRM_RFC', ''),
      address: this.configService.get<string>('FIRM_ADDRESS', ''),
      phone: this.configService.get<string>('FIRM_PHONE', ''),
      email: this.configService.get<string>('FIRM_EMAIL', ''),
    };
  }
}
