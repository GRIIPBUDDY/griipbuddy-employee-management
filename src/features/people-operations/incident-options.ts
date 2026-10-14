/** Client-safe catalog for employee incident & performance records. */
export const concernCategories = { WORK_QUALITY: "Work quality / mistake", ATTENDANCE: "Attendance", TASK_DEADLINE: "Task or deadline", CUSTOMER_SERVICE: "Customer service", POLICY_VIOLATION: "Policy violation", COMMUNICATION: "Communication", WORKPLACE_CONDUCT: "Workplace conduct", OTHER: "Other" } as const;
export const positiveCategories = { ACHIEVEMENT: "Achievement", EXCELLENT_PERFORMANCE: "Excellent performance", IMPROVEMENT: "Improvement", SUCCESSFUL_RESOLUTION: "Successful resolution" } as const;
export const incidentCategories = { ...concernCategories, ...positiveCategories } as const;
export type IncidentCategory = keyof typeof incidentCategories;
export const isPositive = (category: string) => category in positiveCategories;
/** Severity is the potential impact of a concern — never an automatic consequence. */
export const severities = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" } as const;
export const incidentStatuses = { DRAFT: "Draft", UNDER_REVIEW: "Under review", CONFIRMED: "Confirmed", DISPUTED: "Disputed", UNSUBSTANTIATED: "Unsubstantiated", RESOLVED: "Resolved", CLOSED: "Closed" } as const;
export type IncidentStatus = keyof typeof incidentStatuses;
export const decisions = ["CONFIRMED", "DISPUTED", "UNSUBSTANTIATED"] as const;
export const openStatuses: IncidentStatus[] = ["DRAFT", "UNDER_REVIEW", "CONFIRMED", "DISPUTED", "UNSUBSTANTIATED"];
export const correctiveActions = { COACHING: "Coaching", TRAINING: "Additional training", PROCESS_CORRECTION: "Process correction", VERBAL_DISCUSSION: "Verbal discussion (recorded internally)", FORMAL_NOTICE: "Formal notice", WARNING: "Warning", FURTHER_REVIEW: "Further review", OTHER: "Other action" } as const;
export const reference = (number: number) => `INC-${String(number).padStart(5, "0")}`;
