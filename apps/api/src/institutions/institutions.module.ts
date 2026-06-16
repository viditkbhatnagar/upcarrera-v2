import { Module } from '@nestjs/common';
import {
  InstitutionsController,
  UserUniversityController,
} from './institutions.controller';
import { InstitutionsService } from './institutions.service';

/**
 * Institutions module (users with role_id=5) + the GET /users/:id/university read.
 * PrismaService is provided by the @Global() PrismaModule, so no import is needed.
 */
@Module({
  controllers: [InstitutionsController, UserUniversityController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
