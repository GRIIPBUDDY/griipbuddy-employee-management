-- Work-time accounting, performance targets and monthly ratings. Additive: three new tables and one settings column;
-- no existing row changes. Applied atomically: either every statement below takes effect or none does.
BEGIN;
-- Rating points deducted from the automated score per confirmed warning severity (Admin-configurable).
ALTER TABLE organization_settings ADD COLUMN warning_deductions JSONB NOT NULL
 DEFAULT '{"NOTICE":0.10,"WARNING":0.25,"SERIOUS_WARNING":0.50,"FINAL_WARNING":1.00}';

-- Observed time away from work while an employee stayed checked in. Only a CONFIRMED record removes its interval
-- from verified work; the interval is subtracted from the union of worked time, so it can never be deducted twice.
CREATE TABLE missing_time_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id UUID NOT NULL REFERENCES employees(id),
 attendance_session_id UUID REFERENCES attendance_sessions(id),
 work_date DATE NOT NULL,
 start_at TIMESTAMPTZ(0) NOT NULL,
 end_at TIMESTAMPTZ(0) NOT NULL,
 category VARCHAR(20) NOT NULL CHECK (category IN ('AWAY_FROM_WORK','EXTENDED_BREAK','PERSONAL_ERRAND','OTHER')),
 reason VARCHAR(1000) NOT NULL CHECK (length(btrim(reason))>0),
 evidence_note VARCHAR(2000) NOT NULL DEFAULT '',
 status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED')),
 reported_by UUID NOT NULL REFERENCES users(id),
 reviewed_by UUID REFERENCES users(id),
 reviewed_at TIMESTAMPTZ(3),
 decision_note VARCHAR(1000),
 employee_response VARCHAR(2000),
 responded_at TIMESTAMPTZ(3),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>=1),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT missing_time_interval CHECK (end_at>start_at AND end_at-start_at<=interval '24 hours'),
 CONSTRAINT missing_time_decision CHECK ((status='PENDING')=(reviewed_at IS NULL) AND (reviewed_at IS NULL)=(reviewed_by IS NULL) AND (reviewed_at IS NULL OR decision_note IS NOT NULL)),
 CONSTRAINT missing_time_response CHECK ((employee_response IS NULL)=(responded_at IS NULL)),
 -- One record per stretch of time: overlapping open or confirmed reports are refused.
 CONSTRAINT missing_time_no_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(start_at,end_at,'[)') WITH &&) WHERE (status<>'REJECTED')
);
CREATE INDEX missing_time_records_employee_idx ON missing_time_records(employee_id,start_at);
CREATE INDEX missing_time_records_status_idx ON missing_time_records(status,work_date);
CREATE FUNCTION protect_missing_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Missing-time records are retained; reject them instead'; END IF;
 IF NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id OR NEW.reported_by<>OLD.reported_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Missing-time identity/revision mismatch'; END IF;
 IF (NEW.start_at,NEW.end_at,NEW.work_date,NEW.attendance_session_id,NEW.category) IS DISTINCT FROM (OLD.start_at,OLD.end_at,OLD.work_date,OLD.attendance_session_id,OLD.category)
    AND NOT (OLD.status='PENDING' AND NEW.status='PENDING') THEN
  RAISE EXCEPTION 'Reopen the record before changing its time'; END IF;
 IF OLD.status<>'PENDING' AND NEW.status NOT IN (OLD.status,'PENDING') THEN RAISE EXCEPTION 'Reopen the record before a new decision'; END IF;
 IF OLD.responded_at IS NOT NULL AND (NEW.employee_response IS DISTINCT FROM OLD.employee_response OR NEW.responded_at IS DISTINCT FROM OLD.responded_at) THEN
  RAISE EXCEPTION 'An employee response is retained as submitted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER missing_time_history_guard BEFORE UPDATE OR DELETE ON missing_time_records FOR EACH ROW EXECUTE FUNCTION protect_missing_time();
-- Unfinished salary months covering the interval return to Draft; finalized months are never touched.
CREATE FUNCTION missing_time_pay_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE zone TEXT;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.status,NEW.start_at,NEW.end_at) IS NOT DISTINCT FROM (OLD.status,OLD.start_at,OLD.end_at) THEN RETURN NEW; END IF;
 SELECT timezone INTO zone FROM organization_settings WHERE id=1;
 IF zone IS NULL THEN RETURN NEW; END IF;
 PERFORM invalidate_pay_range(NEW.employee_id,
  LEAST((NEW.start_at AT TIME ZONE zone)::date,COALESCE((OLD.start_at AT TIME ZONE zone)::date,(NEW.start_at AT TIME ZONE zone)::date)),
  GREATEST((NEW.end_at AT TIME ZONE zone)::date,COALESCE((OLD.end_at AT TIME ZONE zone)::date,(NEW.end_at AT TIME ZONE zone)::date))+1);
 RETURN NEW;
END $$;
CREATE TRIGGER missing_time_salary_invalidation AFTER INSERT OR UPDATE ON missing_time_records FOR EACH ROW EXECUTE FUNCTION missing_time_pay_changed();

-- Measurable results expected in a week or a month, one row per employee (bulk assignment shares assignment_group).
-- period_end is the inclusive last day. A NULL actual_value means the result is still awaited, never zero.
CREATE TABLE performance_targets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id UUID NOT NULL REFERENCES employees(id),
 assignment_group UUID NOT NULL,
 title VARCHAR(150) NOT NULL CHECK (length(btrim(title))>0),
 description VARCHAR(2000) NOT NULL DEFAULT '',
 period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('WEEKLY','MONTHLY')),
 period_start DATE NOT NULL,
 period_end DATE NOT NULL,
 target_value NUMERIC(14,2) NOT NULL CHECK (target_value>0),
 unit VARCHAR(40) NOT NULL CHECK (length(btrim(unit))>0),
 actual_value NUMERIC(14,2) CHECK (actual_value IS NULL OR actual_value>=0),
 result_note VARCHAR(1000),
 result_recorded_by UUID REFERENCES users(id),
 result_recorded_at TIMESTAMPTZ(3),
 status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
 notes VARCHAR(1000) NOT NULL DEFAULT '',
 created_by UUID NOT NULL REFERENCES users(id),
 updated_by UUID NOT NULL REFERENCES users(id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>=1),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (employee_id,assignment_group),
 CONSTRAINT target_period CHECK (
  (period_type='WEEKLY' AND period_end=period_start+6) OR
  (period_type='MONTHLY' AND period_start=date_trunc('month',period_start)::date AND period_end=(date_trunc('month',period_start)+interval '1 month')::date-1)),
 CONSTRAINT target_result CHECK ((actual_value IS NULL)=(result_recorded_at IS NULL) AND (result_recorded_at IS NULL)=(result_recorded_by IS NULL))
);
CREATE INDEX performance_targets_employee_idx ON performance_targets(employee_id,period_end);
CREATE INDEX performance_targets_period_idx ON performance_targets(period_end,status);
CREATE FUNCTION protect_performance_targets() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Targets are retained; cancel them instead'; END IF;
 IF NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id OR NEW.assignment_group<>OLD.assignment_group OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Target identity/revision mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_targets_history_guard BEFORE UPDATE OR DELETE ON performance_targets FOR EACH ROW EXECUTE FUNCTION protect_performance_targets();

-- One assessment per employee and calendar month: a manual 0-5 score plus a 0-5 automated score. A finalized row is a
-- frozen snapshot (breakdown holds every input used); it changes only by an explicit, audited reopening.
CREATE TABLE performance_assessments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id UUID NOT NULL REFERENCES employees(id),
 month DATE NOT NULL CHECK (month=date_trunc('month',month)::date),
 status VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED')),
 manual_score NUMERIC(3,1) CHECK (manual_score IS NULL OR (manual_score BETWEEN 0 AND 5 AND manual_score*2=trunc(manual_score*2))),
 manual_comment VARCHAR(2000) NOT NULL DEFAULT '',
 private_note VARCHAR(2000) NOT NULL DEFAULT '',
 manual_by UUID REFERENCES users(id),
 manual_at TIMESTAMPTZ(3),
 automated_raw NUMERIC(4,2),
 warning_deduction NUMERIC(4,2),
 automated_final NUMERIC(4,2),
 total_score NUMERIC(4,2),
 breakdown JSONB,
 finalized_by UUID REFERENCES users(id),
 finalized_at TIMESTAMPTZ(3),
 reopen_reason VARCHAR(1000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>=1),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (employee_id,month),
 CONSTRAINT assessment_manual CHECK ((manual_score IS NULL)=(manual_at IS NULL) AND (manual_at IS NULL)=(manual_by IS NULL)),
 CONSTRAINT assessment_final CHECK ((status='FINALIZED')=(finalized_at IS NOT NULL) AND (finalized_at IS NULL)=(finalized_by IS NULL)
  AND (status<>'FINALIZED' OR (manual_score IS NOT NULL AND automated_raw IS NOT NULL AND warning_deduction IS NOT NULL AND automated_final IS NOT NULL AND total_score IS NOT NULL AND breakdown IS NOT NULL))),
 CONSTRAINT assessment_ranges CHECK ((automated_raw IS NULL OR automated_raw BETWEEN 0 AND 5) AND (automated_final IS NULL OR automated_final BETWEEN 0 AND 5)
  AND (warning_deduction IS NULL OR warning_deduction>=0) AND (total_score IS NULL OR total_score BETWEEN 0 AND 10)
  AND (status<>'FINALIZED' OR (automated_final=GREATEST(0,automated_raw-warning_deduction) AND total_score=manual_score+automated_final)))
);
CREATE INDEX performance_assessments_month_idx ON performance_assessments(month,status);
CREATE FUNCTION protect_performance_assessments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Assessments are retained'; END IF;
 IF NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id OR NEW.month<>OLD.month OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Assessment identity/revision mismatch'; END IF;
 IF OLD.status='FINALIZED' AND NEW.status='FINALIZED' THEN RAISE EXCEPTION 'A finalized assessment cannot change; reopen it with a reason'; END IF;
 IF OLD.status='FINALIZED' AND (NEW.reopen_reason IS NULL OR length(btrim(NEW.reopen_reason))=0
    OR NEW.manual_score IS DISTINCT FROM OLD.manual_score OR NEW.manual_comment<>OLD.manual_comment OR NEW.private_note<>OLD.private_note) THEN
  RAISE EXCEPTION 'Reopening keeps the recorded manual assessment and needs a reason'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_assessments_history_guard BEFORE UPDATE OR DELETE ON performance_assessments FOR EACH ROW EXECUTE FUNCTION protect_performance_assessments();
COMMIT;
