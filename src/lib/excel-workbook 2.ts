import ExcelJS from "exceljs";
import yauzl from "yauzl";

export const MAX_EXCEL_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_EXCEL_SHEETS = 20;
export const MAX_EXCEL_CELLS = 100_000;
const MAX_EXCEL_ZIP_ENTRIES = 2_000;
const MAX_EXCEL_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

export type ExcelWorkbook = ExcelJS.Workbook;
export type ExcelWorksheet = ExcelJS.Worksheet;

function asBuffer(value: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function printableCellValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return printableCellValue(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
  }
  return String(value);
}

export async function validateExcelZip(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error("invalid_zip"));
        return;
      }

      let entryCount = 0;
      let uncompressedBytes = 0;
      const fail = (reason: string) => {
        zipfile.close();
        reject(new Error(reason));
      };

      zipfile.on("error", () => fail("invalid_zip"));
      zipfile.on("entry", (entry) => {
        entryCount += 1;
        uncompressedBytes += entry.uncompressedSize;
        if (entryCount > MAX_EXCEL_ZIP_ENTRIES) return fail("zip_entry_limit");
        if (uncompressedBytes > MAX_EXCEL_UNCOMPRESSED_BYTES) return fail("zip_uncompressed_limit");
        zipfile.readEntry();
      });
      zipfile.on("end", resolve);
      zipfile.readEntry();
    });
  });
}

export async function readExcelWorkbook(value: Buffer | Uint8Array | ArrayBuffer): Promise<ExcelWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(asBuffer(value) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

export function getWorkbookSheetNames(workbook: ExcelWorkbook): string[] {
  return workbook.worksheets.map((sheet) => sheet.name);
}

export function getCellText(sheet: ExcelWorksheet, address: string): string {
  const cell = sheet.getCell(address);
  return (cell.text || printableCellValue(cell.value)).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

export function getRangeText(sheet: ExcelWorksheet, rangeAddress: string): string {
  const [start, end = start] = rangeAddress.split(":");
  const startCell = sheet.getCell(start);
  const endCell = sheet.getCell(end);
  const values: string[] = [];
  for (let row = startCell.row; row <= endCell.row; row += 1) {
    for (let column = startCell.col; column <= endCell.col; column += 1) {
      const cell = sheet.getCell(row, column);
      const text = (cell.text || printableCellValue(cell.value)).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
      if (text) values.push(text);
    }
  }
  return [...new Set(values)].join(" / ");
}

export function countWorkbookCells(workbook: ExcelWorkbook): number {
  return workbook.worksheets.reduce((total, sheet) => total + Math.max(0, sheet.rowCount) * Math.max(0, sheet.columnCount), 0);
}

export function worksheetToRows(sheet: ExcelWorksheet): unknown[][] {
  const columnCount = Math.max(sheet.actualColumnCount, sheet.columnCount);
  return Array.from({ length: sheet.rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => printableCellValue(sheet.getCell(rowIndex + 1, columnIndex + 1).value)),
  );
}
