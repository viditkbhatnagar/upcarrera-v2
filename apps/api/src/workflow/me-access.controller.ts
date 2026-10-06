import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RecordAccessService, AccessUser } from './record-access.service';

/**
 * GET /auth/me/access — the caller's record-access summary, so the web sidebar can
 * hide items it cannot use. Cosmetic only: the server still enforces access on
 * every route. Protected by the global JwtAuthGuard (any authenticated user).
 */
@Controller('auth')
export class MeAccessController {
  constructor(private readonly access: RecordAccessService) {}

  @Get('me/access')
  @ResponseMessage('Access profile')
  async myAccess(@CurrentUser() user: AccessUser) {
    const scope = await this.access.scopeFor(user);
    return {
      role_key: scope.roleKey,
      scope: scope.scope,
      owner_ids_count: scope.scope === 'owners' ? scope.ids.length : null,
      stages: scope.scope === 'stages' ? scope.stages : null,
    };
  }
}
