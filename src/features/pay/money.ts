import { Prisma } from "@/generated/prisma/client";
const Decimal=Prisma.Decimal.clone({precision:40,rounding:Prisma.Decimal.ROUND_HALF_UP});
export const decimal=(value:string|number|Prisma.Decimal)=>new Decimal(value);
export const money=(value:string|number|Prisma.Decimal)=>decimal(value).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toFixed(2);
export const sumMoney=(values:string[])=>values.reduce((a,b)=>a.plus(b),decimal(0));
export function commission(type:string,value:string,orderValue:string|null) {
 return money(type==="FIXED"?decimal(value):decimal(orderValue??0).times(value).div(100));
}
