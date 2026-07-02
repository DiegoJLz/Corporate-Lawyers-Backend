import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './app.config';
import authConfig from './auth.config';
import storageConfig from './storage.config';
import mailConfig from './mail.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, authConfig, storageConfig, mailConfig],
    }),
  ],
})
export class AppConfigModule {}
