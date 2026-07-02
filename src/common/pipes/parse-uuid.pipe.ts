import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!uuidValidate(value) || uuidVersion(value) !== 4) {
      const paramName = metadata.data || 'id';
      throw new BadRequestException(
        `Invalid UUID format for parameter: ${paramName}`,
      );
    }
    return value;
  }
}
