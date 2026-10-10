-- Additive query support only. No history, grants, business rules or tables change.
CREATE INDEX audit_logs_event_time_id_idx ON audit_logs(event_time DESC,id DESC);
CREATE INDEX audit_logs_action_event_time_idx ON audit_logs(action,event_time DESC);
CREATE INDEX employee_documents_live_expiry_idx ON employee_documents(expires_on,id) WHERE deleted_at IS NULL AND expires_on IS NOT NULL;
CREATE INDEX leave_requests_status_start_at_idx ON leave_requests(status,start_at);
CREATE INDEX salary_periods_status_start_date_idx ON salary_periods(status,start_date);
CREATE INDEX performance_reviews_draft_idx ON performance_reviews(id) WHERE published_at IS NULL;
CREATE INDEX attendance_sessions_incomplete_idx ON attendance_sessions(scheduled_end_at,id) WHERE checkout_at IS NULL AND voided_at IS NULL;
