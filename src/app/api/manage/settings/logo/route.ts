import { apiError,requestIdentity } from "@/lib/http";
import { AppError } from "@/lib/utils/errors";
import { updateLogo,resetLogo } from "@/features/settings/organization";
const noStore={"Cache-Control":"private, no-store"};
export async function POST(request:Request){try{const identity=await requestIdentity(true,true);if(Number(request.headers.get("content-length"))>2.2*1024*1024)throw new AppError(400,"LOGO_SIZE","The logo must be 2 MB or smaller.");await updateLogo(identity,(await request.formData()).get("logo"));return Response.json({success:true},{headers:noStore});}catch(error){return apiError(error);}}
export async function DELETE(){try{await resetLogo(await requestIdentity(true,true));return Response.json({success:true},{headers:noStore});}catch(error){return apiError(error);}}
