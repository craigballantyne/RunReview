const HAS_TZ_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Various import-time sources give timestamps as either epoch-ms numbers (always an unambiguous
 * instant) or ISO strings with no timezone suffix (e.g. "2026-07-21T00:00:00.0"). JS's Date
 * constructor parses date-time strings like that using the *server process's* local timezone,
 * not UTC, so the result would silently differ depending on where this code runs. Appending "Z"
 * forces a deterministic UTC interpretation regardless of server timezone.
 */
export function toDate(value: number | string): Date {
  if (typeof value === "number") return new Date(value);
  return new Date(HAS_TZ_SUFFIX.test(value) ? value : `${value}Z`);
}
