import { IsString, IsEnum, IsUUID, IsOptional, IsDateString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CasePriority } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ example: 'Preparar contestación de demanda' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'User UUID to assign the task to' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Must be a future date' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: CasePriority, default: 'MEDIUM' })
  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
