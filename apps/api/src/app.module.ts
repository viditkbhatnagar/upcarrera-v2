import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { LeadsModule } from './leads/leads.module';
import { StudentsModule } from './students/students.module';
import { AcademicsModule } from './academics/academics.module';
import { TeachersModule } from './teachers/teachers.module';
import { FinanceModule } from './finance/finance.module';
import { SessionsModule } from './sessions/sessions.module';
import { PlatformModule } from './platform/platform.module';
import { FilesModule } from './files/files.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StudentModule } from './student/student.module';
import { ConsultantsModule } from './consultants/consultants.module';
import { SalesModule } from './sales/sales.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { ZoomModule } from './zoom/zoom.module';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    LeadsModule,
    StudentsModule,
    AcademicsModule,
    TeachersModule,
    FinanceModule,
    SessionsModule,
    PlatformModule,
    FilesModule,
    IntegrationsModule,
    ReportsModule,
    NotificationsModule,
    StudentModule,
    ConsultantsModule,
    SalesModule,
    AssessmentsModule,
    InstitutionsModule,
    ZoomModule,
  ],
  providers: [
    // Global JWT guard — every route is protected unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global role guard — enforces @Roles() at the controller layer
    // (CI4 only gated permissions in views; we move it server-side).
    { provide: APP_GUARD, useClass: RolesGuard },
    // Global permission guard — enforces @RequirePermission() slugs.
    // Registered LAST so it runs after JwtAuthGuard populates request.user
    // (reads roleId) and after RolesGuard. Ports permission_helper.php.
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
