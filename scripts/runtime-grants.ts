import "dotenv/config";
import pg from "pg";
if (!process.env.MIGRATION_DATABASE_URL) throw new Error("Runtime grants require a one-off MIGRATION_DATABASE_URL.");
const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await client.connect();
try {
  // Role is created by the container initializer. Existing databases must provision it separately.
  await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO employee_runtime;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM employee_runtime;
    GRANT SELECT, INSERT, UPDATE ON users, employees, employment_periods, organization_settings, employee_documents, employee_activities, departments, positions, work_schedules, schedule_slots, attendance_sessions, attendance_corrections, overtime_reviews, calendar_days, leave_requests, notifications, compensation_rates, salary_periods, salary_calculations, salary_adjustments, preorders, performance_reviews, disciplinary_records, assets, asset_assignments, commission_rechecks, email_change_requests, task_assignments, weekly_earning_statements, shift_swap_requests, option_items, leave_allowances TO employee_runtime;
    GRANT SELECT, INSERT ON audit_logs TO employee_runtime;
    REVOKE ALL ON TABLE _prisma_migrations FROM employee_runtime;`);
  console.log("Runtime grants applied; audit history is append-only for the application role.");
} finally { await client.end(); }
