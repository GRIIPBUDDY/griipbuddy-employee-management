// Shared by the live workforce service and its client view (no server-only imports here).
export const liveStatuses = { WITHIN_SCHEDULE: "Working within schedule", PAST_END: "Past scheduled end — checkout pending", UNSCHEDULED: "Unscheduled session — review required", INCOMPLETE: "Incomplete session — attention required" } as const;
export type LiveStatus = keyof typeof liveStatuses;
export const liveStatusTone = { WITHIN_SCHEDULE: "success", PAST_END: "warning", UNSCHEDULED: "info", INCOMPLETE: "danger" } as const;
