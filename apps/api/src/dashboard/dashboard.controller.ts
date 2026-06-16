import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Dashboard metrics. Protected by the global JwtAuthGuard (no @Public).
 * Port of CI4 App\Controllers\App\Dashboard. The {status,message,data}
 * envelope is applied automatically by ResponseInterceptor.
 *
 * The JWT payload (jwt.strategy.ts) spreads payload.data onto request.user, so
 * @CurrentUser('id') and @CurrentUser('role_id') both resolve. Literal sub-paths
 * (/admin, /consultant) are declared at the same depth as the root GET — there
 * is no /:id route here, so no ordering hazard.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ResponseMessage('Dashboard')
  getOverview(
    @CurrentUser('id') userId: number,
    @CurrentUser('role_id') roleId: number | null,
  ) {
    return this.dashboard.getOverview(userId, roleId);
  }

  @Get('admin')
  @ResponseMessage('Admin dashboard')
  getAdmin(@Query() query: DashboardQueryDto) {
    const year = query.year ?? new Date().getFullYear();
    return this.dashboard.getAdminMetrics(year);
  }

  @Get('consultant')
  @ResponseMessage('Consultant dashboard')
  getConsultant(
    @CurrentUser('id') userId: number,
    @Query() query: DashboardQueryDto,
  ) {
    const year = query.year ?? new Date().getFullYear();
    return this.dashboard.getConsultantMetrics(userId, year);
  }
}
