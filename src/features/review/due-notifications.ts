import "server-only";
import pg from "pg";
import { db } from "@/lib/db/client";
import { databaseNow } from "@/features/time/clock";
import { localDate,dateKey,dateValue,addDays } from "@/features/time/dates";
import { documentParentVisible } from "@/features/people-operations/access";
import { notify } from "./notifications";

// One-off runtime invocation, suitable for the frozen daily host schedule. No HTTP route.
// A session lock covers the run; short batches use the established mutation lock.
export async function processDueNotifications() {
 const lock=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});await lock.connect();
 let processed=0;
 try {
  if(!(await lock.query("SELECT pg_try_advisory_lock(73102303) AS locked")).rows[0].locked)return {skipped:true,processed};
  for(const kind of ["documents","attendance","overtime"] as const){
   let cursor:string|undefined;
   for(;;){
    const batch=await db.$transaction(async tx=>{
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(73102301)`;
     const now=await databaseNow(tx),settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true}}),today=localDate(now,settings.timezone);
     const page={orderBy:{id:"asc" as const},take:100,...(cursor?{where:{id:{gt:cursor}}}:{})};
     const rows=kind==="documents"?await tx.employeeDocument.findMany({...page,where:{...page.where,deletedAt:null,expiresOn:{lte:dateValue(addDays(today,30))}},select:{id:true,employeeId:true,expiresOn:true,employeeVisible:true}}):
      kind==="attendance"?await tx.attendanceSession.findMany({...page,where:{...page.where,voidedAt:null,checkoutAt:null,scheduledEndAt:{lt:now}},select:{id:true,employeeId:true,revision:true}}):
      await tx.overtimeReview.findMany({...page,where:{...page.where,status:"PENDING"},select:{id:true,employeeId:true,revision:true}});
     for(const row of rows){
      if(kind==="documents"&&"expiresOn"in row&&row.expiresOn){
       const expiry=dateKey(row.expiresOn);
       for(const milestone of ["30","expired"]){
        if(milestone==="expired"&&expiry>today)continue;
        const event=milestone==="30"?"DOCUMENT_EXPIRING":"DOCUMENT_EXPIRED",key=`document-expiry:${row.id}:${expiry}:${milestone}`,text=milestone==="30"?"An employee document is due to expire or has passed its expiry date.":"An employee document has reached its expiry date.";
        await notify(tx,row.employeeId,`STAFF_${event}`,"employee_documents",row.id,key,text,true);
        if(row.employeeVisible&&await documentParentVisible(tx,row.employeeId,row.id))await notify(tx,row.employeeId,event,"employee_documents",row.id,`own-${key}`,milestone==="30"?"Your released employee document is due to expire or has passed its expiry date.":"Your released employee document has reached its expiry date.");
       }
      } else if("revision"in row){
       const event=kind==="attendance"?"MISSING_CHECKOUT":"OVERTIME_PENDING",key=kind==="attendance"?`missing-checkout:${row.id}:${row.revision}`:`overtime-pending:${row.id}:${row.revision}`,source=kind==="attendance"?"attendance_sessions":"overtime_reviews";
       await notify(tx,row.employeeId,`STAFF_${event}`,source,row.id,key,kind==="attendance"?"A scheduled attendance session is missing checkout.":"A completed weekly overtime calculation needs review.",true);
       if(kind==="attendance")await notify(tx,row.employeeId,event,source,row.id,`own-${key}`,"Your scheduled period ended and checkout is missing. Check out or request a correction.");
      }
     }
     return {last:rows.at(-1)?.id,size:rows.length};
    },{timeout:30000});
    processed+=batch.size;if(batch.size<100)break;cursor=batch.last;
   }
  }
  return {skipped:false,processed};
 } finally {await lock.query("SELECT pg_advisory_unlock(73102303)");await lock.end();}
}
