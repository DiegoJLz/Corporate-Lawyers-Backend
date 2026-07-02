import { Module } from '@nestjs/common';
import { EventController, CalendarController } from './event.controller';
import { EventService } from './event.service';

@Module({
  controllers: [EventController, CalendarController],
  providers: [EventService],
  exports: [EventService],
})
export class CalendarModule {}
