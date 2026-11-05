import ExcelJS from "exceljs";

export type Cell = string | number | null;
export type Table = { name: string; headers: string[]; rows: Cell[][]; /** índices de colunas monetárias (valor em centavos) */ moneyCols?: number[] };

/** Neutraliza injeção de fórmula em planilhas (=, +, -, @, tab, CR no início do texto). */
export function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const brl = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function csvField(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV para Excel brasileiro: separador ";", decimal ",", BOM UTF-8. */
export function toCsv(t: Table): string {
  const money = new Set(t.moneyCols ?? []);
  const lines = [t.headers, ...t.rows].map((row, ri) =>
    row
      .map((c, ci) => {
        if (c === null) return "";
        if (typeof c === "number") return ri > 0 && money.has(ci) ? brl(c) : String(c);
        return csvField(ri === 0 ? c : safeText(c));
      })
      .join(";"),
  );
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function toXlsx(t: Table): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.name.slice(0, 31));
  ws.addRow(t.headers).font = { bold: true };
  const money = new Set(t.moneyCols ?? []);
  for (const row of t.rows) {
    ws.addRow(row.map((c, ci) => (typeof c === "string" ? safeText(c) : c !== null && money.has(ci) ? c / 100 : c)));
  }
  for (const ci of money) ws.getColumn(ci + 1).numFmt = '"R$" #,##0.00';
  ws.columns.forEach((col) => {
    col.width = 18;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
