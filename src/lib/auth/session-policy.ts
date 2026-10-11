// Signed JWT lifetimes are validated at every server boundary. No rolling extension.
export const SESSION_SECONDS=43200;
export function rememberedSeconds(){
 const days=Number(process.env.REMEMBER_ME_DAYS??30);
 if(!Number.isInteger(days) || days<1 || days>90)throw new Error("REMEMBER_ME_DAYS must be an integer from 1 through 90.");
 return days*86400;
}
export function validLifetime(milliseconds:number){return milliseconds===SESSION_SECONDS*1000 || milliseconds===rememberedSeconds()*1000;}
