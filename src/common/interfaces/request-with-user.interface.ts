import { Request } from 'express';
import { UserRole } from '@prisma/client';

export interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}
