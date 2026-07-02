import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import authConfig from '../../config/auth.config';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    @Inject(authConfig.KEY)
    authCfg: ConfigType<typeof authConfig>,
  ) {
    // A1 FIX: Fail fast if secret is missing
    const secret = authCfg.jwtRefreshSecret;
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    } as any);
  }

  validate(req: Request, payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const authHeader = req.get('Authorization');
    const refreshToken = authHeader?.replace('Bearer ', '').trim();

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
    };
  }
}
