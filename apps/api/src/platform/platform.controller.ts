import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ResetPasswordDto, ChangePasswordDto } from './dto/password.dto';
import {
  ListRolePermissionsDto,
  AssignRolePermissionsDto,
} from './dto/role-permission.dto';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { SwitchRoleDto } from './dto/switch-role.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

/** Parse a numeric query param, returning undefined for missing/blank/NaN. */
function toNumber(value?: string): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Staff platform administration. All routes stay behind the global JwtAuthGuard
 * (no @Public). Ports App/Admin, User_role, Permissions, Roles_permission,
 * Notifications + settings_helper.
 */
@Controller()
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  // ----- App (public version gate) -----

  // Public mobile launch check (App::app_version). Only public route in this
  // controller; opts out of the global JwtAuthGuard via @Public().
  @Get('app/version')
  @Public()
  @ResponseMessage('success')
  getAppVersion() {
    return this.platform.getAppVersion();
  }

  // ----- Users -----

  @Get('users')
  @ResponseMessage('Users fetched')
  findUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role_id') roleId?: string,
    @Query('exclude_role_id') excludeRoleId?: string,
  ) {
    return this.platform.findUsers(
      toNumber(page),
      toNumber(limit),
      toNumber(roleId),
      toNumber(excludeRoleId),
    );
  }

  // ----- Self-service (own row) -----
  // Literal `users/me` routes are declared BEFORE the `users/:id` routes so
  // `me` is never parsed as a user id. The acting user always comes from the JWT.

  @Patch('users/me')
  @ResponseMessage('Success')
  updateMe(@CurrentUser('id') userId: number, @Body() dto: UpdateMeDto) {
    return this.platform.updateMe(userId, dto);
  }

  @Post('users/me/switch-role')
  @ResponseMessage('Success')
  switchRole(@CurrentUser('id') userId: number, @Body() dto: SwitchRoleDto) {
    return this.platform.switchRole(userId, dto);
  }

  @Get('users/:id')
  @ResponseMessage('User fetched')
  findUser(@Param('id', ParseIntPipe) id: number) {
    return this.platform.findUser(id);
  }

  @Post('users')
  @RequirePermission('consultants/create')
  @ResponseMessage('User created')
  createUser(@Body() dto: CreateUserDto) {
    return this.platform.createUser(dto);
  }

  @Patch('users/:id')
  @RequirePermission('consultants/edit')
  @ResponseMessage('User updated')
  updateUser(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.platform.updateUser(id, dto);
  }

  @Delete('users/:id')
  @RequirePermission('consultants/delete')
  @ResponseMessage('User deleted')
  removeUser(@Param('id', ParseIntPipe) id: number) {
    return this.platform.removeUser(id);
  }

  // Admin override: set username + new bcrypt password (App/Admin::reset_password).
  @Post('users/:id/reset-password')
  @RequirePermission('consultants/edit')
  @ResponseMessage('Password reset')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.platform.resetPassword(id, dto);
  }

  // Self-service: change OWN password (current-password verified). The :id must
  // match the authenticated user — we ignore the param and use the JWT id so a
  // caller can only ever change their own credentials.
  @Post('users/:id/change-password')
  @ResponseMessage('Password changed')
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.platform.changePassword(userId, dto);
  }

  // ----- Roles -----

  @Get('roles')
  @RequirePermission('roles/index')
  @ResponseMessage('Roles fetched')
  findRoles() {
    return this.platform.findRoles();
  }

  @Post('roles')
  @RequirePermission('roles/create')
  @ResponseMessage('Role created')
  createRole(@Body() dto: CreateRoleDto) {
    return this.platform.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermission('roles/edit')
  @ResponseMessage('Role updated')
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.platform.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission('roles/delete')
  @ResponseMessage('Role deleted')
  removeRole(@Param('id', ParseIntPipe) id: number) {
    return this.platform.removeRole(id);
  }

  // ----- Permissions -----

  @Get('permissions')
  @RequirePermission('permissions/index')
  @ResponseMessage('Permissions fetched')
  findPermissions() {
    return this.platform.findPermissions();
  }

  @Post('permissions')
  @RequirePermission('permissions/create')
  @ResponseMessage('Permission created')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.platform.createPermission(dto);
  }

  @Patch('permissions/:id')
  @RequirePermission('permissions/edit')
  @ResponseMessage('Permission updated')
  updatePermission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.platform.updatePermission(id, dto);
  }

  @Delete('permissions/:id')
  @RequirePermission('permissions/delete')
  @ResponseMessage('Permission deleted')
  removePermission(@Param('id', ParseIntPipe) id: number) {
    return this.platform.removePermission(id);
  }

  // ----- Role-permissions -----
  // Literal sub-path (`unassigned`) is declared before the body-only PUT so it
  // resolves cleanly; there is no role-permissions/:id route to shadow.

  @Get('role-permissions')
  @RequirePermission('roles-permissions/index')
  @ResponseMessage('Role permissions fetched')
  findRolePermissions(@Query() query: ListRolePermissionsDto) {
    return this.platform.findRolePermissions(query.role_id);
  }

  @Get('role-permissions/unassigned')
  @RequirePermission('roles-permissions/index')
  @ResponseMessage('Unassigned permissions fetched')
  findUnassignedPermissions(@Query() query: ListRolePermissionsDto) {
    return this.platform.findUnassignedPermissions(query.role_id ?? 0);
  }

  @Put('role-permissions')
  @RequirePermission('roles-permissions/create')
  @ResponseMessage('Role permissions updated')
  replaceRolePermissions(@Body() dto: AssignRolePermissionsDto) {
    return this.platform.replaceRolePermissions(dto);
  }

  // ----- Settings -----

  @Get('settings')
  @ResponseMessage('Settings fetched')
  getSettings() {
    return this.platform.getSettings();
  }

  @Patch('settings')
  @ResponseMessage('Settings updated')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.platform.updateSettings(dto.settings);
  }

  // ----- Notifications -----

  @Get('notifications')
  @ResponseMessage('Notifications fetched')
  findNotifications(@Query('user_id') userId?: string) {
    return this.platform.findNotifications(toNumber(userId));
  }
}
