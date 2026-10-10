"use client";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "./button";
import type { ActionState } from "@/types/auth";
export function ActionForm({ action, children, submitLabel, resetOnSuccess = false }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; children: React.ReactNode; submitLabel: string; resetOnSuccess?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnSuccess && state.success) form.current?.reset(); }, [state, resetOnSuccess]);
  return <form ref={form} action={formAction} className="space-y-5">
    {children}
    {state.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>}
    <Button disabled={pending} type="submit">{pending ? "Please wait…" : submitLabel}</Button>
  </form>;
}
