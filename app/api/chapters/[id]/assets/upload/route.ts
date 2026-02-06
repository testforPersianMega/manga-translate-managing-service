import path from "path";
import { promises as fs } from "fs";
import unzipper from "unzipper";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canEditChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import {
  MAX_SINGLE_FILE_MB,
  MAX_ZIP_FILE_MB,
  assertFileSize,
  detectImageMime,
  getBaseName,
  isImageFile,
  isJsonFile,
  sanitizeZipPath,
  sortImageEntries,
} from "@/lib/chapter-assets";
import { deleteStorageFile, writeStorageFile } from "@/lib/storage";
import { logError } from "@/lib/error-logger";

const TEMP_UPLOAD_ROOT = "/tmp/chapter-upload-jobs";

const UploadStatuses = {
  CLIENT_UPLOADING: "CLIENT_UPLOADING",
  SERVER_RECEIVED: "SERVER_RECEIVED",
  SERVER_VALIDATING: "SERVER_VALIDATING",
  SERVER_UNZIPPING: "SERVER_UNZIPPING",
  SERVER_PROCESSING: "SERVER_PROCESSING",
  SERVER_SAVING: "SERVER_SAVING",
  DONE: "DONE",
  ERROR: "ERROR",
} as const;

type UploadStatus = (typeof UploadStatuses)[keyof typeof UploadStatuses];

type ImageMode = "append" | "replace_all" | "merge_by_filename";
type SingleImageMode = "append" | "insert" | "replace";
type UploadType =
  | "images_zip"
  | "single_image"
  | "json_zip"
  | "single_json"
  | "combined_zip";

interface RouteParams {
  params: { id: string };
}

type ZipEntry = { entryPath: string; fileName: string; buffer: Buffer };

type ImageCreateOp = {
  kind: "create";
  fileName: string;
  filePath: string;
  buffer: Buffer;
  mimeType: string;
  pageIndex: number;
};

type ImageUpdateOp = {
  kind: "update";
  assetId: string;
  fileName: string;
  filePath: string;
  buffer: Buffer;
  mimeType: string;
  oldFilePath: string;
  pageIndex: number;
};

type JsonOp = {
  assetId: string;
  fileName: string;
  filePath: string;
  buffer: Buffer;
  oldJsonPath?: string;
};

function buildUniqueFilePath(
  chapterId: string,
  folder: "images" | "json",
  fileName: string,
  jobId: string,
  index: number,
) {
  const safeName = path.posix.basename(fileName);
  const uniqueName = `${jobId}-${index}-${safeName}`;
  return path.posix.join("chapters", chapterId, folder, uniqueName);
}

async function updateUploadJob(
  jobId: string,
  status: UploadStatus,
  messageFa: string,
  progressCurrent: number | null,
  progressTotal: number | null,
) {
  await prisma.uploadJob.update({
    where: { id: jobId },
    data: {
      status,
      messageFa,
      progressCurrent,
      progressTotal,
    },
  });
}

async function ensureTempDir() {
  await fs.mkdir(TEMP_UPLOAD_ROOT, { recursive: true });
}

async function readZipEntries(jobId: string, zipPath: string) {
  const zip = await unzipper.Open.file(zipPath);
  const sanitizedEntries = zip.files
    .filter((entry) => entry.type === "File")
    .map((entry) => {
      const sanitized = sanitizeZipPath(entry.path);
      if (!sanitized || sanitized.includes("__MACOSX")) return null;
      const fileName = path.posix.basename(sanitized);
      if (!fileName) return null;
      return { entry, sanitized, fileName };
    })
    .filter((entry): entry is { entry: unzipper.File; sanitized: string; fileName: string } =>
      Boolean(entry),
    );

  const total = sanitizedEntries.length;
  let current = 0;
  const entries: ZipEntry[] = [];
  await updateUploadJob(
    jobId,
    UploadStatuses.SERVER_UNZIPPING,
    `در حال استخراج فایل‌ها (۰ از ${total})`,
    0,
    total,
  );
  for (const { entry, sanitized, fileName } of sanitizedEntries) {
    const buffer = await entry.buffer();
    entries.push({ entryPath: sanitized, fileName, buffer });
    current += 1;
    await updateUploadJob(
      jobId,
      UploadStatuses.SERVER_UNZIPPING,
      `در حال استخراج فایل‌ها (${current} از ${total})`,
      current,
      total,
    );
  }
  return entries;
}

async function applyImageOperations(
  chapterId: string,
  mode: ImageMode,
  entries: ZipEntry[],
  jobId: string,
) {
  if (!entries.length) {
    throw new Error("هیچ تصویری در فایل ZIP پیدا نشد");
  }
  if (!entries.every((entry) => isImageFile(entry.fileName))) {
    throw new Error("ZIP باید فقط شامل تصاویر باشد");
  }

  const sorted = sortImageEntries(entries);
  const existingAssets = await prisma.chapterAsset.findMany({
    where: { chapterId },
    include: { pageJson: true },
  });
  const existingByFileName = new Map(
    existingAssets.map((asset) => [asset.fileName, asset]),
  );

  const maxIndex = existingAssets.reduce(
    (max, asset) => Math.max(max, asset.pageIndex),
    0,
  );
  let nextIndex = mode === "append" ? maxIndex + 1 : 1;
  if (mode === "merge_by_filename") {
    nextIndex = maxIndex + 1;
  }

  const operations: Array<ImageCreateOp | ImageUpdateOp> = [];
  let fileIndex = 0;
  for (const entry of sorted) {
    const mime = await detectImageMime(entry.buffer);
    if (!mime) {
      throw new Error(`نوع فایل ${entry.fileName} معتبر نیست`);
    }
    fileIndex += 1;
    const filePath = buildUniqueFilePath(chapterId, "images", entry.fileName, jobId, fileIndex);
    if (mode === "merge_by_filename" && existingByFileName.has(entry.fileName)) {
      const asset = existingByFileName.get(entry.fileName)!;
      operations.push({
        kind: "update",
        assetId: asset.id,
        fileName: entry.fileName,
        filePath,
        buffer: entry.buffer,
        mimeType: mime,
        oldFilePath: asset.filePath,
        pageIndex: asset.pageIndex,
      });
      continue;
    }

    operations.push({
      kind: "create",
      fileName: entry.fileName,
      filePath,
      buffer: entry.buffer,
      mimeType: mime,
      pageIndex: nextIndex,
    });
    nextIndex += 1;
  }

  await updateUploadJob(
    jobId,
    UploadStatuses.SERVER_SAVING,
    "در حال ذخیره اطلاعات",
    null,
    null,
  );

  const createdFiles: string[] = [];
  const oldFiles: string[] = [];
  try {
    for (const operation of operations) {
      await writeStorageFile(operation.filePath, operation.buffer);
      createdFiles.push(operation.filePath);
    }

    const createdAssets: { id: string; fileName: string }[] = [];
    await prisma.$transaction(async (tx) => {
      if (mode === "replace_all") {
        await tx.chapterAsset.deleteMany({ where: { chapterId } });
      }

      for (const operation of operations) {
        if (operation.kind === "update") {
          await tx.chapterAsset.update({
            where: { id: operation.assetId },
            data: {
              filePath: operation.filePath,
              fileName: operation.fileName,
              mimeType: operation.mimeType,
              size: operation.buffer.length,
              pageIndex: operation.pageIndex,
            },
          });
          oldFiles.push(operation.oldFilePath);
        } else {
          const asset = await tx.chapterAsset.create({
            data: {
              chapterId,
              pageIndex: operation.pageIndex,
              filePath: operation.filePath,
              fileName: operation.fileName,
              mimeType: operation.mimeType,
              size: operation.buffer.length,
            },
          });
          createdAssets.push({ id: asset.id, fileName: asset.fileName });
        }
      }
    });

    if (mode === "replace_all") {
      for (const asset of existingAssets) {
        await deleteStorageFile(asset.filePath);
        if (asset.pageJson) {
          await deleteStorageFile(asset.pageJson.jsonPath);
        }
      }
    }
    await Promise.all(oldFiles.map((file) => deleteStorageFile(file)));

    return {
      existingAssets,
      createdAssets,
    };
  } catch (error) {
    await Promise.all(createdFiles.map((file) => deleteStorageFile(file)));
    throw error;
  }
}

async function applyJsonOperations(
  chapterId: string,
  entries: ZipEntry[],
  jobId: string,
  assetByBase: Map<string, { id: string }>,
) {
  if (!entries.length) {
    throw new Error("هیچ فایل JSON در ZIP پیدا نشد");
  }
  if (!entries.every((entry) => isJsonFile(entry.fileName))) {
    throw new Error("ZIP باید فقط شامل فایل‌های JSON باشد");
  }

  const errors: string[] = [];
  const operations: JsonOp[] = [];
  let fileIndex = 0;

  for (const entry of entries) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(entry.buffer.toString("utf-8")) as Record<string, unknown>;
    } catch {
      errors.push(`فایل ${entry.fileName} JSON معتبر نیست`);
      continue;
    }

    const explicitImage =
      typeof data.image === "string" && data.image.trim().length
        ? data.image.trim()
        : null;
    const baseName = getBaseName(explicitImage ?? entry.fileName);
    const asset = assetByBase.get(baseName);
    if (!asset) {
      errors.push(`تصویر متناظر برای ${entry.fileName} پیدا نشد`);
      continue;
    }

    fileIndex += 1;
    const filePath = buildUniqueFilePath(chapterId, "json", entry.fileName, jobId, fileIndex);
    operations.push({
      assetId: asset.id,
      fileName: entry.fileName,
      filePath,
      buffer: entry.buffer,
    });
  }

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }

  await updateUploadJob(
    jobId,
    UploadStatuses.SERVER_SAVING,
    "در حال ذخیره اطلاعات",
    null,
    null,
  );

  const createdFiles: string[] = [];
  const oldFiles: string[] = [];

  try {
    for (const operation of operations) {
      await writeStorageFile(operation.filePath, operation.buffer);
      createdFiles.push(operation.filePath);
    }

    await prisma.$transaction(async (tx) => {
      for (const operation of operations) {
        const existing = await tx.chapterPageJson.findUnique({
          where: { assetId: operation.assetId },
        });
        if (existing) {
          await tx.chapterPageJson.update({
            where: { id: existing.id },
            data: {
              jsonPath: operation.filePath,
              jsonFileName: operation.fileName,
              size: operation.buffer.length,
            },
          });
          oldFiles.push(existing.jsonPath);
        } else {
          await tx.chapterPageJson.create({
            data: {
              chapterId,
              assetId: operation.assetId,
              jsonPath: operation.filePath,
              jsonFileName: operation.fileName,
              size: operation.buffer.length,
            },
          });
        }
      }
    });

    await Promise.all(oldFiles.map((file) => deleteStorageFile(file)));
  } catch (error) {
    await Promise.all(createdFiles.map((file) => deleteStorageFile(file)));
    throw error;
  }
}

async function applySingleImage(
  chapterId: string,
  fileName: string,
  buffer: Buffer,
  mode: SingleImageMode,
  jobId: string,
  pageIndexInput?: number,
) {
  const mime = await detectImageMime(buffer);
  if (!mime || !isImageFile(fileName)) {
    throw new Error("فایل تصویر معتبر نیست");
  }

  const existingAssets = await prisma.chapterAsset.findMany({
    where: { chapterId },
  });
  const maxIndex = existingAssets.reduce(
    (max, asset) => Math.max(max, asset.pageIndex),
    0,
  );

  let pageIndex = maxIndex + 1;
  if (mode === "insert" || mode === "replace") {
    if (!pageIndexInput || pageIndexInput < 1) {
      throw new Error("شماره صفحه باید حداقل ۱ باشد");
    }
    pageIndex = pageIndexInput;
  }

  const filePath = buildUniqueFilePath(chapterId, "images", fileName, jobId, 1);
  await updateUploadJob(
    jobId,
    UploadStatuses.SERVER_SAVING,
    "در حال ذخیره اطلاعات",
    null,
    null,
  );

  await writeStorageFile(filePath, buffer);
  let oldFilePath: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      if (mode === "insert") {
        await tx.chapterAsset.updateMany({
          where: { chapterId, pageIndex: { gte: pageIndex } },
          data: { pageIndex: { increment: 1 } },
        });
      }

      const existing = await tx.chapterAsset.findFirst({
        where: { chapterId, pageIndex },
      });

      if (existing) {
        if (mode === "replace" || mode === "insert") {
          oldFilePath = existing.filePath;
          await tx.chapterAsset.update({
            where: { id: existing.id },
            data: {
              filePath,
              fileName,
              mimeType: mime,
              size: buffer.length,
              pageIndex,
            },
          });
        }
      } else {
        await tx.chapterAsset.create({
          data: {
            chapterId,
            pageIndex,
            filePath,
            fileName,
            mimeType: mime,
            size: buffer.length,
          },
        });
      }
    });
  } catch (error) {
    await deleteStorageFile(filePath);
    throw error;
  }

  if (oldFilePath) {
    await deleteStorageFile(oldFilePath);
  }
}

async function applySingleJson(
  chapterId: string,
  fileName: string,
  buffer: Buffer,
  jobId: string,
  pageIndexInput?: number,
) {
  if (!isJsonFile(fileName)) {
    throw new Error("فایل JSON معتبر نیست");
  }
  if (!pageIndexInput || pageIndexInput < 1) {
    throw new Error("شماره صفحه باید حداقل ۱ باشد");
  }

  const asset = await prisma.chapterAsset.findFirst({
    where: { chapterId, pageIndex: pageIndexInput },
  });
  if (!asset) {
    throw new Error("تصویر متناظر یافت نشد");
  }

  const filePath = buildUniqueFilePath(chapterId, "json", fileName, jobId, 1);
  await updateUploadJob(
    jobId,
    UploadStatuses.SERVER_SAVING,
    "در حال ذخیره اطلاعات",
    null,
    null,
  );

  await writeStorageFile(filePath, buffer);

  try {
    let oldJsonPath: string | null = null;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.chapterPageJson.findUnique({ where: { assetId: asset.id } });
      if (existing) {
        oldJsonPath = existing.jsonPath;
        await tx.chapterPageJson.update({
          where: { id: existing.id },
          data: {
            jsonPath: filePath,
            jsonFileName: fileName,
            size: buffer.length,
          },
        });
      } else {
        await tx.chapterPageJson.create({
          data: {
            chapterId,
            assetId: asset.id,
            jsonPath: filePath,
            jsonFileName: fileName,
            size: buffer.length,
          },
        });
      }
    });

    if (oldJsonPath) {
      await deleteStorageFile(oldJsonPath);
    }
  } catch (error) {
    await deleteStorageFile(filePath);
    throw error;
  }
}

async function processUploadJob(params: {
  jobId: string;
  chapterId: string;
  userId: string;
  uploadType: UploadType;
  mode?: ImageMode | SingleImageMode;
  pageIndex?: number;
  tempPath: string;
  originalFileName: string;
}) {
  const { jobId, chapterId, userId, uploadType, mode, pageIndex, tempPath, originalFileName } =
    params;
  try {
    await updateUploadJob(
      jobId,
      UploadStatuses.SERVER_VALIDATING,
      "در حال بررسی فایل‌ها",
      null,
      null,
    );

    if (uploadType === "single_image") {
      const fileBuffer = await fs.readFile(tempPath);
      await updateUploadJob(
        jobId,
        UploadStatuses.SERVER_PROCESSING,
        "در حال پردازش صفحات و متادیتا",
        null,
        null,
      );
      await applySingleImage(
        chapterId,
        originalFileName,
        fileBuffer,
        mode as SingleImageMode,
        jobId,
        pageIndex,
      );
      await prisma.chapterUploadBatch.create({
        data: { chapterId, uploadedByUserId: userId, type: uploadType },
      });
      await updateUploadJob(jobId, UploadStatuses.DONE, "آپلود با موفقیت انجام شد", null, null);
      return;
    }

    if (uploadType === "single_json") {
      const fileBuffer = await fs.readFile(tempPath);
      await updateUploadJob(
        jobId,
        UploadStatuses.SERVER_PROCESSING,
        "در حال پردازش صفحات و متادیتا",
        null,
        null,
      );
      await applySingleJson(chapterId, originalFileName, fileBuffer, jobId, pageIndex);
      await prisma.chapterUploadBatch.create({
        data: { chapterId, uploadedByUserId: userId, type: uploadType },
      });
      await updateUploadJob(jobId, UploadStatuses.DONE, "آپلود با موفقیت انجام شد", null, null);
      return;
    }

    const entries = await readZipEntries(jobId, tempPath);
    const imageEntries = entries.filter((entry) => isImageFile(entry.fileName));
    const jsonEntries = entries.filter((entry) => isJsonFile(entry.fileName));

    await updateUploadJob(
      jobId,
      UploadStatuses.SERVER_PROCESSING,
      "در حال پردازش صفحات و متادیتا",
      null,
      null,
    );

    if (uploadType === "images_zip") {
      if (entries.length !== imageEntries.length) {
        throw new Error("ZIP باید فقط شامل تصاویر باشد");
      }
      await applyImageOperations(chapterId, mode as ImageMode, imageEntries, jobId);
    } else if (uploadType === "json_zip") {
      if (entries.length !== jsonEntries.length) {
        throw new Error("ZIP باید فقط شامل فایل‌های JSON باشد");
      }
      const assets = await prisma.chapterAsset.findMany({ where: { chapterId } });
      const assetByBase = new Map(assets.map((asset) => [getBaseName(asset.fileName), asset]));
      await applyJsonOperations(chapterId, jsonEntries, jobId, assetByBase);
    } else if (uploadType === "combined_zip") {
      if (!imageEntries.length && !jsonEntries.length) {
        throw new Error("ZIP شامل هیچ فایل معتبری نیست");
      }
      const assets = await prisma.chapterAsset.findMany({ where: { chapterId } });
      const existingByBase =
        mode === "replace_all"
          ? new Map<string, { id: string }>()
          : new Map(assets.map((asset) => [getBaseName(asset.fileName), asset]));
      const newImageBaseNames = new Set(
        imageEntries.map((entry) => getBaseName(entry.fileName)),
      );

      if (jsonEntries.length) {
        const missing = jsonEntries.filter((entry) => {
          const baseName = getBaseName(entry.fileName);
          return !existingByBase.has(baseName) && !newImageBaseNames.has(baseName);
        });
        if (missing.length) {
          throw new Error("برای برخی فایل‌های JSON تصویر متناظر یافت نشد");
        }
      }

      const { existingAssets, createdAssets } = imageEntries.length
        ? await applyImageOperations(chapterId, mode as ImageMode, imageEntries, jobId)
        : { existingAssets: assets, createdAssets: [] };

      const mergedAssetByBase = new Map<string, { id: string }>(
        (mode === "replace_all" ? [] : existingAssets).map((asset) => [
          getBaseName(asset.fileName),
          asset,
        ]),
      );
      createdAssets.forEach((asset) => {
        mergedAssetByBase.set(getBaseName(asset.fileName), asset);
      });

      if (jsonEntries.length) {
        await applyJsonOperations(chapterId, jsonEntries, jobId, mergedAssetByBase);
      }
    }

    await prisma.chapterUploadBatch.create({
      data: { chapterId, uploadedByUserId: userId, type: uploadType },
    });
    await updateUploadJob(jobId, UploadStatuses.DONE, "آپلود با موفقیت انجام شد", null, null);
  } catch (error) {
    await logError(error, `uploadJob:${jobId}`);
    await updateUploadJob(
      jobId,
      UploadStatuses.ERROR,
      (error as Error).message,
      null,
      null,
    );
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
    }

    const chapter = await prisma.chapter.findUnique({ where: { id: params.id } });
    if (!chapter) {
      return NextResponse.json({ error: "چپتر یافت نشد" }, { status: 404 });
    }

    const permissions = await getEffectivePermissions(user.id);
    const canEdit = await canEditChapter(user, chapter);
    if (!canEdit) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "فایلی ارسال نشده است" }, { status: 400 });
    }

    const uploadType = String(formData.get("uploadType") || "") as UploadType;
    const mode = String(formData.get("mode") || "append") as ImageMode | SingleImageMode;
    const pageIndex = formData.get("pageIndex")
      ? Number(formData.get("pageIndex"))
      : undefined;

    const allowedTypes: UploadType[] = [
      "images_zip",
      "single_image",
      "json_zip",
      "single_json",
      "combined_zip",
    ];
    if (!uploadType || !allowedTypes.includes(uploadType)) {
      return NextResponse.json({ error: "نوع آپلود نامعتبر است" }, { status: 400 });
    }

    try {
      if (uploadType === "single_image") {
        if (mode === "replace" || mode === "insert") {
          if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE)) {
            return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
          }
        } else if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD)) {
          return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
        }
        assertFileSize(file, MAX_SINGLE_FILE_MB, "تصویر");
      } else if (uploadType === "single_json") {
        if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD)) {
          return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
        }
        assertFileSize(file, MAX_SINGLE_FILE_MB, "فایل JSON");
      } else {
        if (mode === "replace_all") {
          if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_DELETE)) {
            return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
          }
        } else if (mode === "merge_by_filename") {
          if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE)) {
            return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
          }
        } else if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD)) {
          return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
        }
        assertFileSize(file, MAX_ZIP_FILE_MB, "فایل ZIP");
      }
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }

    const job = await prisma.uploadJob.create({
      data: {
        chapterId: chapter.id,
        userId: user.id,
        status: UploadStatuses.SERVER_RECEIVED,
        progressCurrent: null,
        progressTotal: null,
        messageFa: "فایل‌ها با موفقیت دریافت شدند",
      },
    });

    await ensureTempDir();
    const tempPath = path.join(TEMP_UPLOAD_ROOT, `${job.id}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    void processUploadJob({
      jobId: job.id,
      chapterId: chapter.id,
      userId: user.id,
      uploadType,
      mode,
      pageIndex,
      tempPath,
      originalFileName: file.name,
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    await logError(error, `POST /api/chapters/${params.id}/assets/upload`);
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
