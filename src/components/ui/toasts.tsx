"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
export function Toasts() {
  const [message,setMessage]=useState<string|null>(null);
  useEffect(()=>{const receive=(event:Event)=>setMessage((event as CustomEvent<string>).detail);window.addEventListener("workspace:saved",receive);return()=>window.removeEventListener("workspace:saved",receive);},[]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(null),6000);return()=>clearTimeout(timer);},[message]);
  return message?<div className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-sm shadow-lg"><CheckCircle2 aria-hidden="true" size={20} className="shrink-0 text-emerald-600"/><p className="max-w-sm">{message}</p><button type="button" onClick={()=>setMessage(null)} aria-label="Dismiss notification" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={16}/></button></div>:null;
}
