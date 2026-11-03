import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chatPipelineRunQuerySchema,
  saveChatPipelineGraphSchema,
  type ChatPipelineGraphSnapshot,
  type ChatPipelineRunDetail,
  type ChatPipelineRunSummary,
  type SaveChatPipelineGraphInput,
} from '@inkseek/shared';
import { AuthGuard } from '../../auth/auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PipelineGraphService } from './pipeline-graph.service.js';
import { ChatPipelineRunner } from './pipeline-runner.service.js';

interface RunQuery {
  limit: number;
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
  @ApiOperation({ summary: '读取当前管线图与可用节点目录' })
  graph(): Promise<ChatPipelineGraphSnapshot> {
    return this.graphs.snapshot();
  }

  @Put('graph')
  @ApiOperation({ summary: '保存画布上的节点、连线与位置' })
  saveGraph(
    @Body(new ZodValidationPipe(saveChatPipelineGraphSchema))
    input: SaveChatPipelineGraphInput,
  ): Promise<ChatPipelineGraphSnapshot> {
    return this.graphs.save(input);
  }

  @Post('graph/reset')
  @ApiOperation({ summary: '恢复出厂默认管线图' })
  resetGraph(): Promise<ChatPipelineGraphSnapshot> {
    return this.graphs.reset();
  }

  @Get('runs')
  @ApiOperation({ summary: '按时间倒序列出最近的管线运行' })
  runs(
    @Query(new ZodValidationPipe(chatPipelineRunQuerySchema)) query: RunQuery,
  ): Promise<ChatPipelineRunSummary[]> {
    return this.pipeline.listRuns(query.limit);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: '读取单次管线运行及其节点轨迹' })
  run(@Param('id') id: string): Promise<ChatPipelineRunDetail> {
    return this.pipeline.getRun(id);
  }
}
