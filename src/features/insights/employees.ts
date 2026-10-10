import "server-only";
import { Prisma } from "@/generated/prisma/client";
// Current department matches the directory; inactive staff remain in historical reports.
export function employeeCte(today:string) {return Prisma.sql`employee_info AS (
 SELECT e.id AS employee_id,e.employee_number,e.legal_name AS employee_name,p.department_id,
 COALESCE(d.name,p.department_label,'—') AS department,COALESCE(j.name,p.position_label,'—') AS position,
 (SELECT min(start_date) FROM employment_periods WHERE employee_id=e.id) AS join_date,
 CASE WHEN NOT u.is_active THEN 'INACTIVE' WHEN EXISTS (SELECT 1 FROM employment_periods ep WHERE ep.employee_id=e.id AND ep.start_date<=${today}::date AND (ep.end_date IS NULL OR ep.end_date>${today}::date)) THEN 'ACTIVE'
 WHEN EXISTS (SELECT 1 FROM employment_periods ep WHERE ep.employee_id=e.id AND ep.start_date>${today}::date) THEN 'UPCOMING' ELSE 'INACTIVE' END AS employment_status
 FROM employees e JOIN users u ON u.id=e.user_id
 LEFT JOIN LATERAL (SELECT * FROM employment_periods ep WHERE ep.employee_id=e.id ORDER BY (ep.start_date<=${today}::date AND (ep.end_date IS NULL OR ep.end_date>${today}::date)) DESC,ep.start_date DESC,ep.id DESC LIMIT 1) p ON true
 LEFT JOIN departments d ON d.id=p.department_id LEFT JOIN positions j ON j.id=p.position_id
)`;}
