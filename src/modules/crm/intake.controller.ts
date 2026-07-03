import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IntakeService } from './intake.service';
import { SubmitIntakeDto } from './dto/submit-intake.dto';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('CRM - Intake')
@ApiBearerAuth()
@Controller({ version: '1', path: 'leads' })
export class IntakeController {
  constructor(private readonly intakeService: IntakeService) {}

  @Get(':leadId/intake')
  @ApiOperation({ summary: 'Get intake form for lead' })
  async findOne(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.intakeService.findOne(leadId);
  }

  @Post(':leadId/intake')
  @ApiOperation({ summary: 'Submit intake form for lead' })
  async submit(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SubmitIntakeDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.intakeService.submit(leadId, dto, userId);
  }

  @Patch(':leadId/intake')
  @ApiOperation({ summary: 'Update intake form responses' })
  async update(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SubmitIntakeDto,
  ) {
    return this.intakeService.update(leadId, dto);
  }
}
