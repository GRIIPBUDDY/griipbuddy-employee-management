// Browser approval fields are irrelevant to a rejection. Direct API decisions still
// go through overtimeDecisionSchema and the service's explicit zero-amount guard.
export function overtimeDecisionFromForm(form:FormData) {
  const text=(key:string)=>String(form.get(key)??""),decision=text("decision");
  return {id:text("id"),revision:Number(text("revision")),decision,approvedSeconds:decision==="REJECTED"?0:Number(text("approvedHours"))*3600+Number(text("approvedMinutes"))*60+Number(text("approvedRemainder")),comment:text("comment")};
}
