import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type AttachmentStorageMode = "local_public" | "external_reference";

export function getAttachmentStorageMode(): AttachmentStorageMode {
  const raw = (process.env.ATTACHMENT_STORAGE_MODE ?? "local_public").trim().toLowerCase();
  return raw === "external_reference" ? "external_reference" : "local_public";
}

const ACTIVE_WEB_EXTENSIONS = new Set([
  ".css",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".wasm",
  ".xhtml",
  ".xml",
]);

function sanitizeFileName(name: string): string {
  const safeName = name.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_").slice(0, 120) || "upload.bin";
  const ext = path.extname(safeName).toLowerCase();
  return ACTIVE_WEB_EXTENSIONS.has(ext) ? `${safeName}.bin` : safeName;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isPublicPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

export function isValidStoragePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return isPublicPath(trimmed) || isHttpUrl(trimmed);
}

export async function persistAttachmentToLocalPublic(file: File) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const safeName = sanitizeFileName(file.name || "upload.bin");
  const finalName = `${randomUUID()}-${safeName}`;
  const relativePath = path.posix.join("uploads", yyyy, mm, finalName);
  const diskDir = path.join(process.cwd(), "public", "uploads", yyyy, mm);

  await mkdir(diskDir, { recursive: true });
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(path.join(diskDir, finalName), Buffer.from(arrayBuffer));

  return {
    fileName: file.name || "upload.bin",
    fileType: file.type || undefined,
    fileSizeBytes: file.size,
    storagePath: `/${relativePath}`,
  };
}
