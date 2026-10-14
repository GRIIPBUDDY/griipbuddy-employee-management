"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
/** Uploads evidence through the private document storage (staff only) and links it to the record. */
export function EvidenceUpload({ id, revision }: { id: string; revision: number }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), busy = useRef(false), router = useRouter();
  return <form className="space-y-3" onSubmit={async event => {
    event.preventDefault(); if (busy.current) return; busy.current = true;
    const form = event.currentTarget; setPending(true); setError("");
    try {
      const data = new FormData(form); data.set("revision", String(revision));
      const response = await fetch(`/api/manage/incidents/${id}/evidence`, { method: "POST", body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "The evidence could not be uploaded."); return; }
      window.dispatchEvent(new CustomEvent("workspace:saved", { detail: "Evidence uploaded privately and linked." }));
      form.reset(); form.dispatchEvent(new CustomEvent("action:success", { bubbles: true })); router.refresh();
    } catch { setError("The evidence could not be uploaded. Please retry."); } finally { setPending(false); busy.current = false; }
  }}><fieldset disabled={pending} className="space-y-3">
    <Field label="File" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required hint="PDF, JPEG or PNG, up to 10 MiB. Stored privately; never public." />
    <Field label="Document name (optional)" name="displayName" maxLength={150} />
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
    <Button type="submit">{pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}Upload evidence</Button>
  </fieldset></form>;
}
