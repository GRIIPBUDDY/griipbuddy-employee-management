-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'SUSPENDED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "earnings_effective_from" DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
ADD COLUMN     "paid_leave_counts_for_base" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "standard_hours_versions" JSONB NOT NULL DEFAULT '[{"effectiveFrom":"1900-01-01","hours":48}]';

-- AlterTable
ALTER TABLE "compensation_rates" ADD COLUMN     "overtime_hourly_rate" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "salary_periods" ADD COLUMN     "calculation_method" VARCHAR(30) NOT NULL DEFAULT 'LEGACY_MONTHLY',
ADD COLUMN     "paid_at" TIMESTAMPTZ(3),
ADD COLUMN     "paid_by" UUID,
ADD COLUMN     "payment_note" VARCHAR(500),
ADD COLUMN     "payment_reference" VARCHAR(150),
ADD COLUMN     "payment_status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "salary_adjustments" ADD COLUMN     "corrects_weekly_statement_id" UUID,
ADD COLUMN     "earning_week_date" DATE,
ADD COLUMN     "included_weekly_statement_id" UUID;

-- AlterTable
ALTER TABLE "preorders" ADD COLUMN     "included_weekly_statement_id" UUID;

-- CreateTable
CREATE TABLE "commission_rechecks" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "preorder_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "explanation" VARCHAR(2000) NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "review_comment" VARCHAR(500),
    "resolved_at" TIMESTAMPTZ(3),
    "correction_adjustment_id" UUID,
    "operation_key" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rechecks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_change_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "previous_email" VARCHAR(254) NOT NULL,
    "new_email" VARCHAR(254) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "delivery_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "notice_delivered_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "session_version_snapshot" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "assigned_date" DATE NOT NULL,
    "due_date" DATE,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
    "created_by" UUID NOT NULL,
    "completion_note" VARCHAR(2000),
    "completed_at" TIMESTAMPTZ(3),
    "completed_by" UUID,
    "operation_key" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_earning_statements" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "week_start_date" DATE NOT NULL,
    "week_end_date" DATE NOT NULL,
    "timezone_snapshot" VARCHAR(100) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "calculation_snapshot" JSONB NOT NULL,
    "month_components" JSONB NOT NULL,
    "source_fingerprint" CHAR(64) NOT NULL,
    "base_amount" DECIMAL(18,2) NOT NULL,
    "overtime_amount" DECIMAL(18,2) NOT NULL,
    "commission_amount" DECIMAL(18,2) NOT NULL,
    "bonus_amount" DECIMAL(18,2) NOT NULL,
    "deduction_amount" DECIMAL(18,2) NOT NULL,
    "other_amount" DECIMAL(18,2) NOT NULL,
    "final_amount" DECIMAL(18,2) NOT NULL,
    "calculated_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "finalized_by" UUID,
    "finalized_at" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "weekly_earning_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_swap_requests" (
    "id" UUID NOT NULL,
    "requester_employee_id" UUID NOT NULL,
    "partner_employee_id" UUID NOT NULL,
    "requester_slot_id" UUID NOT NULL,
    "requester_date" DATE NOT NULL,
    "partner_slot_id" UUID NOT NULL,
    "partner_date" DATE NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'AWAITING_PARTNER',
    "reason" VARCHAR(500) NOT NULL,
    "partner_comment" VARCHAR(500),
    "review_comment" VARCHAR(500),
    "requested_by" UUID NOT NULL,
    "accepted_by" UUID,
    "accepted_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "operation_key" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_rechecks_operation_key_key" ON "commission_rechecks"("operation_key");

-- CreateIndex
CREATE INDEX "commission_rechecks_employee_id_status_created_at_idx" ON "commission_rechecks"("employee_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_change_requests_token_hash_key" ON "email_change_requests"("token_hash");

-- CreateIndex
CREATE INDEX "email_change_requests_user_id_status_created_at_idx" ON "email_change_requests"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "task_assignments_employee_id_assigned_date_idx" ON "task_assignments"("employee_id", "assigned_date");

-- CreateIndex
CREATE INDEX "task_assignments_due_date_status_idx" ON "task_assignments"("due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_employee_id_operation_key_key" ON "task_assignments"("employee_id", "operation_key");

-- CreateIndex
CREATE INDEX "weekly_earning_statements_week_start_date_status_idx" ON "weekly_earning_statements"("week_start_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_earning_statements_employee_id_week_start_date_key" ON "weekly_earning_statements"("employee_id", "week_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_earning_statements_id_employee_id_key" ON "weekly_earning_statements"("id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_swap_requests_operation_key_key" ON "shift_swap_requests"("operation_key");

-- CreateIndex
CREATE INDEX "shift_swap_requests_requester_employee_id_status_idx" ON "shift_swap_requests"("requester_employee_id", "status");

-- CreateIndex
CREATE INDEX "shift_swap_requests_partner_employee_id_status_idx" ON "shift_swap_requests"("partner_employee_id", "status");

-- Historical inactive accounts remain suspended. Existing formulas/snapshots are unchanged.
UPDATE users SET account_status='SUSPENDED' WHERE NOT is_active;
UPDATE organization_settings SET earnings_effective_from=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE timezone)::date;
ALTER TABLE compensation_rates ADD CHECK(overtime_hourly_rate IS NULL OR overtime_hourly_rate>=0);
ALTER TABLE salary_periods ADD FOREIGN KEY(paid_by) REFERENCES users(id),
 ADD CHECK(calculation_method IN ('LEGACY_MONTHLY','WEEKLY_ATTENDANCE')),
 ADD CHECK(payment_status IN ('UNPAID','PAID')),
 ADD CHECK((payment_status='PAID')=(paid_at IS NOT NULL AND paid_by IS NOT NULL)),
 ADD CHECK(payment_status<>'PAID' OR status='FINALIZED');
ALTER TABLE preorders ADD UNIQUE(id,employee_id);
ALTER TABLE commission_rechecks ADD FOREIGN KEY(preorder_id,employee_id) REFERENCES preorders(id,employee_id),
 ADD FOREIGN KEY(requested_by) REFERENCES users(id),ADD FOREIGN KEY(reviewed_by) REFERENCES users(id),
 ADD FOREIGN KEY(correction_adjustment_id) REFERENCES salary_adjustments(id),
 ADD CHECK(status IN ('PENDING','REJECTED','CONFIRMED','CORRECTED')),
 ADD CHECK((status='PENDING')=(resolved_at IS NULL)),ADD CHECK(status='PENDING' OR reviewed_by IS NOT NULL),
 ADD CHECK(length(trim(reason))>0);
CREATE UNIQUE INDEX one_pending_recheck ON commission_rechecks(preorder_id) WHERE status='PENDING';
ALTER TABLE email_change_requests ADD FOREIGN KEY(user_id) REFERENCES users(id),ADD FOREIGN KEY(requested_by) REFERENCES users(id),
 ADD CHECK(status IN ('PENDING','COMPLETED','CANCELLED')),ADD CHECK(expires_at>created_at),
 ADD CHECK((status='COMPLETED')=(completed_at IS NOT NULL));
ALTER TABLE task_assignments ADD FOREIGN KEY(employee_id) REFERENCES employees(id),ADD FOREIGN KEY(created_by) REFERENCES users(id),ADD FOREIGN KEY(completed_by) REFERENCES users(id),
 ADD CHECK(status IN ('ASSIGNED','IN_PROGRESS','COMPLETED')),ADD CHECK(priority IN ('LOW','NORMAL','HIGH')),
 ADD CHECK(due_date IS NULL OR due_date>=assigned_date),ADD CHECK(length(trim(title))>0),
 ADD CHECK((status='COMPLETED')=(completed_at IS NOT NULL AND completed_by IS NOT NULL));
ALTER TABLE weekly_earning_statements ADD FOREIGN KEY(employee_id) REFERENCES employees(id),ADD FOREIGN KEY(calculated_by) REFERENCES users(id),ADD FOREIGN KEY(reviewed_by) REFERENCES users(id),ADD FOREIGN KEY(finalized_by) REFERENCES users(id),
 ADD CHECK(week_end_date=week_start_date+7),ADD CHECK(status IN ('DRAFT','CALCULATED','REVIEWED','FINALIZED')),
 ADD CHECK((status='FINALIZED')=(finalized_at IS NOT NULL AND finalized_by IS NOT NULL)),
 ADD CHECK(status NOT IN ('REVIEWED','FINALIZED') OR reviewed_by IS NOT NULL),
 ADD CHECK(final_amount=base_amount+overtime_amount+commission_amount+bonus_amount+other_amount-deduction_amount),
 ADD CHECK(status<>'FINALIZED' OR final_amount>=0);
ALTER TABLE preorders ADD FOREIGN KEY(included_weekly_statement_id,employee_id) REFERENCES weekly_earning_statements(id,employee_id);
ALTER TABLE salary_adjustments ADD FOREIGN KEY(included_weekly_statement_id,employee_id) REFERENCES weekly_earning_statements(id,employee_id),
 ADD FOREIGN KEY(corrects_weekly_statement_id,employee_id) REFERENCES weekly_earning_statements(id,employee_id);
ALTER TABLE shift_swap_requests ADD FOREIGN KEY(requester_employee_id) REFERENCES employees(id),ADD FOREIGN KEY(partner_employee_id) REFERENCES employees(id),
 ADD FOREIGN KEY(requester_slot_id) REFERENCES schedule_slots(id),ADD FOREIGN KEY(partner_slot_id) REFERENCES schedule_slots(id),
 ADD FOREIGN KEY(requested_by) REFERENCES users(id),ADD FOREIGN KEY(accepted_by) REFERENCES users(id),ADD FOREIGN KEY(reviewed_by) REFERENCES users(id),
 ADD CHECK(requester_employee_id<>partner_employee_id),ADD CHECK(status IN ('AWAITING_PARTNER','ACCEPTED','DECLINED','REJECTED','APPROVED')),
 ADD CHECK(status NOT IN ('ACCEPTED','APPROVED') OR accepted_by IS NOT NULL AND accepted_at IS NOT NULL),
 ADD CHECK(status NOT IN ('REJECTED','APPROVED') OR reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL);
CREATE FUNCTION workforce_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Workforce history cannot be deleted';END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='weekly_earning_statements' THEN
   IF OLD.status='FINALIZED' THEN RAISE EXCEPTION 'Final weekly statement is immutable';END IF;
  ELSIF TG_TABLE_NAME='task_assignments' THEN
   IF OLD.status='COMPLETED' OR NEW.employee_id<>OLD.employee_id OR NEW.created_by<>OLD.created_by OR NEW.operation_key<>OLD.operation_key THEN RAISE EXCEPTION 'Task ownership and completion history are immutable';END IF;
  ELSIF TG_TABLE_NAME='commission_rechecks' THEN
   IF OLD.status<>'PENDING' OR NEW.preorder_id<>OLD.preorder_id OR NEW.employee_id<>OLD.employee_id OR NEW.requested_by<>OLD.requested_by OR NEW.reason<>OLD.reason OR NEW.operation_key<>OLD.operation_key THEN RAISE EXCEPTION 'Recheck request history is immutable';END IF;
  ELSIF TG_TABLE_NAME='shift_swap_requests' THEN
   IF OLD.status IN ('APPROVED','REJECTED','DECLINED') OR (to_jsonb(NEW)-ARRAY['status','partner_comment','review_comment','accepted_by','accepted_at','reviewed_by','reviewed_at','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','partner_comment','review_comment','accepted_by','accepted_at','reviewed_by','reviewed_at','revision']) THEN RAISE EXCEPTION 'Swap proposal identity and decisions are immutable';END IF;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Current workforce revision required';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workforce_week_guard BEFORE UPDATE OR DELETE ON weekly_earning_statements FOR EACH ROW EXECUTE FUNCTION workforce_history_guard();
CREATE TRIGGER workforce_task_guard BEFORE UPDATE OR DELETE ON task_assignments FOR EACH ROW EXECUTE FUNCTION workforce_history_guard();
CREATE TRIGGER workforce_recheck_guard BEFORE UPDATE OR DELETE ON commission_rechecks FOR EACH ROW EXECUTE FUNCTION workforce_history_guard();
CREATE TRIGGER workforce_swap_guard BEFORE UPDATE OR DELETE ON shift_swap_requests FOR EACH ROW EXECUTE FUNCTION workforce_history_guard();
-- Synchronize the established active flag so legacy account/offboarding writers revoke access.
CREATE FUNCTION synchronize_account_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.account_status<>OLD.account_status THEN NEW.is_active:=NEW.account_status<>'SUSPENDED';
  ELSIF NEW.is_active<>OLD.is_active THEN NEW.account_status:=CASE WHEN NEW.is_active THEN 'ACTIVE'::"AccountStatus" ELSE 'SUSPENDED'::"AccountStatus" END;END IF;
 END IF;
 IF NOT NEW.is_active THEN NEW.account_status:='SUSPENDED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_status_sync BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION synchronize_account_status();
CREATE OR REPLACE FUNCTION protect_pay_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p salary_periods%ROWTYPE;e employment_periods%ROWTYPE;a users%ROWTYPE;original salary_calculations%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Compensation history cannot be deleted';END IF;
 IF TG_TABLE_NAME='compensation_rates' THEN
  IF TG_OP='UPDATE' AND (OLD.superseded_at IS NOT NULL OR NEW.revision<>OLD.revision+1 OR NEW.superseded_at IS NULL OR
   (to_jsonb(NEW)-ARRAY['superseded_at','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['superseded_at','revision','updated_at'])) THEN RAISE EXCEPTION 'Replace compensation with retained version segments';END IF;
  SELECT * INTO e FROM employment_periods WHERE id=NEW.employment_period_id AND employee_id=NEW.employee_id;
  IF NEW.currency<>(SELECT currency FROM organization_settings WHERE id=1) OR (TG_OP='INSERT' AND (NEW.effective_from<e.start_date OR e.end_date IS NOT NULL AND (NEW.effective_until IS NULL OR NEW.effective_until>e.end_date))) THEN RAISE EXCEPTION 'Rate currency/employment coverage mismatch';END IF;
 ELSIF TG_TABLE_NAME='salary_periods' THEN
  IF TG_OP='UPDATE' AND ((OLD.status='FINALIZED' AND NOT (OLD.payment_status='UNPAID' AND NEW.payment_status='PAID' AND (to_jsonb(NEW)-ARRAY['payment_status','paid_at','paid_by','payment_reference','payment_note','updated_at'])=(to_jsonb(OLD)-ARRAY['payment_status','paid_at','paid_by','payment_reference','payment_note','updated_at']))) OR NEW.id<>OLD.id OR NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date OR NEW.currency<>OLD.currency OR NEW.timezone_snapshot<>OLD.timezone_snapshot OR NEW.created_by<>OLD.created_by OR NEW.calculation_method<>OLD.calculation_method) THEN RAISE EXCEPTION 'Salary period identity/finalization is immutable';END IF;
  IF NEW.status IN ('APPROVED','FINALIZED') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=CASE WHEN NEW.status='APPROVED' THEN NEW.approved_by ELSE NEW.finalized_by END AND u.is_active AND (u.role='ADMIN' OR u.role='HR_MANAGER' AND NOT EXISTS(SELECT 1 FROM salary_calculations c JOIN employees pay_employee ON pay_employee.id=c.employee_id WHERE c.salary_period_id=NEW.id AND pay_employee.user_id=u.id))) THEN RAISE EXCEPTION 'Distinct authorized salary approval/finalization required';END IF;
 ELSIF TG_TABLE_NAME='salary_calculations' THEN
  SELECT * INTO p FROM salary_periods WHERE id=NEW.salary_period_id;
  IF TG_OP='UPDATE' AND (OLD.finalized_at IS NOT NULL OR NEW.employee_id<>OLD.employee_id OR NEW.salary_period_id<>OLD.salary_period_id) OR p.status='FINALIZED' THEN RAISE EXCEPTION 'Finalized salary statement is immutable';END IF;
  IF NEW.input_revision<>p.input_revision THEN RAISE EXCEPTION 'Calculation input revision is stale';END IF;
  IF NEW.finalized_at IS NOT NULL AND (p.status<>'APPROVED' OR current_setting('app.salary_finalizing',true) IS DISTINCT FROM p.id::text OR NEW.final_amount<0) THEN RAISE EXCEPTION 'Verified approval context required to finalize';END IF;
 ELSIF TG_TABLE_NAME IN ('salary_adjustments','preorders') THEN
  IF TG_OP='UPDATE' THEN
   IF OLD.included_salary_calculation_id IS NOT NULL OR NEW.employee_id<>OLD.employee_id OR NEW.created_by<>OLD.created_by OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Included compensation sources and identities are immutable';END IF;
   IF TG_TABLE_NAME='salary_adjustments' THEN
   IF (NEW.commission_related<>OLD.commission_related OR NEW.corrects_salary_calculation_id IS DISTINCT FROM OLD.corrects_salary_calculation_id OR NEW.operation_key<>OLD.operation_key OR NEW.salary_period_id<>OLD.salary_period_id OR NEW.type<>OLD.type) THEN RAISE EXCEPTION 'Adjustment classification/target is immutable';END IF;END IF;
  END IF;
  IF NEW.included_weekly_statement_id IS NOT NULL THEN
   IF TG_OP='UPDATE' AND OLD.included_weekly_statement_id IS NULL AND (to_jsonb(NEW)-ARRAY['included_weekly_statement_id','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['included_weekly_statement_id','revision','updated_at']) THEN RAISE EXCEPTION 'Immutable weekly source inclusion required';END IF;
   IF NOT EXISTS(SELECT 1 FROM weekly_earning_statements WHERE id=NEW.included_weekly_statement_id AND employee_id=NEW.employee_id AND status='FINALIZED') THEN RAISE EXCEPTION 'Final own weekly claim required';END IF;
   IF TG_OP='UPDATE' AND OLD.included_weekly_statement_id IS NOT NULL AND (NEW.included_salary_calculation_id IS NULL OR (to_jsonb(NEW)-ARRAY['included_salary_calculation_id','included_at','status','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['included_salary_calculation_id','included_at','status','revision','updated_at'])) THEN RAISE EXCEPTION 'Frozen weekly source cannot be changed';END IF;
  END IF;
  IF NEW.salary_period_id IS NOT NULL THEN
   SELECT * INTO p FROM salary_periods WHERE id=NEW.salary_period_id;
   IF p.status='FINALIZED' THEN RAISE EXCEPTION 'Cannot change sources assigned to finalized salary';END IF;
  END IF;
  IF NEW.included_salary_calculation_id IS NOT NULL THEN
   IF TG_OP<>'UPDATE' OR OLD.status<>'APPROVED' OR p.status<>'APPROVED' OR current_setting('app.salary_finalizing',true) IS DISTINCT FROM p.id::text OR
    (to_jsonb(NEW)-ARRAY['included_salary_calculation_id','included_at','status','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['included_salary_calculation_id','included_at','status','revision','updated_at']) THEN RAISE EXCEPTION 'Verified immutable source inclusion required';END IF;
  END IF;
  IF TG_TABLE_NAME='salary_adjustments' THEN
  IF NEW.corrects_salary_calculation_id IS NOT NULL THEN
   SELECT * INTO original FROM salary_calculations WHERE id=NEW.corrects_salary_calculation_id AND employee_id=NEW.employee_id;
   IF original.finalized_at IS NULL OR NEW.salary_period_id=original.salary_period_id OR (NEW.status='APPROVED' AND NEW.reconciliation_snapshot IS NULL) THEN RAISE EXCEPTION 'Correction must reconcile a prior finalized own statement';END IF;
   IF (original.calculation_snapshot->>'commissionRelated')::boolean AND NOT NEW.commission_related THEN RAISE EXCEPTION 'Commission-derived correction cannot lose its classification';END IF;
  END IF;END IF;
  IF NEW.approved_by IS NOT NULL AND NEW.status IN ('APPROVED','REJECTED','INCLUDED') THEN
   SELECT * INTO a FROM users WHERE id=NEW.approved_by;
   IF NOT a.is_active OR NOT (a.role='ADMIN' OR a.role='HR_MANAGER' AND NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND user_id=a.id)) THEN RAISE EXCEPTION 'Authorized non-self adjustment reviewer required';END IF;
   IF (TG_TABLE_NAME='preorders' OR (to_jsonb(NEW)->>'commission_related')::boolean) AND NOT (a.role='ADMIN' OR a.role='HR_MANAGER' AND a.can_manage_commissions) THEN RAISE EXCEPTION 'Commission management permission required';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE c record;BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='attendance_sessions'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%source%SELF%CORRECTION%' LOOP
 EXECUTE format('ALTER TABLE attendance_sessions DROP CONSTRAINT %I',c.conname);END LOOP;
END $$;
ALTER TABLE attendance_sessions ADD CHECK(source IN ('SELF','CORRECTION','UNSCHEDULED')),
 ADD CHECK(source<>'UNSCHEDULED' OR schedule_slot_id IS NULL AND scheduled_start_at IS NULL AND scheduled_end_at IS NULL AND earliest_checkin_at IS NULL AND checkin_operation_key IS NOT NULL);
CREATE OR REPLACE FUNCTION protect_attendance_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal attendance_corrections%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Attendance history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['checkout_at','checkout_operation_key','revision','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkout_at','checkout_operation_key','revision','updated_at']) AND OLD.checkout_at IS NULL AND OLD.voided_at IS NULL AND NEW.checkout_at IS NOT NULL AND NEW.checkout_operation_key IS NOT NULL AND NEW.revision=OLD.revision+1 THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.source IN ('SELF','UNSCHEDULED') THEN RETURN NEW; END IF;
 SELECT * INTO proposal FROM attendance_corrections WHERE id=NULLIF(current_setting('app.attendance_correction',true),'')::uuid AND status='PENDING';
 IF NOT FOUND OR proposal.employee_id<>NEW.employee_id OR proposal.employment_period_id<>NEW.employment_period_id THEN RAISE EXCEPTION 'Matching pending correction context is required'; END IF;
 IF TG_OP='INSERT' THEN
  IF proposal.type<>'ADD' OR NEW.source<>'CORRECTION' THEN RAISE EXCEPTION 'ADD proposal required'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['checkin_at','checkout_at','schedule_slot_id','work_date','source','revision','updated_at','voided_at','void_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkin_at','checkout_at','schedule_slot_id','work_date','source','revision','updated_at','voided_at','void_reason']) THEN RAISE EXCEPTION 'Original recording snapshots and provenance are immutable'; END IF;
  IF proposal.session_id<>OLD.id OR proposal.target_revision<>OLD.revision OR NEW.revision<>OLD.revision+1 OR OLD.voided_at IS NOT NULL OR
   NEW.employee_id<>OLD.employee_id OR NEW.employment_period_id<>OLD.employment_period_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR
   NEW.checkin_operation_key IS DISTINCT FROM OLD.checkin_operation_key OR NEW.checkout_operation_key IS DISTINCT FROM OLD.checkout_operation_key THEN RAISE EXCEPTION 'Stale correction or immutable provenance'; END IF;
 END IF;
 IF proposal.type='VOID' THEN
  IF NEW.voided_at IS NULL OR NEW.void_reason<>proposal.reason OR (to_jsonb(NEW)-ARRAY['voided_at','void_reason','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['voided_at','void_reason','revision','updated_at']) THEN RAISE EXCEPTION 'Invalid VOID'; END IF;
 ELSE
  IF NEW.source<>'CORRECTION' THEN RAISE EXCEPTION 'Approved changed facts require correction source'; END IF;
  IF NEW.checkin_at IS DISTINCT FROM proposal.proposed_checkin_at OR NEW.checkout_at IS DISTINCT FROM proposal.proposed_checkout_at OR NEW.work_date<>proposal.work_date OR NEW.schedule_slot_id IS DISTINCT FROM proposal.schedule_slot_id OR NEW.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Fact does not match proposal'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION payment_authority_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payment_status='PAID' AND (TG_OP='INSERT' OR OLD.payment_status<>'PAID') THEN
  IF NOT EXISTS(SELECT 1 FROM users u WHERE u.id=NEW.paid_by AND u.is_active AND (u.role='ADMIN' OR u.role='HR_MANAGER' AND NOT EXISTS(SELECT 1 FROM salary_calculations c JOIN employees pay_employee ON pay_employee.id=c.employee_id WHERE c.salary_period_id=NEW.id AND pay_employee.user_id=u.id))) THEN RAISE EXCEPTION 'Authorized payment recording required';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER payment_authority_guard BEFORE INSERT OR UPDATE ON salary_periods FOR EACH ROW EXECUTE FUNCTION payment_authority_guard();
