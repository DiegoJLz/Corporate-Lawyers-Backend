import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCaseDto } from './create-case.dto';

// clientProfileId cannot be changed after creation
export class UpdateCaseDto extends PartialType(
  OmitType(CreateCaseDto, ['clientProfileId']),
) {}
