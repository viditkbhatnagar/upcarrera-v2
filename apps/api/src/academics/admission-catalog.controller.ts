import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { UniversityCourseService } from './university-course.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

/**
 * Add Lead catalog cascade (IN04), keyed by id not title. Every route is a READ
 * gated with crm:catalog.view (Counsellor and above; Super Admin bypasses). Only
 * universities / courses / intakes with a LIVE, OPEN offering surface here, so the
 * cascade can never offer a closed or untagged combination.
 */
@Controller('admission-catalog')
export class AdmissionCatalogController {
  constructor(private readonly catalog: UniversityCourseService) {}

  @Get('universities')
  @RequirePermission('crm:catalog.view')
  @ResponseMessage('Admission catalog universities')
  universities() {
    return this.catalog.catalogUniversities();
  }

  @Get('universities/:id/courses')
  @RequirePermission('crm:catalog.view')
  @ResponseMessage('Admission catalog courses')
  courses(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.catalogCourses(id);
  }

  @Get('universities/:id/courses/:courseId/intakes')
  @RequirePermission('crm:catalog.view')
  @ResponseMessage('Admission catalog intakes')
  intakes(
    @Param('id', ParseIntPipe) id: number,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.catalog.catalogIntakes(id, courseId);
  }
}
