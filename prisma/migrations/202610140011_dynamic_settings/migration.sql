-- Configurable organization: branding, modules, attendance/leave rules, editable lists, leave allowances and
-- monthly-only payroll. Additive: no rows are deleted and existing codes remain valid list items.

-- Branding, module switches and rules.
ALTER TABLE organization_settings
 ADD COLUMN company_legal_name VARCHAR(150) NOT NULL DEFAULT 'GRIIPBUDDY LLC',
 ADD COLUMN company_address VARCHAR(500) NOT NULL DEFAULT '1021 E Lincolnway, Cheyenne, Wyoming 82001, United States',
 ADD COLUMN brand_color VARCHAR(7) NOT NULL DEFAULT '#4b2a5e',
 ADD COLUMN logo_data BYTEA,
 ADD COLUMN logo_mime VARCHAR(20),
 ADD COLUMN logo_revision INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN enabled_modules JSONB NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN late_grace_minutes SMALLINT NOT NULL DEFAULT 0,
 ADD COLUMN working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb,
 ADD COLUMN leave_day_basis VARCHAR(10) NOT NULL DEFAULT 'WORKING',
 ADD COLUMN leave_over_balance VARCHAR(10) NOT NULL DEFAULT 'BLOCK',
 ADD COLUMN salary_payment_day SMALLINT;
ALTER TABLE organization_settings
 ADD CONSTRAINT organization_brand_color CHECK (brand_color ~ '^#[0-9a-f]{6}$'),
 ADD CONSTRAINT organization_logo_pair CHECK ((logo_data IS NULL) = (logo_mime IS NULL) AND (logo_mime IS NULL OR logo_mime='image/png') AND (logo_data IS NULL OR octet_length(logo_data) BETWEEN 1 AND 1048576)),
 ADD CONSTRAINT organization_modules_object CHECK (jsonb_typeof(enabled_modules)='object'),
 ADD CONSTRAINT organization_late_grace CHECK (late_grace_minutes BETWEEN 0 AND 120),
 ADD CONSTRAINT organization_working_days CHECK (jsonb_typeof(working_days)='array'),
 ADD CONSTRAINT organization_leave_basis CHECK (leave_day_basis IN ('WORKING','CALENDAR')),
 ADD CONSTRAINT organization_leave_balance_rule CHECK (leave_over_balance IN ('BLOCK','FLAG')),
 ADD CONSTRAINT organization_payment_day CHECK (salary_payment_day IS NULL OR salary_payment_day BETWEEN 1 AND 28);
-- The organization's legal identity for PDFs defaults to GRIIPBUDDY LLC (editable in Settings → Branding).
-- Salary is monthly: weekly statements are off by default (an administrator can re-enable them for legacy months).

-- Editable option lists. Codes are stored on records; labels and availability are configurable.
CREATE TABLE option_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 list VARCHAR(30) NOT NULL CHECK (list IN ('LEAVE_CATEGORY','ASSET_TYPE','DOCUMENT_TYPE','EMPLOYMENT_TYPE','ADJUSTMENT_CATEGORY')),
 code VARCHAR(20) NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,19}$'),
 label VARCHAR(100) NOT NULL CHECK (length(btrim(label))>0),
 sort_order INTEGER NOT NULL DEFAULT 0,
 is_active BOOLEAN NOT NULL DEFAULT true,
 attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes)='object'),
 created_by UUID REFERENCES users(id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>=1),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (list,code)
);
CREATE FUNCTION protect_option_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Option items are retained; deactivate instead';END IF;
 IF NEW.list<>OLD.list OR NEW.code<>OLD.code OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Option list and code are immutable';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER option_items_history_guard BEFORE UPDATE OR DELETE ON option_items FOR EACH ROW EXECUTE FUNCTION protect_option_items();
INSERT INTO option_items(list,code,label,sort_order,attributes) VALUES
 ('LEAVE_CATEGORY','ANNUAL','Annual leave',10,'{"paid":true,"yearlyDays":null}'),
 ('LEAVE_CATEGORY','SICK','Sick leave',20,'{"paid":true,"yearlyDays":null}'),
 ('LEAVE_CATEGORY','PERSONAL','Personal / casual leave',30,'{"paid":true,"yearlyDays":null}'),
 ('LEAVE_CATEGORY','EMERGENCY','Emergency leave',40,'{"paid":true,"yearlyDays":null}'),
 ('LEAVE_CATEGORY','UNPAID','Unpaid leave',50,'{"paid":false,"yearlyDays":null}'),
 ('LEAVE_CATEGORY','OTHER','Other leave',60,'{"paid":true,"yearlyDays":null}'),
 ('ASSET_TYPE','LAPTOP','Laptop',10,'{}'),('ASSET_TYPE','PHONE','Phone',20,'{}'),('ASSET_TYPE','CAMERA','Camera',30,'{}'),
 ('ASSET_TYPE','SIM','SIM card',40,'{}'),('ASSET_TYPE','ACCESS_CARD','Access card',50,'{}'),('ASSET_TYPE','OTHER','Other',60,'{}'),
 ('DOCUMENT_TYPE','PASSPORT','Passport',10,'{}'),('DOCUMENT_TYPE','NATIONAL_ID','National ID',20,'{}'),
 ('DOCUMENT_TYPE','EMPLOYMENT_CONTRACT','Employment contract',30,'{}'),('DOCUMENT_TYPE','EDUCATION','Education',40,'{}'),
 ('DOCUMENT_TYPE','VISA_WORK_PERMIT','Visa / work permit',50,'{}'),('DOCUMENT_TYPE','BANK','Bank',60,'{}'),('DOCUMENT_TYPE','OTHER','Other',70,'{}'),
 ('EMPLOYMENT_TYPE','FULL_TIME','Full-time',10,'{}'),('EMPLOYMENT_TYPE','PART_TIME','Part-time',20,'{}'),('EMPLOYMENT_TYPE','CONTRACT','Contract',30,'{}'),
 ('EMPLOYMENT_TYPE','INTERN','Intern',40,'{}'),('EMPLOYMENT_TYPE','OTHER','Other',50,'{}'),
 ('ADJUSTMENT_CATEGORY','BONUS','Bonus',10,'{"kind":"BONUS"}'),('ADJUSTMENT_CATEGORY','ALLOWANCE','Allowance',20,'{"kind":"BONUS"}'),
 ('ADJUSTMENT_CATEGORY','DEDUCTION','Deduction',30,'{"kind":"DEDUCTION"}'),('ADJUSTMENT_CATEGORY','OTHER','Other adjustment',40,'{"kind":"OTHER"}');
-- Preserve any value already stored on records (for example a historical code) as an inactive item.
INSERT INTO option_items(list,code,label,sort_order,is_active)
 SELECT DISTINCT 'LEAVE_CATEGORY',category,initcap(replace(category,'_',' ')),900,false FROM leave_requests WHERE category ~ '^[A-Z][A-Z0-9_]{0,19}$'
 UNION SELECT DISTINCT 'ASSET_TYPE',type,initcap(replace(type,'_',' ')),900,false FROM assets WHERE type ~ '^[A-Z][A-Z0-9_]{0,19}$'
 UNION SELECT DISTINCT 'EMPLOYMENT_TYPE',employment_type,initcap(replace(employment_type,'_',' ')),900,false FROM employment_periods WHERE employment_type ~ '^[A-Z][A-Z0-9_]{0,19}$'
 ON CONFLICT (list,code) DO NOTHING;

-- Lists become data: replace fixed value checks with code-format checks.
ALTER TABLE leave_requests DROP CONSTRAINT leave_category;
ALTER TABLE leave_requests ADD CONSTRAINT leave_category_code CHECK (category ~ '^[A-Z][A-Z0-9_]{0,19}$');
ALTER TABLE employment_periods DROP CONSTRAINT employment_type_valid;
ALTER TABLE employment_periods ADD CONSTRAINT employment_type_code CHECK (employment_type ~ '^[A-Z][A-Z0-9_]{0,29}$');
DO $$ DECLARE c record;BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='assets'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%LAPTOP%' LOOP
  EXECUTE format('ALTER TABLE assets DROP CONSTRAINT %I',c.conname);END LOOP;
END $$;
ALTER TABLE assets ADD CONSTRAINT asset_type_code CHECK (type ~ '^[A-Z][A-Z0-9_]{0,19}$');
ALTER TABLE employee_documents ALTER COLUMN type TYPE VARCHAR(20) USING type::text;
DROP TYPE "DocumentType";
ALTER TABLE employee_documents ADD CONSTRAINT document_type_code CHECK (type ~ '^[A-Z][A-Z0-9_]{0,19}$');

-- Adjustment categories label the payroll kind (bonus, deduction, other) without changing the arithmetic.
ALTER TABLE salary_adjustments ADD COLUMN category VARCHAR(20) CHECK (category IS NULL OR category ~ '^[A-Z][A-Z0-9_]{0,19}$');

-- Per-employee yearly leave allowance overrides (the category default applies otherwise).
CREATE TABLE leave_allowances (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id UUID NOT NULL REFERENCES employees(id),
 year SMALLINT NOT NULL CHECK (year BETWEEN 1900 AND 2199),
 category VARCHAR(20) NOT NULL CHECK (category ~ '^[A-Z][A-Z0-9_]{0,19}$'),
 days NUMERIC(5,1) NOT NULL CHECK (days>=0 AND days<=366),
 reason VARCHAR(500) NOT NULL CHECK (length(btrim(reason))>0),
 created_by UUID NOT NULL REFERENCES users(id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>=1),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (employee_id,year,category)
);
CREATE TRIGGER leave_allowances_history_guard BEFORE DELETE ON leave_allowances FOR EACH ROW EXECUTE FUNCTION protect_option_items();

-- Monthly-only payroll: months calculate directly from attendance. An open weekly-ledger month without
-- finalized weekly statements may move to the monthly method; finalized history keeps its method.
DO $$ DECLARE c record;BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='salary_periods'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%calculation_method%' LOOP
  EXECUTE format('ALTER TABLE salary_periods DROP CONSTRAINT %I',c.conname);END LOOP;
END $$;
ALTER TABLE salary_periods ADD CONSTRAINT salary_calculation_method CHECK (calculation_method IN ('LEGACY_MONTHLY','WEEKLY_ATTENDANCE','MONTHLY_ATTENDANCE'));
DO $$ DECLARE source TEXT;guard TEXT:='OR NEW.calculation_method<>OLD.calculation_method';BEGIN
 source:=pg_get_functiondef('protect_pay_history()'::regprocedure);
 IF position(guard IN source)=0 THEN RAISE EXCEPTION 'Unexpected salary history guard';END IF;
 EXECUTE replace(source,guard,'OR (NEW.calculation_method<>OLD.calculation_method AND NOT (OLD.calculation_method=''WEEKLY_ATTENDANCE'' AND NEW.calculation_method=''MONTHLY_ATTENDANCE'' AND OLD.status<>''FINALIZED'' AND NOT EXISTS(SELECT 1 FROM weekly_earning_statements w WHERE w.status=''FINALIZED'' AND w.week_start_date<NEW.end_date AND w.week_end_date>NEW.start_date)))');
END $$;
