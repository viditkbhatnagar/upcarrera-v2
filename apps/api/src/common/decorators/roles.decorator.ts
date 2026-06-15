import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given role ids.
 * Role ids mirror the legacy login_helper.php integers
 * (1=admin, 2=telecaller, 3=teacher, 4=student, 5=accountant, 6=consultant, 7=sub-admin, 8=client).
 */
export const Roles = (...roles: number[]) => SetMetadata(ROLES_KEY, roles);
