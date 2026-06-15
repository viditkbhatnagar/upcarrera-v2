import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/**
 * Requires the acting user's role to hold the given permission slug
 * (a row in `permissions.slug`, granted via `role_permissions`).
 *
 * Enforced by {@link PermissionsGuard}. Slugs mirror the legacy
 * permission_helper.php values (e.g. 'consultants/create', 'roles/index',
 * 'roles-permissions/delete'). Super Admin (role_id === 1) bypasses all
 * checks — this replaces the legacy inverted admin deny-list with a clean
 * allow-list plus a super-admin override.
 */
export const RequirePermission = (slug: string) => SetMetadata(PERMISSION_KEY, slug);
