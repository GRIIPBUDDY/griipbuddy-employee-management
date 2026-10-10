import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/types/auth";

// Keep filtering in SQL so inaccessible sources never consume a page or unread count.
// The source resolver repeats these checks before returning any stored message.
export function visibleNotifications(actor: Actor) {
 const staff = actor.role === "ADMIN" || actor.role === "HR_MANAGER";
 const commissionStaff = actor.role === "ADMIN" || actor.role === "HR_MANAGER" && actor.canManageCommissions;
 return Prisma.sql`n.recipient_user_id = ${actor.userId}::uuid AND
  ((starts_with(n.event_type, 'STAFF_') AND ${staff}) OR
   (NOT starts_with(n.event_type, 'STAFF_') AND n.employee_id = ${actor.employeeId}::uuid)) AND (
  (n.source_type = 'performance_reviews' AND EXISTS (SELECT 1 FROM performance_reviews s WHERE s.id=n.source_id AND s.employee_id=n.employee_id AND (starts_with(n.event_type, 'STAFF_') OR s.published_at IS NOT NULL AND s.employee_visible))) OR
  (n.source_type = 'disciplinary_records' AND EXISTS (SELECT 1 FROM disciplinary_records s WHERE s.id=n.source_id AND s.employee_id=n.employee_id AND (starts_with(n.event_type, 'STAFF_') OR s.published_at IS NOT NULL AND s.employee_visible AND s.revoked_at IS NULL))) OR
  (n.source_type = 'asset_assignments' AND EXISTS (SELECT 1 FROM asset_assignments s WHERE s.id=n.source_id AND s.employee_id=n.employee_id)) OR
  (n.source_type = 'preorders' AND (starts_with(n.event_type, 'STAFF_') AND ${commissionStaff} OR NOT starts_with(n.event_type, 'STAFF_') AND ${actor.preorderCommissionEnabled}) AND EXISTS (SELECT 1 FROM preorders s WHERE s.id=n.source_id AND s.employee_id=n.employee_id)) OR
  (n.source_type = 'salary_calculations' AND EXISTS (SELECT 1 FROM salary_calculations s WHERE s.id=n.source_id AND s.employee_id=n.employee_id AND s.finalized_at IS NOT NULL)) OR
  (n.source_type = 'salary_periods' AND starts_with(n.event_type, 'STAFF_') AND EXISTS (SELECT 1 FROM salary_periods s WHERE s.id=n.source_id)) OR
  (n.source_type = 'attendance_corrections' AND EXISTS (SELECT 1 FROM attendance_corrections s WHERE s.id=n.source_id AND s.employee_id=n.employee_id)) OR
  (n.source_type = 'leave_requests' AND EXISTS (SELECT 1 FROM leave_requests s WHERE s.id=n.source_id AND s.employee_id=n.employee_id)) OR
  (n.source_type = 'overtime_reviews' AND EXISTS (SELECT 1 FROM overtime_reviews s WHERE s.id=n.source_id AND s.employee_id=n.employee_id)) OR
  (n.source_type = 'attendance_sessions' AND EXISTS (SELECT 1 FROM attendance_sessions s WHERE s.id=n.source_id AND s.employee_id=n.employee_id AND s.voided_at IS NULL)) OR
  (n.source_type = 'employee_documents' AND EXISTS (SELECT 1 FROM employee_documents s WHERE s.id=n.source_id AND s.employee_id=n.employee_id AND s.deleted_at IS NULL AND (starts_with(n.event_type, 'STAFF_') OR s.employee_visible AND NOT EXISTS (SELECT 1 FROM disciplinary_records w WHERE w.employee_id=s.employee_id AND w.attachment_document_id=s.id AND (w.published_at IS NULL OR NOT w.employee_visible OR w.revoked_at IS NOT NULL)))))
 )`;
}
