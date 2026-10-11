"use client";
import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, LoaderCircle, AlertCircle } from "lucide-react";
import { Button } from "./button";
import { ConfirmDialog, type Confirmation } from "./confirm-dialog";
import type { ActionState } from "@/types/auth";
export function ActionForm({action, children, submitLabel, resetOnSuccess=false, confirmation}: {action:(state:ActionState,form:FormData)=>Promise<ActionState>;children:React.ReactNode;submitLabel:string;resetOnSuccess?:boolean;confirmation?:Confirmation}) {
  const form=useRef<HTMLFormElement>(null),dialog=useRef<HTMLDialogElement>(null),confirmed=useRef(false),inFlight=useRef(false),snapshot=useRef<FormData|null>(null);
  const [state,formAction,pending]=useActionState(async (previous:ActionState,data:FormData):Promise<ActionState>=>{
    try{const result=await action(previous,data);if(result.success)window.dispatchEvent(new CustomEvent("workspace:saved",{detail:result.success}));return result;}catch{return {error:"The request could not be completed. Your entries are preserved. Try again or refresh to check the latest status."};}finally{inFlight.current=false;}
  },{});
  useEffect(()=>{
    if(state.error && snapshot.current && form.current) {
      // React form actions reset uncontrolled fields even when returning validation errors.
      for(const field of Array.from(form.current.elements)) {
        if(!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)||!field.name||field.type==="hidden")continue;
        const values=snapshot.current.getAll(field.name);
        if(field instanceof HTMLInputElement && (field.type==="checkbox"||field.type==="radio"))field.checked=values.includes(field.value);
        else if(field instanceof HTMLSelectElement && field.multiple)Array.from(field.options).forEach(option=>{option.selected=values.includes(option.value);});
        else if(typeof values[0]==="string")field.value=values[0];
      }
    }
    if(state.success&&resetOnSuccess)form.current?.reset();
  },[state,resetOnSuccess]);
  return <><form ref={form} action={formAction} aria-busy={pending} className="space-y-5" onSubmit={event=>{
    if(pending||inFlight.current){event.preventDefault();return;}
    if(confirmation && !confirmed.current){event.preventDefault();dialog.current?.showModal();return;}
    confirmed.current=false;inFlight.current=true;snapshot.current=new FormData(event.currentTarget);
  }}>
    <fieldset disabled={pending} className="min-w-0 space-y-5">{children}</fieldset>
    {state.error&&<p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900"><AlertCircle size={18} className="mt-1 shrink-0" aria-hidden="true"/>{state.error}</p>}
    {state.success&&<p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900"><CheckCircle2 size={18} className="mt-1 shrink-0" aria-hidden="true"/>{state.success}</p>}
    <Button disabled={pending} type="submit" variant={confirmation?.destructive?"destructive":"default"}>{pending&&<LoaderCircle size={16} className="animate-spin" aria-hidden="true"/>}{pending?"Saving…":submitLabel}</Button>
  </form>{confirmation&&<ConfirmDialog dialogRef={dialog} confirmation={confirmation} onConfirm={()=>{dialog.current?.close();confirmed.current=true;form.current?.requestSubmit();}}/>}</>;
}
