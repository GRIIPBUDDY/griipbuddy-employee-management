import { apiError,requestIdentity } from "@/lib/http";
import { payslipPdf } from "@/features/pay/documents";
import { pdfResponse } from "@/lib/pdf/document";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){try{const file=await payslipPdf(await requestIdentity(),(await context.params).id,true);return pdfResponse(file.bytes,file.filename);}catch(error){return apiError(error);}}
