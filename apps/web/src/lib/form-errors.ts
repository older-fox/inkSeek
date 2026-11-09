import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Maps server-side field validation errors onto a react-hook-form instance; reports whether any were applied. */
export function applyApiFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  stripPrefixes: string[] = [],
): boolean {
  if (!(error instanceof ApiError) || !error.fieldErrors) {
    return false;
  }

  let applied = false;

  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    const field = stripPrefixes.reduce(
      (current, prefix) =>
        current.startsWith(`${prefix}.`) ? current.slice(prefix.length + 1) : current,
      key,
    );

    if (messages[0]) {
      setError(field as Path<T>, { type: 'server', message: messages[0] });
      applied = true;
    }
  }

  return applied;
}
