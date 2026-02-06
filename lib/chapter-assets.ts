import path from "path";
import unzipper from "unzipper";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "./prisma";
import { deleteStorageDirectory, deleteStorageFile, writeStorageFile } from "./storage";

export const MAX_SINGLE_FILE_MB = Number(process.env.MAX_SINGLE_FILE_MB ?? 20);
export const MAX_ZIP_FILE_MB = Number(process.env.MAX_ZIP_FILE_MB ?? 500);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const JSON_EXTENSIONS = new Set([".json"]);

export type ZipEntry = {
  entryPath: string;
  fileName: string;
  buffer: Buffer;
};

export function assertFileSize(file: File, maxMb: number, label: string) {
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`${label} نباید بیشتر از ${maxMb} مگابایت باشد`);
  }
}

export function sanitizeZipPath(entryPath: string) {
  const normalized = path.posix.normalize(entryPath).replace(/^\.(\/|\\)/, "");
  if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    return null;
  }
  return normalized.replace(/^\/+/, "");
}

export function getChapterImagePath(chapterId: string, fileName: string) {
  return path.posix.join("chapters", chapterId, "images", fileName);
}

export function getChapterJsonPath(chapterId: string, fileName: string) {
  return path.posix.join("chapters", chapterId, "json", fileName);
}

export function isImageFile(fileName: string) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function isJsonFile(fileName: string) {
  return JSON_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function getBaseName(fileName: string) {
  return path.basename(fileName, path.extname(fileName)).toLowerCase();
}

export async function parseZipEntries(file: File) {
  assertFileSize(file, MAX_ZIP_FILE_MB, "فایل ZIP");
  const buffer = Buffer.from(await file.arrayBuffer());
  const zip = await unzipper.Open.buffer(buffer);
  const entries: ZipEntry[] = [];
  for (const entry of zip.files) {
    if (entry.type !== "File") continue;
    const sanitized = sanitizeZipPath(entry.path);
    if (!sanitized || sanitized.includes("__MACOSX")) continue;
    const fileName = path.posix.basename(sanitized);
    if (!fileName) continue;
    const entryBuffer = await entry.buffer();
    entries.push({ entryPath: sanitized, fileName, buffer: entryBuffer });
  }
  return entries;
}

export async function detectImageMime(buffer: Buffer) {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected && IMAGE_MIME_TYPES.has(detected.mime)) {
    return detected.mime;
  }
  return null;
}

export function sortImageEntries(entries: ZipEntry[]) {
  const numeric = entries.every((entry) => /^\d+$/.test(getBaseName(entry.fileName)));
  return [...entries].sort((a, b) => {
    if (numeric) {
      return Number(getBaseName(a.fileName)) - Number(getBaseName(b.fileName));
    }
    return a.fileName.localeCompare(b.fileName, "fa");
  });
}

export async function saveImageToStorage(chapterId: string, fileName: string, buffer: Buffer) {
  const filePath = getChapterImagePath(chapterId, fileName);
  await writeStorageFile(filePath, buffer);
  return filePath;
}

export async function saveJsonToStorage(chapterId: string, fileName: string, buffer: Buffer) {
  const filePath = getChapterJsonPath(chapterId, fileName);
  await writeStorageFile(filePath, buffer);
  return filePath;
}

export async function deleteChapterAssets(chapterId: string) {
  const assets = await prisma.chapterAsset.findMany({
    where: { chapterId },
    include: { pageJson: true },
  });
  for (const asset of assets) {
    await deleteStorageFile(asset.filePath);
    if (asset.pageJson) {
      await deleteStorageFile(asset.pageJson.jsonPath);
    }
  }
  await prisma.chapterAsset.deleteMany({ where: { chapterId } });
  await deleteStorageDirectory(path.posix.join("chapters", chapterId));
}

export async function deleteAssetWithFiles(assetId: string) {
  const asset = await prisma.chapterAsset.findUnique({
    where: { id: assetId },
    include: { pageJson: true },
  });
  if (!asset) return;
  await deleteStorageFile(asset.filePath);
  if (asset.pageJson) {
    await deleteStorageFile(asset.pageJson.jsonPath);
  }
  await prisma.chapterAsset.delete({ where: { id: assetId } });
}

export async function deleteJsonWithFile(jsonId: string) {
  const json = await prisma.chapterPageJson.findUnique({ where: { id: jsonId } });
  if (!json) return;
  await deleteStorageFile(json.jsonPath);
  await prisma.chapterPageJson.delete({ where: { id: jsonId } });
}
