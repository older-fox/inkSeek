import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agentIntentionCreateSchema,
  agentTodoCreateSchema,
  agentTodoUpdateSchema,
  mindChangeQuerySchema,
  mindHeartbeatQuerySchema,
  mindJournalQuerySchema,
  mindLongEventQuerySchema,
  mindPromptLogQuerySchema,
  mindRunQuerySchema,
  mindSettingsUpdateSchema,
  personaGroupStanceUpdateSchema,
  personaMemoryCreateSchema,
  personaMemoryQuerySchema,
  personaMemoryUpdateSchema,
  personaRelationshipUpdateSchema,
  personaStateUpdateSchema,
  type AgentIntentionCreateInput,
  type AgentTodoCreateInput,
  type AgentTodoUpdateInput,
  type MindChangeQueryInput,
  type MindHeartbeatQueryInput,
  type MindJournalQueryInput,
  type MindLongEventQueryInput,
  type MindPromptLogQueryInput,
  type MindRunQueryInput,
  type MindSettingsUpdateInput,
  type PersonaGroupStanceUpdateInput,
  type PersonaMemoryCreateInput,
  type PersonaMemoryQueryInput,
  type PersonaMemoryUpdateInput,
  type PersonaRelationshipUpdateInput,
  type PersonaStateUpdateInput,
} from '@inkseek/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { MindService } from './mind.service.js';
import { PersonaMemoryService } from './persona-memory.service.js';

@ApiTags('mind')
@ApiCookieAuth()
@Controller('mind')
@UseGuards(AuthGuard)
export class MindController {
  constructor(
    private readonly mind: MindService,
    private readonly memories: PersonaMemoryService,
  ) {}

  @Get('settings/:channelId')
  @ApiOperation({ summary: '读取渠道心智模式' })
  settings(@Param('channelId') channelId: string) {
    return this.mind.getSettings(channelId);
  }

  @Patch('settings/:channelId')
  @ApiOperation({ summary: '更新渠道心智模式' })
  updateSettings(
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(mindSettingsUpdateSchema)) input: MindSettingsUpdateInput,
  ) {
    return this.mind.updateSettings(channelId, input);
  }

  @Get('state/:personaId')
  @ApiOperation({ summary: '读取人格当下状态' })
  state(@Param('personaId') personaId: string) {
    return this.mind.getState(personaId);
  }

  @Patch('state/:personaId')
  @ApiOperation({ summary: '调整人格状态' })
  updateState(
    @Param('personaId') personaId: string,
    @Body(new ZodValidationPipe(personaStateUpdateSchema)) input: PersonaStateUpdateInput,
  ) {
    return this.mind.updateState(personaId, input);
  }

  @Get('long-events/:personaId')
  @ApiOperation({ summary: '读取长时事件列表' })
  longEvents(
    @Param('personaId') personaId: string,
    @Query(new ZodValidationPipe(mindLongEventQuerySchema)) query: MindLongEventQueryInput,
  ) {
    return this.mind.listLongEvents(personaId, query.limit);
  }

  @Post('long-events/:personaId/end')
  @ApiOperation({ summary: '手动结束当前长时事件' })
  endLongEvent(@Param('personaId') personaId: string) {
    return this.mind.endLongEvent(personaId);
  }

  @Get('changes/:personaId')
  @ApiOperation({ summary: '读取统一变动历史' })
  changes(
    @Param('personaId') personaId: string,
    @Query(new ZodValidationPipe(mindChangeQuerySchema)) query: MindChangeQueryInput,
  ) {
    return this.mind.listChanges(personaId, query);
  }

  @Get('relationships/:personaId')
  @ApiOperation({ summary: '读取人格关系列表' })
  relationships(@Param('personaId') personaId: string) {
    return this.mind.listRelationships(personaId);
  }

  @Get('relationships/:personaId/contact/:externalId')
  @ApiOperation({ summary: '读取人格对某个外部联系人的关系' })
  relationship(@Param('personaId') personaId: string, @Param('externalId') externalId: string) {
    return this.mind.relationshipByExternalId(personaId, externalId);
  }

  @Patch('relationships/:personaId')
  @ApiOperation({ summary: '调整对某个联系人的关系' })
  updateRelationship(
    @Param('personaId') personaId: string,
    @Body(new ZodValidationPipe(personaRelationshipUpdateSchema))
    input: PersonaRelationshipUpdateInput,
  ) {
    return this.mind.updateRelationship(personaId, input);
  }

  @Get('group-stances/:personaId')
  @ApiOperation({ summary: '读取人格对群的态度' })
  groupStances(@Param('personaId') personaId: string) {
    return this.mind.listGroupStances(personaId);
  }

  @Patch('group-stances/:personaId')
  @ApiOperation({ summary: '调整人格对某个群的态度' })
  updateGroupStance(
    @Param('personaId') personaId: string,
    @Body(new ZodValidationPipe(personaGroupStanceUpdateSchema))
    input: PersonaGroupStanceUpdateInput,
  ) {
    return this.mind.updateGroupStance(personaId, input);
  }

  @Get('memories')
  @ApiOperation({ summary: '检索人格记忆' })
  listMemories(
    @Query(new ZodValidationPipe(personaMemoryQuerySchema)) query: PersonaMemoryQueryInput,
  ) {
    return this.mind.listMemories(query);
  }

  @Post('memories')
  @ApiOperation({ summary: '写入一条人格记忆' })
  createMemory(
    @Body(new ZodValidationPipe(personaMemoryCreateSchema)) input: PersonaMemoryCreateInput,
  ) {
    return this.memories.create(input);
  }

  @Patch('memories/:id')
  @ApiOperation({ summary: '修改一条人格记忆' })
  updateMemory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(personaMemoryUpdateSchema)) input: PersonaMemoryUpdateInput,
  ) {
    return this.memories.update(id, input);
  }

  @Delete('memories/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '遗忘一条人格记忆' })
  async deleteMemory(@Param('id') id: string): Promise<void> {
    await this.memories.delete(id);
  }

  @Get('todos/:personaId')
  @ApiOperation({ summary: '读取人格待办' })
  todos(@Param('personaId') personaId: string) {
    return this.mind.listTodos(personaId);
  }

  @Post('todos')
  @ApiOperation({ summary: '替人格新增一条待办' })
  createTodo(@Body(new ZodValidationPipe(agentTodoCreateSchema)) input: AgentTodoCreateInput) {
    return this.mind.createTodo(input);
  }

  @Patch('todos/:id')
  @ApiOperation({ summary: '修改人格待办' })
  updateTodo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(agentTodoUpdateSchema)) input: AgentTodoUpdateInput,
  ) {
    return this.mind.updateTodo(id, input);
  }

  @Get('intentions/:personaId')
  @ApiOperation({ summary: '读取人格主动意图' })
  intentions(@Param('personaId') personaId: string) {
    return this.mind.listIntentions(personaId);
  }

  @Post('intentions')
  @ApiOperation({ summary: '替人格新增一条主动意图' })
  createIntention(
    @Body(new ZodValidationPipe(agentIntentionCreateSchema)) input: AgentIntentionCreateInput,
  ) {
    return this.mind.createIntention(input);
  }

  @Get('runs')
  @ApiOperation({ summary: '读取心智运行列表' })
  runs(@Query(new ZodValidationPipe(mindRunQuerySchema)) query: MindRunQueryInput) {
    return this.mind.listRuns(query.personaId, query.conversationId, query.limit, query.offset);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: '读取一次心智运行详情' })
  run(@Param('id') id: string) {
    return this.mind.runDetail(id);
  }

  @Get('prompts')
  @ApiOperation({ summary: '读取最近的 LLM 提示词日志' })
  promptLogs(
    @Query(new ZodValidationPipe(mindPromptLogQuerySchema)) query: MindPromptLogQueryInput,
  ) {
    return this.mind.listPromptLogs(query);
  }

  @Get('journal')
  @ApiOperation({ summary: '读取人格日记' })
  journal(@Query(new ZodValidationPipe(mindJournalQuerySchema)) query: MindJournalQueryInput) {
    return this.mind.listJournal(query.personaId, query.limit);
  }

  @Delete('journal/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除一篇人格日记' })
  async deleteJournal(@Param('id') id: string): Promise<void> {
    await this.mind.deleteJournal(id);
  }

  @Get('actions/:personaId/pending')
  @ApiOperation({ summary: '读取待审动作' })
  pendingActions(@Param('personaId') personaId: string) {
    return this.mind.pendingActions(personaId);
  }

  @Post('actions/:id/approve')
  @ApiOperation({ summary: '批准并发送一条待审动作' })
  approveAction(@Param('id') id: string) {
    return this.mind.approveAction(id);
  }

  @Post('heartbeat/:personaId')
  @ApiOperation({ summary: '手动唤醒人格心跳' })
  heartbeat(@Param('personaId') personaId: string) {
    return this.mind.triggerHeartbeat(personaId);
  }

  @Get('heartbeats/:personaId')
  @ApiOperation({ summary: '读取心跳日志' })
  heartbeats(
    @Param('personaId') personaId: string,
    @Query(new ZodValidationPipe(mindHeartbeatQuerySchema)) query: MindHeartbeatQueryInput,
  ) {
    return this.mind.listHeartbeats(personaId, query);
  }

  @Get('stickers')
  @ApiOperation({ summary: '读取 Agent 收藏的表情库' })
  stickers() {
    return this.mind.listStickers();
  }
}
