import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UserService } from './user.service';
import { CreateUserDto, CreateLawyerProfileDto, CreateClientProfileDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateLawyerProfileDto, UpdateClientProfileDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ version: '1', path: 'users' })
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'List all users with filters' })
  async findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser('userId') userId: string) {
    return this.userService.findOne(userId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOne(id);
  }

  // A3 FIX: Users can only update themselves. Admins can update anyone.
  @Patch(':id')
  @ApiOperation({ summary: 'Update user (own profile or admin)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('role') currentUserRole: string,
  ) {
    this.assertSelfOrAdmin(id, currentUserId, currentUserRole);
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete user (soft delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') performedBy: string,
  ) {
    return this.userService.remove(id, performedBy);
  }

  // ─── Profiles ──────────────────────────────────────────────

  @Post(':id/lawyer-profile')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create lawyer profile for a user' })
  async createLawyerProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLawyerProfileDto,
  ) {
    return this.userService.createLawyerProfile(id, dto);
  }

  // A3 FIX: Lawyer can update own profile, admins can update any
  @Patch(':id/lawyer-profile')
  @ApiOperation({ summary: 'Update lawyer profile' })
  async updateLawyerProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLawyerProfileDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('role') currentUserRole: string,
  ) {
    this.assertSelfOrAdmin(id, currentUserId, currentUserRole);
    return this.userService.updateLawyerProfile(id, dto);
  }

  @Post(':id/client-profile')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create client profile for a user' })
  async createClientProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientProfileDto,
  ) {
    return this.userService.createClientProfile(id, dto);
  }

  // A3 FIX: Client can update own profile, admins can update any
  @Patch(':id/client-profile')
  @ApiOperation({ summary: 'Update client profile' })
  async updateClientProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientProfileDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('role') currentUserRole: string,
  ) {
    this.assertSelfOrAdmin(id, currentUserId, currentUserRole);
    return this.userService.updateClientProfile(id, dto);
  }

  private assertSelfOrAdmin(targetId: string, currentUserId: string, currentRole: string) {
    const isAdmin = currentRole === UserRole.SUPER_ADMIN || currentRole === UserRole.ADMIN;
    if (targetId !== currentUserId && !isAdmin) {
      throw new ForbiddenException('You can only modify your own profile');
    }
  }
}
