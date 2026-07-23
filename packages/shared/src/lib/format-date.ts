/** Formats an ISO date string as e.g. "4 Jul 2021" using UTC to avoid viewer-timezone drift for wall-clock local times. */
export function formatActivityDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
