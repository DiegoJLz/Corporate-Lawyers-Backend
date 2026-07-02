import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// M1 FIX: ConfigModule.forRoot() is called in AppModule.
// This module just re-exports ConfigModule for use within CoreModule.
@Module({
  imports: [ConfigModule],
  exports: [ConfigModule],
})
export class AppConfigModule {}
