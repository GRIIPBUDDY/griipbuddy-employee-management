-- Additive compensation outputs. Existing source facts and migrations are retained.
CREATE TABLE compensation_rates (
 id UUID PRIMARY KEY,employee_id UUID NOT NULL REFERENCES employees(id),employment_period_id UUID NOT NULL,
 effective_from DATE NOT NULL,effective_until DATE,superseded_at TIMESTAMPTZ(3),pay_type VARCHAR(20) NOT NULL CHECK(pay_type IN ('MONTHLY','HOURLY','DAILY')),
 base_amount NUMERIC(18,4) NOT NULL CHECK(base_amount>=0),currency CHAR(3) NOT NULL,overtime_hourly_equivalent NUMERIC(18,4) CHECK(overtime_hourly_equivalent>=0),
 overtime_multiplier NUMERIC(8,4) NOT NULL DEFAULT 1 CHECK(overtime_multiplier BETWEEN 1 AND 100),change_reason VARCHAR(500) NOT NULL CHECK(length(trim(change_reason))>0),
 created_by UUID NOT NULL REFERENCES users(id),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id),CHECK(effective_until IS NULL OR effective_until>effective_from),CHECK(pay_type<>'HOURLY' OR overtime_hourly_equivalent IS NULL),
 EXCLUDE USING gist(employee_id WITH =,daterange(effective_from,effective_until,'[)') WITH &&) WHERE(superseded_at IS NULL)
);
CREATE INDEX compensation_rates_employee_id_effective_from_idx ON compensation_rates(employee_id,effective_from);
CREATE TABLE salary_periods (
 id UUID PRIMARY KEY,start_date DATE NOT NULL UNIQUE,end_date DATE NOT NULL,timezone_snapshot VARCHAR(100) NOT NULL,currency CHAR(3) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','CALCULATED','REVIEWED','APPROVED','FINALIZED')),input_revision INTEGER NOT NULL DEFAULT 1 CHECK(input_revision>0),calculated_input_revision INTEGER,
 created_by UUID NOT NULL REFERENCES users(id),calculated_by UUID REFERENCES users(id),calculated_at TIMESTAMPTZ(3),reviewed_by UUID REFERENCES users(id),reviewed_at TIMESTAMPTZ(3),approved_by UUID REFERENCES users(id),approved_at TIMESTAMPTZ(3),finalized_by UUID REFERENCES users(id),finalized_at TIMESTAMPTZ(3),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL,
 CHECK(start_date=date_trunc('month',start_date)::date AND end_date=(start_date+INTERVAL '1 month')::date),
 CHECK(status='DRAFT' OR calculated_input_revision=input_revision),CHECK(status NOT IN ('REVIEWED','APPROVED','FINALIZED') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(status NOT IN ('APPROVED','FINALIZED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),CHECK((status='FINALIZED')=(finalized_at IS NOT NULL)),CHECK(status<>'FINALIZED' OR finalized_by IS NOT NULL)
);
CREATE TABLE salary_calculations (
 id UUID PRIMARY KEY,employee_id UUID NOT NULL REFERENCES employees(id),salary_period_id UUID NOT NULL REFERENCES salary_periods(id),input_revision INTEGER NOT NULL,
 base_amount NUMERIC(18,2) NOT NULL CHECK(base_amount>=0),overtime_amount NUMERIC(18,2) NOT NULL CHECK(overtime_amount>=0),commission_amount NUMERIC(18,2) NOT NULL CHECK(commission_amount>=0),bonus_amount NUMERIC(18,2) NOT NULL CHECK(bonus_amount>=0),deduction_amount NUMERIC(18,2) NOT NULL CHECK(deduction_amount>=0),other_amount NUMERIC(18,2) NOT NULL,final_amount NUMERIC(18,2) NOT NULL,
 calculation_snapshot JSONB NOT NULL,calculated_by UUID NOT NULL REFERENCES users(id),calculated_at TIMESTAMPTZ(3) NOT NULL,finalized_at TIMESTAMPTZ(3),
 UNIQUE(employee_id,salary_period_id),UNIQUE(id,employee_id),UNIQUE(id,employee_id,salary_period_id),CHECK(final_amount=base_amount+overtime_amount+commission_amount+bonus_amount+other_amount-deduction_amount),CHECK(calculation_snapshot->>'formatVersion'='1')
);
CREATE TABLE salary_adjustments (
 id UUID PRIMARY KEY,employee_id UUID NOT NULL REFERENCES employees(id),salary_period_id UUID NOT NULL REFERENCES salary_periods(id),included_salary_calculation_id UUID,
 type VARCHAR(20) NOT NULL CHECK(type IN ('BONUS','DEDUCTION','OTHER','CORRECTION')),amount NUMERIC(18,2) NOT NULL,reason VARCHAR(500) NOT NULL CHECK(length(trim(reason))>0),status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 commission_related BOOLEAN NOT NULL DEFAULT false,corrects_salary_calculation_id UUID,reconciliation_snapshot JSONB,created_by UUID NOT NULL REFERENCES users(id),approved_by UUID REFERENCES users(id),approved_at TIMESTAMPTZ(3),review_comment VARCHAR(500),operation_key UUID NOT NULL UNIQUE,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(corrects_salary_calculation_id,employee_id) REFERENCES salary_calculations(id,employee_id),FOREIGN KEY(included_salary_calculation_id,employee_id,salary_period_id) REFERENCES salary_calculations(id,employee_id,salary_period_id),
 CHECK(type NOT IN ('BONUS','DEDUCTION') OR amount>=0),CHECK((type='CORRECTION')=(corrects_salary_calculation_id IS NOT NULL)),CHECK(status='PENDING' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),CHECK(included_salary_calculation_id IS NULL OR status='APPROVED')
);
CREATE INDEX salary_adjustments_employee_id_salary_period_id_status_idx ON salary_adjustments(employee_id,salary_period_id,status);
CREATE UNIQUE INDEX one_unsettled_reconciliation ON salary_adjustments(corrects_salary_calculation_id) WHERE corrects_salary_calculation_id IS NOT NULL AND included_salary_calculation_id IS NULL AND status<>'REJECTED';
CREATE TABLE preorders (
 id UUID PRIMARY KEY,employee_id UUID NOT NULL REFERENCES employees(id),employment_period_id UUID NOT NULL,reference VARCHAR(100) NOT NULL UNIQUE CHECK(reference=upper(trim(reference)) AND length(reference)>0),order_at TIMESTAMPTZ(3) NOT NULL,order_value NUMERIC(18,4) CHECK(order_value>=0),currency CHAR(3) NOT NULL,
 commission_type VARCHAR(20) NOT NULL CHECK(commission_type IN ('FIXED','PERCENT')),commission_value NUMERIC(18,4) NOT NULL CHECK(commission_value>=0),policy_version INTEGER NOT NULL CHECK(policy_version>0),commission_amount NUMERIC(18,2) NOT NULL CHECK(commission_amount>=0),eligibility_evidence_id UUID NOT NULL REFERENCES audit_logs(id),
 salary_period_id UUID REFERENCES salary_periods(id),included_salary_calculation_id UUID,status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED','INCLUDED')),
 created_by UUID NOT NULL REFERENCES users(id),approved_by UUID REFERENCES users(id),approved_at TIMESTAMPTZ(3),included_at TIMESTAMPTZ(3),reason VARCHAR(500) NOT NULL,review_comment VARCHAR(500),revision INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id),FOREIGN KEY(included_salary_calculation_id,employee_id,salary_period_id) REFERENCES salary_calculations(id,employee_id,salary_period_id),
 CHECK(commission_type<>'PERCENT' OR (order_value IS NOT NULL AND commission_value<=100)),CHECK(commission_amount=round(CASE WHEN commission_type='FIXED' THEN commission_value ELSE order_value*commission_value/100 END,2)),
 CHECK(status NOT IN ('APPROVED','REJECTED','INCLUDED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),CHECK((status='INCLUDED')=(included_salary_calculation_id IS NOT NULL)),CHECK(status<>'INCLUDED' OR (salary_period_id IS NOT NULL AND included_at IS NOT NULL))
);
CREATE INDEX preorders_employee_id_order_at_idx ON preorders(employee_id,order_at);
CREATE INDEX preorders_status_salary_period_id_idx ON preorders(status,salary_period_id);
CREATE FUNCTION protect_pay_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p salary_periods%ROWTYPE;e employment_periods%ROWTYPE;a users%ROWTYPE;original salary_calculations%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Compensation history cannot be deleted';END IF;
 IF TG_TABLE_NAME='compensation_rates' THEN
  IF TG_OP='UPDATE' AND (OLD.superseded_at IS NOT NULL OR NEW.revision<>OLD.revision+1 OR NEW.superseded_at IS NULL OR
   (to_jsonb(NEW)-ARRAY['superseded_at','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['superseded_at','revision','updated_at'])) THEN RAISE EXCEPTION 'Replace compensation with retained version segments';END IF;
  SELECT * INTO e FROM employment_periods WHERE id=NEW.employment_period_id AND employee_id=NEW.employee_id;
  IF NEW.currency<>(SELECT currency FROM organization_settings WHERE id=1) OR (TG_OP='INSERT' AND (NEW.effective_from<e.start_date OR e.end_date IS NOT NULL AND (NEW.effective_until IS NULL OR NEW.effective_until>e.end_date))) THEN RAISE EXCEPTION 'Rate currency/employment coverage mismatch';END IF;
 ELSIF TG_TABLE_NAME='salary_periods' THEN
  IF TG_OP='UPDATE' AND (OLD.status='FINALIZED' OR NEW.id<>OLD.id OR NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date OR NEW.currency<>OLD.currency OR NEW.timezone_snapshot<>OLD.timezone_snapshot OR NEW.created_by<>OLD.created_by) THEN RAISE EXCEPTION 'Salary period identity/finalization is immutable';END IF;
  IF NEW.status IN ('APPROVED','FINALIZED') AND NOT EXISTS(SELECT 1 FROM users WHERE id=CASE WHEN NEW.status='APPROVED' THEN NEW.approved_by ELSE NEW.finalized_by END AND is_active AND role='ADMIN') THEN RAISE EXCEPTION 'Admin salary approval/finalization required';END IF;
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
CREATE TRIGGER rates_history_guard BEFORE INSERT OR UPDATE OR DELETE ON compensation_rates FOR EACH ROW EXECUTE FUNCTION protect_pay_history();
CREATE TRIGGER salary_period_history_guard BEFORE INSERT OR UPDATE OR DELETE ON salary_periods FOR EACH ROW EXECUTE FUNCTION protect_pay_history();
CREATE TRIGGER salary_calculation_history_guard BEFORE INSERT OR UPDATE OR DELETE ON salary_calculations FOR EACH ROW EXECUTE FUNCTION protect_pay_history();
CREATE TRIGGER salary_adjustment_history_guard BEFORE INSERT OR UPDATE OR DELETE ON salary_adjustments FOR EACH ROW EXECUTE FUNCTION protect_pay_history();
CREATE TRIGGER preorder_history_guard BEFORE INSERT OR UPDATE OR DELETE ON preorders FOR EACH ROW EXECUTE FUNCTION protect_pay_history();
-- Every existing source writer already takes the shared pay/authorization lock. Triggers cover
-- both known rows and new roster/source insertions; boundary weeks invalidate both months.
CREATE FUNCTION invalidate_pay_range(subject UUID,from_date DATE,until_date DATE,exact_period UUID DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE zone TEXT;first_day INTEGER;left_date DATE;right_date DATE;changed_period RECORD;c RECORD;actor UUID;
BEGIN
 SELECT timezone,week_start_day INTO zone,first_day FROM organization_settings WHERE id=1;
 actor:=NULLIF(current_setting('app.actor_user_id',true),'')::uuid;
 left_date:=from_date-((extract(isodow FROM from_date)::integer-first_day+7)%7);
 right_date:=CASE WHEN until_date IS NULL THEN 'infinity'::date ELSE until_date+7 END;
 FOR changed_period IN SELECT id,input_revision,status FROM salary_periods WHERE status<>'FINALIZED' AND (id=exact_period OR exact_period IS NULL AND start_date<right_date AND end_date>left_date) ORDER BY id FOR UPDATE LOOP
  UPDATE salary_periods SET input_revision=input_revision+1,status='DRAFT',calculated_input_revision=NULL,calculated_by=NULL,calculated_at=NULL,reviewed_by=NULL,reviewed_at=NULL,approved_by=NULL,approved_at=NULL,updated_at=clock_timestamp() WHERE id=changed_period.id;
  INSERT INTO audit_logs(id,actor_user_id,employee_id,action,entity,entity_id,event_time,system_source,request_id,before,after)
   VALUES(gen_random_uuid(),actor,subject,'SALARY_INPUTS_CHANGED','salary_periods',changed_period.id,clock_timestamp(),CASE WHEN actor IS NULL THEN 'pay-input-trigger' ELSE NULL END,gen_random_uuid(),jsonb_build_object('inputRevision',changed_period.input_revision,'status',changed_period.status),jsonb_build_object('inputRevision',changed_period.input_revision+1,'status','DRAFT'));
 END LOOP;
 -- Outstanding post-final reconciliations also depend on their original historical month.
 IF exact_period IS NULL THEN
  FOR c IN SELECT a.id FROM salary_adjustments a JOIN salary_calculations sc ON sc.id=a.corrects_salary_calculation_id JOIN salary_periods p ON p.id=sc.salary_period_id
    WHERE a.included_salary_calculation_id IS NULL AND a.status<>'REJECTED' AND (subject IS NULL OR a.employee_id=subject) AND p.start_date<right_date AND p.end_date>left_date AND a.reconciliation_snapshot IS NOT NULL ORDER BY a.id LOOP
   UPDATE salary_adjustments SET status='PENDING',approved_by=NULL,approved_at=NULL,review_comment=NULL,reconciliation_snapshot=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE id=c.id;
  END LOOP;
 END IF;
END $$;
CREATE FUNCTION pay_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j JSONB;o JSONB;subject UUID;from_date DATE;until_date DATE;old_from DATE;zone TEXT;target UUID;target_start TIMESTAMPTZ;target_end TIMESTAMPTZ;
BEGIN
 j:=to_jsonb(NEW);o:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 SELECT timezone INTO zone FROM organization_settings WHERE id=1;
 IF zone IS NULL THEN RETURN NEW;END IF;
 subject:=NULLIF(j->>'employee_id','')::uuid;
 IF TG_TABLE_NAME IN ('salary_adjustments','preorders') THEN
  IF j->>'included_salary_calculation_id' IS NOT NULL THEN RETURN NEW;END IF;
  target:=NULLIF(j->>'salary_period_id','')::uuid;
  IF target IS NOT NULL THEN PERFORM invalidate_pay_range(subject,NULL,NULL,target);END IF;
  IF TG_OP='UPDATE' AND o->>'salary_period_id' IS DISTINCT FROM j->>'salary_period_id' AND o->>'salary_period_id' IS NOT NULL THEN PERFORM invalidate_pay_range(subject,NULL,NULL,(o->>'salary_period_id')::uuid);END IF;
  -- Newly unassigned orders are blockers for old unpaid months too.
  IF TG_TABLE_NAME='preorders' AND target IS NULL THEN from_date:=((j->>'order_at')::timestamptz AT TIME ZONE zone)::date;PERFORM invalidate_pay_range(subject,from_date,NULL);END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='attendance_sessions' THEN
  from_date:=((j->>'checkin_at')::timestamptz AT TIME ZONE zone)::date;old_from:=((o->>'checkin_at')::timestamptz AT TIME ZONE zone)::date;from_date:=LEAST(from_date,old_from);
  until_date:=CASE WHEN j->>'checkout_at' IS NULL OR TG_OP='UPDATE' AND o->>'checkout_at' IS NULL THEN NULL ELSE GREATEST(((j->>'checkout_at')::timestamptz AT TIME ZONE zone)::date,((o->>'checkout_at')::timestamptz AT TIME ZONE zone)::date)+1 END;
 ELSIF TG_TABLE_NAME='attendance_corrections' THEN
  from_date:=LEAST((j->>'work_date')::date,((j->>'proposed_checkin_at')::timestamptz AT TIME ZONE zone)::date);until_date:=GREATEST((j->>'work_date')::date+1,((j->>'proposed_checkout_at')::timestamptz AT TIME ZONE zone)::date+1);
  IF j->>'session_id' IS NOT NULL THEN
   SELECT checkin_at,checkout_at INTO target_start,target_end FROM attendance_sessions WHERE id=(j->>'session_id')::uuid;
   from_date:=LEAST(from_date,(target_start AT TIME ZONE zone)::date);until_date:=CASE WHEN target_end IS NULL THEN NULL ELSE GREATEST(until_date,(target_end AT TIME ZONE zone)::date+1) END;
  END IF;
 ELSIF TG_TABLE_NAME='leave_requests' THEN
  from_date:=((j->>'start_at')::timestamptz AT TIME ZONE zone)::date;until_date:=((j->>'end_at')::timestamptz AT TIME ZONE zone)::date+1;
 ELSIF TG_TABLE_NAME='overtime_reviews' THEN from_date:=(j->>'week_start_date')::date;until_date:=from_date+7;
 ELSIF TG_TABLE_NAME='calendar_days' THEN from_date:=(j->>'local_date')::date;until_date:=from_date+1;
 ELSIF TG_TABLE_NAME IN ('work_schedules','compensation_rates') THEN
  from_date:=LEAST((j->>'effective_from')::date,(o->>'effective_from')::date);until_date:=CASE WHEN j->>'effective_until' IS NULL OR TG_OP='UPDATE' AND o->>'effective_until' IS NULL THEN NULL ELSE GREATEST((j->>'effective_until')::date,(o->>'effective_until')::date) END;
 ELSIF TG_TABLE_NAME='schedule_slots' THEN SELECT employee_id,effective_from,effective_until INTO subject,from_date,until_date FROM work_schedules WHERE id=(j->>'work_schedule_id')::uuid;
 ELSIF TG_TABLE_NAME='employment_periods' THEN from_date:=LEAST((j->>'start_date')::date,(o->>'start_date')::date);until_date:=CASE WHEN j->>'end_date' IS NULL OR TG_OP='UPDATE' AND o->>'end_date' IS NULL THEN NULL ELSE GREATEST((j->>'end_date')::date,(o->>'end_date')::date) END;
 ELSIF TG_TABLE_NAME='organization_settings' THEN
  IF j->'overtime_policy_versions' IS NOT DISTINCT FROM o->'overtime_policy_versions' AND j->>'timezone' IS NOT DISTINCT FROM o->>'timezone' AND j->>'currency' IS NOT DISTINCT FROM o->>'currency' AND j->>'week_start_day' IS NOT DISTINCT FROM o->>'week_start_day' THEN RETURN NEW;END IF;
  from_date:=CASE WHEN TG_OP='UPDATE' AND j->>'timezone'=o->>'timezone' AND j->>'week_start_day'=o->>'week_start_day' THEN (j->'overtime_policy_versions'->-1->>'effectiveFrom')::date ELSE '0001-01-01'::date END;until_date:=NULL;
 END IF;
 IF from_date IS NOT NULL THEN PERFORM invalidate_pay_range(subject,from_date,until_date);END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t TEXT;BEGIN
 FOREACH t IN ARRAY ARRAY['attendance_sessions','attendance_corrections','leave_requests','overtime_reviews','calendar_days','work_schedules','schedule_slots','employment_periods','compensation_rates','preorders','salary_adjustments','organization_settings'] LOOP
  EXECUTE format('CREATE TRIGGER salary_input_invalidation AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pay_source_changed()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION protect_time_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.timezone IS DISTINCT FROM OLD.timezone OR NEW.currency IS DISTINCT FROM OLD.currency) AND
 (EXISTS(SELECT 1 FROM work_schedules) OR EXISTS(SELECT 1 FROM attendance_sessions) OR EXISTS(SELECT 1 FROM leave_requests) OR EXISTS(SELECT 1 FROM calendar_days) OR EXISTS(SELECT 1 FROM overtime_reviews) OR EXISTS(SELECT 1 FROM compensation_rates) OR EXISTS(SELECT 1 FROM salary_periods) OR EXISTS(SELECT 1 FROM preorders)) THEN RAISE EXCEPTION 'Timezone/currency are frozen after official sources';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_week_setting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.week_start_day<>OLD.week_start_day AND (EXISTS(SELECT 1 FROM work_schedules) OR EXISTS(SELECT 1 FROM attendance_sessions) OR EXISTS(SELECT 1 FROM overtime_reviews) OR EXISTS(SELECT 1 FROM calendar_days) OR EXISTS(SELECT 1 FROM leave_requests) OR EXISTS(SELECT 1 FROM compensation_rates) OR EXISTS(SELECT 1 FROM salary_periods)) THEN RAISE EXCEPTION 'Workweek is frozen after official records';END IF;
 RETURN NEW;
END $$;

-- A new employment stint resets earning access; retained old grants cannot authorize a rehire.
CREATE FUNCTION reset_rehire_commission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account UUID;actor UUID;
BEGIN
 IF EXISTS(SELECT 1 FROM employment_periods WHERE employee_id=NEW.employee_id AND id<>NEW.id) THEN
  SELECT user_id INTO account FROM employees WHERE id=NEW.employee_id;
  UPDATE employees SET preorder_commission_enabled=false,updated_at=clock_timestamp() WHERE id=NEW.employee_id AND preorder_commission_enabled;
  UPDATE users SET session_version=session_version+1,updated_at=clock_timestamp() WHERE id=account;
  actor:=NULLIF(current_setting('app.actor_user_id',true),'')::uuid;
  INSERT INTO audit_logs(id,actor_user_id,employee_id,action,entity,entity_id,event_time,system_source,request_id,after)
   VALUES(gen_random_uuid(),actor,NEW.employee_id,'EMPLOYEE_ELIGIBILITY_RESET','employees',NEW.employee_id,clock_timestamp(),CASE WHEN actor IS NULL THEN 'rehire-trigger' ELSE NULL END,gen_random_uuid(),jsonb_build_object('preorderCommissionEnabled',false));
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER employment_commission_reset AFTER INSERT ON employment_periods FOR EACH ROW EXECUTE FUNCTION reset_rehire_commission();
