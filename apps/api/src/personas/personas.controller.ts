import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  savePersonaSchema,
  type PersonaRecord,
  type PersonaSummary,
  type PersonaVersionDetail,
  type SavePersonaInput,
} from '@inkseek/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PersonasService } from './personas.service.js';

@ApiTags('personas')
@ApiCookieAuth()
@Controller('personas')
@UseGuards(AuthGuard)
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Get()
  @ApiOperation({ summary: '列出人格中心的所有人格卡' })
  /** Summaries only; the full card is loaded on demand. */
  list(): Promise<PersonaSummary[]> {
    return this.personas.list();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: '创建一张人格卡并记录首个版本' })
  /** Version 1 is written alongside the card so history is never empty. */
  create(
    @Body(new ZodValidationPipe(savePersonaSchema)) input: SavePersonaInput,
  ): Promise<PersonaRecord> {
    return this.personas.create(input);
  }

  @Get(':id')
  @ApiOperation({ summary: '读取人格卡及其版本历史' })
  /** Includes the version index used by the history sidebar. */
  get(@Param('id') id: string): Promise<PersonaRecord> {
    return this.personas.get(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '保存人格卡并生成新版本' })
  /** Every save appends a version; existing channel snapshots keep their old data. */
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savePersonaSchema)) input: SavePersonaInput,
  ): Promise<PersonaRecord> {
    return this.personas.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除人格卡及全部版本历史，渠道快照不受影响' })
  /** Hard delete of the card and its versions; snapshots on channels are left alone. */
  remove(@Param('id') id: string): Promise<void> {
    return this.personas.remove(id);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: '读取某个历史版本的完整人格数据' })
  /** Reads one immutable snapshot by its number, used for compare and rollback. */
  version(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<PersonaVersionDetail> {
    return this.personas.getVersion(id, version);
  }
}
