import readXlsxFile from "read-excel-file/node";
import yauzl from "yauzl";

export const MAX_EXCEL_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_EXCEL_SHEETS = 20;
export const MAX_EXCEL_CELLS = 100_000;
const MAX_EXCEL_ZIP_ENTRIES = 2_000;
const MAX_EXCEL_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

type ExcelCellValue = string | number | boolean | Date | null;

export type ExcelWorksheet = {
  name: string;
  data: ExcelCellValue[][];
  rowCount: number;
  columnCount: number;
};

export type ExcelWorkbook = {
  worksheets: ExcelWorksheet[];
  getWorksheet: (name: string) => ExcelWorksheet | undefined;
};

function asBuffer(value: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function printableCellValue(value: ExcelCellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function normalizedCellText(value: ExcelCellValue | undefined): string {
  return printableCellValue(value).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function parseCellAddress(address: string): { rowIndex: number; columnIndex: number } | undefined {
  const match = /^([A-Z]+)(\d+)$/i.exec(address.trim());
  if (!match) return undefined;

  const letters = match[1].toUpperCase();
  let columnIndex = 0;
  for (const letter of letters) columnIndex = columnIndex * 26 + letter.charCodeAt(0) - 64;

  const rowIndex = Number(match[2]) - 1;
  return rowIndex >= 0 && columnIndex > 0 ? { rowIndex, columnIndex: columnIndex - 1 } : undefined;
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
      let settled = false;
      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(new Error(reason));
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      zipfile.on("error", () => fail("invalid_zip"));
      zipfile.on("entry", (entry) => {
        entryCount += 1;
        uncompressedBytes += entry.uncompressedSize;
        if (entryCount > MAX_EXCEL_ZIP_ENTRIES) return fail("zip_entry_limit");
        if (uncompressedBytes > MAX_EXCEL_UNCOMPRESSED_BYTES) return fail("zip_uncompressed_limit");
        zipfile.readEntry();
      });
      zipfile.on("end", succeed);
      zipfile.readEntry();
    });
  });
}

export async function readExcelWorkbook(value: Buffer | Uint8Array | ArrayBuffer): Promise<ExcelWorkbook> {
  const sheets = await readXlsxFile(asBuffer(value));
  const worksheets = sheets.map(({ sheet, data }) => {
    const rows = data.map((row) => row as ExcelCellValue[]);
    return {
      name: sheet,
      data: rows,
      rowCount: rows.length,
      columnCount: rows.reduce((maximum, row) => Math.max(maximum, row.length), 0),
    };
  });

  return {
    worksheets,
    getWorksheet(name) {
      return worksheets.find((sheet) => sheet.name === name);
    },
  };
}

export function getWorkbookSheetNames(workbook: ExcelWorkbook): string[] {
  return workbook.worksheets.map((sheet) => sheet.name);
}

export function getCellText(sheet: ExcelWorksheet, address: string): string {
  const position = parseCellAddress(address);
  return position ? normalizedCellText(sheet.data[position.rowIndex]?.[position.columnIndex]) : "";
}

export function getRangeText(sheet: ExcelWorksheet, rangeAddress: string): string {
  const [startAddress, endAddress = startAddress] = rangeAddress.split(":");
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) return "";

  const values: string[] = [];
  for (let rowIndex = Math.min(start.rowIndex, end.rowIndex); rowIndex <= Math.max(start.rowIndex, end.rowIndex); rowIndex += 1) {
    for (let columnIndex = Math.min(start.columnIndex, end.columnIndex); columnIndex <= Math.max(start.columnIndex, end.columnIndex); columnIndex += 1) {
      const text = normalizedCellText(sheet.data[rowIndex]?.[columnIndex]);
      if (text) values.push(text);
    }
  }
  return [...new Set(values)].join(" / ");
}

export function countWorkbookCells(workbook: ExcelWorkbook): number {
  return workbook.worksheets.reduce((total, sheet) => total + sheet.rowCount * sheet.columnCount, 0);
}

export function worksheetToRows(sheet: ExcelWorksheet): unknown[][] {
  return sheet.data.map((row) => row.map((cell) => printableCellValue(cell)));
}
