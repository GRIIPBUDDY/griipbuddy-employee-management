import { it, expect } from "vitest";
import { overtimeDecisionFromForm } from "@/features/review/decision-input";
import { overtimeDecisionSchema } from "@/features/review/validation";
const data=(decision:string)=>{const form=new FormData();Object.entries({id:"0db60871-631a-4698-b89d-65c3037712de",revision:"3",decision,approvedHours:"3",approvedMinutes:"20",approvedRemainder:"15",comment:decision==="APPROVED"?"Evidence checked":""}).forEach(([key,value])=>form.set(key,value));return form;};
it("normalizes rejection to zero despite prefilled positive browser approval fields",()=>expect(overtimeDecisionSchema.parse(overtimeDecisionFromForm(data("REJECTED")))).toMatchObject({approvedSeconds:0,comment:"",decision:"REJECTED"}));
it("preserves exact whole-second partial approval amounts",()=>expect(overtimeDecisionSchema.parse(overtimeDecisionFromForm(data("APPROVED")))).toMatchObject({approvedSeconds:12015,revision:3}));
it("permits a trimmed optional reason and caps its length",()=>{const input=overtimeDecisionFromForm(data("REJECTED"));expect(overtimeDecisionSchema.parse({...input,comment:"  Evidence checked  "}).comment).toBe("Evidence checked");expect(overtimeDecisionSchema.safeParse({...input,comment:"x".repeat(501)}).success).toBe(false);});
it.each(["unexpected","STALE","FINALIZED"])("rejects injected decision %s",decision=>expect(overtimeDecisionSchema.safeParse(overtimeDecisionFromForm(data(decision))).success).toBe(false));
it("rejects fractional approval and invalid revisions",()=>{const form=data("APPROVED");form.set("approvedRemainder","0.5");expect(overtimeDecisionSchema.safeParse(overtimeDecisionFromForm(form)).success).toBe(false);form.set("revision","0");expect(overtimeDecisionSchema.safeParse(overtimeDecisionFromForm(form)).success).toBe(false);});
