import { logoPng } from "@/features/settings/organization";
// Public organization logo (sign-in page, navigation, favicon-sized uses). Cache busting uses ?v=<revision>.
export async function GET(){return new Response(new Uint8Array(await logoPng()),{headers:{"Content-Type":"image/png","Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});}
