import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { ApplicationsController } from './applications.controller';
import { StudentsService } from './students.service';

/**
 * Students + Applications module.
 * PrismaService is provided by the @Global() PrismaModule, so no import is needed.
 */
@Module({
  controllers: [StudentsController, ApplicationsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
