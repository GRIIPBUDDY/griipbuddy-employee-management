CREATE TABLE "departments" (
 "id" UUID PRIMARY KEY, "name" VARCHAR(100) NOT NULL, "normalized_name" VARCHAR(100) NOT NULL UNIQUE,
 "is_active" BOOLEAN NOT NULL DEFAULT true, "created_by" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "departments_name_check" CHECK (name=btrim(name) AND length(name)>0 AND normalized_name=lower(btrim(name)))
);
ALTER TABLE employment_periods ADD COLUMN "department_id" UUID REFERENCES "departments"(id) ON DELETE RESTRICT;
CREATE INDEX "employment_periods_department_id_idx" ON employment_periods("department_id");
-- Add catalog references without rewriting historical label snapshots or identity fields.
INSERT INTO "departments"(id,name,normalized_name,created_by,created_at,updated_at)
SELECT gen_random_uuid(),btrim(department_label),lower(btrim(department_label)),created_by,created_at,updated_at
FROM (SELECT DISTINCT ON (lower(btrim(department_label))) * FROM employment_periods
 WHERE length(btrim(department_label))>0 ORDER BY lower(btrim(department_label)),created_at,id) existing;
UPDATE employment_periods p SET "department_id"=c.id FROM "departments" c WHERE lower(btrim(p.department_label))=c.normalized_name;
INSERT INTO audit_logs(id,action,entity,entity_id,request_id,system_source,"after")
SELECT gen_random_uuid(),'CATALOG_BACKFILLED','departments',id::text,gen_random_uuid(),'migration_3b_catalogs',jsonb_build_object('name',name) FROM "departments";
CREATE TABLE "positions" (
 "id" UUID PRIMARY KEY, "name" VARCHAR(100) NOT NULL, "normalized_name" VARCHAR(100) NOT NULL UNIQUE,
 "is_active" BOOLEAN NOT NULL DEFAULT true, "created_by" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "positions_name_check" CHECK (name=btrim(name) AND length(name)>0 AND normalized_name=lower(btrim(name)))
);
ALTER TABLE employment_periods ADD COLUMN "position_id" UUID REFERENCES "positions"(id) ON DELETE RESTRICT;
CREATE INDEX "employment_periods_position_id_idx" ON employment_periods("position_id");
-- Add catalog references without rewriting historical label snapshots or identity fields.
INSERT INTO "positions"(id,name,normalized_name,created_by,created_at,updated_at)
SELECT gen_random_uuid(),btrim(position_label),lower(btrim(position_label)),created_by,created_at,updated_at
FROM (SELECT DISTINCT ON (lower(btrim(position_label))) * FROM employment_periods
 WHERE length(btrim(position_label))>0 ORDER BY lower(btrim(position_label)),created_at,id) existing;
UPDATE employment_periods p SET "position_id"=c.id FROM "positions" c WHERE lower(btrim(p.position_label))=c.normalized_name;
INSERT INTO audit_logs(id,action,entity,entity_id,request_id,system_source,"after")
SELECT gen_random_uuid(),'CATALOG_BACKFILLED','positions',id::text,gen_random_uuid(),'migration_3b_catalogs',jsonb_build_object('name',name) FROM "positions";
CREATE FUNCTION protect_catalog_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Deactivate catalogs; preserve historical references'; END IF;
 IF NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN
   RAISE EXCEPTION 'Catalog identity and provenance are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "departments_history_guard" BEFORE UPDATE OR DELETE ON "departments" FOR EACH ROW EXECUTE FUNCTION protect_catalog_history();
CREATE TRIGGER "positions_history_guard" BEFORE UPDATE OR DELETE ON "positions" FOR EACH ROW EXECUTE FUNCTION protect_catalog_history();
