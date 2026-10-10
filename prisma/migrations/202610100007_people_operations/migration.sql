ALTER TABLE leave_requests ADD COLUMN category varchar(20) NOT NULL DEFAULT 'OTHER', ADD COLUMN operation_key uuid;
ALTER TABLE leave_requests ADD CONSTRAINT leave_category CHECK(category IN ('ANNUAL','SICK','PERSONAL','EMERGENCY','UNPAID','OTHER'));
CREATE UNIQUE INDEX leave_requests_employee_id_operation_key_key ON leave_requests(employee_id,operation_key);
CREATE FUNCTION prevent_duplicate_leave() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(73102301);
 IF EXISTS(SELECT 1 FROM leave_requests WHERE employee_id=NEW.employee_id AND start_at=NEW.start_at AND end_at=NEW.end_at AND status IN ('PENDING','APPROVED')) THEN RAISE EXCEPTION 'A current leave request already covers these exact dates'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER leave_duplicate_guard BEFORE INSERT ON leave_requests FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_leave();

CREATE TABLE performance_reviews (
 id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 employment_period_id uuid NOT NULL, start_date date NOT NULL, end_date date NOT NULL CHECK(end_date>start_date),
 overall_rating int CHECK(overall_rating BETWEEN 1 AND 5), productivity int CHECK(productivity BETWEEN 1 AND 5),
 work_quality int CHECK(work_quality BETWEEN 1 AND 5), communication int CHECK(communication BETWEEN 1 AND 5),
 attendance int CHECK(attendance BETWEEN 1 AND 5), responsibility int CHECK(responsibility BETWEEN 1 AND 5),
 strengths varchar(2000) NOT NULL, improvement_areas varchar(2000) NOT NULL, reviewer_comments varchar(2000) NOT NULL,
 staff_notes varchar(2000) NOT NULL, employee_visible boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES users(id), reviewed_by uuid REFERENCES users(id), published_at timestamptz(3),
 revision int NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id),
 CHECK((published_at IS NULL AND reviewed_by IS NULL) OR (published_at IS NOT NULL AND reviewed_by IS NOT NULL AND overall_rating IS NOT NULL))
);
CREATE INDEX performance_reviews_employee_id_start_date_published_at_idx ON performance_reviews(employee_id,start_date,published_at);
CREATE TABLE disciplinary_records (
 id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id), employment_period_id uuid NOT NULL,
 issue_date date NOT NULL, severity varchar(20) NOT NULL CHECK(severity IN ('NOTICE','WARNING','SERIOUS_WARNING','FINAL_WARNING')),
 reason varchar(500) NOT NULL CHECK(length(trim(reason))>0), description varchar(2000) NOT NULL, action_taken varchar(2000) NOT NULL,
 staff_notes varchar(2000) NOT NULL, attachment_document_id uuid, employee_visible boolean NOT NULL DEFAULT false,
 acknowledgement_requested boolean NOT NULL DEFAULT false, acknowledged_at timestamptz(3), acknowledged_by uuid REFERENCES users(id),
 published_at timestamptz(3), issued_by uuid NOT NULL REFERENCES users(id), published_by uuid REFERENCES users(id),
 revoked_at timestamptz(3), revocation_reason varchar(500), revision int NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL,
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id),
 FOREIGN KEY(attachment_document_id,employee_id) REFERENCES employee_documents(id,employee_id),
 CHECK((acknowledged_at IS NULL)=(acknowledged_by IS NULL)), CHECK((revoked_at IS NULL)=(revocation_reason IS NULL)),
 CHECK((published_at IS NULL)=(published_by IS NULL)),
 CHECK(acknowledged_at IS NULL OR (published_at IS NOT NULL AND employee_visible AND acknowledgement_requested))
);
CREATE INDEX disciplinary_records_employee_id_issue_date_severity_idx ON disciplinary_records(employee_id,issue_date,severity);
CREATE INDEX disciplinary_records_attachment_document_id_idx ON disciplinary_records(attachment_document_id);
CREATE TABLE assets (
 id uuid PRIMARY KEY, asset_code varchar(50) NOT NULL UNIQUE CHECK(length(trim(asset_code))>0 AND asset_code=upper(trim(asset_code))),
 type varchar(20) NOT NULL CHECK(type IN ('LAPTOP','PHONE','CAMERA','SIM','ACCESS_CARD','OTHER')), name varchar(150) NOT NULL,
 serial_number varchar(100) NOT NULL, condition varchar(200) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','RETIRED','LOST')), notes varchar(2000) NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), revision int NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL
);
CREATE INDEX assets_type_status_idx ON assets(type,status);
CREATE TABLE asset_assignments (
 id uuid PRIMARY KEY, asset_id uuid NOT NULL REFERENCES assets(id), employee_id uuid NOT NULL REFERENCES employees(id),
 employment_period_id uuid NOT NULL, identification_snapshot jsonb NOT NULL, assigned_at timestamptz(3) NOT NULL,
 returned_at timestamptz(3) CHECK(returned_at>=assigned_at), condition_out varchar(200) NOT NULL,
 condition_in varchar(200), notes varchar(2000) NOT NULL, return_notes varchar(2000),
 assigned_by uuid NOT NULL REFERENCES users(id), returned_by uuid REFERENCES users(id), revision int NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(employment_period_id,employee_id) REFERENCES employment_periods(id,employee_id),
 CHECK((returned_at IS NULL AND condition_in IS NULL AND returned_by IS NULL AND return_notes IS NULL) OR
 (returned_at IS NOT NULL AND condition_in IS NOT NULL AND returned_by IS NOT NULL AND return_notes IS NOT NULL))
);
CREATE UNIQUE INDEX asset_one_open_assignment ON asset_assignments(asset_id) WHERE returned_at IS NULL;
CREATE INDEX asset_assignments_employee_id_assigned_at_idx ON asset_assignments(employee_id,assigned_at);
CREATE INDEX asset_assignments_asset_id_assigned_at_idx ON asset_assignments(asset_id,assigned_at);

CREATE FUNCTION protect_people_operations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; allowed boolean; stint employment_periods%ROWTYPE; org_timezone text; issued_date date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'People and asset history cannot be deleted'; END IF;
 actor:=NULLIF(current_setting('app.actor_user_id',true),'')::uuid;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Identity/history revision mismatch'; END IF;
 IF TG_TABLE_NAME='assets' THEN
  IF TG_OP='UPDATE' AND NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'Asset creator is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.employee_id<>OLD.employee_id OR NEW.employment_period_id<>OLD.employment_period_id) THEN RAISE EXCEPTION 'Record ownership is immutable'; END IF;
 SELECT * INTO stint FROM employment_periods WHERE id=NEW.employment_period_id AND employee_id=NEW.employee_id;
 SELECT timezone INTO org_timezone FROM organization_settings WHERE id=1;
 IF TG_TABLE_NAME='asset_assignments' THEN
  IF TG_OP='INSERT' THEN
   PERFORM 1 FROM assets WHERE id=NEW.asset_id FOR UPDATE;
   IF NOT EXISTS(SELECT 1 FROM assets WHERE id=NEW.asset_id AND status='AVAILABLE') THEN RAISE EXCEPTION 'Asset is unavailable'; END IF;
   issued_date:=(NEW.assigned_at AT TIME ZONE org_timezone)::date;
   IF issued_date<stint.start_date OR (stint.end_date IS NOT NULL AND issued_date>=stint.end_date) THEN RAISE EXCEPTION 'Assignment must fit employment'; END IF;
  ELSE
   IF OLD.returned_at IS NOT NULL OR NEW.returned_at IS NULL OR
    (to_jsonb(NEW)-ARRAY['returned_at','condition_in','return_notes','returned_by','revision']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['returned_at','condition_in','return_notes','returned_by','revision']) THEN RAISE EXCEPTION 'Only a retained one-time return is allowed'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='performance_reviews' THEN
  IF TG_OP='INSERT' OR OLD.published_at IS NULL THEN
   IF NEW.start_date<stint.start_date OR (stint.end_date IS NOT NULL AND NEW.end_date>stint.end_date) THEN RAISE EXCEPTION 'Review must fit employment'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'Review creator is immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.published_at IS NOT NULL THEN
   IF NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR
    current_setting('app.people_correction_id',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Published reviews require an explicit correction'; END IF;
  END IF;
  IF NEW.published_at IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM users u WHERE u.id=actor AND u.is_active AND (u.role='ADMIN' OR (u.role='HR_MANAGER' AND NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND user_id=actor)))) THEN RAISE EXCEPTION 'Authorized non-self publication required'; END IF;
  END IF;
 ELSE
  IF TG_OP='INSERT' OR OLD.published_at IS NULL THEN
   IF NEW.issue_date<stint.start_date OR (stint.end_date IS NOT NULL AND NEW.issue_date>=stint.end_date) THEN RAISE EXCEPTION 'Warning must fit employment'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.issued_by<>OLD.issued_by OR OLD.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Issuer/revoked record is immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.published_at IS NOT NULL THEN
   IF NEW.acknowledged_at IS NOT NULL AND OLD.acknowledged_at IS NULL THEN
    IF (to_jsonb(NEW)-ARRAY['acknowledged_at','acknowledged_by','revision','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['acknowledged_at','acknowledged_by','revision','updated_at']) OR
       NEW.acknowledged_by IS DISTINCT FROM actor OR NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND user_id=actor) OR
       NOT OLD.employee_visible OR NOT OLD.acknowledgement_requested THEN RAISE EXCEPTION 'Only the subject can acknowledge the current published record'; END IF;
    RETURN NEW;
   END IF;
   IF NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by OR
    current_setting('app.people_correction_id',true) IS DISTINCT FROM OLD.id::text OR NEW.acknowledged_at IS NOT NULL THEN RAISE EXCEPTION 'Official warnings need an audited correction and new receipt'; END IF;
  END IF;
  IF NEW.published_at IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM users u WHERE u.id=actor AND u.is_active AND (u.role='ADMIN' OR (u.role='HR_MANAGER' AND NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND user_id=actor)))) THEN RAISE EXCEPTION 'Authorized non-self publication required'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_operations_guard BEFORE INSERT OR UPDATE OR DELETE ON performance_reviews FOR EACH ROW EXECUTE FUNCTION protect_people_operations();
CREATE TRIGGER disciplinary_operations_guard BEFORE INSERT OR UPDATE OR DELETE ON disciplinary_records FOR EACH ROW EXECUTE FUNCTION protect_people_operations();
CREATE TRIGGER asset_operations_guard BEFORE INSERT OR UPDATE OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION protect_people_operations();
CREATE TRIGGER assignment_operations_guard BEFORE INSERT OR UPDATE OR DELETE ON asset_assignments FOR EACH ROW EXECUTE FUNCTION protect_people_operations();
