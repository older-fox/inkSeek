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
  bilibiliSettingsSchema,
  mindBannedWordsSchema,
  modelProviderSchema,
  phoneConnectSchema,
  phoneDisconnectSchema,
  phonePairSchema,
  redisSettingsSchema,
  type BilibiliSettingsInput,
  type BilibiliSettingsResult,
  type MindBannedWordsInput,
  type MindBannedWordsResult,
  type ModelProviderInput,
  type PhoneConnectInput,
  type PhoneDisconnectInput,
  type PhonePairInput,
  type PhoneSettingsResult,
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

  @Put('bilibili')
  @HttpCode(200)
  @ApiOperation({ summary: '校验并保存 B 站 SESSDATA，用于读取自动字幕（管理员）' })
  updateBilibili(
    @Body(new ZodValidationPipe(bilibiliSettingsSchema)) input: BilibiliSettingsInput,
  ): Promise<BilibiliSettingsResult> {
    return this.settings.updateBilibili(input);
  }

  @Put('mind-banned-words')
  @HttpCode(200)
  @ApiOperation({ summary: '保存全局禁用词，对所有渠道的心智提示词生效（管理员）' })
  updateMindBannedWords(
    @Body(new ZodValidationPipe(mindBannedWordsSchema)) input: MindBannedWordsInput,
  ): Promise<MindBannedWordsResult> {
    return this.settings.updateMindBannedWords(input);
  }

  @Post('phone/connect')
  @HttpCode(200)
  @ApiOperation({ summary: '通过 adb connect 连接手机（管理员）' })
  connectPhone(
    @Body(new ZodValidationPipe(phoneConnectSchema)) input: PhoneConnectInput,
  ): Promise<PhoneSettingsResult> {
    return this.settings.connectPhone(input);
  }

  @Post('phone/pair')
  @HttpCode(200)
  @ApiOperation({ summary: '无线调试配对（管理员）' })
  pairPhone(
    @Body(new ZodValidationPipe(phonePairSchema)) input: PhonePairInput,
  ): Promise<PhoneSettingsResult> {
    return this.settings.pairPhone(input);
  }

  @Post('phone/disconnect')
  @HttpCode(200)
  @ApiOperation({ summary: '断开无线调试设备（管理员）' })
  disconnectPhone(
    @Body(new ZodValidationPipe(phoneDisconnectSchema)) input: PhoneDisconnectInput,
  ): Promise<PhoneSettingsResult> {
    return this.settings.disconnectPhone(input);
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
