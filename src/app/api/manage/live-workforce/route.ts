import { apiError } from "@/lib/http";
import { getIdentity } from "@/lib/auth/request";
import { liveWorkforce } from "@/features/time/live";
// Who is working right now. liveWorkforce enforces Admin or HR/Manager itself (one actor check per poll). Always read
// fresh from the database; never cached or shared.
export async function GET(request:Request){try{return Response.json(await liveWorkforce(await getIdentity(),Object.fromEntries(new URL(request.url).searchParams)),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
