import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  /** Parses into the schema type and groups issues by dotted field path for the form UI. */
  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});

    if (result.success) {
      return result.data;
    }

    const fieldErrors: Record<string, string[]> = {};

    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join('.') : '_';
      (fieldErrors[key] ??= []).push(issue.message);
    }

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: '请检查输入内容',
      fieldErrors,
    });
  }
}
