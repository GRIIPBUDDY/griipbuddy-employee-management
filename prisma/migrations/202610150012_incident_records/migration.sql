-- Employee incident & performance records. Additive: one new table, one new document category; no existing rows change.
-- Applied atomically: either every statement below takes effect or none does.
BEGIN;
CREATE TABLE incident_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 number INTEGER NOT NULL UNIQUE CHECK (number>0),
 employee_id UUID NOT NULL REFERENCES employees(id),
 kind VARCHAR(10) NOT NULL CHECK (kind IN ('CONCERN','POSITIVE')),
 category VARCHAR(30) NOT NULL,
 title VARCHAR(150) NOT NULL CHECK (length(btrim(title))>0),
 description VARCHAR(5000) NOT NULL CHECK (length(btrim(description))>0),
 impact VARCHAR(2000) NOT NULL DEFAULT '',
 severity VARCHAR(10) CHECK (severity IS NULL OR severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
 occurred_on DATE NOT NULL,
 occurred_at TIMESTAMPTZ(3),
 status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','UNDER_REVIEW','CONFIRMED','DISPUTED','UNSUBSTANTIATED','RESOLVED','CLOSED')),
 staff_notes VARCHAR(2000) NOT NULL DEFAULT '',
 evidence_document_id UUID,
 related_task_id UUID REFERENCES task_assignments(id),
 related_session_id UUID REFERENCES attendance_sessions(id),
 related_activity_id UUID REFERENCES employee_activities(id),
 related_warning_id UUID REFERENCES disciplinary_records(id),
 related_review_id UUID REFERENCES performance_reviews(id),
 employee_visible BOOLEAN NOT NULL DEFAULT false,
 response_requested BOOLEAN NOT NULL DEFAULT false,
 acknowledged_at TIMESTAMPTZ(3),
 acknowledged_by UUID REFERENCES users(id),
 employee_response VARCHAR(2000),
 employee_disputes BOOLEAN,
 responded_at TIMESTAMPTZ(3),
 responded_by UUID REFERENCES users(id),
 review_note VARCHAR(2000),
 reviewed_by UUID REFERENCES users(id),
 reviewed_at TIMESTAMPTZ(3),
 corrective_action VARCHAR(30) CHECK (corrective_action IS NULL OR corrective_action IN ('COACHING','TRAINING','PROCESS_CORRECTION','VERBAL_DISCUSSION','FORMAL_NOTICE','WARNING','FURTHER_REVIEW','OTHER')),
 corrective_note VARCHAR(2000),
 follow_up_on DATE,
 corrective_completed_at TIMESTAMPTZ(3),
 corrective_completed_by UUID REFERENCES users(id),
 completion_note VARCHAR(2000),
 resolution VARCHAR(2000),
 resolved_at TIMESTAMPTZ(3),
 resolved_by UUID REFERENCES users(id),
 reported_by UUID NOT NULL REFERENCES users(id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>=1),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (id,employee_id),
 FOREIGN KEY (evidence_document_id,employee_id) REFERENCES employee_documents(id,employee_id),
 CONSTRAINT incident_category CHECK (category IN ('WORK_QUALITY','ATTENDANCE','TASK_DEADLINE','CUSTOMER_SERVICE','POLICY_VIOLATION','COMMUNICATION','WORKPLACE_CONDUCT','OTHER','ACHIEVEMENT','EXCELLENT_PERFORMANCE','IMPROVEMENT','SUCCESSFUL_RESOLUTION')),
 CONSTRAINT incident_kind_category CHECK ((kind='POSITIVE') = (category IN ('ACHIEVEMENT','EXCELLENT_PERFORMANCE','IMPROVEMENT','SUCCESSFUL_RESOLUTION'))),
 -- Severity describes potential impact of a concern; positive records carry no severity or corrective action.
 CONSTRAINT incident_severity CHECK ((kind='CONCERN') = (severity IS NOT NULL)),
 CONSTRAINT incident_positive_no_action CHECK (kind='CONCERN' OR corrective_action IS NULL),
 CONSTRAINT incident_draft_private CHECK (status<>'DRAFT' OR NOT employee_visible),
 CONSTRAINT incident_response_needs_visibility CHECK (NOT response_requested OR employee_visible),
 CONSTRAINT incident_ack_pair CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL)),
 CONSTRAINT incident_response_set CHECK ((employee_response IS NULL) = (responded_at IS NULL) AND (responded_at IS NULL) = (responded_by IS NULL) AND (responded_at IS NULL) = (employee_disputes IS NULL)),
 CONSTRAINT incident_decision CHECK (status NOT IN ('CONFIRMED','DISPUTED','UNSUBSTANTIATED') OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND review_note IS NOT NULL)),
 CONSTRAINT incident_resolution CHECK ((status IN ('RESOLVED','CLOSED')) = (resolved_at IS NOT NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL OR resolution IS NOT NULL)),
 CONSTRAINT incident_completion CHECK ((corrective_completed_at IS NULL) = (corrective_completed_by IS NULL) AND (corrective_completed_at IS NULL OR corrective_action IS NOT NULL))
);
CREATE INDEX incident_records_employee_idx ON incident_records(employee_id,occurred_on);
CREATE INDEX incident_records_status_idx ON incident_records(status,occurred_on);
CREATE INDEX incident_records_follow_up_idx ON incident_records(follow_up_on) WHERE follow_up_on IS NOT NULL AND corrective_completed_at IS NULL;
-- History is retained: records are never deleted, identity never changes, the employee's own response and
-- acknowledgement are never erased, and factual details change only while the record is open for review.
CREATE FUNCTION protect_incident_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Incident records are retained; close them instead'; END IF;
 IF NEW.id<>OLD.id OR NEW.number<>OLD.number OR NEW.employee_id<>OLD.employee_id OR NEW.kind<>OLD.kind OR NEW.reported_by<>OLD.reported_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Incident identity/revision mismatch'; END IF;
 IF OLD.responded_at IS NOT NULL AND (NEW.employee_response IS DISTINCT FROM OLD.employee_response OR NEW.employee_disputes IS DISTINCT FROM OLD.employee_disputes OR NEW.responded_at IS DISTINCT FROM OLD.responded_at OR NEW.responded_by IS DISTINCT FROM OLD.responded_by) THEN
  RAISE EXCEPTION 'An employee response is retained as submitted'; END IF;
 IF OLD.acknowledged_at IS NOT NULL AND (NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at OR NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by) THEN
  RAISE EXCEPTION 'An acknowledgement is retained as recorded'; END IF;
 IF OLD.status NOT IN ('DRAFT','UNDER_REVIEW') AND (NEW.category,NEW.title,NEW.description,NEW.impact,NEW.severity,NEW.occurred_on,NEW.occurred_at) IS DISTINCT FROM (OLD.category,OLD.title,OLD.description,OLD.impact,OLD.severity,OLD.occurred_on,OLD.occurred_at) THEN
  RAISE EXCEPTION 'Reopen the record before amending its details'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER incident_records_history_guard BEFORE UPDATE OR DELETE ON incident_records FOR EACH ROW EXECUTE FUNCTION protect_incident_records();
-- Evidence reuses private employee documents under its own category.
INSERT INTO option_items(list,code,label,sort_order) VALUES ('DOCUMENT_TYPE','INCIDENT_EVIDENCE','Incident evidence',80) ON CONFLICT (list,code) DO NOTHING;
COMMIT;
