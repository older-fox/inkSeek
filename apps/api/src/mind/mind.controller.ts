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
  mindLearningQuerySchema,
  mindLongEventQuerySchema,
  mindPhoneFocusStartSchema,
  mindPromptLogQuerySchema,
  mindRunQuerySchema,
  mindSettingsUpdateSchema,
  personaGroupStanceUpdateSchema,
  personaMemoryCreateSchema,
  personaMemoryQuerySchema,
  personaMemoryUpdateSchema,
  personaRelationshipUpdateSchema,
  personaStateUpdateSchema,
  personaStyleNoteUpdateSchema,
  type AgentIntentionCreateInput,
  type AgentTodoCreateInput,
  type AgentTodoUpdateInput,
  type MindChangeQueryInput,
  type MindHeartbeatQueryInput,
  type MindJournalQueryInput,
  type MindLearningQueryInput,
  type MindLongEventQueryInput,
  type MindPhoneFocusStartInput,
  type MindPromptLogQueryInput,
  type MindRunQueryInput,
  type MindSettingsUpdateInput,
  type PersonaGroupStanceUpdateInput,
  type PersonaMemoryCreateInput,
  type PersonaMemoryQueryInput,
  type PersonaMemoryUpdateInput,
  type PersonaRelationshipUpdateInput,
  type PersonaStateUpdateInput,
  type PersonaStyleNoteUpdateInput,
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

  /** Reads the channel's settings, creating the row with defaults when absent. */
  @Get('settings/:channelId')
  @ApiOperation({ summary: '读取渠道心智模式' })
  settings(@Param('channelId') channelId: string) {
    return this.mind.getSettings(channelId);
  }

  /** Wireless adb targets reachable from the configured host. */
  @Get('phone-devices')
  @ApiOperation({ summary: '列出可选的无线 adb 设备' })
  phoneDevices() {
    return this.mind.phoneDevices();
  }

  /** Current focus plus a recent-history page for the panel. */
  @Get('focus/:personaId')
  @ApiOperation({ summary: '读取人格当前焦点与最近焦点' })
  focus(@Param('personaId') personaId: string) {
    return this.mind.focusOverview(personaId);
  }

  /** Starts background phone time; an already running session is returned instead. */
  @Post('focus/:personaId/phone')
  @ApiOperation({ summary: '让 TA 开始一段后台手机时间' })
  startPhoneFocus(
    @Param('personaId') personaId: string,
    @Body(new ZodValidationPipe(mindPhoneFocusStartSchema)) input: MindPhoneFocusStartInput,
  ) {
    return this.mind.startPhoneFocus(personaId, input.goal);
  }

  /** Partial update: omitted fields keep their stored value. */
  @Patch('settings/:channelId')
  @ApiOperation({ summary: '更新渠道心智模式' })
  updateSettings(
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(mindSettingsUpdateSchema)) input: MindSettingsUpdateInput,
  ) {
    return this.mind.updateSettings(channelId, input);
  }

  /** Current stats snapshot of one persona. */
  @Get('state/:personaId')
  @ApiOperation({ summary: '读取人格当下状态' })
  state(@Param('personaId') personaId: string) {
    return this.mind.getState(personaId);
  }

  /** Applies a partial stats patch on the operator's behalf. */
  @Patch('state/:personaId')
  @ApiOperation({ summary: '调整人格状态' })
  updateState(
    @Param('personaId') personaId: string,
    @Body(new ZodValidationPipe(personaStateUpdateSchema)) input: PersonaStateUpdateInput,
  ) {
    return this.mind.updateState(personaId, input);
  }

  /** Newest-first long-event history; limit comes from the query. */
  @Get('long-events/:personaId')
  @ApiOperation({ summary: '读取长时事件列表' })
  longEvents(
    @Param('personaId') personaId: string,
    @Query(new ZodValidationPipe(mindLongEventQuerySchema)) query: MindLongEventQueryInput,
  ) {
    return this.mind.listLongEvents(personaId, query.limit);
  }

  /** Force-ends the persona's current long event, if any. */
  @Post('long-events/:personaId/end')
  @ApiOperation({ summary: '手动结束当前长时事件' })
  endLongEvent(@Param('personaId') personaId: string) {
    return this.mind.endLongEvent(personaId);
  }

  /** Unified change feed, filtered and paged by the query. */
  @Get('changes/:personaId')
  @ApiOperation({ summary: '读取统一变动历史' })
  changes(
    @Param('personaId') personaId: string,
    @Query(new ZodValidationPipe(mindChangeQuerySchema)) query: MindChangeQueryInput,
  ) {
    return this.mind.listChanges(personaId, query);
  }

  /** All relationships held by one persona. */
  @Get('relationships/:personaId')
  @ApiOperation({ summary: '读取人格关系列表' })
  relationships(@Param('personaId') personaId: string) {
    return this.mind.listRelationships(personaId);
  }

  /** Relationship toward one external contact, or null when none exists yet. */
  @Get('relationships/:personaId/contact/:externalId')
  @ApiOperation({ summary: '读取人格对某个外部联系人的关系' })
  relationship(@Param('personaId') personaId: string, @Param('externalId') externalId: string) {
    return this.mind.relationshipByExternalId(personaId, externalId);
  }

  /** Edits the relationship toward one contact, creating it if needed. */
  @Patch('relationships/:personaId')
  @ApiOperation({ summary: '调整对某个联系人的关系' })
  updateRelationship(
    @Param('personaId') personaId: string,
    @Body(new ZodValidationPipe(personaRelationshipUpdateSchema))
    input: PersonaRelationshipUpdateInput,
  ) {
    return this.mind.updateRelationship(personaId, input);
  }

  /** Per-group stances held by one persona. */
  @Get('group-stances/:personaId')
  @ApiOperation({ summary: '读取人格对群的态度' })
  groupStances(@Param('personaId') personaId: string) {
    return this.mind.listGroupStances(personaId);
  }

  /** Edits the stance toward one group, creating it if needed. */
  @Patch('group-stances/:personaId')
  @ApiOperation({ summary: '调整人格对某个群的态度' })
  updateGroupStance(
    @Param('personaId') personaId: string,
    @Body(new ZodValidationPipe(personaGroupStanceUpdateSchema))
    input: PersonaGroupStanceUpdateInput,
  ) {
    return this.mind.updateGroupStance(personaId, input);
  }

  /** Memory search page described by the shared query schema. */
  @Get('memories')
  @ApiOperation({ summary: '检索人格记忆' })
  listMemories(
    @Query(new ZodValidationPipe(personaMemoryQuerySchema)) query: PersonaMemoryQueryInput,
  ) {
    return this.mind.listMemories(query);
  }

  /** Total rows under the same filters as listMemories; paging is ignored. */
  @Get('memories/count')
  @ApiOperation({ summary: '统计人格记忆条数' })
  async countMemories(
    @Query(new ZodValidationPipe(personaMemoryQuerySchema)) query: PersonaMemoryQueryInput,
  ): Promise<{ total: number }> {
    return { total: await this.mind.countMemories(query) };
  }

  /** Writes one memory directly, bypassing the model pipeline. */
  @Post('memories')
  @ApiOperation({ summary: '写入一条人格记忆' })
  createMemory(
    @Body(new ZodValidationPipe(personaMemoryCreateSchema)) input: PersonaMemoryCreateInput,
  ) {
    return this.memories.create(input);
  }

  /** Edits one memory in place; unknown ids surface as 404. */
  @Patch('memories/:id')
  @ApiOperation({ summary: '修改一条人格记忆' })
  updateMemory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(personaMemoryUpdateSchema)) input: PersonaMemoryUpdateInput,
  ) {
    return this.memories.update(id, input);
  }

  /** Forgets one memory; responds 204 with no body. */
  @Delete('memories/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '遗忘一条人格记忆' })
  async deleteMemory(@Param('id') id: string): Promise<void> {
    await this.memories.delete(id);
  }

  /** Todo list of one persona, open items first. */
  @Get('todos/:personaId')
  @ApiOperation({ summary: '读取人格待办' })
  todos(@Param('personaId') personaId: string) {
    return this.mind.listTodos(personaId);
  }

  /** Adds a todo on the persona's behalf, as if it wrote the line itself. */
  @Post('todos')
  @ApiOperation({ summary: '替人格新增一条待办' })
  createTodo(@Body(new ZodValidationPipe(agentTodoCreateSchema)) input: AgentTodoCreateInput) {
    return this.mind.createTodo(input);
  }

  /** Edits one todo, including its done state. */
  @Patch('todos/:id')
  @ApiOperation({ summary: '修改人格待办' })
  updateTodo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(agentTodoUpdateSchema)) input: AgentTodoUpdateInput,
  ) {
    return this.mind.updateTodo(id, input);
  }

  /** Proactive intentions currently open for the persona. */
  @Get('intentions/:personaId')
  @ApiOperation({ summary: '读取人格主动意图' })
  intentions(@Param('personaId') personaId: string) {
    return this.mind.listIntentions(personaId);
  }

  /** Adds a proactive intention on the persona's behalf. */
  @Post('intentions')
  @ApiOperation({ summary: '替人格新增一条主动意图' })
  createIntention(
    @Body(new ZodValidationPipe(agentIntentionCreateSchema)) input: AgentIntentionCreateInput,
  ) {
    return this.mind.createIntention(input);
  }

  /** Run history page, narrowed by persona or conversation. */
  @Get('runs')
  @ApiOperation({ summary: '读取心智运行列表' })
  runs(@Query(new ZodValidationPipe(mindRunQuerySchema)) query: MindRunQueryInput) {
    return this.mind.listRuns(query.personaId, query.conversationId, query.limit, query.offset);
  }

  /** One run with its recorded steps, prompt and tool traffic. */
  @Get('runs/:id')
  @ApiOperation({ summary: '读取一次心智运行详情' })
  run(@Param('id') id: string) {
    return this.mind.runDetail(id);
  }

  /** Recent LLM prompt logs, filtered by the query. */
  @Get('prompts')
  @ApiOperation({ summary: '读取最近的 LLM 提示词日志' })
  promptLogs(
    @Query(new ZodValidationPipe(mindPromptLogQuerySchema)) query: MindPromptLogQueryInput,
  ) {
    return this.mind.listPromptLogs(query);
  }

  /** Diary entries written by the persona, newest first. */
  @Get('journal')
  @ApiOperation({ summary: '读取人格日记' })
  journal(@Query(new ZodValidationPipe(mindJournalQuerySchema)) query: MindJournalQueryInput) {
    return this.mind.listJournal(query.personaId, query.limit);
  }

  /** Removes one diary entry; the persona's memory rows are left untouched. */
  @Delete('journal/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除一篇人格日记' })
  async deleteJournal(@Param('id') id: string): Promise<void> {
    await this.mind.deleteJournal(id);
  }

  /**
   * Actions the persona queued but could not send on its own (approval-gated
   * channels); the human decides whether any of them actually goes out.
   */
  @Get('actions/:personaId/pending')
  @ApiOperation({ summary: '读取待审动作' })
  pendingActions(@Param('personaId') personaId: string) {
    return this.mind.pendingActions(personaId);
  }

  /** Sends a queued action now; approving is the only way it reaches the chat. */
  @Post('actions/:id/approve')
  @ApiOperation({ summary: '批准并发送一条待审动作' })
  approveAction(@Param('id') id: string) {
    return this.mind.approveAction(id);
  }

  /** Runs one heartbeat immediately instead of waiting for the timer. */
  @Post('heartbeat/:personaId')
  @ApiOperation({ summary: '手动唤醒人格心跳' })
  heartbeat(@Param('personaId') personaId: string) {
    return this.mind.triggerHeartbeat(personaId);
  }

  /** Heartbeat history: what woke the persona, what it decided, what it cost. */
  @Get('heartbeats/:personaId')
  @ApiOperation({ summary: '读取心跳日志' })
  heartbeats(
    @Param('personaId') personaId: string,
    @Query(new ZodValidationPipe(mindHeartbeatQuerySchema)) query: MindHeartbeatQueryInput,
  ) {
    return this.mind.listHeartbeats(personaId, query);
  }

  /** Recent autonomous-learning sessions, their sources and the notes they produced. */
  @Get('learning/:personaId')
  @ApiOperation({ summary: '读取人格自主学习概览' })
  learning(
    @Param('personaId') personaId: string,
    @Query(new ZodValidationPipe(mindLearningQuerySchema)) query: MindLearningQueryInput,
  ) {
    return this.mind.learningOverview(personaId, query.channelId, query.limit ?? 12);
  }

  /** Kicks off one learning session now; the read-only browsing rules still apply. */
  @Post('learning/:personaId/start')
  @ApiOperation({ summary: '让 TA 立刻开始一次自主学习' })
  startLearning(@Param('personaId') personaId: string) {
    return this.mind.startLearning(personaId);
  }

  /** Edits, reweights or pauses one learned phrasing note before it hardens into style. */
  @Patch('style-notes/:id')
  @ApiOperation({ summary: '修改一条学到的说话方式' })
  updateStyleNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(personaStyleNoteUpdateSchema))
    input: PersonaStyleNoteUpdateInput,
  ) {
    return this.mind.updateStyleNote(id, input);
  }

  /** Drops a learned phrasing note so it stops steering future turns. */
  @Delete('style-notes/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除一条学到的说话方式' })
  async deleteStyleNote(@Param('id') id: string): Promise<void> {
    await this.mind.deleteStyleNote(id);
  }

  /** Stickers this channel's agent collected itself, scoped to that channel. */
  @Get('stickers/:channelId')
  @ApiOperation({ summary: '读取 Agent 收藏的表情库' })
  stickers(@Param('channelId') channelId: string) {
    return this.mind.listStickers(channelId);
  }

  /** Deletes the library row together with this channel's copy of the image. */
  @Delete('stickers/:channelId/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '从表情库删除一张表情' })
  deleteSticker(@Param('channelId') channelId: string, @Param('id') id: string) {
    return this.mind.deleteSticker(channelId, id);
  }
}
