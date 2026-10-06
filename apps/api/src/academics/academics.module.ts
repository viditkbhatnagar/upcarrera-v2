import { Module } from '@nestjs/common';
import { AcademicsService } from './academics.service';
import { IntakeMasterService } from './intake-master.service';
import { UniversityCourseService } from './university-course.service';
import { AdmissionCatalogController } from './admission-catalog.controller';
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
    AdmissionCatalogController,
  ],
  providers: [AcademicsService, IntakeMasterService, UniversityCourseService],
  exports: [UniversityCourseService],
})
export class AcademicsModule {}
