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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsDto } from './dto/list-students.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Staff-only student records endpoints (protected by the global JwtAuthGuard).
 * Mirrors CI4 App/Students.
 */
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ResponseMessage('Students fetched')
  list(@Query() query: ListStudentsDto) {
    return this.students.listStudents(query);
  }

  @Get(':id')
  @ResponseMessage('Student fetched')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudent(id);
  }

  @Post()
  @ResponseMessage('Student created')
  create(@Body() dto: CreateStudentDto) {
    return this.students.createStudent(dto);
  }

  @Patch(':id')
  @ResponseMessage('Student updated')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.updateStudent(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Student deleted')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.students.deleteStudent(id);
  }

  @Get(':id/documents')
  @ResponseMessage('Student documents fetched')
  documents(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudentDocuments(id);
  }

  @Get(':id/qualifications')
  @ResponseMessage('Student qualifications fetched')
  qualifications(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudentQualifications(id);
  }
}
