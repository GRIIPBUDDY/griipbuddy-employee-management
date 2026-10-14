import { apiError,requestIdentity } from "@/lib/http";
import { registerPdf } from "@/features/pay/documents";
import { pdfResponse } from "@/lib/pdf/document";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){try{const file=await registerPdf(await requestIdentity(),(await context.params).id);return pdfResponse(file.bytes,file.filename);}catch(error){return apiError(error);}}
