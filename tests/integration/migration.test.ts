import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { testPostgres } from "../postgres";
it("upgrades populated Phase 3A without losing identities, employment, audit or existing guards", async () => {
  const user = randomUUID(), employee = randomUUID(), period = randomUUID(), audit = randomUUID();
  const database = await testPostgres(async owner => {
    await owner.query("INSERT INTO users(id,email,password_hash,role,must_change_password,updated_at) VALUES($1,'legacy@example.test','old-preserved-hash','ADMIN',false,now())", [user]);
    await owner.query("INSERT INTO employees(id,user_id,employee_number,legal_name,created_by,bank_details,updated_at) VALUES($1,$2,'LEGACY-001','Legacy Employee',$2,$3,now())", [employee, user, { existing: "retained-bank-value" }]);
    await owner.query("INSERT INTO employment_periods(id,employee_id,start_date,department_label,position_label,created_by,updated_at) VALUES($1,$2,'2020-01-01','Legacy department','Legacy position',$3,now())", [period, employee, user]);
    await owner.query("INSERT INTO audit_logs(id,actor_user_id,employee_id,action,entity,request_id) VALUES($1,$2,$3,'LEGACY_EVENT','employees',$4)", [audit, user, employee, randomUUID()]);
  });
  try {
    const old = (await database.owner.query("SELECT e.employee_number,e.bank_details,u.password_hash,p.employment_type FROM employees e JOIN users u ON u.id=e.user_id JOIN employment_periods p ON p.employee_id=e.id WHERE e.id=$1", [employee])).rows[0];
    expect(old).toMatchObject({ employee_number: "LEGACY-001", password_hash: "old-preserved-hash", bank_details: { existing: "retained-bank-value" }, employment_type: "FULL_TIME" });
    expect((await database.owner.query("SELECT department_id,position_id,department_label,position_label FROM employment_periods WHERE id=$1", [period])).rows[0]).toMatchObject({ department_id: expect.any(String), position_id: expect.any(String), department_label: "Legacy department", position_label: "Legacy position" });
    expect((await database.owner.query("SELECT id FROM audit_logs WHERE id=$1", [audit])).rowCount).toBe(1);
    expect((await database.owner.query("SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL")).rows[0].count).toBe(12);
    await expect(database.owner.query("UPDATE employees SET user_id=$1 WHERE id=$2", [randomUUID(), employee])).rejects.toBeDefined();
    await expect(database.owner.query("UPDATE audit_logs SET action='TAMPERED' WHERE id=$1", [audit])).rejects.toBeDefined();
    expect((await database.owner.query("SELECT has_table_privilege('employee_runtime','employee_documents','DELETE') AS can_delete, has_table_privilege('employee_runtime','audit_logs','UPDATE') AS can_update_audit")).rows[0]).toEqual({ can_delete: false, can_update_audit: false });
  } finally { await database.stop(); }
});

it("adds Phase 3F over populated Phase 3E preserving final pay, rates, leave and audit evidence",async()=>{
 const user=randomUUID(),employee=randomUUID(),stint=randomUUID(),rate=randomUUID(),period=randomUUID(),calculation=randomUUID(),leave=randomUUID(),legacyAudit=randomUUID();
 const database=await testPostgres(async(owner,ownerUrl)=>{
  for(const name of ["202610090002_people","202610090003_catalogs","202610090004_time","202610090005_review","202610100006_pay"]){await owner.query(await readFile(`prisma/migrations/${name}/migration.sql`,"utf8"));execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","resolve","--applied",name],{env:{...process.env,MIGRATION_DATABASE_URL:ownerUrl},stdio:"pipe"});}
  await owner.query("INSERT INTO users(id,email,password_hash,role,must_change_password,updated_at) VALUES($1,'phase3e@example.test','preserved-3e-hash','ADMIN',false,now())",[user]);
  await owner.query("INSERT INTO organization_settings(id,company_name,changed_by,overtime_policy_versions,updated_at) VALUES(1,'Existing 3E',$1,'[]',now())",[user]);
  await owner.query("INSERT INTO employees(id,user_id,employee_number,legal_name,created_by,updated_at) VALUES($1,$2,'3E-001','Phase 3E Employee',$2,now())",[employee,user]);
  await owner.query("INSERT INTO employment_periods(id,employee_id,start_date,department_label,position_label,created_by,updated_at) VALUES($1,$2,'2020-01-01','Operations','Associate',$3,now())",[stint,employee,user]);
  await owner.query("INSERT INTO compensation_rates(id,employee_id,employment_period_id,effective_from,pay_type,base_amount,currency,overtime_multiplier,change_reason,created_by,updated_at) VALUES($1,$2,$3,'2020-01-01','MONTHLY',15000,'BDT',1,'Retained terms',$4,now())",[rate,employee,stint,user]);
  await owner.query("INSERT INTO leave_requests(id,employee_id,employment_period_id,start_at,end_at,type,reason,requested_by,updated_at) VALUES($1,$2,$3,'2030-01-08 03:00Z','2030-01-08 07:00Z','PAID','Retained pending leave',$4,now())",[leave,employee,stint,user]);
  await owner.query("INSERT INTO salary_periods(id,start_date,end_date,timezone_snapshot,currency,created_by,updated_at) VALUES($1,'2030-01-01','2030-02-01','Asia/Dhaka','BDT',$2,now())",[period,user]);
  await owner.query("UPDATE salary_periods SET status='APPROVED',calculated_input_revision=input_revision,reviewed_by=$2,reviewed_at=now(),approved_by=$2,approved_at=now() WHERE id=$1",[period,user]);
  await owner.query("BEGIN");await owner.query("SELECT set_config('app.salary_finalizing',$1,true)",[period]);
  await owner.query("INSERT INTO salary_calculations(id,employee_id,salary_period_id,input_revision,base_amount,overtime_amount,commission_amount,bonus_amount,deduction_amount,other_amount,final_amount,calculation_snapshot,calculated_by,calculated_at,finalized_at) VALUES($1,$2,$3,1,15000,0,0,0,0,0,15000,$4,$5,now(),now())",[calculation,employee,period,{formatVersion:1,commissionRelated:false,retained:"Original final snapshot"},user]);
  await owner.query("UPDATE salary_periods SET status='FINALIZED',calculated_input_revision=input_revision,reviewed_by=$2,reviewed_at=now(),approved_by=$2,approved_at=now(),finalized_by=$2,finalized_at=now() WHERE id=$1",[period,user]);await owner.query("COMMIT");
  await owner.query("INSERT INTO audit_logs(id,actor_user_id,employee_id,action,entity,entity_id,request_id) VALUES($1,$2,$3,'RETAINED_3E_FINALIZATION','salary_calculations',$4,$5)",[legacyAudit,user,employee,calculation,randomUUID()]);
 });
 try{
  expect((await database.owner.query("SELECT id FROM audit_logs WHERE id=$1",[legacyAudit])).rowCount).toBe(1);
  expect((await database.owner.query("SELECT final_amount,calculation_snapshot,finalized_at FROM salary_calculations WHERE id=$1",[calculation])).rows[0]).toMatchObject({final_amount:"15000.00",calculation_snapshot:{retained:"Original final snapshot"},finalized_at:expect.any(Date)});
  expect((await database.owner.query("SELECT base_amount FROM compensation_rates WHERE id=$1",[rate])).rows[0].base_amount).toBe("15000.0000");
  expect((await database.owner.query("SELECT type,status,category,operation_key FROM leave_requests WHERE id=$1",[leave])).rows[0]).toEqual({type:"PAID",status:"PENDING",category:"OTHER",operation_key:null});
  await expect(database.owner.query("UPDATE salary_calculations SET final_amount=1 WHERE id=$1",[calculation])).rejects.toBeDefined();
  expect((await database.owner.query("SELECT has_table_privilege('employee_runtime','disciplinary_records','UPDATE') u,has_table_privilege('employee_runtime','asset_assignments','DELETE') d")).rows[0]).toEqual({u:true,d:false});
 }finally{await database.stop();}
});

it("adds Phase 3C over populated Phase 3B without changing private documents or timeline", async () => {
  const user = randomUUID(), employee = randomUUID(), period = randomUUID(), document = randomUUID(), event = randomUUID();
  const database = await testPostgres(async (owner, ownerUrl) => {
    for (const name of ["202610090002_people", "202610090003_catalogs"]) {
      await owner.query(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "resolve", "--applied", name], { env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl }, stdio: "pipe" });
    }
    await owner.query("INSERT INTO users(id,email,password_hash,role,must_change_password,updated_at) VALUES($1,'phase3b@example.test','preserved-3b-hash','ADMIN',false,now())", [user]);
    await owner.query("INSERT INTO employees(id,user_id,employee_number,legal_name,created_by,updated_at) VALUES($1,$2,'3B-001','Phase 3B Employee',$2,now())", [employee,user]);
    await owner.query("INSERT INTO employment_periods(id,employee_id,start_date,department_label,position_label,created_by,updated_at) VALUES($1,$2,'2020-01-01','Operations','Associate',$3,now())", [period,employee,user]);
    await owner.query("INSERT INTO employee_documents(id,employee_id,employment_period_id,type,display_name,storage_key,mime_type,file_size,sha256,uploaded_by,employee_visible,updated_at) VALUES($1,$2,$3,'OTHER','Retained document',$4,'image/png',64,$5,$6,true,now())", [document,employee,period,randomUUID()+'.bin','a'.repeat(64),user]);
    await owner.query("INSERT INTO employee_activities(id,employee_id,event_time,type,title,description,source_type,source_id,employee_visible,created_by,updated_at) VALUES($1,$2,now(),'DOCUMENT_UPLOADED','Retained document event','','employee_documents',$3,true,$4,now())", [event,employee,document,user]);
  });
  try {
    expect((await database.owner.query("SELECT display_name,sha256,employee_visible FROM employee_documents WHERE id=$1", [document])).rows[0]).toEqual({ display_name: "Retained document", sha256: "a".repeat(64), employee_visible: true });
    expect((await database.owner.query("SELECT source_id FROM employee_activities WHERE id=$1", [event])).rows[0].source_id).toBe(document);
    expect((await database.owner.query("SELECT count(*)::int AS n FROM work_schedules")).rows[0].n).toBe(0);
    expect((await database.owner.query("SELECT has_table_privilege('employee_runtime','attendance_sessions','INSERT') AS can_insert,has_table_privilege('employee_runtime','attendance_sessions','DELETE') AS can_delete")).rows[0]).toEqual({ can_insert: true, can_delete: false });
  } finally { await database.stop(); }
});

it("upgrades populated Phase 3C without rewriting schedule identities, attendance times or rule snapshots",async()=>{
 const user=randomUUID(),employee=randomUUID(),period=randomUUID(),schedule=randomUUID(),slot=randomUUID(),session=randomUUID();
 const database=await testPostgres(async(owner,ownerUrl)=>{
  for(const name of ["202610090002_people","202610090003_catalogs","202610090004_time"]){await owner.query(await readFile(`prisma/migrations/${name}/migration.sql`,"utf8"));execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","resolve","--applied",name],{env:{...process.env,MIGRATION_DATABASE_URL:ownerUrl},stdio:"pipe"});}
  await owner.query("INSERT INTO users(id,email,password_hash,role,must_change_password,updated_at) VALUES($1,'phase3c@example.test','preserved-3c-hash','ADMIN',false,now())",[user]);
  await owner.query("INSERT INTO organization_settings(id,company_name,changed_by,overtime_policy_versions,updated_at) VALUES(1,'Existing 3C',$1,'[]',now())",[user]);
  await owner.query("INSERT INTO employees(id,user_id,employee_number,legal_name,created_by,updated_at) VALUES($1,$2,'3C-001','Phase 3C Employee',$2,now())",[employee,user]);
  await owner.query("INSERT INTO employment_periods(id,employee_id,start_date,department_label,position_label,created_by,updated_at) VALUES($1,$2,'2020-01-01','Operations','Associate',$3,now())",[period,employee,user]);
  await owner.query("BEGIN");
  await owner.query("INSERT INTO work_schedules(id,employee_id,employment_period_id,effective_from,label,created_by,change_reason,updated_at) VALUES($1,$2,$3,'2030-01-07','Existing pattern',$4,'Existing reason',now())",[schedule,employee,period,user]);
  await owner.query("INSERT INTO schedule_slots(id,work_schedule_id,weekday,start_minute,end_minute,updated_at) VALUES($1,$2,1,540,780,now())",[slot,schedule]);await owner.query("COMMIT");
  await owner.query("INSERT INTO attendance_sessions(id,employee_id,employment_period_id,schedule_slot_id,work_date,scheduled_start_at,scheduled_end_at,timezone_snapshot,rules_version_snapshot,early_checkin_minutes_snapshot,earliest_checkin_at,checkin_at,checkout_at,source,created_by,revision,checkin_operation_key,updated_at) VALUES($1,$2,$3,$4,'2030-01-07','2030-01-07 03:00Z','2030-01-07 07:00Z','Asia/Dhaka',3,10,'2030-01-07 02:50Z','2030-01-07 02:55Z','2030-01-07 08:30Z','SELF',$5,2,$6,now())",[session,employee,period,slot,user,randomUUID()]);
 });
 try{
  const row=(await database.owner.query("SELECT id,schedule_slot_id,timezone_snapshot,rules_version_snapshot,revision,source,checkin_at,checkout_at FROM attendance_sessions WHERE id=$1",[session])).rows[0];
  expect(row).toMatchObject({id:session,schedule_slot_id:slot,timezone_snapshot:"Asia/Dhaka",rules_version_snapshot:3,revision:2,source:"SELF"});expect(row.checkin_at.toISOString()).toBe("2030-01-07T02:55:00.000Z");expect(row.checkout_at.toISOString()).toBe("2030-01-07T08:30:00.000Z");
  expect((await database.owner.query("SELECT count(*)::int AS n FROM attendance_corrections")).rows[0].n).toBe(0);
  expect((await database.owner.query("SELECT has_table_privilege('employee_runtime','overtime_reviews','UPDATE') AS can_review,has_table_privilege('employee_runtime','attendance_corrections','DELETE') AS can_delete")).rows[0]).toEqual({can_review:true,can_delete:false});
 }finally{await database.stop();}
});
it("adds Phase 3E over populated Phase 3D while retaining overtime decisions, leave, holidays and notifications",async()=>{
 const user=randomUUID(),employee=randomUUID(),stint=randomUUID(),overtime=randomUUID(),leave=randomUUID(),holiday=randomUUID(),notice=randomUUID();
 const database=await testPostgres(async(owner,ownerUrl)=>{
  for(const name of ["202610090002_people","202610090003_catalogs","202610090004_time","202610090005_review"]){await owner.query(await readFile(`prisma/migrations/${name}/migration.sql`,"utf8"));execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","resolve","--applied",name],{env:{...process.env,MIGRATION_DATABASE_URL:ownerUrl},stdio:"pipe"});}
  await owner.query("INSERT INTO users(id,email,password_hash,role,must_change_password,updated_at) VALUES($1,'phase3d@example.test','preserved-3d-hash','ADMIN',false,now())",[user]);
  await owner.query("INSERT INTO organization_settings(id,company_name,changed_by,overtime_policy_versions,updated_at) VALUES(1,'Existing 3D',$1,'[]',now())",[user]);
  await owner.query("INSERT INTO employees(id,user_id,employee_number,legal_name,created_by,updated_at) VALUES($1,$2,'3D-001','Phase 3D Employee',$2,now())",[employee,user]);
  await owner.query("INSERT INTO employment_periods(id,employee_id,start_date,department_label,position_label,created_by,updated_at) VALUES($1,$2,'2020-01-01','Operations','Associate',$3,now())",[stint,employee,user]);
  await owner.query("INSERT INTO overtime_reviews(id,employee_id,week_start_date,timezone_snapshot,threshold_seconds,policy_version,actual_seconds_snapshot,potential_seconds_snapshot,approved_seconds,status,reviewed_by,reviewed_at,review_comment,updated_at) VALUES($1,$2,'2030-01-07','Asia/Dhaka',144000,1,158400,14400,7200,'APPROVED',$3,now(),'Retained decision',now())",[overtime,employee,user]);
  await owner.query("INSERT INTO leave_requests(id,employee_id,employment_period_id,start_at,end_at,type,status,reason,requested_by,reviewed_by,reviewed_at,updated_at) VALUES($1,$2,$3,'2030-01-08 03:00Z','2030-01-08 07:00Z','PAID','APPROVED','Retained paid leave',$4,$4,now(),now())",[leave,employee,stint,user]);
  await owner.query("INSERT INTO calendar_days(id,local_date,name,created_by,updated_at) VALUES($1,'2030-01-09','Retained holiday',$2,now())",[holiday,user]);
  await owner.query("INSERT INTO notifications(id,recipient_user_id,employee_id,event_type,source_type,source_id,event_key,text) VALUES($1,$2,$3,'OVERTIME_DECIDED','overtime_reviews',$4,'retained-event','Safe existing alert')",[notice,user,employee,overtime]);
 });
 try{
  expect((await database.owner.query("SELECT status,approved_seconds,review_comment FROM overtime_reviews WHERE id=$1",[overtime])).rows[0]).toEqual({status:"APPROVED",approved_seconds:7200,review_comment:"Retained decision"});
  expect((await database.owner.query("SELECT type,status FROM leave_requests WHERE id=$1",[leave])).rows[0]).toEqual({type:"PAID",status:"APPROVED"});expect((await database.owner.query("SELECT source_id FROM notifications WHERE id=$1",[notice])).rows[0].source_id).toBe(overtime);
  expect((await database.owner.query("SELECT count(*)::int AS n FROM compensation_rates")).rows[0].n).toBe(0);expect((await database.owner.query("SELECT has_table_privilege('employee_runtime','salary_calculations','UPDATE') AS edit,has_table_privilege('employee_runtime','preorders','DELETE') AS remove")).rows[0]).toEqual({edit:true,remove:false});
 }finally{await database.stop();}
});

it("adds Phase 3G indexes over populated Phase 3F without changing warning, document, notification or audit history",async()=>{
 const user=randomUUID(),employee=randomUUID(),stint=randomUUID(),document=randomUUID(),warning=randomUUID(),notification=randomUUID(),audit=randomUUID();let before:Record<string,Record<string,unknown>>={};
 const snapshot=async(owner:import("pg").Client)=>(await owner.query(`SELECT jsonb_build_object('user',(SELECT to_jsonb(u) FROM users u WHERE id=$1),'employee',(SELECT to_jsonb(e) FROM employees e WHERE id=$2),'stint',(SELECT to_jsonb(p) FROM employment_periods p WHERE id=$3),'document',(SELECT to_jsonb(d) FROM employee_documents d WHERE id=$4),'warning',(SELECT to_jsonb(w) FROM disciplinary_records w WHERE id=$5),'notification',(SELECT to_jsonb(n) FROM notifications n WHERE id=$6),'audit',(SELECT to_jsonb(a) FROM audit_logs a WHERE id=$7)) AS history`,[user,employee,stint,document,warning,notification,audit])).rows[0].history;
 const database=await testPostgres(async(owner,ownerUrl)=>{
  for(const name of ["202610090002_people","202610090003_catalogs","202610090004_time","202610090005_review","202610100006_pay","202610100007_people_operations"]){await owner.query(await readFile(`prisma/migrations/${name}/migration.sql`,"utf8"));execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","resolve","--applied",name],{env:{...process.env,MIGRATION_DATABASE_URL:ownerUrl},stdio:"pipe"});}
  await owner.query("INSERT INTO users(id,email,password_hash,role,must_change_password,updated_at) VALUES($1,'phase3f@example.test','preserved-3f-hash','ADMIN',false,now())",[user]);
  await owner.query("INSERT INTO organization_settings(id,company_name,changed_by,overtime_policy_versions,updated_at) VALUES(1,'Existing 3F',$1,'[]',now())",[user]);
  await owner.query("INSERT INTO employees(id,user_id,employee_number,legal_name,created_by,updated_at) VALUES($1,$2,'3F-001','Existing employee',$2,now())",[employee,user]);
  await owner.query("INSERT INTO employment_periods(id,employee_id,start_date,department_label,position_label,created_by,updated_at) VALUES($1,$2,'2020-01-01','Operations','Associate',$3,now())",[stint,employee,user]);
  await owner.query("INSERT INTO employee_documents(id,employee_id,type,display_name,storage_key,mime_type,file_size,sha256,uploaded_by,employee_visible,expires_on,updated_at) VALUES($1,$2,'OTHER','Retained document',$3,'image/png',64,$4,$5,true,'2030-01-01',now())",[document,employee,randomUUID()+'.bin','a'.repeat(64),user]);
  await owner.query("BEGIN");await owner.query("SELECT set_config('app.actor_user_id',$1,true)",[user]);
  await owner.query("INSERT INTO disciplinary_records(id,employee_id,employment_period_id,issue_date,severity,reason,description,action_taken,staff_notes,attachment_document_id,employee_visible,acknowledgement_requested,published_at,published_by,issued_by,updated_at) VALUES($1,$2,$3,'2026-01-01','WARNING','Retained reason','Retained description','Discuss expectations','Private retained notes',$4,true,true,now(),$5,$5,now())",[warning,employee,stint,document,user]);
  await owner.query("COMMIT");
  await owner.query("INSERT INTO notifications(id,recipient_user_id,employee_id,event_type,source_type,source_id,event_key,text,read_at) VALUES($1,$2,$3,'WARNING_ISSUED','disciplinary_records',$4,'retained-3f-warning','Safe retained alert',now())",[notification,user,employee,warning]);
  await owner.query("INSERT INTO audit_logs(id,actor_user_id,employee_id,action,entity,entity_id,request_id,after) VALUES($1,$2,$3,'WARNING_ISSUED','disciplinary_records',$4,$5,$6)",[audit,user,employee,warning,randomUUID(),{retainedEvidence:true}]);before=await snapshot(owner);
 });
 try{expect(await snapshot(database.owner)).toEqual({...before,user:{...before.user,account_status:"ACTIVE"}});expect((await database.owner.query("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL")).rows[0].n).toBe(12);expect((await database.owner.query("SELECT count(*)::int AS n FROM pg_indexes WHERE indexname IN ('audit_logs_event_time_id_idx','employee_documents_live_expiry_idx','attendance_sessions_incomplete_idx')")).rows[0].n).toBe(3);await expect(database.owner.query("UPDATE audit_logs SET action='TAMPERED' WHERE id=$1",[audit])).rejects.toBeDefined();expect((await database.owner.query("SELECT has_table_privilege('employee_runtime','audit_logs','UPDATE') AS u,has_schema_privilege('employee_runtime','public','CREATE') AS c")).rows[0]).toEqual({u:false,c:false});}finally{await database.stop();}
});
