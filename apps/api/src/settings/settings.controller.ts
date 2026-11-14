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
  ttsSettingsSchema,
  ttsTestSchema,
  toolMaxTokensSchema,
  visionModelSchema,
  webAllowedHostsSchema,
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
  type TtsSettingsInput,
  type TtsSettingsResult,
  type TtsTestInput,
  type TtsTestResult,
  type ToolMaxTokensInput,
  type ToolTokenResult,
  type VisionModelInput,
  type VisionModelResult,
  type WebAllowedHostsInput,
  type WebAllowedHostsResult,
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
  /** Aggregates every settings block the admin page renders. */
  overview(): Promise<SettingsOverview> {
    return this.settings.getOverview();
  }

  @Put('redis')
  @HttpCode(200)
  @ApiOperation({ summary: '测试并保存 Redis 缓存配置（管理员）' })
  /** Saves only after a successful probe, so a broken config cannot be persisted. */
  updateRedis(
    @Body(new ZodValidationPipe(redisSettingsSchema)) input: RedisSettingsInput,
  ): Promise<RedisSettingsResult> {
    return this.settings.updateRedis(input);
  }

  @Put('bilibili')
  @HttpCode(200)
  @ApiOperation({ summary: '校验并保存 B 站 SESSDATA，用于读取自动字幕（管理员）' })
  /** Validates against Bilibili before storing the cookie. */
  updateBilibili(
    @Body(new ZodValidationPipe(bilibiliSettingsSchema)) input: BilibiliSettingsInput,
  ): Promise<BilibiliSettingsResult> {
    return this.settings.updateBilibili(input);
  }

  @Put('tts')
  @HttpCode(200)
  @ApiOperation({ summary: '测试并保存云端语音合成配置（管理员）' })
  /** Synthesizes a short probe clip before storing, so a broken endpoint cannot be saved. */
  updateTts(
    @Body(new ZodValidationPipe(ttsSettingsSchema)) input: TtsSettingsInput,
  ): Promise<TtsSettingsResult> {
    return this.settings.updateTts(input);
  }

  @Post('tts/test')
  @HttpCode(200)
  @ApiOperation({ summary: '用已保存配置试听一段语音（管理员）' })
  /** Returns the synthesized clip as base64 for in-page playback. */
  testTts(@Body(new ZodValidationPipe(ttsTestSchema)) input: TtsTestInput): Promise<TtsTestResult> {
    return this.settings.testTts(input);
  }

  @Put('max-tokens')
  @HttpCode(200)
  @ApiOperation({ summary: '保存单次模型调用的全局 token 上限（管理员）' })
  /** Callers may ask for less than this ceiling; they are never allowed more. */
  updateMaxTokens(
    @Body(new ZodValidationPipe(toolMaxTokensSchema)) input: ToolMaxTokensInput,
  ): Promise<ToolTokenResult> {
    return this.settings.updateMaxTokens(input);
  }

  @Put('vision-model')
  @HttpCode(200)
  @ApiOperation({ summary: '用内置图片探测并保存专门的识图模型（管理员）' })
  /** A model that cannot read the probe image is rejected instead of stored. */
  updateVisionModel(
    @Body(new ZodValidationPipe(visionModelSchema)) input: VisionModelInput,
  ): Promise<VisionModelResult> {
    return this.settings.updateVisionModel(input);
  }

  @Put('web-allowed-hosts')
  @HttpCode(200)
  @ApiOperation({ summary: '保存网页访问白名单：域名允许在内网解析时仍被心智读取（管理员）' })
  /** Entries are normalized to bare hostnames; covered subdomains inherit the entry. */
  updateWebAllowedHosts(
    @Body(new ZodValidationPipe(webAllowedHostsSchema)) input: WebAllowedHostsInput,
  ): Promise<WebAllowedHostsResult> {
    return this.settings.updateWebAllowedHosts(input);
  }

  @Put('mind-banned-words')
  @HttpCode(200)
  @ApiOperation({ summary: '保存全局禁用词，对所有渠道的心智提示词生效（管理员）' })
  /** Empty input clears the list and disables the filter for every channel. */
  updateMindBannedWords(
    @Body(new ZodValidationPipe(mindBannedWordsSchema)) input: MindBannedWordsInput,
  ): Promise<MindBannedWordsResult> {
    return this.settings.updateMindBannedWords(input);
  }

  @Post('phone/connect')
  @HttpCode(200)
  @ApiOperation({ summary: '通过 adb connect 连接手机（管理员）' })
  /** Connects an already-paired device; pairing itself is a separate step. */
  connectPhone(
    @Body(new ZodValidationPipe(phoneConnectSchema)) input: PhoneConnectInput,
  ): Promise<PhoneSettingsResult> {
    return this.settings.connectPhone(input);
  }

  @Post('phone/pair')
  @HttpCode(200)
  @ApiOperation({ summary: '无线调试配对（管理员）' })
  /** Exchanges the one-time wireless debugging code for a trusted pairing. */
  pairPhone(
    @Body(new ZodValidationPipe(phonePairSchema)) input: PhonePairInput,
  ): Promise<PhoneSettingsResult> {
    return this.settings.pairPhone(input);
  }

  @Post('phone/disconnect')
  @HttpCode(200)
  @ApiOperation({ summary: '断开无线调试设备（管理员）' })
  /** Drops the adb transport without forgetting the paired device. */
  disconnectPhone(
    @Body(new ZodValidationPipe(phoneDisconnectSchema)) input: PhoneDisconnectInput,
  ): Promise<PhoneSettingsResult> {
    return this.settings.disconnectPhone(input);
  }

  @Post('providers')
  @HttpCode(201)
  @ApiOperation({ summary: '测试并新增模型提供商（管理员）' })
  /** Probes the endpoint first; only a reachable provider with models is stored. */
  createProvider(
    @Body(new ZodValidationPipe(modelProviderSchema)) input: ModelProviderInput,
  ): Promise<ModelProviderSaveResult> {
    return this.settings.createProvider(input);
  }

  @Post('providers/:id/test')
  @HttpCode(200)
  @ApiOperation({ summary: '重新测试模型提供商并刷新可用模型（管理员）' })
  /** Re-fetches the model list, e.g. after the account gains access to new models. */
  retestProvider(@Param('id') id: string): Promise<ModelProviderSaveResult> {
    return this.settings.retestProvider(id);
  }

  @Delete('providers/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除模型提供商（管理员）' })
  /** Removes the provider record; channels pointing at it fall back to the default. */
  deleteProvider(@Param('id') id: string): Promise<void> {
    return this.settings.deleteProvider(id);
  }
}
