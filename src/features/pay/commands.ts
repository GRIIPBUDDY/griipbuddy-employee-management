import "server-only";
import { z } from "zod";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated } from "@/lib/validation/schemas";
import type { Identity } from "@/types/auth";
import { payStaff } from "./access";
import { publishRate } from "./rates";
import { createPeriod,calculatePeriod,transitionPeriod } from "./periods";
import { createAdjustment,decideAdjustment,editAdjustment } from "./adjustments";
import { reconcileSalary } from "./reconciliation";
import { submitPreorder,decidePreorder,assignPreorder,updateCommissionPolicy } from "./commissions";
const command=z.object({kind:z.enum(["rate","period","calculate","transition","adjustment","adjustmentDecision","adjustmentEdit","reconcile","preorderStaff","preorderDecision","assign","commissionPolicy"]),data:z.unknown()}).strict();
export async function payCommand(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(command,input);
 switch(v.kind){
  case "rate":return publishRate(identity,v.data);
  case "period":return createPeriod(identity,v.data);
  case "calculate":return calculatePeriod(identity,v.data);
  case "transition":return transitionPeriod(identity,v.data);
  case "adjustment":return createAdjustment(identity,v.data);
  case "adjustmentEdit":return editAdjustment(identity,v.data);
  case "adjustmentDecision":return decideAdjustment(identity,v.data);
  case "reconcile":return reconcileSalary(identity,v.data);
  case "preorderStaff":return submitPreorder(identity,v.data,true);
  case "preorderDecision":return decidePreorder(identity,v.data);
  case "assign":return assignPreorder(identity,v.data);
  case "commissionPolicy":return updateCommissionPolicy(identity,v.data);
 }
}
