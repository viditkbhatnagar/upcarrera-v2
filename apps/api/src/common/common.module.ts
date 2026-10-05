import { Global, Module } from '@nestjs/common';
import { UserStateService } from './user-state.service';

/**
 * Global cross-cutting providers. UserStateService is shared by the global guards
 * (which live in the root injector) and by any feature that needs the live
 * account state, so it is exported from a @Global module.
 */
@Global()
@Module({
  providers: [UserStateService],
  exports: [UserStateService],
})
export class CommonModule {}
