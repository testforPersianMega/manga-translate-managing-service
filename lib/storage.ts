import path from "path";
import { promises as fs } from "fs";
import { logError } from "@/lib/error-logger";

export const STORAGE_ROOT = process.env.STORAGE_ROOT ?? "/app/storage";

export function resolveStoragePath(relativePath: string) {
  const root = path.resolve(STORAGE_ROOT);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root)) {
    throw new Error("مسیر فایل نامعتبر است");
  }
  return resolved;
}

export async function ensureDir(absolutePath: string) {
  await fs.mkdir(absolutePath, { recursive: true });
}

export async function writeStorageFile(relativePath: string, buffer: Buffer) {
  const absolutePath = resolveStoragePath(relativePath);
  await ensureDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, buffer);
  return absolutePath;
}

export async function deleteStorageFile(relativePath: string) {
  const absolutePath = resolveStoragePath(relativePath);
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await logError(error, "deleteStorageFile");
      throw error;
    }
  }
}

export async function deleteStorageDirectory(relativePath: string) {
  const absolutePath = resolveStoragePath(relativePath);
  await fs.rm(absolutePath, { recursive: true, force: true });
}
