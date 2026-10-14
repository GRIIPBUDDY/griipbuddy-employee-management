"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";
import { Field, SelectField, CheckboxField, FieldGrid } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
export function DocumentUpload({ employeeId, types }: { employeeId: string; types: { code: string; label: string }[] }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), busy = useRef(false);
  const router = useRouter();
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (busy.current) return; busy.current = true;
    const form = event.currentTarget; setPending(true); setError("");
    try {
      const response = await fetch(`/api/employees/${employeeId}/documents`, { method: "POST", body: new FormData(form) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "Upload failed. Check the file and try again."); return; }
      window.dispatchEvent(new CustomEvent("workspace:saved", { detail: "Document uploaded and stored privately." }));
      form.reset(); form.dispatchEvent(new CustomEvent("action:success", { bubbles: true })); router.refresh();
    } catch { setError("Upload failed. Please retry."); } finally { setPending(false); busy.current = false; }
  }}><fieldset disabled={pending} className="space-y-4"><FieldGrid><Field label="Display name" name="displayName" required maxLength={150} /><SelectField label="Category" name="type" defaultValue={types.some(t => t.code === "OTHER") ? "OTHER" : types[0]?.code}>{types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</SelectField><Field label="Issue date" name="issuedOn" type="date" /><Field label="Expiry date" name="expiresOn" type="date" hint="Expiry alerts are sent 30 days before." /></FieldGrid>
    <Field label="File" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required hint="PDF, JPEG or PNG, up to 10 MiB. Files are stored outside public directories." />
    <CheckboxField name="employeeVisible" label="Release to the employee" description="The employee can view and download this document from their portal." />
    <CheckboxField name="profilePhoto" label="Use as profile photo" description="Requires a released JPEG or PNG in the Other category." /></fieldset>
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
    <Button type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{pending ? "Uploading…" : "Upload document"}</Button>
  </form>;
}
