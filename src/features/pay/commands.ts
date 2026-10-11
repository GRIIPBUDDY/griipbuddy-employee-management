import "server-only";
import { z } from "zod";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated } from "@/lib/validation/schemas";
import type { Identity } from "@/types/auth";
import { payStaff } from "./access";
import { publishRate } from "./rates";
import { calculateWeekly,transitionWeekly,recordPayment,correctWeekly } from "./weekly";
import { createPeriod,calculatePeriod,transitionPeriod } from "./periods";
import { createAdjustment,decideAdjustment,editAdjustment } from "./adjustments";
import { reconcileSalary } from "./reconciliation";
import { submitPreorder,decidePreorder,assignPreorder,updateCommissionPolicy,withdrawPreorder } from "./commissions";
const command=z.object({kind:z.enum(["rate","period","calculate","transition","adjustment","adjustmentDecision","adjustmentEdit","reconcile","preorderStaff","preorderCancel","preorderDecision","assign","commissionPolicy","weeklyCalculate","weeklyTransition","payment","weeklyCorrection"]),data:z.unknown()}).strict();
export async function payCommand(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(command,input);
 switch(v.kind){
  case "weeklyCorrection":return correctWeekly(identity,v.data);
  case "weeklyCalculate":return calculateWeekly(identity,v.data);
  case "weeklyTransition":return transitionWeekly(identity,v.data);
  case "payment":return recordPayment(identity,v.data);
  case "rate":return publishRate(identity,v.data);
  case "period":return createPeriod(identity,v.data);
  case "calculate":return calculatePeriod(identity,v.data);
  case "transition":return transitionPeriod(identity,v.data);
  case "adjustment":return createAdjustment(identity,v.data);
  case "adjustmentEdit":return editAdjustment(identity,v.data);
  case "adjustmentDecision":return decideAdjustment(identity,v.data);
  case "reconcile":return reconcileSalary(identity,v.data);
  case "preorderCancel":return withdrawPreorder(identity,validated(z.object({id:z.uuid()}).strict(),v.data).id,true);
  case "preorderStaff":return submitPreorder(identity,v.data,true);
  case "preorderDecision":return decidePreorder(identity,v.data);
  case "assign":return assignPreorder(identity,v.data);
  case "commissionPolicy":return updateCommissionPolicy(identity,v.data);
 }
}
