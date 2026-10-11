// Disposable local review workspace. Never reads or connects to a production database.
import { testPostgres } from "../tests/postgres";
import { randomBytes,randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { cp,mkdtemp,rm,writeFile,mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import argon2 from "argon2";
import { localDate,weekStart,addDays,dayStart } from "../src/features/time/dates";
import type { Identity } from "../src/types/auth";
const database=await testPostgres();
let stopping=false;
database.owner.on("error",()=>{if(!stopping)console.error("Local fixture connection closed unexpectedly.");});
process.env.DATABASE_URL=database.runtimeUrl;
const {db}=await import("../src/lib/db/client");
const password="Local-Review-Only-2026!",passwordHash=await argon2.hash(password);
const identity=(userId:string):Identity=>({userId,sessionVersion:1,issuedAt:Date.now(),absoluteExpiresAt:Date.now()+43200000});
const admin=await db.user.create({data:{email:"admin@local.example.test",displayName:"Morgan Admin",role:"ADMIN",passwordHash,mustChangePassword:false}});
const hr=await db.user.create({data:{email:"hr@local.example.test",displayName:"Samira HR",role:"HR_MANAGER",passwordHash,mustChangePassword:false}});
const today=localDate(new Date(),"Asia/Dhaka"),week=addDays(weekStart(today),-7);
await db.organizationSettings.create({data:{companyName:"GriipBuddy · Local review",changedBy:admin.id,earningsEffectiveFrom:new Date(week.slice(0,7)+"-01"),overtimePolicyVersions:[{effectiveFrom:"2020-01-06",thresholdSeconds:172800,ruleVersion:1}]}});
const corrections=await import("../src/features/review/corrections"),overtime=await import("../src/features/review/overtime"),schedules=await import("../src/features/time/schedules"),rates=await import("../src/features/pay/rates"),tasks=await import("../src/features/tasks/service");
let reviewId="",employeeId="",staleReviewId="",staleEmployeeId="";
for(const [index,name] of ["Alex Rahman","Jordan Hasan"].entries()){
 const user=await db.user.create({data:{email:index?"jordan@local.example.test":"employee@local.example.test",role:"EMPLOYEE",passwordHash,mustChangePassword:false}});
 const employee=await db.employee.create({data:{userId:user.id,employeeNumber:`GB-${String(index+1).padStart(3,"0")}`,legalName:name,createdBy:admin.id,employmentPeriods:{create:{startDate:new Date("2020-01-01"),departmentLabel:"Operations",positionLabel:"Operations associate",createdBy:admin.id}}},include:{employmentPeriods:true}});
 await rates.publishRate(identity(hr.id),{employeeId:employee.id,employmentPeriodId:employee.employmentPeriods[0].id,effectiveFrom:"2020-01-01",effectiveUntil:"",payType:"MONTHLY",baseAmount:"30000",overtimeHourlyRate:"100",overtimeHourlyEquivalent:"",overtimeMultiplier:"1",reason:"Synthetic local review terms"});
 await schedules.publishSchedule(identity(admin.id),{employeeId:employee.id,employmentPeriodId:employee.employmentPeriods[0].id,effectiveFrom:today,effectiveUntil:"",label:"Operations schedule",reason:"Synthetic local schedule",slots:[1,2,3,4,5,6].map(day=>({weekday:day,startMinute:540,endMinute:1020,endDayOffset:0}))});
 // Seed retained historical schedule evidence only in this disposable database.
 await db.workSchedule.create({data:{employeeId:employee.id,employmentPeriodId:employee.employmentPeriods[0].id,effectiveFrom:new Date(week),effectiveUntil:new Date(today),createdBy:admin.id,label:"Retained review schedule",changeReason:"Synthetic historical fixture",slots:{create:[1,2,3,4,5,6].map(weekday=>({weekday,startMinute:540,endMinute:1080,endDayOffset:0}))}}});
 {
  if(index===0)employeeId=employee.id;else staleEmployeeId=employee.id;
  for(let offset=0;offset<6;offset++){
   const date=addDays(week,offset),start=new Date(dayStart(date,"Asia/Dhaka").getTime()+9*3600000),end=new Date(start.getTime()+9*3600000);
   const id=await corrections.submitCorrection(identity(user.id),{type:"ADD",workDate:date,checkinAt:start.toISOString(),checkoutAt:end.toISOString(),reason:"Synthetic evidence for local overtime review",operationKey:randomUUID()});
   await corrections.decideCorrection(identity(hr.id),{id,decision:"APPROVED",comment:"Synthetic evidence verified"});
  }
  const candidate=(await overtime.calculateOvertime(identity(hr.id),{employeeId:employee.id,week})).id;
  if(index===0)reviewId=candidate;else staleReviewId=candidate;
 }
 await tasks.assignTasks(identity(hr.id),{employeeIds:[employee.id],title:index?"Prepare next week's rota":"Review the warehouse handover",description:"Confirm the checklist and add any missing handover notes.",assignedDate:today,dueDate:addDays(today,1),priority:"HIGH",operationKey:randomUUID()});
}
const port=3021,base=`http://127.0.0.1:${port}`,documents=await mkdtemp(join(tmpdir(),"griipbuddy-ui-documents-"));
await cp(".next/static",".next/standalone/.next/static",{recursive:true});
const env:NodeJS.ProcessEnv={...process.env,DATABASE_URL:database.runtimeUrl,PRIVATE_DOCUMENTS_DIR:documents,APP_BASE_URL:base,AUTH_URL:base,AUTH_SECRET:randomBytes(32).toString("hex"),ALLOW_LOCAL_HTTP:"true",NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",PORT:String(port),HOSTNAME:"127.0.0.1"};
delete env.MIGRATION_DATABASE_URL;
const server=spawn(process.execPath,[".next/standalone/server.js"],{env,stdio:["ignore","pipe","pipe"]});
let output="";server.stdout.on("data",data=>{output+=data.toString();});server.stderr.on("data",data=>{output+=data.toString();});
let ready=false;
for(let i=0;i<100;i++){try{ready=(await fetch(base+"/api/health/ready")).ok;}catch{/* Local server is starting. */}if(ready)break;if(server.exitCode!==null)throw new Error("Local review server exited: "+output);await new Promise(resolve=>setTimeout(resolve,100));}
if(!ready)throw new Error("Local review server failed readiness.");
await mkdir(".local/ui-review",{recursive:true,mode:0o700});
await writeFile(".local/ui-review/session.json",JSON.stringify({pid:process.pid,base,week,employeeId,reviewId,staleReviewId,staleEmployeeId,password,adminEmail:admin.email,hrEmail:hr.email,employeeEmail:"employee@local.example.test",runtimeUrl:database.runtimeUrl},null,2),{mode:0o600});
console.log(`Local review ready: ${base}/login\nSynthetic employee week: ${week}\nReview data saved privately to .local/ui-review/session.json`);
await new Promise<void>(resolve=>{const done=()=>{stopping=true;resolve();};process.once("SIGINT",done);process.once("SIGTERM",done);server.once("exit",done);});
server.kill("SIGTERM");await Promise.allSettled([db.$disconnect(),database.stop()]);await rm(documents,{recursive:true,force:true});await rm(".local/ui-review/session.json",{force:true});
