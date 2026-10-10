-- Additive Phase 3C migration. Existing identities and history remain intact.
CREATE TABLE work_schedules (
 id UUID PRIMARY KEY, employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 employment_period_id UUID NOT NULL, effective_from DATE NOT NULL, effective_until DATE,
 label VARCHAR(100), holiday_work_required BOOLEAN NOT NULL DEFAULT false, superseded_at TIMESTAMPTZ(3),
 created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, change_reason VARCHAR(500) NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id) ON DELETE RESTRICT,
 CHECK(effective_until IS NULL OR effective_until>effective_from), CHECK(revision>=1), CHECK(length(btrim(change_reason))>0),
 CHECK(NOT holiday_work_required OR effective_until IS NOT NULL),
 CONSTRAINT schedules_no_overlap EXCLUDE USING gist(employee_id WITH =,daterange(effective_from,effective_until,'[)') WITH &&) WHERE(superseded_at IS NULL)
);
CREATE INDEX work_schedules_employee_id_effective_from_idx ON work_schedules(employee_id,effective_from);
CREATE TABLE schedule_slots (
 id UUID PRIMARY KEY, work_schedule_id UUID NOT NULL REFERENCES work_schedules(id) ON DELETE RESTRICT,
 weekday SMALLINT NOT NULL, start_minute SMALLINT NOT NULL, end_minute SMALLINT NOT NULL, end_day_offset SMALLINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 CHECK(weekday BETWEEN 1 AND 7), CHECK(start_minute BETWEEN 0 AND 1439), CHECK(end_minute BETWEEN 0 AND 1439), CHECK(end_day_offset IN(0,1)),
 CHECK(end_minute+1440*end_day_offset-start_minute BETWEEN 1 AND 1440)
);
CREATE INDEX schedule_slots_work_schedule_id_weekday_idx ON schedule_slots(work_schedule_id,weekday);
CREATE TABLE attendance_sessions (
 id UUID PRIMARY KEY, employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, employment_period_id UUID NOT NULL,
 schedule_slot_id UUID REFERENCES schedule_slots(id) ON DELETE RESTRICT, work_date DATE NOT NULL,
 scheduled_start_at TIMESTAMPTZ(0), scheduled_end_at TIMESTAMPTZ(0), timezone_snapshot VARCHAR(100) NOT NULL,
 rules_version_snapshot INTEGER NOT NULL, early_checkin_minutes_snapshot INTEGER NOT NULL, earliest_checkin_at TIMESTAMPTZ(0),
 checkin_at TIMESTAMPTZ(0) NOT NULL, checkout_at TIMESTAMPTZ(0), source VARCHAR(20) NOT NULL DEFAULT 'SELF',
 voided_at TIMESTAMPTZ(3), void_reason VARCHAR(500), created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 1, checkin_operation_key UUID, checkout_operation_key UUID,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id) ON DELETE RESTRICT,
 UNIQUE(id,employee_id), UNIQUE(employee_id,checkin_operation_key), UNIQUE(employee_id,checkout_operation_key),
 CHECK(checkout_at IS NULL OR checkout_at>checkin_at), CHECK(source IN('SELF','CORRECTION')), CHECK(revision>=1),
 CHECK(rules_version_snapshot>=1 AND early_checkin_minutes_snapshot BETWEEN 0 AND 60),
 CHECK((scheduled_start_at IS NULL AND scheduled_end_at IS NULL) OR (scheduled_start_at IS NOT NULL AND scheduled_end_at>scheduled_start_at)),
 CHECK(source<>'SELF' OR (schedule_slot_id IS NOT NULL AND scheduled_start_at IS NOT NULL AND scheduled_end_at IS NOT NULL AND earliest_checkin_at IS NOT NULL AND checkin_operation_key IS NOT NULL)),
 CHECK((voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND length(btrim(void_reason))>0)),
 CONSTRAINT attendance_no_overlap EXCLUDE USING gist(employee_id WITH =,tstzrange(checkin_at,checkout_at,'[)') WITH &&) WHERE(voided_at IS NULL)
);
CREATE UNIQUE INDEX attendance_one_open ON attendance_sessions(employee_id) WHERE checkout_at IS NULL AND voided_at IS NULL;
CREATE INDEX attendance_sessions_employee_id_work_date_idx ON attendance_sessions(employee_id,work_date);
CREATE INDEX attendance_sessions_employee_id_checkin_at_idx ON attendance_sessions(employee_id,checkin_at);

CREATE FUNCTION protect_time_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE today DATE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Time history cannot be deleted'; END IF;
 IF TG_TABLE_NAME='schedule_slots' THEN RAISE EXCEPTION 'Published slots are immutable; publish a future replacement'; END IF;
 IF TG_TABLE_NAME='work_schedules' THEN
  IF (to_jsonb(NEW)-ARRAY['effective_until','superseded_at','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['effective_until','superseded_at','revision','updated_at']) OR OLD.superseded_at IS NOT NULL OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Schedule identity, pattern and provenance are immutable';
  END IF;
  SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO today FROM organization_settings WHERE id=1;
  IF NEW.superseded_at IS NOT NULL THEN
   IF OLD.effective_from<=today THEN RAISE EXCEPTION 'Historical schedule supersession requires the reviewed correction workflow'; END IF;
  ELSIF NEW.effective_until IS NULL OR NEW.effective_until<=today OR (OLD.effective_until IS NOT NULL AND NEW.effective_until>=OLD.effective_until) THEN
   RAISE EXCEPTION 'Only audited future shortening is permitted';
  END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['checkout_at','checkout_operation_key','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkout_at','checkout_operation_key','revision','updated_at']) OR OLD.checkout_at IS NOT NULL OR OLD.voided_at IS NOT NULL OR NEW.checkout_at IS NULL OR NEW.checkout_operation_key IS NULL OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Attendance facts/snapshots are immutable except closing an open session; corrections require the reviewed workflow';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER schedule_history_guard BEFORE UPDATE OR DELETE ON work_schedules FOR EACH ROW EXECUTE FUNCTION protect_time_history();
CREATE TRIGGER slot_history_guard BEFORE UPDATE OR DELETE ON schedule_slots FOR EACH ROW EXECUTE FUNCTION protect_time_history();
CREATE TRIGGER attendance_history_guard BEFORE UPDATE OR DELETE ON attendance_sessions FOR EACH ROW EXECUTE FUNCTION protect_time_history();

CREATE FUNCTION validate_time_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stint employment_periods%ROWTYPE; parent work_schedules%ROWTYPE;
BEGIN
 SELECT * INTO stint FROM employment_periods WHERE id=NEW.employment_period_id AND employee_id=NEW.employee_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employment ownership mismatch'; END IF;
 IF TG_TABLE_NAME='work_schedules' THEN
  IF NEW.effective_from<stint.start_date OR (stint.end_date IS NOT NULL AND (NEW.effective_until IS NULL OR NEW.effective_until>stint.end_date)) THEN RAISE EXCEPTION 'Schedule range must fit employment'; END IF;
 ELSE
  IF NEW.schedule_slot_id IS NOT NULL THEN
   SELECT s.* INTO parent FROM schedule_slots slot JOIN work_schedules s ON s.id=slot.work_schedule_id WHERE slot.id=NEW.schedule_slot_id;
   IF NOT FOUND OR parent.employee_id<>NEW.employee_id OR parent.employment_period_id<>NEW.employment_period_id THEN RAISE EXCEPTION 'Attendance slot ownership mismatch'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER schedule_owner_guard BEFORE INSERT ON work_schedules FOR EACH ROW EXECUTE FUNCTION validate_time_owner();
CREATE TRIGGER attendance_owner_guard BEFORE INSERT ON attendance_sessions FOR EACH ROW EXECUTE FUNCTION validate_time_owner();

-- Cyclic weekly overlap, including Sunday overnight into Monday. Deferred until all child inserts finish.
CREATE FUNCTION validate_weekly_slots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM (
   SELECT start_at,lag(end_at) OVER(ORDER BY start_at,end_at) AS previous_end FROM (
    SELECT (slot.weekday-1)*1440+slot.start_minute+w.offset_minutes AS start_at,
           (slot.weekday-1)*1440+slot.end_minute+1440*slot.end_day_offset+w.offset_minutes AS end_at
    FROM schedule_slots slot CROSS JOIN (VALUES(-10080),(0),(10080)) w(offset_minutes)
    WHERE slot.work_schedule_id=NEW.work_schedule_id
   ) spans
  ) ordered WHERE previous_end>start_at
 ) THEN RAISE EXCEPTION 'Cyclic weekly schedule slots overlap'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER weekly_slot_overlap AFTER INSERT ON schedule_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_weekly_slots();

CREATE FUNCTION protect_time_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.timezone IS DISTINCT FROM OLD.timezone OR NEW.currency IS DISTINCT FROM OLD.currency) AND (EXISTS(SELECT 1 FROM work_schedules) OR EXISTS(SELECT 1 FROM attendance_sessions)) THEN
  RAISE EXCEPTION 'Timezone and currency are frozen after official time records';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER official_time_settings_guard BEFORE UPDATE ON organization_settings FOR EACH ROW EXECUTE FUNCTION protect_time_settings();

CREATE FUNCTION protect_slot_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_revision INTEGER; parent_tx BIGINT;
BEGIN
 SELECT revision,xmin::text::bigint INTO parent_revision,parent_tx FROM work_schedules WHERE id=NEW.work_schedule_id;
 IF parent_revision IS DISTINCT FROM 1 OR parent_tx IS DISTINCT FROM (txid_current() % 4294967296) THEN
  RAISE EXCEPTION 'Slots must be inserted with their new schedule in the same transaction';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER slot_publication_guard BEFORE INSERT ON schedule_slots FOR EACH ROW EXECUTE FUNCTION protect_slot_publication();

CREATE FUNCTION validate_schedule_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject UUID;
BEGIN
 IF TG_TABLE_NAME='schedule_slots' THEN SELECT employee_id INTO subject FROM work_schedules WHERE id=NEW.work_schedule_id;
 ELSE subject:=NEW.employee_id; END IF;
 IF EXISTS (
  SELECT 1 FROM work_schedules a JOIN work_schedules b ON b.employee_id=a.employee_id AND b.effective_from=a.effective_until
   JOIN employment_periods p ON p.id=a.employment_period_id
   JOIN schedule_slots old_slot ON old_slot.work_schedule_id=a.id
   JOIN schedule_slots new_slot ON new_slot.work_schedule_id=b.id
  WHERE a.employee_id=subject AND a.superseded_at IS NULL AND b.superseded_at IS NULL
   AND (p.end_date IS NULL OR p.end_date>a.effective_until)
   AND old_slot.weekday=extract(isodow FROM a.effective_until-1) AND old_slot.end_day_offset=1
   AND new_slot.weekday=extract(isodow FROM b.effective_from) AND old_slot.end_minute>new_slot.start_minute
 ) THEN RAISE EXCEPTION 'Schedule version boundary overlaps an overnight slot'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER schedule_transition_guard AFTER INSERT OR UPDATE ON work_schedules DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_schedule_transition();
CREATE CONSTRAINT TRIGGER slot_transition_guard AFTER INSERT ON schedule_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_schedule_transition();
