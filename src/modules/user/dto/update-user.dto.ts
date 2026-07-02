import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateUserDto, CreateLawyerProfileDto, CreateClientProfileDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password', 'email', 'role'])) {}

export class UpdateLawyerProfileDto extends PartialType(CreateLawyerProfileDto) {}

export class UpdateClientProfileDto extends PartialType(CreateClientProfileDto) {}
