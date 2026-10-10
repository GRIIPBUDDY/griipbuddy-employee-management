import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field,SelectField } from "@/components/ui/field";
import { Hidden } from "@/components/review/forms";
import { payAction } from "@/features/pay/actions";
export { ActionForm,Field,SelectField,Hidden,payAction };
export const label=(s:string)=>s==="REVIEWED"?"Under Review":s[0]+s.slice(1).toLowerCase();
export function PayNav(){return <nav className="flex flex-wrap gap-5 text-sm text-blue-700"><Link href="/manage/salary">Salary periods</Link><Link href="/manage/adjustments">Adjustments</Link><Link href="/manage/commissions">Pre-orders & commissions</Link></nav>;}
export function Pager({page,hasNext}:{page:number;hasNext:boolean}) {return <nav className="flex gap-5 text-sm"><span>Page {page}</span>{page>1 && <Link href={`?page=${page-1}`}>Previous</Link>}{hasNext && <Link href={`?page=${page+1}`}>Next</Link>}</nav>;}
export function PayDecision({kind,id,revision}:{kind:"adjustmentDecision"|"preorderDecision";id:string;revision:number}) {return <ActionForm action={payAction} submitLabel="Save review decision"><Hidden values={{kind,id,revision}}/><SelectField name="decision" label="Decision"><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></SelectField><Field name="comment" label="Review comment" maxLength={500}/></ActionForm>;}
