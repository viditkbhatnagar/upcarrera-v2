import { Controller, Get, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AvailableDatesDto } from './dto/available-dates.dto';
import { AvailableTimesDto } from './dto/available-times.dto';

/**
 * Read-only bulk-scheduling lookups over teachers_schedules. Ports
 * Sessions::get_teacher_schedule_dates() / get_teacher_schedule_times().
 *
 * Shares the /teacher-schedules prefix with the teachers module's
 * TeacherSchedulesController, but only on distinct literal sub-paths
 * (`available-dates` / `available-times`) so there is no route collision with
 * that module's bare GET / POST.
 */
@Controller('teacher-schedules')
export class TeacherSchedulesLookupController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('available-dates')
  @ResponseMessage('Teacher available dates fetched successfully!')
  availableDates(@Query() query: AvailableDatesDto) {
    return this.sessions.getTeacherAvailableDates(query.teacher_id);
  }

  @Get('available-times')
  @ResponseMessage('Teacher available times fetched successfully!')
  availableTimes(@Query() query: AvailableTimesDto) {
    return this.sessions.getTeacherAvailableTimes(query.teacher_id, query.date);
  }
}
