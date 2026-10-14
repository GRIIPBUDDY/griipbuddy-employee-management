import { apiError,requestIdentity } from "@/lib/http";
import { reportPdf } from "@/features/insights/report-pdf";
import { pdfResponse } from "@/lib/pdf/document";
export async function GET(request:Request,context:{params:Promise<{kind:string}>}){try{const query=Object.fromEntries(new URL(request.url).searchParams),file=await reportPdf(await requestIdentity(),(await context.params).kind,query);return pdfResponse(file.bytes,file.filename);}catch(error){return apiError(error);}}
