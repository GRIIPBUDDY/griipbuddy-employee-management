-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'HR_MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "CommissionRuleType" AS ENUM ('FIXED', 'PERCENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(100),
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "can_manage_commissions" BOOLEAN NOT NULL DEFAULT false,
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "temporary_password_expires_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "last_failed_login_at" TIMESTAMPTZ(3),
    "locked_until" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_number" VARCHAR(32) NOT NULL,
    "legal_name" VARCHAR(150) NOT NULL,
    "preferred_name" VARCHAR(100),
    "phone" VARCHAR(30),
    "address" VARCHAR(500),
    "emergency_contact" JSONB,
    "bank_details" JSONB,
    "preorder_commission_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_periods" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "department_label" VARCHAR(100) NOT NULL,
    "position_label" VARCHAR(100) NOT NULL,
    "end_reason" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employment_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "company_name" VARCHAR(150) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Dhaka',
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "early_checkin_minutes" INTEGER NOT NULL DEFAULT 10,
    "overtime_policy_versions" JSONB NOT NULL,
    "commission_rule_type" "CommissionRuleType" NOT NULL DEFAULT 'FIXED',
    "commission_rule_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rules_version" INTEGER NOT NULL DEFAULT 1,
    "changed_by" UUID NOT NULL,
    "last_successful_backup_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "employee_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(100),
    "event_time" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "request_id" UUID NOT NULL,
    "system_source" VARCHAR(80),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_number_key" ON "employees"("employee_number");

-- CreateIndex
CREATE INDEX "employees_legal_name_idx" ON "employees"("legal_name");

-- CreateIndex
CREATE INDEX "employment_periods_employee_id_start_date_idx" ON "employment_periods"("employee_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "employment_periods_id_employee_id_key" ON "employment_periods"("id", "employee_id");

-- CreateIndex
CREATE INDEX "audit_logs_employee_id_event_time_idx" ON "audit_logs"("employee_id", "event_time");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_event_time_idx" ON "audit_logs"("entity", "entity_id", "event_time");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_event_time_idx" ON "audit_logs"("actor_user_id", "event_time");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_periods" ADD CONSTRAINT "employment_periods_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_periods" ADD CONSTRAINT "employment_periods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Frozen invariants not representable in Prisma's schema language.
ALTER TABLE users ADD CONSTRAINT users_normalized_email CHECK (email = lower(btrim(email))),
  ADD CONSTRAINT users_hr_grant CHECK (NOT can_manage_commissions OR role = 'HR_MANAGER'),
  ADD CONSTRAINT users_session_version CHECK (session_version >= 1),
  ADD CONSTRAINT users_failed_logins CHECK (failed_login_count >= 0),
  ADD CONSTRAINT users_temporary_expiry CHECK (NOT must_change_password OR temporary_password_expires_at IS NOT NULL);
ALTER TABLE employment_periods ADD CONSTRAINT employment_positive_range CHECK (end_date IS NULL OR start_date < end_date),
  ADD CONSTRAINT employment_revision_positive CHECK (revision >= 1),
  ADD CONSTRAINT employment_periods_no_overlap EXCLUDE USING gist
    (employee_id WITH =, daterange(start_date, end_date, '[)') WITH &&);
CREATE UNIQUE INDEX employment_one_open_period ON employment_periods(employee_id) WHERE end_date IS NULL;
ALTER TABLE organization_settings ADD CONSTRAINT organization_singleton CHECK (id = 1),
  ADD CONSTRAINT organization_early_allowance CHECK (early_checkin_minutes BETWEEN 0 AND 60),
  ADD CONSTRAINT organization_rules_positive CHECK (rules_version >= 1),
  ADD CONSTRAINT organization_commission_value CHECK (commission_rule_value >= 0 AND (commission_rule_type <> 'PERCENT' OR commission_rule_value <= 100)),
  ADD CONSTRAINT organization_policy_array CHECK (jsonb_typeof(overtime_policy_versions) = 'array');
ALTER TABLE audit_logs ADD CONSTRAINT audit_has_source CHECK (actor_user_id IS NOT NULL OR system_source IS NOT NULL);

-- Identity links and historical subject IDs cannot be reassigned, even accidentally.
CREATE FUNCTION protect_foundation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'employees' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Employee account ownership is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'employment_periods' THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
      RAISE EXCEPTION 'Employment period ownership is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER employee_identity_immutable BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION protect_foundation_identity();
CREATE TRIGGER employment_identity_immutable BEFORE UPDATE ON employment_periods FOR EACH ROW EXECUTE FUNCTION protect_foundation_identity();

-- Also fail closed for an accidentally over-granted application role.
CREATE FUNCTION protect_audit_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only';
END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_history();
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
