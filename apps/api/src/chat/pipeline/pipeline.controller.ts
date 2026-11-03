import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chatPipelineRunQuerySchema,
  chatPipelineScopeQuerySchema,
  debugChatPipelineRunSchema,
  followChatPipelineGraphSchema,
  saveChatPipelineGraphSchema,
  type ChatPipelineGraphSnapshot,
  type ChatPipelineRunDetail,
  type ChatPipelineRunSummary,
  type ChatPipelineScope,
  type DebugChatPipelineRunInput,
  type PipelineScopeRef,
  type SaveChatPipelineGraphInput,
} from '@inkseek/shared';
import { AuthGuard } from '../../auth/auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PipelineGraphService } from './pipeline-graph.service.js';
import { ChatPipelineRunner } from './pipeline-runner.service.js';

interface RunQuery {
  limit: number;
  scope?: ChatPipelineScope;
  scopeId?: string;
}

@ApiTags('pipeline')
@ApiCookieAuth()
@Controller('pipeline')
@UseGuards(AuthGuard)
export class PipelineController {
  constructor(
    private readonly pipeline: ChatPipelineRunner,
    private readonly graphs: PipelineGraphService,
  ) {}

  @Get('graph')
  @ApiOperation({ summary: '读取作用域管线图：渠道/人格未保存副本时返回其继承来源' })
  graph(
    @Query(new ZodValidationPipe(chatPipelineScopeQuerySchema)) query: PipelineScopeRef,
  ): Promise<ChatPipelineGraphSnapshot> {
    return this.graphs.snapshot(query);
  }

  @Put('graph')
  @ApiOperation({ summary: '保存画布上的节点、连线与位置；首次保存会创建该作用域的副本' })
  saveGraph(
    @Body(new ZodValidationPipe(saveChatPipelineGraphSchema))
    input: SaveChatPipelineGraphInput,
  ): Promise<ChatPipelineGraphSnapshot> {
    return this.graphs.save(input);
  }

  @Post('graph/follow')
  @ApiOperation({ summary: '删除该作用域的副本并恢复跟随父级（全局则为恢复出厂模板）' })
  followGraph(
    @Body(new ZodValidationPipe(followChatPipelineGraphSchema)) ref: PipelineScopeRef,
  ): Promise<ChatPipelineGraphSnapshot> {
    return this.graphs.follow(ref);
  }

  @Post('debug-runs')
  @ApiOperation({ summary: '用一条模拟消息干跑作用域管线；记录 effects 但不发送' })
  debug(
    @Body(new ZodValidationPipe(debugChatPipelineRunSchema)) input: DebugChatPipelineRunInput,
  ): Promise<ChatPipelineRunDetail> {
    return this.pipeline.debug(input);
  }

  @Get('runs')
  @ApiOperation({ summary: '按时间倒序列出最近的管线运行，可按作用域筛选' })
  runs(
    @Query(new ZodValidationPipe(chatPipelineRunQuerySchema)) query: RunQuery,
  ): Promise<ChatPipelineRunSummary[]> {
    return this.pipeline.listRuns(query.limit, { scope: query.scope, scopeId: query.scopeId });
  }

  @Get('runs/:id')
  @ApiOperation({ summary: '读取单次管线运行及其节点轨迹' })
  run(@Param('id') id: string): Promise<ChatPipelineRunDetail> {
    return this.pipeline.getRun(id);
  }
}
