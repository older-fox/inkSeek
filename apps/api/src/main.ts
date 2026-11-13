import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { FastifyPluginCallback } from 'fastify';
import { mkdir } from 'node:fs/promises';
import { AppModule } from './app.module.js';
import { SESSION_COOKIE_NAME } from './auth/session-cookie.js';
import {
  CHAT_CHANNEL_ROOT,
  CHAT_MEDIA_ROOT,
  CHAT_STICKER_ROOT,
  CHAT_VOICE_ROOT,
} from './chat/chat-paths.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

const API_PORT = 3100;
// Outgoing chat images travel as base64 data URLs: 4 × 12 MB schema cap plus JSON overhead.
const JSON_BODY_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * Boots the Fastify-backed API: cookies, static media roots, global prefix,
 * the exception filter and Swagger, then listens on loopback only — public
 * traffic reaches the API through Nginx, which owns the single exposed port.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: JSON_BODY_LIMIT_BYTES }),
  );

  // @fastify/cookie augments FastifyInstance, which conflicts with Nest's copy of the type.
  await app.register(fastifyCookie as unknown as FastifyPluginCallback<Record<never, never>>);
  await mkdir(CHAT_CHANNEL_ROOT, { recursive: true });
  // Legacy shared roots stay readable for old references; new media only ever
  // lands under data/chat/channels/<channelId>/.
  await mkdir(CHAT_MEDIA_ROOT, { recursive: true });
  await mkdir(CHAT_VOICE_ROOT, { recursive: true });
  await mkdir(CHAT_STICKER_ROOT, { recursive: true });
  await app.getHttpAdapter().getInstance().register(fastifyStatic, {
    root: CHAT_CHANNEL_ROOT,
    prefix: '/api/v1/media/channels/',
    decorateReply: false,
    index: false,
  });
  await app.getHttpAdapter().getInstance().register(fastifyStatic, {
    root: CHAT_MEDIA_ROOT,
    prefix: '/api/v1/media/images/',
    decorateReply: false,
    index: false,
  });
  await app.getHttpAdapter().getInstance().register(fastifyStatic, {
    root: CHAT_VOICE_ROOT,
    prefix: '/api/v1/media/voices/',
    decorateReply: false,
    index: false,
  });
  await app.getHttpAdapter().getInstance().register(fastifyStatic, {
    root: CHAT_STICKER_ROOT,
    prefix: '/api/v1/media/stickers/',
    decorateReply: false,
    index: false,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('inkSeek Platform API')
    .setDescription('Agent 聊天控制平台 API')
    .setVersion('0.1.0')
    .addCookieAuth(SESSION_COOKIE_NAME)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(API_PORT, '127.0.0.1');
  Logger.log(`API listening on http://localhost:${API_PORT}/api/v1`, 'Bootstrap');
  Logger.log(`OpenAPI docs on http://localhost:${API_PORT}/api/docs`, 'Bootstrap');
}

void bootstrap();
