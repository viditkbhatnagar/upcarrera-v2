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
  list(@Query() query: ListQueryDto) {
    return this.academics.listCourses(query);
  }

  // Declared before the `:id` route so the literal segment wins routing.
  @Get(':id/subjects-with-teachers')
  @ResponseMessage('Subjects with teachers')
  subjectsWithTeachers(@Param('id', ParseIntPipe) id: number) {
    return this.academics.subjectsWithTeachers(id);
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
  list(@Query() query: ListQueryDto) {
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
  list(@Query() query: ListQueryDto) {
    return this.academics.listSemesters(query);
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

// college -> /colleges (read-only list)
@Controller('colleges')
export class CollegesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Colleges')
  list(@Query() query: ListQueryDto) {
    return this.academics.listColleges(query);
  }
}

// countries -> /countries (read-only list)
@Controller('countries')
export class CountriesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Countries')
  list(@Query() query: ListQueryDto) {
    return this.academics.listCountries(query);
  }
}

// states -> /states (read-only list)
@Controller('states')
export class StatesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('States')
  list(@Query() query: ListQueryDto) {
    return this.academics.listStates(query);
  }
}

// visa_type -> /visa-types (read-only list; see phase-3 stub in service)
@Controller('visa-types')
export class VisaTypesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Visa Types')
  list(@Query() query: ListQueryDto) {
    return this.academics.listVisaTypes(query);
  }
}

// document_type -> /document-types (read-only list)
@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @ResponseMessage('Document Types')
  list(@Query() query: ListQueryDto) {
    return this.academics.listDocumentTypes(query);
  }
}
