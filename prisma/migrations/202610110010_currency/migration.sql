-- Changing a default is prospective. Existing money is never converted or relabelled.
ALTER TABLE organization_settings ADD CONSTRAINT organization_currency_code CHECK (currency ~ '^[A-Z]{3}$');
CREATE OR REPLACE FUNCTION protect_time_settings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE today DATE;
BEGIN
 IF NEW.timezone IS DISTINCT FROM OLD.timezone AND
 (EXISTS(SELECT 1 FROM work_schedules) OR EXISTS(SELECT 1 FROM attendance_sessions) OR EXISTS(SELECT 1 FROM leave_requests) OR EXISTS(SELECT 1 FROM calendar_days) OR EXISTS(SELECT 1 FROM overtime_reviews) OR EXISTS(SELECT 1 FROM compensation_rates) OR EXISTS(SELECT 1 FROM salary_periods) OR EXISTS(SELECT 1 FROM preorders)) THEN RAISE EXCEPTION 'Timezone is frozen after official sources';END IF;
 IF NEW.currency IS DISTINCT FROM OLD.currency THEN
  today := (clock_timestamp() AT TIME ZONE OLD.timezone)::date;
  IF EXISTS(SELECT 1 FROM compensation_rates WHERE superseded_at IS NULL AND (effective_until IS NULL OR effective_until > today))
   OR EXISTS(SELECT 1 FROM salary_periods WHERE status <> 'FINALIZED')
   OR EXISTS(SELECT 1 FROM weekly_earning_statements WHERE status <> 'FINALIZED')
   OR EXISTS(SELECT 1 FROM preorders WHERE status IN ('PENDING','APPROVED') AND included_weekly_statement_id IS NULL AND included_salary_calculation_id IS NULL)
   THEN RAISE EXCEPTION 'Close outstanding payroll, commission claims and active compensation terms before changing currency';END IF;
 END IF;
 RETURN NEW;
END $$;
