import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ChatMediaService } from '../chat-media.service.js';
import { ChatService } from '../chat.service.js';
import type { PipelineEffect, PipelineMessage } from './pipeline-types.js';

/**
 * Commits the effects a node returned. Effects are separated from node code so
 * the runner owns ordering and failure semantics, and a future dry-run only
 * needs to skip this call.
 */
@Injectable()
export class PipelineEffectsService {
  constructor(
    private readonly media: ChatMediaService,
    // Resolved lazily: ChatService owns the message store and depends on the
    // processor → runner → effects chain.
    private readonly moduleRef: ModuleRef,
  ) {}

  async commit(message: PipelineMessage, effects: PipelineEffect[]): Promise<void> {
    for (const effect of effects) {
      if (effect.type !== 'reply') {
        continue;
      }
      const chat = this.moduleRef.get(ChatService, { strict: false });
      // Image ports carry references (stored media URLs); NapCat needs data URLs.
      const attachments =
        effect.images.length > 0
          ? await Promise.all(effect.images.map((reference) => this.media.toDataUrl(reference)))
          : [];
      await chat.sendMessage(message.conversationId, {
        text: effect.text,
        images: attachments,
      });
    }
  }
}
