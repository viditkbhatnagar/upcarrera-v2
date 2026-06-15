import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

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

  // ----- Users -----

  @Get('users')
  @ResponseMessage('Users fetched')
  findUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role_id') roleId?: string,
  ) {
    return this.platform.findUsers(toNumber(page), toNumber(limit), toNumber(roleId));
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

  // ----- Roles -----

  @Get('roles')
  @RequirePermission('roles/index')
  @ResponseMessage('Roles fetched')
  findRoles() {
    return this.platform.findRoles();
  }

  // ----- Permissions -----

  @Get('permissions')
  @RequirePermission('permissions/index')
  @ResponseMessage('Permissions fetched')
  findPermissions() {
    return this.platform.findPermissions();
  }

  // ----- Role-permissions -----

  @Get('role-permissions')
  @RequirePermission('roles-permissions/index')
  @ResponseMessage('Role permissions fetched')
  findRolePermissions(@Query('role_id') roleId?: string) {
    return this.platform.findRolePermissions(toNumber(roleId));
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
