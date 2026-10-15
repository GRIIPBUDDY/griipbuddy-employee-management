/** Client-safe labels for missing-time records. */
export const missingTimeCategories = { AWAY_FROM_WORK: "Away from work", EXTENDED_BREAK: "Extended break", PERSONAL_ERRAND: "Personal errand", OTHER: "Other" } as const;
export type MissingTimeCategory = keyof typeof missingTimeCategories;
export const missingTimeStatuses = { PENDING: "Pending review", CONFIRMED: "Confirmed", REJECTED: "Rejected" } as const;
export type MissingTimeStatus = keyof typeof missingTimeStatuses;
