// Applies to newly written structured audit values and historical viewer projections.
// Historical database rows and permission evidence are never rewritten.
export function redactAudit(value:unknown):unknown {
 if(Array.isArray(value))return value.map(redactAudit);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,item])=>{
  const normalized=key.replace(/[^a-z]/gi,"").toLowerCase();
  if(/password|token|secret|cookie|sessionkey|storagekey|filebytes|filecontents|sha256/.test(normalized))return [key,"[excluded]"];
  if(/bank|accountnumber|passportnumber|nationalid|identitynumber|dateofbirth|emergencycontact|^address$|^phone$/.test(normalized))return [key,"[masked]"];
  return [key,redactAudit(item)];
 }));
 return value;
}
