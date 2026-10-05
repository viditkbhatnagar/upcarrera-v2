import { Module } from '@nestjs/common';
import { AcademicsService } from './academics.service';
import { IntakeMasterService } from './intake-master.service';
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
  IntakesController,
  DocumentTypesController,
  GroupCoursesController,
} from './academics.controller';

/**
 * Academic catalog module: courses, universities, subjects, semesters,
 * specialisations, group courses, plus lookups (colleges, countries, states,
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
    IntakesController,
    DocumentTypesController,
    GroupCoursesController,
  ],
  providers: [AcademicsService, IntakeMasterService],
})
export class AcademicsModule {}
