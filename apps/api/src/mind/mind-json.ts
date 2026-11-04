import { Prisma } from '../generated/prisma/client.js';

/** JSON column value for an audit row; `null` becomes a real database NULL. */
export function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return value as Prisma.InputJsonValue;
}

/** Relationship/stance JSON fields use `{}` rather than SQL NULL for "cleared". */
export function jsonOrNull(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return {};
  }
  return value as Prisma.InputJsonValue;
}
