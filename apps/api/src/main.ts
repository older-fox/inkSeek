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
import { CHAT_MEDIA_ROOT, CHAT_VOICE_ROOT } from './chat/chat-paths.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

const API_PORT = 3100;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  // @fastify/cookie augments FastifyInstance, which conflicts with Nest's copy of the type.
  await app.register(fastifyCookie as unknown as FastifyPluginCallback<Record<never, never>>);
  await mkdir(CHAT_MEDIA_ROOT, { recursive: true });
  await mkdir(CHAT_VOICE_ROOT, { recursive: true });
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

  await app.listen(API_PORT, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${API_PORT}/api/v1`, 'Bootstrap');
  Logger.log(`OpenAPI docs on http://localhost:${API_PORT}/api/docs`, 'Bootstrap');
}

void bootstrap();
