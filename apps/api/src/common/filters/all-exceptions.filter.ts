import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

interface HttpErrorPayload {
  code?: string;
  message?: string | string[];
  fieldErrors?: Record<string, string[]>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const payload: HttpErrorPayload =
        typeof response === 'string' ? { message: response } : (response as HttpErrorPayload);

      const message = Array.isArray(payload.message)
        ? payload.message.join('；')
        : (payload.message ?? exception.message);

      reply.status(status).send({
        error: {
          code: payload.code ?? 'HTTP_ERROR',
          message,
          ...(payload.fieldErrors ? { fieldErrors: payload.fieldErrors } : {}),
        },
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );

    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器开小差了，请稍后重试',
      },
    });
  }
}
