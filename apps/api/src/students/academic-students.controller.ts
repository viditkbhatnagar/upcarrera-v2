import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { ListAcademicStudentsDto } from './dto/list-academic-students.dto';
import { UpdateAcademicStudentDto } from './dto/update-academic-student.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Staff-only academic view of students (protected by the global JwtAuthGuard).
 * Mirrors CI4 App/Academic. The :id here is the student's USER id
 * (students.student_id = users.id), matching the legacy app/academic routes.
 */
@Controller('academic/students')
export class AcademicStudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ResponseMessage('Academic students fetched')
  list(@Query() query: ListAcademicStudentsDto) {
    return this.students.listAcademicStudents(query);
  }

  @Get(':id')
  @ResponseMessage('Academic student fetched')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.students.getAcademicStudent(id);
  }

  @Patch(':id')
  @ResponseMessage('Student Academic Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAcademicStudentDto,
  ) {
    return this.students.updateAcademicStudent(id, dto);
  }
}
