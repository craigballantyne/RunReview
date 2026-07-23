/** Matches the import scope decision: accept any activity_type_key containing "running" (e.g. trail_running). */
export function isRunningActivityType(activityTypeKey: string): boolean {
  return activityTypeKey.toLowerCase().includes("running");
}
