const PDF_SIGNATURE = Buffer.from("%PDF-");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];

export type IdentityDocumentKind = "pdf" | "png" | "jpeg";

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

export function detectIdentityDocumentKind(buffer: Buffer): IdentityDocumentKind | null {
  if (startsWith(buffer, PDF_SIGNATURE)) return "pdf";
  if (startsWith(buffer, PNG_SIGNATURE)) return "png";
  if (startsWith(buffer, JPEG_PREFIX)) return "jpeg";
  return null;
}

export function isZipContainer(buffer: Buffer): boolean {
  return ZIP_SIGNATURES.some((signature) => startsWith(buffer, signature));
}
