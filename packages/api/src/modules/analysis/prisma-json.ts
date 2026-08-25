import type { Prisma } from "@prisma/client";

/**
 * Prisma's `InputJsonValue` requires an index signature, which `interface` declarations don't
 * carry (unlike `Record`/type aliases). Everything passed through here is plain serialisable data
 * defined in `@run-review/shared`, so the assertion is safe — kept in one place rather than
 * repeated at each call site.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
