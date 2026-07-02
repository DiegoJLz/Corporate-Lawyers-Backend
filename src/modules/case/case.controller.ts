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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole, CaseAssignmentRole } from '@prisma/client';
import { CaseService } from './case.service';
import { ConflictCheckService } from './conflict-check.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CaseQueryDto } from './dto/case-query.dto';
import { AddPartyDto, UpdatePartyDto } from './dto/add-party.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { AssignLawyerDto } from './dto/assign-lawyer.dto';
import { Roles } from '../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../core/security/decorators/current-user.decorator';

@ApiTags('Cases')
@ApiBearerAuth()
@Controller({ version: '1', path: 'cases' })
export class CaseController {
  constructor(
    private readonly caseService: CaseService,
    private readonly conflictCheckService: ConflictCheckService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List cases (filtered by role)' })
  async findAll(
    @Query() query: CaseQueryDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.caseService.findAll(query, userId, role);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Create a new case' })
  async create(
    @Body() dto: CreateCaseDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.caseService.create(dto, userId);
  }

  @Get('conflict-check')
  @ApiOperation({ summary: 'Check for conflicts of interest by name' })
  async conflictCheck(@Query('name') name: string) {
    return this.conflictCheckService.checkByName(name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get case by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update case' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role, CaseAssignmentRole.LEAD_ATTORNEY);
    return this.caseService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete case' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.caseService.remove(id, userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update case status (validated transitions)' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role, CaseAssignmentRole.LEAD_ATTORNEY);
    return this.caseService.updateStatus(id, dto, userId, role);
  }

  // ─── Assignments ──────────────────────────────────────────────

  @Get(':id/assignments')
  @ApiOperation({ summary: 'List case assignments' })
  async getAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.getAssignments(id);
  }

  @Post(':id/assignments')
  @ApiOperation({ summary: 'Assign lawyer/assistant to case' })
  async assignLawyer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLawyerDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role, CaseAssignmentRole.LEAD_ATTORNEY);
    return this.caseService.assignLawyer(id, dto, userId);
  }

  @Delete(':id/assignments/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove assignment' })
  async removeAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role, CaseAssignmentRole.LEAD_ATTORNEY);
    return this.caseService.removeAssignment(id, targetUserId, userId);
  }

  // ─── Parties ──────────────────────────────────────────────────

  @Get(':id/parties')
  @ApiOperation({ summary: 'List case parties' })
  async getParties(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.getParties(id);
  }

  @Post(':id/parties')
  @ApiOperation({ summary: 'Add party to case' })
  async addParty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPartyDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.addParty(id, dto, userId);
  }

  @Patch(':id/parties/:partyId')
  @ApiOperation({ summary: 'Update party' })
  async updateParty(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Body() dto: UpdatePartyDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.updateParty(id, partyId, dto);
  }

  @Delete(':id/parties/:partyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove party' })
  async removeParty(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.removeParty(id, partyId, userId);
  }

  // ─── Notes ──────────────────────────────────────────────────

  @Get(':id/notes')
  @ApiOperation({ summary: 'List case notes' })
  async getNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Query('isInternal') isInternal?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    const internal = isInternal === 'true' ? true : isInternal === 'false' ? false : undefined;
    return this.caseService.getNotes(id, internal, limit ?? 20, offset ?? 0);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add note to case' })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.addNote(id, dto, userId);
  }

  @Patch(':id/notes/:noteId')
  @ApiOperation({ summary: 'Edit note (author or admin)' })
  async updateNote(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: AddNoteDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.caseService.updateNote(noteId, dto.content, userId, role);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete note (author or admin)' })
  async removeNote(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.caseService.removeNote(noteId, userId, role);
  }

  // ─── Timeline ──────────────────────────────────────────────

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get case timeline (cursor-based)' })
  async getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
    @CurrentUser('userId') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    if (userId && role) {
      await this.caseService.assertCaseAccess(id, userId, role);
    }
    return this.caseService.getTimeline(id, limit ?? 20, cursor);
  }

  // ─── Tasks ──────────────────────────────────────────────────

  @Get(':id/tasks')
  @ApiOperation({ summary: 'List case tasks' })
  async getTasks(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Query('isCompleted') isCompleted?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('priority') priority?: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.getTasks(id, {
      isCompleted: isCompleted === 'true' ? true : isCompleted === 'false' ? false : undefined,
      assigneeId,
      priority,
    });
  }

  @Post(':id/tasks')
  @ApiOperation({ summary: 'Create task for case' })
  async createTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.createTask(id, dto, userId);
  }

  @Patch(':id/tasks/:taskId')
  @ApiOperation({ summary: 'Update task' })
  async updateTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.updateTask(id, taskId, dto);
  }

  @Patch(':id/tasks/:taskId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark task as completed' })
  async completeTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.completeTask(id, taskId, userId);
  }

  @Delete(':id/tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete task' })
  async removeTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.caseService.assertCaseAccess(id, userId, role);
    return this.caseService.removeTask(id, taskId);
  }
}
