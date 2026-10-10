-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASSPORT', 'NATIONAL_ID', 'EMPLOYMENT_CONTRACT', 'EDUCATION', 'VISA_WORK_PERMIT', 'BANK', 'OTHER');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "gender" VARCHAR(50),
ADD COLUMN     "nationality" VARCHAR(100),
ADD COLUMN     "photo_document_id" UUID;

-- AlterTable
ALTER TABLE "employment_periods" ADD COLUMN     "employment_type" VARCHAR(30) NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "manager_employee_id" UUID,
ADD COLUMN     "probation_end_date" DATE,
ADD COLUMN     "work_location" VARCHAR(100);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_period_id" UUID,
    "type" "DocumentType" NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "storage_key" VARCHAR(64) NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "issued_on" DATE,
    "expires_on" DATE,
    "employee_visible" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deletion_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_activities" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "event_time" TIMESTAMPTZ(3) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "source_type" VARCHAR(50),
    "source_id" UUID,
    "event_key" VARCHAR(150),
    "employee_visible" BOOLEAN NOT NULL DEFAULT false,
    "commission_restricted" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deletion_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_storage_key_key" ON "employee_documents"("storage_key");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_type_expires_on_idx" ON "employee_documents"("employee_id", "type", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_id_employee_id_key" ON "employee_documents"("id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_activities_event_key_key" ON "employee_activities"("event_key");

-- CreateIndex
CREATE INDEX "employee_activities_employee_id_event_time_idx" ON "employee_activities"("employee_id", "event_time");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_photo_document_id_fkey" FOREIGN KEY ("photo_document_id") REFERENCES "employee_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_periods" ADD CONSTRAINT "employment_periods_manager_employee_id_fkey" FOREIGN KEY ("manager_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employment_period_id_employee_id_fkey" FOREIGN KEY ("employment_period_id", "employee_id") REFERENCES "employment_periods"("id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_activities" ADD CONSTRAINT "employee_activities_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_activities" ADD CONSTRAINT "employee_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep existing ownership, overlap and audit guards intact; this migration is additive.
ALTER TABLE employment_periods
  ADD CONSTRAINT employment_type_valid CHECK (employment_type IN ('FULL_TIME','PART_TIME','CONTRACT','INTERN','OTHER')),
  ADD CONSTRAINT employment_probation_valid CHECK (probation_end_date IS NULL OR probation_end_date >= start_date),
  ADD CONSTRAINT employment_manager_not_self CHECK (manager_employee_id IS NULL OR manager_employee_id <> employee_id);
ALTER TABLE employee_documents
  ADD CONSTRAINT document_allowed_mime CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  ADD CONSTRAINT document_size_limit CHECK (file_size BETWEEN 1 AND 10485760),
  ADD CONSTRAINT document_key_format CHECK (storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$'),
  ADD CONSTRAINT document_hash_format CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT document_dates CHECK (issued_on IS NULL OR expires_on IS NULL OR issued_on <= expires_on),
  ADD CONSTRAINT document_deletion_reason CHECK (deleted_at IS NULL OR (deletion_reason IS NOT NULL AND length(btrim(deletion_reason)) > 0));
ALTER TABLE employee_activities
  ADD CONSTRAINT activity_source_pair CHECK ((source_type IS NULL) = (source_id IS NULL)),
  ADD CONSTRAINT activity_deletion_reason CHECK (deleted_at IS NULL OR (deletion_reason IS NOT NULL AND length(btrim(deletion_reason)) > 0));

CREATE FUNCTION protect_people_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'People history must be retained'; END IF;
  IF TG_TABLE_NAME = 'employee_documents' THEN
    IF ROW(NEW.employee_id, NEW.employment_period_id, NEW.storage_key, NEW.mime_type, NEW.file_size, NEW.sha256, NEW.uploaded_by, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.employee_id, OLD.employment_period_id, OLD.storage_key, OLD.mime_type, OLD.file_size, OLD.sha256, OLD.uploaded_by, OLD.created_at)
      THEN RAISE EXCEPTION 'Document ownership and file identity are immutable'; END IF;
    IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Deleted document metadata is retained'; END IF;
    IF (NEW.deleted_at IS NOT NULL OR NOT NEW.employee_visible OR NEW.mime_type NOT IN ('image/jpeg','image/png'))
      AND EXISTS (SELECT 1 FROM employees WHERE photo_document_id = NEW.id) THEN RAISE EXCEPTION 'Clear profile photo before restricting document'; END IF;
  ELSE
    IF ROW(NEW.employee_id, NEW.source_type, NEW.source_id, NEW.event_key, NEW.commission_restricted, NEW.created_by, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.employee_id, OLD.source_type, OLD.source_id, OLD.event_key, OLD.commission_restricted, OLD.created_by, OLD.created_at)
      THEN RAISE EXCEPTION 'Timeline ownership and source identity are immutable'; END IF;
    IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Deleted timeline metadata is retained'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_history_guard BEFORE UPDATE OR DELETE ON employee_documents FOR EACH ROW EXECUTE FUNCTION protect_people_history();
CREATE TRIGGER activity_history_guard BEFORE UPDATE OR DELETE ON employee_activities FOR EACH ROW EXECUTE FUNCTION protect_people_history();

CREATE FUNCTION protect_profile_photo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.photo_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM employee_documents WHERE id = NEW.photo_document_id AND employee_id = NEW.id
      AND deleted_at IS NULL AND employee_visible AND mime_type IN ('image/jpeg','image/png')
  ) THEN RAISE EXCEPTION 'Profile photo must be an owned released image'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER employee_photo_guard BEFORE INSERT OR UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION protect_profile_photo();
