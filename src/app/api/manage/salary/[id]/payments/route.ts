import { apiError,requestIdentity } from "@/lib/http";
import { paymentExport } from "@/features/pay/documents";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){try{const file=await paymentExport(await requestIdentity(),(await context.params).id);return new Response(file.csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${file.filename}"`,"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
