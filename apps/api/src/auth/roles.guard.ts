import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UserStateService } from '../common/user-state.service';

/**
 * Enforces @Roles(...ids). Like PermissionsGuard (CRITIQUE #13) it resolves the
 * acting role FRESH through UserStateService rather than trusting the 7-day JWT
 * snapshot, and refuses a deactivated/deleted account, so a role or status change
 * takes effect without re-login.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userState: UserStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<number[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    const userId = Number(user?.userId ?? user?.id);
    if (!user || !Number.isFinite(userId)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    const state = await this.userState.get(userId);
    if (this.userState.isInactive(state)) {
      throw new ForbiddenException('This account is no longer active.');
    }

    if (!required.includes(Number(state?.roleId))) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
    return true;
  }
}
