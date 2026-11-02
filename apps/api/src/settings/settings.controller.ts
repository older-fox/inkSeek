import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  modelProviderSchema,
  redisSettingsSchema,
  type ModelProviderInput,
  type ModelProviderSaveResult,
  type RedisSettingsInput,
  type RedisSettingsResult,
  type SettingsOverview,
} from '@inkseek/shared';
import { AdminGuard } from '../auth/admin.guard.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@ApiCookieAuth()
@Controller('settings')
@UseGuards(AuthGuard, AdminGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: '读取系统设置概览（管理员）' })
  overview(): Promise<SettingsOverview> {
    return this.settings.getOverview();
  }

  @Put('redis')
  @HttpCode(200)
  @ApiOperation({ summary: '测试并保存 Redis 缓存配置（管理员）' })
  updateRedis(
    @Body(new ZodValidationPipe(redisSettingsSchema)) input: RedisSettingsInput,
  ): Promise<RedisSettingsResult> {
    return this.settings.updateRedis(input);
  }

  @Post('providers')
  @HttpCode(201)
  @ApiOperation({ summary: '测试并新增模型提供商（管理员）' })
  createProvider(
    @Body(new ZodValidationPipe(modelProviderSchema)) input: ModelProviderInput,
  ): Promise<ModelProviderSaveResult> {
    return this.settings.createProvider(input);
  }

  @Post('providers/:id/test')
  @HttpCode(200)
  @ApiOperation({ summary: '重新测试模型提供商并刷新可用模型（管理员）' })
  retestProvider(@Param('id') id: string): Promise<ModelProviderSaveResult> {
    return this.settings.retestProvider(id);
  }

  @Delete('providers/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除模型提供商（管理员）' })
  deleteProvider(@Param('id') id: string): Promise<void> {
    return this.settings.deleteProvider(id);
  }
}
