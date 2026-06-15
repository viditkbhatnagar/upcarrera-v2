import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

/**
 * Student mobile-API parity module (/api/student/*).
 * PrismaService is provided by the @Global() PrismaModule, so no import is needed.
 *
 * NOTE: register StudentModule in app.module.ts imports[] (done during integration).
 */
@Module({
  controllers: [StudentController],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}
