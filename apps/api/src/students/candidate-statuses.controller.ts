import { Controller, Get } from '@nestjs/common';
import { StudentsService } from './students.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Candidate status options (legacy App/Controllers/Api/Candidate). Protected by
 * the global JwtAuthGuard. The underlying `candidate_status` table is ABSENT from
 * the current Prisma schema, so the service returns a documented empty list.
 */
@Controller('candidate-statuses')
export class CandidateStatusesController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ResponseMessage('Candidate statuses fetched')
  list() {
    return this.students.getCandidateStatuses();
  }
}
