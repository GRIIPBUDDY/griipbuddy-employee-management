-- Additive Phase 3D sources and decisions. Prior migrations and facts are retained.
ALTER TABLE organization_settings ADD COLUMN week_start_day SMALLINT NOT NULL DEFAULT 1 CHECK (week_start_day BETWEEN 1 AND 7);
CREATE TABLE attendance_corrections (
 id UUID PRIMARY KEY, employee_id UUID NOT NULL REFERENCES employees(id), employment_period_id UUID NOT NULL,
 session_id UUID, type VARCHAR(20) NOT NULL CHECK(type IN ('ADD','REPLACE','VOID')), work_date DATE NOT NULL,
 schedule_slot_id UUID REFERENCES schedule_slots(id), proposed_checkin_at TIMESTAMPTZ(0), proposed_checkout_at TIMESTAMPTZ(0),
 reason VARCHAR(500) NOT NULL CHECK(length(trim(reason))>0), original_values JSONB NOT NULL, target_revision INTEGER,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
 requested_by UUID NOT NULL REFERENCES users(id), reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ(3), review_comment VARCHAR(500),
 applied_session_id UUID, operation_key UUID NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id),
 FOREIGN KEY(session_id,employee_id) REFERENCES attendance_sessions(id,employee_id),
 FOREIGN KEY(applied_session_id,employee_id) REFERENCES attendance_sessions(id,employee_id),
 CHECK((type='ADD' AND session_id IS NULL AND target_revision IS NULL) OR (type IN ('REPLACE','VOID') AND session_id IS NOT NULL AND target_revision>0)),
 CHECK(type='VOID' OR (proposed_checkin_at IS NOT NULL AND proposed_checkout_at IS NOT NULL AND proposed_checkout_at>proposed_checkin_at)),
 CHECK((status IN ('PENDING','WITHDRAWN') AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK((status='APPROVED' AND applied_session_id IS NOT NULL) OR (status<>'APPROVED' AND applied_session_id IS NULL)),
 UNIQUE(employee_id,operation_key)
);
CREATE INDEX attendance_corrections_employee_id_status_created_at_idx ON attendance_corrections(employee_id,status,created_at);
CREATE INDEX attendance_corrections_status_created_at_idx ON attendance_corrections(status,created_at);
CREATE TABLE overtime_reviews (
 id UUID PRIMARY KEY, employee_id UUID NOT NULL REFERENCES employees(id), week_start_date DATE NOT NULL,
 timezone_snapshot VARCHAR(100) NOT NULL, threshold_seconds INTEGER NOT NULL CHECK(threshold_seconds>0), policy_version INTEGER NOT NULL CHECK(policy_version>0),
 actual_seconds_snapshot INTEGER NOT NULL CHECK(actual_seconds_snapshot>=0), potential_seconds_snapshot INTEGER NOT NULL CHECK(potential_seconds_snapshot>=0),
 approved_seconds INTEGER NOT NULL DEFAULT 0 CHECK(approved_seconds>=0), status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','NOT_REQUIRED','STALE')),
 reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ(3), review_comment VARCHAR(500), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 UNIQUE(employee_id,week_start_date), CHECK(approved_seconds<=potential_seconds_snapshot),
 CHECK(status<>'NOT_REQUIRED' OR (potential_seconds_snapshot=0 AND approved_seconds=0)),
 CHECK(status NOT IN ('APPROVED','REJECTED') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(status<>'REJECTED' OR approved_seconds=0)
);
CREATE INDEX overtime_reviews_status_week_start_date_idx ON overtime_reviews(status,week_start_date);
CREATE TABLE calendar_days (
 id UUID PRIMARY KEY, local_date DATE NOT NULL UNIQUE, name VARCHAR(100) NOT NULL CHECK(length(trim(name))>0), created_by UUID NOT NULL REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE leave_requests (
 id UUID PRIMARY KEY, employee_id UUID NOT NULL REFERENCES employees(id), employment_period_id UUID NOT NULL,
 start_at TIMESTAMPTZ(0) NOT NULL, end_at TIMESTAMPTZ(0) NOT NULL CHECK(end_at>start_at), type VARCHAR(20) NOT NULL CHECK(type IN ('PAID','UNPAID')),
 reason VARCHAR(500) NOT NULL CHECK(length(trim(reason))>0), status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','CANCELLED')),
 requested_by UUID NOT NULL REFERENCES users(id), reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ(3), review_comment VARCHAR(500), revision INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id),
 EXCLUDE USING gist(employee_id WITH =, tstzrange(start_at,end_at,'[)') WITH &&) WHERE(status='APPROVED')
);
CREATE INDEX leave_requests_employee_id_start_at_status_idx ON leave_requests(employee_id,start_at,status);
CREATE TABLE notifications (
 id UUID PRIMARY KEY, recipient_user_id UUID NOT NULL REFERENCES users(id), employee_id UUID REFERENCES employees(id), event_type VARCHAR(80) NOT NULL,
 text VARCHAR(200) NOT NULL, source_type VARCHAR(80) NOT NULL, source_id UUID NOT NULL, event_key VARCHAR(200) NOT NULL,
 read_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(recipient_user_id,event_key)
);
CREATE INDEX notifications_recipient_user_id_read_at_created_at_idx ON notifications(recipient_user_id,read_at,created_at);
CREATE FUNCTION protect_review_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Review history cannot be deleted'; END IF;
 IF TG_TABLE_NAME='attendance_corrections' THEN
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED','WITHDRAWN') OR
   (to_jsonb(NEW)-ARRAY['status','reviewed_by','reviewed_at','review_comment','applied_session_id','updated_at']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','reviewed_by','reviewed_at','review_comment','applied_session_id','updated_at']) THEN RAISE EXCEPTION 'Correction proposal and decisions are immutable'; END IF;
 ELSIF TG_TABLE_NAME='overtime_reviews' THEN
  IF NEW.employee_id<>OLD.employee_id OR NEW.week_start_date<>OLD.week_start_date OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Overtime identity/revision mismatch'; END IF;
  IF OLD.status IN ('APPROVED','REJECTED','NOT_REQUIRED') AND (NEW.status<>'STALE' OR
   (to_jsonb(NEW)-ARRAY['status','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','revision','updated_at'])) THEN RAISE EXCEPTION 'Reviewed snapshots must be retained until marked stale'; END IF;
  IF OLD.status='STALE' AND NEW.status NOT IN ('PENDING','NOT_REQUIRED') THEN RAISE EXCEPTION 'Stale overtime must be recomputed before review'; END IF;
  IF NEW.status IN ('PENDING','NOT_REQUIRED') AND (NEW.approved_seconds<>0 OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL) THEN RAISE EXCEPTION 'New calculation requires a new decision'; END IF;
  IF OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED') AND
   (to_jsonb(NEW)-ARRAY['status','approved_seconds','reviewed_by','reviewed_at','review_comment','revision','updated_at']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','approved_seconds','reviewed_by','reviewed_at','review_comment','revision','updated_at']) THEN RAISE EXCEPTION 'Decision must use retained calculation inputs'; END IF;
 ELSIF TG_TABLE_NAME='leave_requests' THEN
  IF NOT ((OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED','WITHDRAWN')) OR (OLD.status='APPROVED' AND NEW.status='CANCELLED')) OR NEW.revision<>OLD.revision+1 OR
   (to_jsonb(NEW)-ARRAY['status','reviewed_by','reviewed_at','review_comment','revision','updated_at']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','reviewed_by','reviewed_at','review_comment','revision','updated_at']) THEN RAISE EXCEPTION 'Leave proposal/history is immutable'; END IF;
 ELSIF TG_TABLE_NAME='notifications' THEN
  IF (to_jsonb(NEW)-'read_at') IS DISTINCT FROM (to_jsonb(OLD)-'read_at') THEN RAISE EXCEPTION 'Notification content is immutable'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('attendance_corrections','leave_requests','overtime_reviews') THEN
 IF NEW.reviewed_by IS NOT NULL AND NEW.status IN ('APPROVED','REJECTED','CANCELLED') THEN
  IF NOT EXISTS(SELECT 1 FROM users u WHERE u.id=NEW.reviewed_by AND u.is_active AND (u.role='ADMIN' OR (u.role='HR_MANAGER' AND NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.user_id=u.id)))) THEN RAISE EXCEPTION 'An authorized non-self reviewer is required'; END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER correction_history_guard BEFORE UPDATE OR DELETE ON attendance_corrections FOR EACH ROW EXECUTE FUNCTION protect_review_history();
CREATE TRIGGER overtime_history_guard BEFORE UPDATE OR DELETE ON overtime_reviews FOR EACH ROW EXECUTE FUNCTION protect_review_history();
CREATE TRIGGER leave_history_guard BEFORE UPDATE OR DELETE ON leave_requests FOR EACH ROW EXECUTE FUNCTION protect_review_history();
CREATE TRIGGER notification_history_guard BEFORE UPDATE OR DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION protect_review_history();
-- Only the matching pending reviewed proposal can change official facts; self checkout stays intact.
CREATE FUNCTION protect_attendance_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal attendance_corrections%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Attendance history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['checkout_at','checkout_operation_key','revision','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkout_at','checkout_operation_key','revision','updated_at']) AND OLD.checkout_at IS NULL AND OLD.voided_at IS NULL AND NEW.checkout_at IS NOT NULL AND NEW.checkout_operation_key IS NOT NULL AND NEW.revision=OLD.revision+1 THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.source='SELF' THEN RETURN NEW; END IF;
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
DROP TRIGGER attendance_history_guard ON attendance_sessions;
CREATE TRIGGER attendance_history_guard BEFORE INSERT OR UPDATE OR DELETE ON attendance_sessions FOR EACH ROW EXECUTE FUNCTION protect_attendance_review();
DROP TRIGGER attendance_owner_guard ON attendance_sessions;
CREATE TRIGGER attendance_owner_guard BEFORE INSERT OR UPDATE ON attendance_sessions FOR EACH ROW EXECUTE FUNCTION validate_time_owner();
CREATE FUNCTION protect_week_setting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.week_start_day<>OLD.week_start_day AND (EXISTS(SELECT 1 FROM work_schedules) OR EXISTS(SELECT 1 FROM attendance_sessions) OR EXISTS(SELECT 1 FROM overtime_reviews) OR EXISTS(SELECT 1 FROM calendar_days) OR EXISTS(SELECT 1 FROM leave_requests)) THEN RAISE EXCEPTION 'Workweek is frozen after official records'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workweek_settings_guard BEFORE UPDATE ON organization_settings FOR EACH ROW EXECUTE FUNCTION protect_week_setting();

ALTER TABLE work_schedules ADD CONSTRAINT holiday_work_bounded CHECK(NOT holiday_work_required OR effective_until IS NOT NULL);

CREATE UNIQUE INDEX one_pending_target_correction ON attendance_corrections(session_id) WHERE status='PENDING' AND session_id IS NOT NULL;
ALTER TABLE attendance_corrections ADD CONSTRAINT applied_target_match CHECK(status<>'APPROVED' OR type='ADD' OR applied_session_id=session_id);

CREATE OR REPLACE FUNCTION protect_time_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.timezone IS DISTINCT FROM OLD.timezone OR NEW.currency IS DISTINCT FROM OLD.currency) AND
 (EXISTS(SELECT 1 FROM work_schedules) OR EXISTS(SELECT 1 FROM attendance_sessions) OR EXISTS(SELECT 1 FROM leave_requests) OR EXISTS(SELECT 1 FROM calendar_days) OR EXISTS(SELECT 1 FROM overtime_reviews)) THEN RAISE EXCEPTION 'Timezone/currency are frozen after official time sources'; END IF;
 RETURN NEW;
END $$;
