import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AcademicsService } from './academics.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ListQueryDto } from './dto/list-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { CreateSpecialisationDto } from './dto/create-specialisation.dto';
import { UpdateSpecialisationDto } from './dto/update-specialisation.dto';
import { TeachersBySubjectsDto } from './dto/teachers-by-subjects.dto';
import { SubjectListQueryDto } from './dto/subject-list-query.dto';
import { CourseListQueryDto } from './dto/course-list-query.dto';
import { SemesterListQueryDto } from './dto/semester-list-query.dto';
import { StatesListQueryDto } from './dto/states-list-query.dto';
import { ToggleLmsDto } from './dto/toggle-lms.dto';
import { UpdateCourseStatusDto } from './dto/update-course-status.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { CreateCollegeDto } from './dto/create-college.dto';
import { UpdateCollegeDto } from './dto/update-college.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CreateVisaTypeDto } from './dto/create-visa-type.dto';
import { UpdateVisaTypeDto } from './dto/update-visa-type.dto';
import { CreateIntakeDto } from './dto/create-intake.dto';
import { UpdateIntakeDto } from './dto/update-intake.dto';
import { CreateGroupCourseDto } from './dto/create-group-course.dto';
import { UpdateGroupCourseDto } from './dto/update-group-course.dto';

/**
 * Academic catalog HTTP surface. Every route is a STAFF route, protected by the
 * global JwtAuthGuard (no @Public). The {status,message,data} envelope is added
 * automatically by ResponseInterceptor — handlers just return data.
 */

// course -> /courses
@Controller('courses')
export class CoursesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Courses')
  list(@Query() query: CourseListQueryDto) {
    return this.academics.listCourses(query);
  }

  // Literal sub-path — MUST be declared before the `:id` routes so it is not
  // swallowed by `/courses/:id`.
  @Get('knowledge-base')
  @ResponseMessage('Courses Knowledge Base')
  knowledgeBase() {
    return this.academics.coursesKnowledgeBase();
  }

  // Declared before the `:id` route so the literal segment wins routing.
  @Get(':id/subjects-with-teachers')
  @ResponseMessage('Subjects with teachers')
  subjectsWithTeachers(@Param('id', ParseIntPipe) id: number) {
    return this.academics.subjectsWithTeachers(id);
  }

  // Bulk-scheduling context: [{ subject, teachers:[], students:[] }] for a
  // course. Literal trailing segment, declared before the bare `:id` route.
  @Get(':id/schedule-context')
  @ResponseMessage('Course schedule context')
  scheduleContext(@Param('id', ParseIntPipe) id: number) {
    return this.academics.scheduleContext(id);
  }

  @Get(':id')
  @ResponseMessage('Course')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.academics.getCourse(id);
  }

  @Post()
  @ResponseMessage('Course Added Successfully!')
  create(@Body() dto: CreateCourseDto) {
    return this.academics.createCourse(dto);
  }

  // Sub-resource PATCHes — literal trailing segments, safe after `:id` GETs but
  // declared before the bare `:id` PATCH for clarity/route precedence.
  @Patch(':id/lms')
  @ResponseMessage('Course LMS Updated Successfully!')
  toggleLms(@Param('id', ParseIntPipe) id: number, @Body() dto: ToggleLmsDto) {
    return this.academics.toggleCourseLms(id, dto);
  }

  @Patch(':id/status')
  @ResponseMessage('Status changed successfully!')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseStatusDto,
  ) {
    return this.academics.updateCourseStatus(id, dto);
  }

  @Patch(':id')
  @ResponseMessage('Course Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCourseDto) {
    return this.academics.updateCourse(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Course Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteCourse(id);
  }
}

// university -> /universities
@Controller('universities')
export class UniversitiesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Universities')
  list(@Query() query: ListQueryDto) {
    return this.academics.listUniversities(query);
  }

  // Literal sub-path — declared before `:id` so it is not captured by it.
  @Get('knowledge-base')
  @ResponseMessage('Universities Knowledge Base')
  knowledgeBase() {
    return this.academics.universitiesKnowledgeBase();
  }

  @Get(':id')
  @ResponseMessage('University')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.academics.getUniversity(id);
  }

  @Post()
  @ResponseMessage('University Added Successfully!')
  create(@Body() dto: CreateUniversityDto) {
    return this.academics.createUniversity(dto);
  }

  @Patch(':id')
  @ResponseMessage('University Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUniversityDto) {
    return this.academics.updateUniversity(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('University Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteUniversity(id);
  }
}

// subjects -> /subjects
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Subjects')
  list(@Query() query: SubjectListQueryDto) {
    return this.academics.listSubjects(query);
  }

  /** Teachers assigned to each of the given subjects (via the subject's course). */
  @Post('teachers-by-subjects')
  @ResponseMessage('Teachers by subjects')
  teachersBySubjects(@Body() dto: TeachersBySubjectsDto) {
    return this.academics.teachersBySubjects(dto);
  }

  @Get(':id')
  @ResponseMessage('Subject')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.academics.getSubject(id);
  }

  @Post()
  @ResponseMessage('Subject Added Successfully!')
  create(@Body() dto: CreateSubjectDto) {
    return this.academics.createSubject(dto);
  }

  @Patch(':id')
  @ResponseMessage('Subject Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubjectDto) {
    return this.academics.updateSubject(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Subject Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteSubject(id);
  }
}

// semester -> /semesters
@Controller('semesters')
export class SemestersController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Semesters')
  list(@Query() query: SemesterListQueryDto) {
    return this.academics.listSemesters(query);
  }

  // Literal sub-path — declared before `:id` so it is not captured by it.
  @Get(':id/fee')
  @ResponseMessage('Semester Fee')
  fee(@Param('id', ParseIntPipe) id: number) {
    return this.academics.getSemesterFee(id);
  }

  @Get(':id')
  @ResponseMessage('Semester')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.academics.getSemester(id);
  }

  @Post()
  @ResponseMessage('Semester Added Successfully!')
  create(@Body() dto: CreateSemesterDto) {
    return this.academics.createSemester(dto);
  }

  @Patch(':id')
  @ResponseMessage('Semester Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSemesterDto) {
    return this.academics.updateSemester(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Semester Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteSemester(id);
  }
}

// specialisations -> /specialisations
@Controller('specialisations')
export class SpecialisationsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Specialisations')
  list(@Query() query: ListQueryDto) {
    return this.academics.listSpecialisations(query);
  }

  @Get(':id')
  @ResponseMessage('Specialisation')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.academics.getSpecialisation(id);
  }

  @Post()
  @ResponseMessage('Specialisation Added Successfully!')
  create(@Body() dto: CreateSpecialisationDto) {
    return this.academics.createSpecialisation(dto);
  }

  @Patch(':id')
  @ResponseMessage('Specialisation Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSpecialisationDto) {
    return this.academics.updateSpecialisation(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Specialisation Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteSpecialisation(id);
  }
}

// college -> /colleges (full CRUD)
@Controller('colleges')
export class CollegesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Colleges')
  list(@Query() query: ListQueryDto) {
    return this.academics.listColleges(query);
  }

  @Post()
  @ResponseMessage('College Added Successfully!')
  create(@Body() dto: CreateCollegeDto) {
    return this.academics.createCollege(dto);
  }

  @Patch(':id')
  @ResponseMessage('College Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCollegeDto) {
    return this.academics.updateCollege(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('College Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteCollege(id);
  }
}

// countries -> /countries (full CRUD; PK is country_id)
@Controller('countries')
export class CountriesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Countries')
  list(@Query() query: ListQueryDto) {
    return this.academics.listCountries(query);
  }

  @Post()
  @ResponseMessage('Country Added Successfully!')
  create(@Body() dto: CreateCountryDto) {
    return this.academics.createCountry(dto);
  }

  @Patch(':id')
  @ResponseMessage('Country Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCountryDto) {
    return this.academics.updateCountry(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Country Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteCountry(id);
  }
}

// states -> /states (read-only list with optional ?country filter)
@Controller('states')
export class StatesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('States')
  list(@Query() query: StatesListQueryDto) {
    return this.academics.listStates(query);
  }
}

// visa_type -> /visa-types (full CRUD; mirrors document_type)
@Controller('visa-types')
export class VisaTypesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Visa Types')
  list(@Query() query: ListQueryDto) {
    return this.academics.listVisaTypes(query);
  }

  @Post()
  @ResponseMessage('Visa Type Added Successfully!')
  create(@Body() dto: CreateVisaTypeDto) {
    return this.academics.createVisaType(dto);
  }

  @Patch(':id')
  @ResponseMessage('Visa Type Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVisaTypeDto) {
    return this.academics.updateVisaType(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Visa Type Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteVisaType(id);
  }
}

// intake -> /intakes (admission cycles; full CRUD)
@Controller('intakes')
export class IntakesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Intakes')
  list(@Query() query: ListQueryDto) {
    return this.academics.listIntakes(query);
  }

  @Post()
  @ResponseMessage('Intake Added Successfully!')
  create(@Body() dto: CreateIntakeDto) {
    return this.academics.createIntake(dto);
  }

  @Patch(':id')
  @ResponseMessage('Intake Updated Successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIntakeDto) {
    return this.academics.updateIntake(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Intake Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteIntake(id);
  }
}

// document_type -> /document-types (full CRUD)
@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Document Types')
  list(@Query() query: ListQueryDto) {
    return this.academics.listDocumentTypes(query);
  }

  @Post()
  @ResponseMessage('Document type Added Successfully!')
  create(@Body() dto: CreateDocumentTypeDto) {
    return this.academics.createDocumentType(dto);
  }

  @Patch(':id')
  @ResponseMessage('Document type Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.academics.updateDocumentType(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Document type Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteDocumentType(id);
  }
}

// group_courses -> /group-courses (full CRUD; course_ids JSON array)
@Controller('group-courses')
export class GroupCoursesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Group Courses')
  list(@Query() query: ListQueryDto) {
    return this.academics.listGroupCourses(query);
  }

  @Post()
  @ResponseMessage('Group Course Added Successfully!')
  create(@Body() dto: CreateGroupCourseDto) {
    return this.academics.createGroupCourse(dto);
  }

  @Patch(':id')
  @ResponseMessage('Group Course Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupCourseDto,
  ) {
    return this.academics.updateGroupCourse(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Group Course Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteGroupCourse(id);
  }
}
