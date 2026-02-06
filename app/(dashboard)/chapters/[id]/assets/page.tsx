import path from "path";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  canAccessBook,
  canEditChapter,
  canViewChapter,
  getEffectivePermissions,
} from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import {
  MAX_SINGLE_FILE_MB,
  MAX_ZIP_FILE_MB,
  assertFileSize,
  deleteAssetWithFiles,
  deleteChapterAssets,
  deleteJsonWithFile,
  detectImageMime,
  getBaseName,
  isImageFile,
  isJsonFile,
  parseZipEntries,
  saveImageToStorage,
  saveJsonToStorage,
  sortImageEntries,
} from "@/lib/chapter-assets";
import { deleteStorageFile } from "@/lib/storage";
import { BulkUploadForm } from "@/components/BulkUploadForm";

const pageIndexSchema = z
  .number({ invalid_type_error: "شماره صفحه نامعتبر است" })
  .int("شماره صفحه باید عدد صحیح باشد")
  .min(1, "شماره صفحه باید حداقل ۱ باشد");

type ImageMode = "append" | "replace_all" | "merge_by_filename";

type SingleImageMode = "append" | "insert" | "replace";

type BulkState = {
  status: "idle" | "success" | "error";
  message: string;
  report: { chapterId: string; images: number; jsons: number; error?: string }[];
};

async function requireChapterAccess(userId: string, chapterId: string) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) {
    throw new Error("چپتر یافت نشد");
  }
  return chapter;
}

async function assertAssetPermission(
  userId: string,
  chapterId: string,
  permission: string,
  type: "view" | "edit",
) {
  const chapter = await requireChapterAccess(userId, chapterId);
  const permissions = await getEffectivePermissions(userId);
  if (!permissions.has(permission)) {
    throw new Error("عدم دسترسی لازم");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("کاربر یافت نشد");
  }
  const allowed =
    type === "view" ? await canViewChapter(user, chapter) : await canEditChapter(user, chapter);
  if (!allowed) {
    throw new Error("عدم دسترسی لازم");
  }
  return chapter;
}

async function processImageEntries(
  chapterId: string,
  entries: Awaited<ReturnType<typeof parseZipEntries>>,
  mode: ImageMode,
) {
  if (!entries.length) {
    throw new Error("هیچ تصویری در فایل ZIP پیدا نشد");
  }

  if (!entries.every((entry) => isImageFile(entry.fileName))) {
    throw new Error("ZIP باید فقط شامل تصاویر باشد");
  }

  const sorted = sortImageEntries(entries);

  const existingAssets = await prisma.chapterAsset.findMany({ where: { chapterId } });
  const existingByFileName = new Map(
    existingAssets.map((asset) => [asset.fileName, asset]),
  );
  const maxIndex = existingAssets.reduce(
    (max, asset) => Math.max(max, asset.pageIndex),
    0,
  );

  if (mode === "replace_all") {
    await deleteChapterAssets(chapterId);
  }

  let nextIndex = mode === "append" ? maxIndex + 1 : 1;
  if (mode === "merge_by_filename") {
    nextIndex = maxIndex + 1;
  }

  const createdFiles: string[] = [];
  try {
    for (const entry of sorted) {
      const mime = await detectImageMime(entry.buffer);
      if (!mime) {
        throw new Error(`نوع فایل ${entry.fileName} معتبر نیست`);
      }

      if (mode === "merge_by_filename" && existingByFileName.has(entry.fileName)) {
        const asset = existingByFileName.get(entry.fileName)!;
        const filePath = await saveImageToStorage(chapterId, entry.fileName, entry.buffer);
        createdFiles.push(filePath);
        await prisma.chapterAsset.update({
          where: { id: asset.id },
          data: {
            filePath,
            fileName: entry.fileName,
            mimeType: mime,
            size: entry.buffer.length,
          },
        });
        continue;
      }

      const filePath = await saveImageToStorage(chapterId, entry.fileName, entry.buffer);
      createdFiles.push(filePath);
      await prisma.chapterAsset.create({
        data: {
          chapterId,
          pageIndex: nextIndex,
          filePath,
          fileName: entry.fileName,
          mimeType: mime,
          size: entry.buffer.length,
        },
      });
      nextIndex += 1;
    }
  } catch (error) {
    await Promise.all(createdFiles.map((file) => deleteStorageFile(file)));
    throw error;
  }
}

async function processJsonEntries(
  chapterId: string,
  entries: Awaited<ReturnType<typeof parseZipEntries>>,
) {
  if (!entries.length) {
    throw new Error("هیچ فایل JSON در ZIP پیدا نشد");
  }
  if (!entries.every((entry) => isJsonFile(entry.fileName))) {
    throw new Error("ZIP باید فقط شامل فایل‌های JSON باشد");
  }

  const assets = await prisma.chapterAsset.findMany({ where: { chapterId } });
  const assetByBase = new Map(assets.map((asset) => [getBaseName(asset.fileName), asset]));
  const errors: string[] = [];

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

    const filePath = await saveJsonToStorage(chapterId, entry.fileName, entry.buffer);
    const existing = await prisma.chapterPageJson.findUnique({ where: { assetId: asset.id } });
    if (existing) {
      await deleteStorageFile(existing.jsonPath);
      await prisma.chapterPageJson.update({
        where: { id: existing.id },
        data: {
          jsonPath: filePath,
          jsonFileName: entry.fileName,
          size: entry.buffer.length,
        },
      });
    } else {
      await prisma.chapterPageJson.create({
        data: {
          chapterId,
          assetId: asset.id,
          jsonPath: filePath,
          jsonFileName: entry.fileName,
          size: entry.buffer.length,
        },
      });
    }
  }

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }
}

export default async function ChapterAssetsPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.id },
    include: { book: true },
  });

  if (!chapter) {
    redirect("/books");
  }

  const canAccess = await canAccessBook(user, chapter.bookId);
  if (!canAccess) {
    redirect("/books");
  }

  const canView = await canViewChapter(user, chapter);
  if (!canView) {
    redirect("/books");
  }

  const permissions = await getEffectivePermissions(user.id);
  if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW)) {
    redirect(`/chapters/${params.id}`);
  }

  const canEdit = await canEditChapter(user, chapter);
  const canUpload = permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD) && canEdit;
  const canUpdate = permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE) && canEdit;
  const canDelete = permissions.has(PERMISSIONS.CHAPTER_ASSETS_DELETE) && canEdit;
  const canBulk = permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD_MULTI_CHAPTER);

  const assets = await prisma.chapterAsset.findMany({
    where: { chapterId: params.id },
    include: { pageJson: true },
    orderBy: { pageIndex: "asc" },
  });

  async function uploadImagesZip(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    const file = formData.get("zip") as File | null;
    if (!file) {
      throw new Error("فایل ZIP انتخاب نشده است");
    }
    assertFileSize(file, MAX_ZIP_FILE_MB, "فایل ZIP");

    const mode = String(formData.get("mode") || "append") as ImageMode;

    if (mode === "replace_all") {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_DELETE,
        "edit",
      );
    } else if (mode === "merge_by_filename") {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPDATE,
        "edit",
      );
    } else {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPLOAD,
        "edit",
      );
    }

    const entries = await parseZipEntries(file);
    const imageEntries = entries.filter((entry) => isImageFile(entry.fileName));
    if (entries.length !== imageEntries.length) {
      throw new Error("ZIP باید فقط شامل تصاویر باشد");
    }
    await processImageEntries(params.id, imageEntries, mode);

    await prisma.chapterUploadBatch.create({
      data: { chapterId: params.id, uploadedByUserId: sessionUser.id, type: "images_zip" },
    });
    redirect(`/chapters/${params.id}/assets`);
  }

  async function uploadSingleImage(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    const file = formData.get("image") as File | null;
    if (!file) {
      throw new Error("تصویر انتخاب نشده است");
    }
    assertFileSize(file, MAX_SINGLE_FILE_MB, "تصویر");

    const mode = String(formData.get("mode") || "append") as SingleImageMode;
    if (mode === "replace") {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPDATE,
        "edit",
      );
    } else {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPLOAD,
        "edit",
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = await detectImageMime(buffer);
    if (!mime || !isImageFile(file.name)) {
      throw new Error("فایل تصویر معتبر نیست");
    }

    const fileName = path.basename(file.name);
    const existingAssets = await prisma.chapterAsset.findMany({
      where: { chapterId: params.id },
    });
    const maxIndex = existingAssets.reduce(
      (max, asset) => Math.max(max, asset.pageIndex),
      0,
    );

    let pageIndex = maxIndex + 1;
    if (mode === "insert" || mode === "replace") {
      const parsedIndex = pageIndexSchema.safeParse(Number(formData.get("pageIndex")));
      if (!parsedIndex.success) {
        throw new Error(parsedIndex.error.errors[0]?.message ?? "شماره صفحه نامعتبر است");
      }
      pageIndex = parsedIndex.data;
    }

    if (mode === "insert") {
      await prisma.chapterAsset.updateMany({
        where: { chapterId: params.id, pageIndex: { gte: pageIndex } },
        data: { pageIndex: { increment: 1 } },
      });
    }

    const existing = await prisma.chapterAsset.findFirst({
      where: { chapterId: params.id, pageIndex },
    });

    const filePath = await saveImageToStorage(params.id, fileName, buffer);
    if (existing) {
      if (mode === "replace" || mode === "insert") {
        await deleteStorageFile(existing.filePath);
        await prisma.chapterAsset.update({
          where: { id: existing.id },
          data: {
            filePath,
            fileName,
            mimeType: mime,
            size: buffer.length,
          },
        });
      }
    } else {
      await prisma.chapterAsset.create({
        data: {
          chapterId: params.id,
          pageIndex,
          filePath,
          fileName,
          mimeType: mime,
          size: buffer.length,
        },
      });
    }

    await prisma.chapterUploadBatch.create({
      data: { chapterId: params.id, uploadedByUserId: sessionUser.id, type: "single_image" },
    });

    redirect(`/chapters/${params.id}/assets`);
  }

  async function uploadJsonZip(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPLOAD,
      "edit",
    );

    const file = formData.get("zip") as File | null;
    if (!file) {
      throw new Error("فایل ZIP انتخاب نشده است");
    }
    assertFileSize(file, MAX_ZIP_FILE_MB, "فایل ZIP");

    const entries = await parseZipEntries(file);
    const jsonEntries = entries.filter((entry) => isJsonFile(entry.fileName));
    if (entries.length !== jsonEntries.length) {
      throw new Error("ZIP باید فقط شامل فایل‌های JSON باشد");
    }
    await processJsonEntries(params.id, jsonEntries);

    await prisma.chapterUploadBatch.create({
      data: { chapterId: params.id, uploadedByUserId: sessionUser.id, type: "json_zip" },
    });
    redirect(`/chapters/${params.id}/assets`);
  }

  async function uploadSingleJson(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPLOAD,
      "edit",
    );

    const file = formData.get("json") as File | null;
    if (!file) {
      throw new Error("فایل JSON انتخاب نشده است");
    }
    assertFileSize(file, MAX_SINGLE_FILE_MB, "فایل JSON");

    const parsedIndex = pageIndexSchema.safeParse(Number(formData.get("pageIndex")));
    if (!parsedIndex.success) {
      throw new Error(parsedIndex.error.errors[0]?.message ?? "شماره صفحه نامعتبر است");
    }

    const asset = await prisma.chapterAsset.findFirst({
      where: { chapterId: params.id, pageIndex: parsedIndex.data },
    });
    if (!asset) {
      throw new Error("تصویر متناظر یافت نشد");
    }

    if (!isJsonFile(file.name)) {
      throw new Error("فایل JSON معتبر نیست");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await saveJsonToStorage(params.id, path.basename(file.name), buffer);
    const existing = await prisma.chapterPageJson.findUnique({ where: { assetId: asset.id } });
    if (existing) {
      await deleteStorageFile(existing.jsonPath);
      await prisma.chapterPageJson.update({
        where: { id: existing.id },
        data: { jsonPath: filePath, jsonFileName: file.name, size: buffer.length },
      });
    } else {
      await prisma.chapterPageJson.create({
        data: {
          chapterId: params.id,
          assetId: asset.id,
          jsonPath: filePath,
          jsonFileName: file.name,
          size: buffer.length,
        },
      });
    }

    await prisma.chapterUploadBatch.create({
      data: { chapterId: params.id, uploadedByUserId: sessionUser.id, type: "single_json" },
    });

    redirect(`/chapters/${params.id}/assets`);
  }

  async function uploadCombinedZip(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    const file = formData.get("zip") as File | null;
    if (!file) {
      throw new Error("فایل ZIP انتخاب نشده است");
    }
    assertFileSize(file, MAX_ZIP_FILE_MB, "فایل ZIP");

    const mode = String(formData.get("mode") || "append") as ImageMode;
    if (mode === "replace_all") {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_DELETE,
        "edit",
      );
    } else if (mode === "merge_by_filename") {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPDATE,
        "edit",
      );
    } else {
      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPLOAD,
        "edit",
      );
    }

    const entries = await parseZipEntries(file);
    const imageEntries = entries.filter((entry) => isImageFile(entry.fileName));
    const jsonEntries = entries.filter((entry) => isJsonFile(entry.fileName));
    if (!imageEntries.length && !jsonEntries.length) {
      throw new Error("ZIP شامل هیچ فایل معتبری نیست");
    }

    if (imageEntries.length) {
      await processImageEntries(params.id, imageEntries, mode);
    }
    if (jsonEntries.length) {
      await processJsonEntries(params.id, jsonEntries);
    }

    await prisma.chapterUploadBatch.create({
      data: {
        chapterId: params.id,
        uploadedByUserId: sessionUser.id,
        type: "combined_zip",
      },
    });

    redirect(`/chapters/${params.id}/assets`);
  }

  async function deleteAsset(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_DELETE,
      "edit",
    );

    const assetId = String(formData.get("assetId") ?? "");
    await deleteAssetWithFiles(assetId);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function deleteJson(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_DELETE,
      "edit",
    );

    const jsonId = String(formData.get("jsonId") ?? "");
    await deleteJsonWithFile(jsonId);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function replaceImage(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPDATE,
      "edit",
    );

    const file = formData.get("image") as File | null;
    const assetId = String(formData.get("assetId") ?? "");
    if (!file) {
      throw new Error("تصویر انتخاب نشده است");
    }
    assertFileSize(file, MAX_SINGLE_FILE_MB, "تصویر");

    const asset = await prisma.chapterAsset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new Error("تصویر یافت نشد");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = await detectImageMime(buffer);
    if (!mime || !isImageFile(file.name)) {
      throw new Error("فایل تصویر معتبر نیست");
    }

    const fileName = path.basename(file.name);
    const filePath = await saveImageToStorage(params.id, fileName, buffer);
    await deleteStorageFile(asset.filePath);
    await prisma.chapterAsset.update({
      where: { id: asset.id },
      data: {
        filePath,
        fileName,
        mimeType: mime,
        size: buffer.length,
      },
    });
    redirect(`/chapters/${params.id}/assets`);
  }

  async function replaceJson(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPDATE,
      "edit",
    );

    const file = formData.get("json") as File | null;
    const assetId = String(formData.get("assetId") ?? "");
    if (!file) {
      throw new Error("فایل JSON انتخاب نشده است");
    }
    assertFileSize(file, MAX_SINGLE_FILE_MB, "فایل JSON");

    const asset = await prisma.chapterAsset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new Error("تصویر یافت نشد");
    }

    if (!isJsonFile(file.name)) {
      throw new Error("فایل JSON معتبر نیست");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await saveJsonToStorage(params.id, path.basename(file.name), buffer);
    const existing = await prisma.chapterPageJson.findUnique({ where: { assetId: asset.id } });
    if (existing) {
      await deleteStorageFile(existing.jsonPath);
      await prisma.chapterPageJson.update({
        where: { id: existing.id },
        data: { jsonPath: filePath, jsonFileName: file.name, size: buffer.length },
      });
    } else {
      await prisma.chapterPageJson.create({
        data: {
          chapterId: params.id,
          assetId: asset.id,
          jsonPath: filePath,
          jsonFileName: file.name,
          size: buffer.length,
        },
      });
    }

    redirect(`/chapters/${params.id}/assets`);
  }

  async function reorderPage(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPDATE,
      "edit",
    );

    const assetId = String(formData.get("assetId") ?? "");
    const direction = String(formData.get("direction") ?? "up");
    const asset = await prisma.chapterAsset.findUnique({ where: { id: assetId } });
    if (!asset) return;

    const swapIndex = direction === "up" ? asset.pageIndex - 1 : asset.pageIndex + 1;
    const swapAsset = await prisma.chapterAsset.findFirst({
      where: { chapterId: params.id, pageIndex: swapIndex },
    });
    if (!swapAsset) return;

    await prisma.$transaction([
      prisma.chapterAsset.update({
        where: { id: asset.id },
        data: { pageIndex: 0 },
      }),
      prisma.chapterAsset.update({
        where: { id: swapAsset.id },
        data: { pageIndex: asset.pageIndex },
      }),
      prisma.chapterAsset.update({
        where: { id: asset.id },
        data: { pageIndex: swapIndex },
      }),
    ]);

    redirect(`/chapters/${params.id}/assets`);
  }

  async function bulkUpload(_: BulkState, formData: FormData): Promise<BulkState> {
    "use server";
    try {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        return { status: "error", message: "ابتدا وارد شوید", report: [] };
      }

      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPLOAD_MULTI_CHAPTER,
        "edit",
      );

      const file = formData.get("zip") as File | null;
      if (!file) {
        return { status: "error", message: "فایل ZIP انتخاب نشده است", report: [] };
      }
      assertFileSize(file, MAX_ZIP_FILE_MB, "فایل ZIP");
      const mode = String(formData.get("mode") || "append") as ImageMode;

      const entries = await parseZipEntries(file);
      const grouped = new Map<string, { images: typeof entries; jsons: typeof entries }>();
      const errors: string[] = [];

      const bookCache = new Map<string, string | null>();

      for (const entry of entries) {
        const segments = entry.entryPath.split("/").filter(Boolean);
        if (segments.length < 3) {
          errors.push(`مسیر نامعتبر: ${entry.entryPath}`);
          continue;
        }

        let chapterId: string | null = null;
        let typeSegment: string | null = null;

        if (segments[0] === "chapters") {
          chapterId = segments[1];
          typeSegment = segments[2];
        } else {
          const bookKey = segments[0];
          const chapterNumber = segments[1];
          typeSegment = segments[2];

          let bookId = bookCache.get(bookKey) ?? null;
          if (!bookCache.has(bookKey)) {
            const book = await prisma.book.findFirst({
              where: {
                OR: [{ id: bookKey }, { titleFa: bookKey }, { titleEn: bookKey }],
              },
            });
            bookId = book?.id ?? null;
            bookCache.set(bookKey, bookId);
          }
          if (bookId) {
            const chapter = await prisma.chapter.findFirst({
              where: { bookId, number: chapterNumber },
            });
            chapterId = chapter?.id ?? null;
          }
        }

        if (!chapterId) {
          errors.push(`چپتر برای مسیر ${entry.entryPath} پیدا نشد`);
          continue;
        }

        if (!typeSegment) {
          errors.push(`ساختار پوشه برای ${entry.entryPath} نامعتبر است`);
          continue;
        }

        const group = grouped.get(chapterId) ?? { images: [], jsons: [] };
        if (typeSegment.startsWith("image")) {
          group.images.push(entry);
        } else if (typeSegment.startsWith("json")) {
          group.jsons.push(entry);
        } else {
          errors.push(`مسیر ${entry.entryPath} باید داخل پوشه images یا json باشد`);
        }
        grouped.set(chapterId, group);
      }

      const report: { chapterId: string; images: number; jsons: number; error?: string }[] = [];

      for (const [chapterId, group] of grouped.entries()) {
        try {
          await assertAssetPermission(
            sessionUser.id,
            chapterId,
            PERMISSIONS.CHAPTER_ASSETS_UPLOAD_MULTI_CHAPTER,
            "edit",
          );
          if (group.images.length) {
            await processImageEntries(chapterId, group.images, mode);
          }
          if (group.jsons.length) {
            await processJsonEntries(chapterId, group.jsons);
          }
          report.push({
            chapterId,
            images: group.images.length,
            jsons: group.jsons.length,
          });
        } catch (error) {
          report.push({
            chapterId,
            images: group.images.length,
            jsons: group.jsons.length,
            error: (error as Error).message,
          });
        }
      }

      if (errors.length) {
        return { status: "error", message: errors.join(" | "), report };
      }

      await prisma.chapterUploadBatch.create({
        data: { chapterId: params.id, uploadedByUserId: sessionUser.id, type: "bulk_zip" },
      });

      return { status: "success", message: "آپلود انبوه انجام شد", report };
    } catch (error) {
      return { status: "error", message: (error as Error).message, report: [] };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">دارایی‌های چپتر</h2>
          <p className="text-sm text-gray-500">
            {chapter.book.titleFa} · چپتر {chapter.number}
          </p>
        </div>
        <a href={`/chapters/${params.id}`} className="text-sm text-blue-600">
          بازگشت به چپتر
        </a>
      </div>

      <div className="card">
        <p className="text-sm font-semibold">صفحات</p>
        {assets.length === 0 ? (
          <p className="mt-3 text-xs text-gray-500">هنوز صفحه‌ای بارگذاری نشده است.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <div key={asset.id} className="rounded-lg border border-gray-200 p-3">
                <img
                  src={`/api/assets/image/${asset.id}`}
                  alt={asset.fileName}
                  className="h-48 w-full rounded-md object-cover"
                />
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  <p>صفحه: {asset.pageIndex}</p>
                  <p>فایل: {asset.fileName}</p>
                  <p>JSON: {asset.pageJson ? "دارد" : "ندارد"}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {canUpdate && (
                    <form action={reorderPage}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                        بالا
                      </button>
                    </form>
                  )}
                  {canUpdate && (
                    <form action={reorderPage}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                        پایین
                      </button>
                    </form>
                  )}
                  {canDelete && (
                    <form action={deleteAsset}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600">
                        حذف تصویر
                      </button>
                    </form>
                  )}
                </div>

                {canUpdate && (
                  <form action={replaceImage} className="mt-3 space-y-2">
                    <input type="hidden" name="assetId" value={asset.id} />
                    <input name="image" type="file" accept="image/*" />
                    <button className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white">
                      جایگزینی تصویر
                    </button>
                  </form>
                )}

                <div className="mt-3 space-y-2">
                  {asset.pageJson && (
                    <a
                      href={`/api/assets/json/${asset.pageJson.id}`}
                      className="text-xs text-blue-600"
                    >
                      دانلود JSON
                    </a>
                  )}
                  {canUpdate && (
                    <form action={replaceJson} className="space-y-2">
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input name="json" type="file" accept="application/json" />
                      <button className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white">
                        {asset.pageJson ? "جایگزینی JSON" : "آپلود JSON"}
                      </button>
                    </form>
                  )}
                  {asset.pageJson && canDelete && (
                    <form action={deleteJson}>
                      <input type="hidden" name="jsonId" value={asset.pageJson.id} />
                      <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600">
                        حذف JSON
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canUpload && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h3 className="text-sm font-semibold">آپلود ZIP تصاویر</h3>
            <p className="mt-2 text-xs text-gray-500">
              حداکثر حجم {MAX_ZIP_FILE_MB}MB. فقط تصاویر با نام‌گذاری مرتب.
            </p>
            <form action={uploadImagesZip} className="mt-4 space-y-3">
              <input name="zip" type="file" accept="application/zip" />
              <select name="mode">
                <option value="append">افزودن به انتها</option>
                <option value="replace_all">جایگزینی کامل</option>
                <option value="merge_by_filename">ادغام بر اساس نام فایل</option>
              </select>
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                آپلود تصاویر
              </button>
            </form>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold">آپلود تک تصویر</h3>
            <p className="mt-2 text-xs text-gray-500">حداکثر حجم {MAX_SINGLE_FILE_MB}MB.</p>
            <form action={uploadSingleImage} className="mt-4 space-y-3">
              <input name="image" type="file" accept="image/*" />
              <select name="mode">
                <option value="append">افزودن به انتها</option>
                <option value="insert">درج در شماره صفحه</option>
                <option value="replace">جایگزینی شماره صفحه</option>
              </select>
              <input name="pageIndex" type="number" min={1} placeholder="شماره صفحه" />
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                ثبت تصویر
              </button>
            </form>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold">آپلود ZIP JSON</h3>
            <p className="mt-2 text-xs text-gray-500">
              فایل‌ها باید فقط JSON باشند. تطبیق بر اساس نام فایل یا فیلد image انجام می‌شود.
            </p>
            <form action={uploadJsonZip} className="mt-4 space-y-3">
              <input name="zip" type="file" accept="application/zip" />
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                آپلود JSON
              </button>
            </form>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold">آپلود تک JSON</h3>
            <form action={uploadSingleJson} className="mt-4 space-y-3">
              <input name="json" type="file" accept="application/json" />
              <input name="pageIndex" type="number" min={1} placeholder="شماره صفحه" />
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                ثبت JSON
              </button>
            </form>
          </div>

          <div className="card md:col-span-2">
            <h3 className="text-sm font-semibold">آپلود ترکیبی (تصاویر + JSON)</h3>
            <p className="mt-2 text-xs text-gray-500">
              ZIP می‌تواند شامل پوشه images و json یا فایل‌ها در ریشه باشد.
            </p>
            <form action={uploadCombinedZip} className="mt-4 flex flex-col gap-3 md:flex-row">
              <input name="zip" type="file" accept="application/zip" className="flex-1" />
              <select name="mode" className="md:w-48">
                <option value="append">افزودن به انتها</option>
                <option value="replace_all">جایگزینی کامل</option>
                <option value="merge_by_filename">ادغام بر اساس نام فایل</option>
              </select>
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                آپلود ترکیبی
              </button>
            </form>
          </div>
        </div>
      )}

      {canBulk && (
        <div className="card">
          <h3 className="text-sm font-semibold">آپلود انبوه چند چپتر</h3>
          <p className="mt-2 text-xs text-gray-500">
            ساختار پیشنهادی: <br />
            chapters/&lt;chapterId&gt;/images/*.jpg<br />
            chapters/&lt;chapterId&gt;/json/*.json<br />
            یا <br />
            &lt;bookTitleOrId&gt;/&lt;chapterNumber&gt;/images/*.jpg
          </p>
          <div className="mt-4">
            <BulkUploadForm action={bulkUpload} />
          </div>
        </div>
      )}
    </div>
  );
}
