"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const router = useRouter();
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget;
    setPending(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/employees/${employeeId}/documents`, { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Upload failed."); return; }
      setSuccess("Document uploaded."); form.reset(); router.refresh();
    } catch { setError("Upload failed. Please retry."); } finally { setPending(false); }
  }}><div className="grid gap-4 sm:grid-cols-2"><Field label="Display name" name="displayName" required maxLength={150} /><SelectField label="Document category" name="type" defaultValue="OTHER">{["PASSPORT", "NATIONAL_ID", "EMPLOYMENT_CONTRACT", "EDUCATION", "VISA_WORK_PERMIT", "BANK", "OTHER"].map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</SelectField><Field label="Issue date (optional)" name="issuedOn" type="date" /><Field label="Expiry date (optional)" name="expiresOn" type="date" /></div>
    <Field label="File — PDF, JPEG or PNG; maximum 10 MiB" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="employeeVisible" />Release for employee viewing</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="profilePhoto" />Use as profile photo (released JPEG/PNG in Other)</label>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}{success && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}<Button type="submit" disabled={pending}>{pending ? "Uploading…" : "Upload document"}</Button>
  </form>;
}
