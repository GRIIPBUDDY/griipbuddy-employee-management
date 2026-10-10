export type ReportCell=string|number|null;
export type ReportColumn={key:string;label:string};
export function csvCell(value:ReportCell) {
 let text=value===null?"":String(value);
 // Prefix after inspecting through whitespace/control characters; quoting alone is unsafe.
 // eslint-disable-next-line no-control-regex -- control-prefixed spreadsheet formulas must be neutralized.
 if(/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
 return `"${text.replaceAll('"','""')}"`;
}
export function reportCsv(columns:ReportColumn[],rows:Record<string,ReportCell>[]) {
 return "\uFEFF"+[columns.map(c=>csvCell(c.label)).join(","),...rows.map(row=>columns.map(c=>csvCell(row[c.key]??null)).join(","))].join("\r\n")+"\r\n";
}
