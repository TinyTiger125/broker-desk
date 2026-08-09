import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AttachmentStorageMode = "local_private" | "postgres_private" | "object_private" | "external_reference";

const POSTGRES_PRIVATE_ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024;

export function getAttachmentStorageMode(): AttachmentStorageMode {
  const raw = (process.env.ATTACHMENT_STORAGE_MODE ?? "local_private").trim().toLowerCase();
  if (raw === "postgres_private") return "postgres_private";
  if (raw === "object_private") return "object_private";
  if (raw === "external_reference") return "external_reference";
  return "local_private";
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

export function isValidStoragePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return isHttpUrl(trimmed);
}

function getPrivateAttachmentRoot() {
  return path.join(process.cwd(), ".broker-desk", "private-attachments");
}

function localPrivateStoragePath(tenantId: string, yyyy: string, mm: string, fileName: string) {
  return `local-private://${tenantId}/${yyyy}/${mm}/${fileName}`;
}

export function isLocalPrivateStoragePath(value: string | undefined): boolean {
  return Boolean(value?.startsWith("local-private://"));
}

export function isPostgresPrivateStoragePath(value: string | undefined): boolean {
  return Boolean(value?.startsWith("postgres-private://"));
}

export function getPostgresPrivateAttachmentLimitBytes(): number {
  return POSTGRES_PRIVATE_ATTACHMENT_LIMIT_BYTES;
}

function parseLocalPrivateStoragePath(storagePath: string) {
  let url: URL;
  try {
    url = new URL(storagePath);
  } catch {
    return null;
  }
  if (url.protocol !== "local-private:" || !/^[a-zA-Z0-9_-]+$/.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    parts.length !== 3 ||
    !/^\d{4}$/.test(parts[0]) ||
    !/^\d{2}$/.test(parts[1]) ||
    !/^[a-zA-Z0-9._-]+$/.test(parts[2])
  ) {
    return null;
  }
  return {
    tenantId: url.hostname,
    yyyy: parts[0],
    mm: parts[1],
    fileName: parts[2],
  };
}

export async function persistAttachmentToLocalPrivate(file: File, tenantId: string) {
  if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    throw new Error("attachment storage requires a valid tenant scope");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("attachment exceeds the 25 MB local development limit");
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const safeName = sanitizeFileName(file.name || "upload.bin");
  const finalName = `${randomUUID()}-${safeName}`;
  const diskDir = path.join(getPrivateAttachmentRoot(), tenantId, yyyy, mm);

  await mkdir(diskDir, { recursive: true });
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(path.join(diskDir, finalName), Buffer.from(arrayBuffer));

  return {
    fileName: file.name || "upload.bin",
    fileType: file.type || undefined,
    fileSizeBytes: file.size,
    storagePath: localPrivateStoragePath(tenantId, yyyy, mm, finalName),
  };
}

export async function readLocalPrivateAttachment(input: { storagePath: string; tenantId: string }) {
  const parsed = parseLocalPrivateStoragePath(input.storagePath);
  if (!parsed || parsed.tenantId !== input.tenantId) return null;
  const diskPath = path.join(getPrivateAttachmentRoot(), parsed.tenantId, parsed.yyyy, parsed.mm, parsed.fileName);
  try {
    return await readFile(diskPath);
  } catch {
    return null;
  }
}
