import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordAccessService } from './record-access.service';

/**
 * Row-level access guard for /applications/:id routes. Runs after the global
 * JwtAuthGuard + PermissionsGuard, so request.user and the slug are already
 * checked. It 404s a missing/soft-deleted application and 403s 'Access denied'
 * one the user cannot see, then stashes the loaded row on req.application so the
 * handler does not re-fetch it.
 */
@Injectable()
export class ApplicationAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RecordAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new NotFoundException('Application not found!');
    }

    const application = await this.prisma.applications.findFirst({
      where: { application_id: id, deleted_at: null },
    });
    if (!application) {
      throw new NotFoundException('Application not found!');
    }

    const scope = await this.access.scopeFor(req.user);
    if (!this.access.canSee(scope, application)) {
      throw new ForbiddenException('Access denied');
    }

    req.application = application;
    return true;
  }
}
