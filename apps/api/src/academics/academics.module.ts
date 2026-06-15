import { Module } from '@nestjs/common';
import { AcademicsService } from './academics.service';
import {
  CoursesController,
  UniversitiesController,
  SubjectsController,
  SemestersController,
  SpecialisationsController,
  CollegesController,
  CountriesController,
  StatesController,
  VisaTypesController,
  DocumentTypesController,
} from './academics.controller';

/**
 * Academic catalog module: courses, universities, subjects, semesters,
 * specialisations, plus read-only lookups (colleges, countries, states,
 * visa types, document types).
 */
@Module({
  controllers: [
    CoursesController,
    UniversitiesController,
    SubjectsController,
    SemestersController,
    SpecialisationsController,
    CollegesController,
    CountriesController,
    StatesController,
    VisaTypesController,
    DocumentTypesController,
  ],
  providers: [AcademicsService],
})
export class AcademicsModule {}
