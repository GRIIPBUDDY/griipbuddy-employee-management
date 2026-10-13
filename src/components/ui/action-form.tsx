"use client";
import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, LoaderCircle, AlertCircle } from "lucide-react";
import { Button } from "./button";
import { ConfirmDialog, type Confirmation } from "./confirm-dialog";
import { cn } from "@/lib/utils/cn";
import type { ActionState } from "@/types/auth";
type Variant = "default" | "outline" | "secondary" | "ghost" | "destructive";
/**
 * Server Action form: duplicate-submit protection, optional confirmation, pending state and server-confirmed feedback.
 * Success is only shown after the action resolves successfully; failures keep the entered values.
 * `compact` renders an inline single-button form (status is reported through the global toast and an inline error).
 */
export function ActionForm({ action, children, submitLabel, resetOnSuccess = false, preserveValuesAfterSubmit = false, confirmation, submitVariant, submitSize = "default", compact = false, className, submitIcon, footer }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; children?: React.ReactNode; submitLabel: string; resetOnSuccess?: boolean; preserveValuesAfterSubmit?: boolean; confirmation?: Confirmation; submitVariant?: Variant; submitSize?: "default" | "sm"; compact?: boolean; className?: string; submitIcon?: React.ReactNode; footer?: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null), confirmed = useRef(false), inFlight = useRef(false), snapshot = useRef<FormData | null>(null);
  const [state, formAction, pending] = useActionState(async (previous: ActionState, data: FormData): Promise<ActionState> => {
    try {
      const result = await action(previous, data);
      if (result.success) {
        window.dispatchEvent(new CustomEvent("workspace:saved", { detail: result.success }));
        // Close an enclosing Dialog now, before the revalidated page commits and may replace this form.
        form.current?.dispatchEvent(new CustomEvent("action:success", { bubbles: true }));
      }
      return result;
    }
    catch { return { error: "The request could not be completed. Your entries are preserved. Try again or refresh to check the latest status." }; }
    finally { inFlight.current = false; }
  }, {});
  useEffect(() => {
    if (state.error && snapshot.current && form.current) {
      // React form actions reset uncontrolled fields even when returning validation errors.
      for (const field of Array.from(form.current.elements)) {
        if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !field.name || field.type === "hidden" || field.type === "file") continue;
        const values = snapshot.current.getAll(field.name);
        if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) field.checked = values.includes(field.value);
        else if (field instanceof HTMLSelectElement && field.multiple) Array.from(field.options).forEach(option => { option.selected = values.includes(option.value); });
        else if (typeof values[0] === "string") field.value = values[0];
      }
    }
    if (state.success && resetOnSuccess) form.current?.reset();
  }, [state, resetOnSuccess]);
  const button = <Button disabled={pending} type="submit" size={submitSize} variant={submitVariant ?? (confirmation?.destructive ? "destructive" : "default")}>{pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : submitIcon}{pending ? "Saving…" : submitLabel}</Button>;
  const error = state.error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#fecdca] bg-danger-soft px-3 py-2 text-sm leading-6 text-[#7a271a]"><AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />{state.error}</p>;
  return <><form ref={form} action={formAction} aria-busy={pending} className={cn(compact ? "inline-flex flex-col items-start gap-2" : "space-y-5", className)} onReset={event => {
    // Native action resets can change a controlled select without changing its React state.
    if (preserveValuesAfterSubmit) event.preventDefault();
  }} onSubmit={event => {
    if (pending || inFlight.current) { event.preventDefault(); return; }
    if (confirmation && !confirmed.current) { event.preventDefault(); dialog.current?.showModal(); return; }
    confirmed.current = false; inFlight.current = true; snapshot.current = new FormData(event.currentTarget);
  }}>
    {compact ? <>{children}{button}{error}</> : <>
      <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>
      {error}
      {state.success && <p role="status" className="flex items-start gap-2 rounded-lg border border-[#abefc6] bg-success-soft px-3 py-2 text-sm leading-6 text-[#054f31]"><CheckCircle2 size={16} className="mt-1 shrink-0" aria-hidden="true" />{state.success}</p>}
      <div className="flex flex-wrap items-center gap-3">{button}{footer}</div>
    </>}
  </form>{confirmation && <ConfirmDialog dialogRef={dialog} confirmation={confirmation} onConfirm={() => { dialog.current?.close(); confirmed.current = true; form.current?.requestSubmit(); }} />}</>;
}
